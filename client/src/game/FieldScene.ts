import Phaser from "phaser";
import { DATA, LanePath, type SnapPlayer, type Snapshot } from "@millstorm/shared";
import type { SnapBuffer } from "./buffer";
import { ART_URL, ENEMY_RADIUS, TEAM_COLORS, hex } from "./look";

export interface FieldView {
  you: string;
  placing: string | null;
  selectedId: number | null;
  /** Pings to draw on the field: cell + expiry time. */
  marks: { col: number; row: number; until: number; color: string }[];
}

export interface FieldCallbacks {
  cellClick(col: number, row: number, shift: boolean): void;
  defenderClick(id: number): void;
  cancel(): void;
  ping(col: number, row: number, screenX: number, screenY: number): void;
}

const B = DATA.balance;
const { cols, rows } = B.map;
const PATH = new LanePath(B.map.path, B.map.yardLengthCells);
/** The Yard is drawn shorter than its simulated length so the field can be bigger. */
const YARD_SCALE = 0.55;
const YARD_DRAWN = B.map.yardLengthCells * YARD_SCALE;
function drawPos(progress: number): { x: number; y: number } {
  if (progress <= PATH.laneLength) return PATH.pos(progress);
  const over = Math.min(progress, PATH.totalLength) - PATH.laneLength;
  const end = PATH.pos(PATH.laneLength);
  return { x: end.x + PATH.exitDir.x * over * YARD_SCALE, y: end.y + PATH.exitDir.y * over * YARD_SCALE };
}
const MILL = drawPos(PATH.totalLength);
const EXIT = PATH.points[PATH.points.length - 1];
const SIGNED_SEND_MIN_COST = 45;
const SHOT_LIFE = 180;
const FX_LIFE = 260;

const SVG_FX = [
  "impact",
  "pumpkin-explosion",
  "water-splash",
  "cannon-smoke",
  "shield",
  "flying-shadow",
  "entry-arrow",
  "spore-cloud",
  "upgrade-burst",
  "death-dust",
] as const;

interface FrameMeta {
  pivot: [number, number];
  visible: [number, number, number, number];
}

interface ShotFx {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  kind: string;
  born: number;
  img: Phaser.GameObjects.Image | null;
  landed: boolean;
}

interface Burst {
  img: Phaser.GameObjects.Image;
  born: number;
  life: number;
  grow: number;
  baseScale: number;
}

/** Path tile for each path cell, from the directions to its neighbours along the lane. */
function pathTiles(): Map<string, string> {
  const cells: [number, number][] = [];
  const pts = B.map.path;
  for (let i = 1; i < pts.length; i++) {
    const [c0, r0] = pts[i - 1];
    const [c1, r1] = pts[i];
    const n = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0));
    for (let s = i === 1 ? 0 : 1; s <= n; s++) cells.push([c0 + Math.sign(c1 - c0) * s, r0 + Math.sign(r1 - r0) * s]);
  }
  const dir = (a: [number, number], b: [number, number]) => (b[0] > a[0] ? "e" : b[0] < a[0] ? "w" : b[1] > a[1] ? "s" : "n");
  const out = new Map<string, string>();
  cells.forEach((c, i) => {
    const prev: [number, number] = i > 0 ? cells[i - 1] : [c[0], c[1] - 1];
    const next: [number, number] = i < cells.length - 1 ? cells[i + 1] : [c[0], c[1] + 1];
    const set = new Set([dir(c, prev), dir(c, next)]);
    const key = set.has("n") && set.has("s") ? "ns" : set.has("e") && set.has("w") ? "ew" : set.has("n") && set.has("e") ? "ne" : set.has("w") && set.has("s") ? "ws" : set.has("n") && set.has("w") ? "nw" : "es";
    out.set(`${c[0]},${c[1]}`, `tile/path-${key}`);
  });
  return out;
}
const PATH_TILES = pathTiles();

/** Deterministic grass variety so every client sees the same field. */
function grassTile(col: number, row: number): string {
  const h = ((col * 73856093) ^ (row * 19349663)) >>> 0;
  const v = h % 100;
  // Only variants with the same base tone as grass-light; the others read as dark patches.
  return v < 9 ? "tile/grass-flowers" : "tile/grass-light";
}

export class FieldScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private ground!: Phaser.GameObjects.Container;
  private meta: Record<string, FrameMeta> = {};
  private cell = 32;
  private ox = 0;
  private oy = 0;
  private hover: { col: number; row: number } | null = null;
  private shots: ShotFx[] = [];
  private bursts: Burst[] = [];
  private seenShots = new Set<string>();
  private labels = new Map<number, Phaser.GameObjects.Text>();
  private defenders = new Map<number, { img: Phaser.GameObjects.Image; level: number; spore: Phaser.GameObjects.Image | null }>();
  private enemies = new Map<number, { img: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image | null; shield: Phaser.GameObjects.Image | null; lastX: number }>();
  private millBody!: Phaser.GameObjects.Image;
  private rotor!: Phaser.GameObjects.Image;
  private cannon!: Phaser.GameObjects.Image;
  private flag!: Phaser.GameObjects.Image;
  private millAngle = 0;

  constructor(
    private readonly buffer: SnapBuffer,
    private readonly view: FieldView,
    private readonly cb: FieldCallbacks,
  ) {
    super("field");
  }

  preload(): void {
    this.load.atlas("field", `${ART_URL}field.png`, `${ART_URL}field.json`);
    this.load.atlas("tiles", `${ART_URL}tiles.png`, `${ART_URL}tiles.json`);
    this.load.image("sky", `${ART_URL}sky.jpg`);
    this.load.json("artmeta", `${ART_URL}art.json`);
    this.load.image("flag-0", `${ART_URL}icons/ui-team-blue.png`);
    this.load.image("flag-1", `${ART_URL}icons/ui-team-orange.png`);
    for (const k of SVG_FX) this.load.svg(`fx-${k}`, `${ART_URL}fx/${k}.svg`, { width: 128, height: 128 });
  }

  create(): void {
    this.meta = (this.cache.json.get("artmeta") as { frames: Record<string, FrameMeta> }).frames;
    this.ground = this.add.container(0, 0).setDepth(-1000);
    this.millBody = this.add.image(0, 0, "field", "mill/body/healthy");
    this.rotor = this.add.image(0, 0, "field", "mill/rotor/healthy");
    this.cannon = this.add.image(0, 0, "field", "cannon/l1").setVisible(false);
    this.flag = this.add.image(0, 0, "flag-0");
    this.g = this.add.graphics().setDepth(5000);
    this.input.mouse?.disableContextMenu();
    this.scale.on("resize", (size: Phaser.Structs.Size) => {
      this.cameras.main.setSize(size.width, size.height);
      this.layout();
    });
    this.layout();

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => (this.hover = this.toCell(p.x, p.y)));
    this.input.on("pointerout", () => (this.hover = null));
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const c = this.toCell(p.x, p.y);
      const ev = p.event as MouseEvent;
      if (p.rightButtonDown()) return this.cb.cancel();
      if (!c) return;
      if (ev.altKey || p.middleButtonDown()) return this.cb.ping(c.col, c.row, ev.clientX, ev.clientY);
      const me = this.me();
      const d = me?.d.find((x) => x[2] === c.col && x[3] === c.row);
      if (d && !this.view.placing) this.cb.defenderClick(d[0]);
      else this.cb.cellClick(c.col, c.row, ev.shiftKey);
    });
  }

  private layout(): void {
    const w = this.scale.width;
    // Leave room at the top for the "Идут к тебе" strip overlaid on the canvas.
    const top = 34;
    const h = this.scale.height - top;
    const tall = rows + YARD_DRAWN + 1.4;
    this.cell = Math.max(12, Math.floor(Math.min(w / (cols + 0.4), h / tall)));
    this.ox = Math.floor((w - this.cell * cols) / 2);
    this.oy = top + Math.floor((h - this.cell * tall) / 2 + this.cell * 0.1);
    this.buildGround();
    // Sizes depend on the cell; let sprites rescale on the next frame.
    for (const d of this.defenders.values()) d.level = -1;
  }

  private toCell(x: number, y: number): { col: number; row: number } | null {
    const col = Math.floor((x - this.ox) / this.cell);
    const row = Math.floor((y - this.oy) / this.cell);
    return col >= 0 && row >= 0 && col < cols && row < rows ? { col, row } : null;
  }

  private sx(x: number): number {
    return this.ox + x * this.cell;
  }

  private sy(y: number): number {
    return this.oy + y * this.cell;
  }

  private me(s: Snapshot | null = this.buffer.cur): SnapPlayer | undefined {
    return s?.players.find((p) => p.id === this.view.you);
  }

  /** Scale a frame so its visible (non-empty) width is `width` px, and anchor it at its pivot. */
  private fitFrame(img: Phaser.GameObjects.Image, frame: string, width: number): void {
    const m = this.meta[frame];
    img.setFrame(frame);
    const visW = m ? (m.visible[2] - m.visible[0]) * img.frame.width : img.frame.width;
    img.setScale(width / Math.max(1, visW));
    if (m) img.setOrigin(m.pivot[0], m.pivot[1]);
  }

  // ------------------------------------------------------------------ ground

  private buildGround(): void {
    this.ground.removeAll(true);
    const c = this.cell;
    const add = (o: Phaser.GameObjects.GameObject) => this.ground.add(o);
    // Sky behind the floating island, cropped to cover the canvas.
    const sky = this.add.image(this.scale.width / 2, this.scale.height / 2, "sky");
    sky.setScale(Math.max(this.scale.width / sky.width, this.scale.height / sky.height));
    add(sky);
    const yardTop = rows;
    const tile = (frame: string, x: number, y: number, h = 1) =>
      add(this.add.image(this.sx(x), this.sy(y), "tiles", frame).setOrigin(0).setDisplaySize(c + 1, c * h + 1));
    for (let x = 0; x < cols; x++)
      for (let y = 0; y < rows; y++) tile(PATH_TILES.get(`${x},${y}`) ?? grassTile(x, y), x, y);
    // Yard: straw-covered ground with a dirt track to the Mill.
    const yardRows = Math.ceil(YARD_DRAWN + 1);
    const rowH = (YARD_DRAWN + 1) / yardRows;
    for (let x = 0; x < cols; x++)
      for (let y = 0; y < yardRows; y++) {
        const onTrack = x === Math.floor(EXIT.x);
        tile(onTrack ? "tile/yard" : grassTile(x, yardTop + y), x, yardTop + y * rowH, rowH);
      }
    // Fence along the top of the yard, with a gate where the path enters.
    for (let x = 0; x < cols; x++) {
      const gate = x === Math.floor(EXIT.x);
      const f = this.add.image(this.sx(x + 0.5), this.sy(yardTop + 0.12), "field", gate ? "prop/gate" : "prop/fence").setOrigin(0.5, 0.7);
      f.setScale((c * (gate ? 1.15 : 1.08)) / f.frame.width);
      if (gate) f.setAlpha(0.9);
      add(f);
    }
    // A little farm clutter in the yard corners.
    const decor: [string, number, number, number][] = [
      ["prop/hay", 1, yardTop + 1.2, 0.9],
      ["prop/barrel", 2.1, yardTop + 1.5, 0.6],
      ["prop/grain-sack", 8.3, yardTop + 1.4, 0.6],
      ["prop/bush", 9.2, yardTop + 1.0, 0.8],
      ["prop/rocks", 0.4, yardTop + 2.4, 0.6],
    ];
    for (const [frame, x, y, size] of decor) {
      const d = this.add.image(this.sx(x), this.sy(y), "field", frame).setOrigin(0.5, 0.8);
      d.setScale((c * size) / d.frame.width);
      add(d);
    }
    // Field border.
    const border = this.add.graphics();
    border.lineStyle(Math.max(2, c * 0.08), 0x4e2e16, 1);
    border.strokeRect(this.sx(0), this.sy(0), c * cols, c * rows);
    add(border);
    // Entry arrow over the first path cell.
    const start = PATH.points[0];
    const arrow = this.add.image(this.sx(start.x), this.sy(start.y - 0.25), "fx-entry-arrow");
    arrow.setDisplaySize(c * 0.8, c * 0.8);
    add(arrow);
  }

  // ------------------------------------------------------------------ frame

  override update(_t: number, delta: number): void {
    const g = this.g;
    const s = this.buffer.cur;
    g.clear();
    const me = this.me();
    if (!s || !me) return;
    const team = s.teams[me.team];
    const frac = team.hp / team.maxHp;
    this.millAngle += (delta / 1000) * (0.3 + 1.2 * frac);
    this.drawMill(frac, team.cannonLevel, me.team);
    this.drawDefenders(me);
    this.drawEnemies(s, me);
    this.drawShots(me);
    this.drawOverlay(me);
  }

  private drawMill(frac: number, cannon: number, team: number): void {
    const c = this.cell;
    const x = this.sx(MILL.x);
    const y = this.sy(MILL.y + 0.55);
    const state = frac <= 0 ? "destroyed" : frac <= 0.15 ? "critical" : frac <= 0.3 ? "damaged" : "healthy";
    this.fitFrame(this.millBody, `mill/body/${state}`, c * 2.5);
    this.millBody.setPosition(x, y).setDepth(y);
    const m = this.meta[`mill/body/${state}`];
    // Rotor hub sits near the top of the tower body.
    const bodyH = m ? (m.visible[3] - m.visible[1]) * this.millBody.displayHeight : c;
    const hubY = y - bodyH * 0.72;
    if (state === "destroyed") this.rotor.setVisible(false);
    else {
      const rotorFrame = state === "healthy" ? "mill/rotor/healthy" : state === "damaged" ? "mill/rotor/damaged" : "mill/rotor/broken";
      this.rotor.setVisible(true).setFrame(rotorFrame);
      this.rotor.setScale((c * 2.9) / this.rotor.frame.width).setOrigin(0.5, 0.5);
      this.rotor.setPosition(x, hubY).setRotation(this.millAngle).setDepth(y + 1);
    }
    this.flag.setTexture(`flag-${team}`).setDisplaySize(c * 0.7, c * 0.7).setPosition(x - c * 1.45, y - bodyH * 0.3).setDepth(y + 2);
    if (cannon > 0) {
      this.fitFrame(this.cannon, `cannon/l${Math.min(5, cannon)}`, c * 1.3);
      this.cannon.setVisible(true).setPosition(x + c * 1.9, y - c * 0.05).setDepth(y);
    } else this.cannon.setVisible(false);
  }

  private drawDefenders(me: SnapPlayer): void {
    const c = this.cell;
    const ids = DATA.defenderIds;
    const alive = new Set<number>();
    for (const [id, typeIdx, col, row, level, spored] of me.d) {
      alive.add(id);
      const type = ids[typeIdx];
      let d = this.defenders.get(id);
      if (!d) {
        d = { img: this.add.image(0, 0, "field", `defender/${type}/l1`), level: -1, spore: null };
        this.defenders.set(id, d);
      }
      const x = this.sx(col + 0.5);
      const y = this.sy(row + 0.92);
      if (d.level !== level) {
        if (d.level > 0 && level > d.level) this.burst("fx-upgrade-burst", x, y - c * 0.4, c * 1.2, 1.4, 360);
        this.fitFrame(d.img, `defender/${type}/l${level}`, c * 1.12);
        d.level = level;
      }
      d.img.setPosition(x, y).setDepth(y);
      if (spored && !d.spore) d.spore = this.add.image(0, 0, "fx-spore-cloud").setAlpha(0.85);
      if (!spored && d.spore) {
        d.spore.destroy();
        d.spore = null;
      }
      d.spore?.setDisplaySize(c * 0.7, c * 0.7).setPosition(x + c * 0.25, y - c * 0.9).setDepth(y + 1);
    }
    for (const [id, d] of this.defenders)
      if (!alive.has(id)) {
        d.img.destroy();
        d.spore?.destroy();
        this.defenders.delete(id);
      }
  }

  private drawEnemies(s: Snapshot, me: SnapPlayer): void {
    const g = this.g;
    const c = this.cell;
    const ids = DATA.enemyIds;
    const alpha = this.buffer.alpha();
    const prevMe = this.me(this.buffer.prev);
    const prevProgress = new Map<number, number>();
    if (prevMe) for (const e of prevMe.e) prevProgress.set(e[0], e[2]);
    const alive = new Set<number>();
    const labelled = new Set<number>();
    const step = Math.floor(this.time.now / 260);

    for (const [id, typeIdx, prog100, hp, maxHp, shield, senderIdx] of me.e) {
      alive.add(id);
      const type = ids[typeIdx];
      const def = B.enemies[type];
      const p0 = prevProgress.get(id);
      const prog = (p0 === undefined ? prog100 : p0 + (prog100 - p0) * alpha) / 100;
      const pos = drawPos(prog);
      const ahead = drawPos(prog + 0.08);
      const dx = ahead.x - pos.x;
      const dy = ahead.y - pos.y;
      const side = Math.abs(dx) >= Math.abs(dy);
      const pose = `${side ? "side" : "down"}_${(step + id) % 2 ? "b" : "a"}`;
      const frame = `enemy/${type}/${pose}`;
      const r = c * (ENEMY_RADIUS[type] ?? 0.25);
      const x = this.sx(pos.x);
      const lift = def.flying ? c * (0.28 + 0.05 * Math.sin(this.time.now / 180 + id)) : 0;
      const y = this.sy(pos.y) + r * 0.9 - lift;

      let e = this.enemies.get(id);
      if (!e) {
        e = { img: this.add.image(0, 0, "field", frame), shadow: null, shield: null, lastX: x };
        if (def.flying) e.shadow = this.add.image(0, 0, "fx-flying-shadow").setAlpha(0.55);
        this.enemies.set(id, e);
      }
      this.fitFrame(e.img, frame, r * 3.1);
      e.img.setFlipX(side && dx < 0).setPosition(x, y).setDepth(this.sy(pos.y) + r);
      e.shadow?.setDisplaySize(r * 2.2, r * 0.9).setPosition(x, this.sy(pos.y) + r * 0.9).setDepth(this.sy(pos.y) - 1);
      if (shield > 0 && !e.shield) e.shield = this.add.image(0, 0, "fx-shield").setAlpha(0.75);
      if (shield <= 0 && e.shield) {
        e.shield.destroy();
        e.shield = null;
      }
      e.shield?.setDisplaySize(r * 3, r * 3).setPosition(x, y - r).setDepth(e.img.depth + 1);

      const boss = r >= c * 0.44;
      const top = y - e.img.displayHeight * (this.meta[frame]?.pivot[1] ?? 0.9) + e.img.displayHeight * (this.meta[frame]?.visible[1] ?? 0);
      if (hp < maxHp || boss) {
        const w = Math.max(c * 0.6, r * 2.2);
        g.fillStyle(0x2b1d14, 0.85);
        g.fillRect(x - w / 2 - 1, top - c * 0.14 - 1, w + 2, c * 0.1 + 2);
        g.fillStyle(0x5bd46b, 1);
        g.fillRect(x - w / 2, top - c * 0.14, (w * Math.max(0, hp)) / maxHp, c * 0.1);
      }
      // "Посылка с подписью": the sender's team dot, and a name tag on expensive single-unit sends.
      if (senderIdx >= 0) {
        const sender = s.players[senderIdx];
        const sendDef = Object.values(B.sends).find((sd) => sd.units.some(([u]) => u === type));
        const count = sendDef?.units.reduce((a, [, n]) => a + n, 0) ?? 1;
        g.fillStyle(0x2b1d14, 1);
        g.fillCircle(x + r * 0.9, top + c * 0.02, Math.max(3, c * 0.09));
        g.fillStyle(hex(TEAM_COLORS[sender?.team ?? 1]), 1);
        g.fillCircle(x + r * 0.9, top + c * 0.02, Math.max(2, c * 0.07));
        if (count === 1 && sender && (sendDef?.lureCost ?? 0) >= SIGNED_SEND_MIN_COST) {
          labelled.add(id);
          let t = this.labels.get(id);
          if (!t) {
            t = this.add
              .text(0, 0, `от ${sender.name}`, {
                fontFamily: "Rubik, system-ui, sans-serif",
                fontStyle: "bold",
                fontSize: `${Math.max(10, Math.round(c * 0.3))}px`,
                color: "#3a2414",
                backgroundColor: "#fbf4e2",
                padding: { x: 3, y: 1 },
              })
              .setOrigin(0.5, 1)
              .setDepth(5001);
            this.labels.set(id, t);
          }
          t.setPosition(x, top - c * 0.2);
        }
      }
      e.lastX = x;
    }
    for (const [id, t] of this.labels)
      if (!labelled.has(id)) {
        t.destroy();
        this.labels.delete(id);
      }
    for (const [id, e] of this.enemies)
      if (!alive.has(id)) {
        // Gone: either killed or reached the Mill. A puff of dust marks the spot.
        this.burst("fx-death-dust", e.img.x, e.img.y - e.img.displayHeight * 0.3, e.img.displayWidth * 0.9, 1.3, 320);
        e.img.destroy();
        e.shadow?.destroy();
        e.shield?.destroy();
        this.enemies.delete(id);
      }
  }

  private burst(key: string, x: number, y: number, size: number, grow: number, life = FX_LIFE): void {
    const img = this.add.image(x, y, key).setDepth(4000);
    img.setDisplaySize(size, size);
    this.bursts.push({ img, born: this.time.now, life, grow, baseScale: img.scaleX });
  }

  private drawShots(me: SnapPlayer): void {
    const c = this.cell;
    const now = this.time.now;
    const byId = new Map(me.d.map((d) => [d[0], d]));
    for (const [tick, from, x10, y10, kind] of me.s) {
      const key = `${tick}:${from}:${x10}:${y10}`;
      if (this.seenShots.has(key)) continue;
      this.seenShots.add(key);
      const d = byId.get(from);
      const src =
        from === -1 ? { x: this.cannon.visible ? (this.cannon.x - this.ox) / c : MILL.x, y: MILL.y } : d ? { x: d[2] + 0.5, y: d[3] + 0.2 } : null;
      if (!src) continue;
      const to = { x: x10 / 10, y: y10 / 10 };
      if (kind === "spray") {
        const range = B.defenders.sprinkler.rangeCells ?? 2;
        this.burst("fx-water-splash", this.sx(src.x), this.sy(src.y + 0.3), c * range * 1.6, 1.15, 300);
        continue;
      }
      if (kind === "cannon") this.burst("fx-cannon-smoke", this.sx(src.x) + c * 0.3, this.sy(src.y) - c * 0.3, c * 0.9, 1.5, 300);
      const frame = kind === "splash" ? "projectile/splash" : kind === "pierce" ? "projectile/pierce" : kind === "air" ? "projectile/air" : kind === "cannon" ? "projectile/cannon" : "projectile/basic";
      const img = this.add.image(this.sx(src.x), this.sy(src.y), "field", frame).setDepth(4500);
      const size = kind === "pierce" ? 0.7 : kind === "splash" || kind === "cannon" ? 0.4 : 0.55;
      img.setScale((c * size) / img.frame.width);
      const ang = Math.atan2(to.y - src.y, to.x - src.x);
      if (kind !== "splash" && kind !== "cannon") img.setRotation(ang);
      this.shots.push({ x0: src.x, y0: src.y, x1: to.x, y1: to.y, kind, born: now, img, landed: false });
    }
    if (this.seenShots.size > 2000) this.seenShots.clear();

    for (const f of this.shots) {
      const t = Math.min(1, (now - f.born) / SHOT_LIFE);
      const arc = f.kind === "splash" || f.kind === "cannon" ? Math.sin(t * Math.PI) * 0.6 : 0;
      f.img?.setPosition(this.sx(f.x0 + (f.x1 - f.x0) * t), this.sy(f.y0 + (f.y1 - f.y0) * t - arc));
      if (f.kind === "splash") f.img?.setRotation(t * 6);
      if (t >= 1 && !f.landed) {
        f.landed = true;
        f.img?.destroy();
        f.img = null;
        if (f.kind === "splash") {
          const r = B.defenders.pumpkin.splashRadiusCells ?? 1;
          this.burst("fx-pumpkin-explosion", this.sx(f.x1), this.sy(f.y1), c * r * 2, 1.2, 320);
        } else this.burst("fx-impact", this.sx(f.x1), this.sy(f.y1), c * (f.kind === "cannon" ? 0.9 : 0.5), 1.3);
      }
    }
    this.shots = this.shots.filter((f) => !f.landed);

    for (const b of this.bursts) {
      const t = (now - b.born) / b.life;
      b.img.setScale(b.baseScale * (1 + (b.grow - 1) * t)).setAlpha(Math.max(0, 1 - t));
      if (t >= 1) b.img.destroy();
    }
    this.bursts = this.bursts.filter((b) => now - b.born < b.life);
  }

  private drawOverlay(me: SnapPlayer): void {
    const g = this.g;
    const c = this.cell;
    const placing = this.view.placing;
    if (placing && this.hover) {
      const { col, row } = this.hover;
      const def = B.defenders[placing];
      const blocked = PATH.isPathCell(col, row) || me.d.some((d) => d[2] === col && d[3] === row);
      const afford = me.grain >= def.cost;
      g.fillStyle(blocked || !afford ? 0xc0392b : 0xf6ecd0, 0.5);
      g.fillRect(this.sx(col), this.sy(row), c, c);
      g.lineStyle(2, blocked || !afford ? 0x7e1f1a : 0xe2b33c, 1);
      g.strokeRect(this.sx(col) + 1, this.sy(row) + 1, c - 2, c - 2);
      const range = def.rangeCells ?? def.auraRangeCells;
      if (range) {
        g.lineStyle(2, 0xf6ecd0, 0.95);
        g.fillStyle(0xf6ecd0, 0.14);
        g.fillCircle(this.sx(col + 0.5), this.sy(row + 0.5), range * c);
        g.strokeCircle(this.sx(col + 0.5), this.sy(row + 0.5), range * c);
      }
    }
    const sel = me.d.find((d) => d[0] === this.view.selectedId);
    if (sel) {
      const def = B.defenders[DATA.defenderIds[sel[1]]];
      const range = def.rangeCells ?? def.auraRangeCells;
      g.lineStyle(2, 0xe2b33c, 1);
      g.strokeRect(this.sx(sel[2]) + 1, this.sy(sel[3]) + 1, c - 2, c - 2);
      if (range) {
        g.lineStyle(2, 0xf6ecd0, 0.95);
        g.fillStyle(0xf6ecd0, 0.12);
        g.fillCircle(this.sx(sel[2] + 0.5), this.sy(sel[3] + 0.5), range * c);
        g.strokeCircle(this.sx(sel[2] + 0.5), this.sy(sel[3] + 0.5), range * c);
      }
    }
    const now = performance.now();
    this.view.marks = this.view.marks.filter((m) => m.until > now);
    for (const m of this.view.marks) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 120);
      g.lineStyle(3, hex(m.color), 0.95);
      g.strokeCircle(this.sx(m.col + 0.5), this.sy(m.row + 0.5), c * (0.4 + pulse * 0.2));
    }
  }
}
