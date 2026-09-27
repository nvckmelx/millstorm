import Phaser from "phaser";
import { DATA, LanePath, type SnapPlayer, type Snapshot } from "@millstorm/shared";
import type { SnapBuffer } from "./buffer";
import { DEFENDER_COLORS, ENEMY_RADIUS, TEAM_COLORS, armorColor, hex } from "./look";

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
const GRASS = [0x9fd36b, 0x96cc62];
const DIRT = 0xd8b27a;
const DIRT_EDGE = 0xc19a61;
const OUTLINE = 0x3b2a1a;
const SIGNED_SEND_MIN_COST = 45;

interface ShotFx {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  kind: string;
  born: number;
}

export class FieldScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private cell = 32;
  private ox = 0;
  private oy = 0;
  private hover: { col: number; row: number } | null = null;
  private shots: ShotFx[] = [];
  private seenShots = new Set<string>();
  private labels = new Map<number, Phaser.GameObjects.Text>();
  private millAngle = 0;

  constructor(
    private readonly buffer: SnapBuffer,
    private readonly view: FieldView,
    private readonly cb: FieldCallbacks,
  ) {
    super("field");
  }

  create(): void {
    this.g = this.add.graphics();
    this.input.mouse?.disableContextMenu();
    this.scale.on("resize", () => this.layout());
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
    const tall = rows + YARD_DRAWN + 1.1;
    this.cell = Math.max(12, Math.floor(Math.min(w / (cols + 0.4), h / tall)));
    this.ox = Math.floor((w - this.cell * cols) / 2);
    this.oy = top + Math.floor((h - this.cell * tall) / 2 + this.cell * 0.1);
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

  override update(_t: number, delta: number): void {
    const g = this.g;
    const s = this.buffer.cur;
    g.clear();
    this.drawGround();
    const me = this.me();
    if (!s || !me) return;
    const team = s.teams[me.team];
    this.millAngle += (delta / 1000) * (0.4 + 1.6 * (team.hp / team.maxHp));
    this.drawMill(team.hp / team.maxHp, team.cannonLevel, me.team);
    this.drawDefenders(me);
    this.drawEnemies(s, me);
    this.drawShots(me);
    this.drawOverlay(me);
  }

  private drawGround(): void {
    const g = this.g;
    const c = this.cell;
    for (let x = 0; x < cols; x++)
      for (let y = 0; y < rows; y++) {
        g.fillStyle(PATH.isPathCell(x, y) ? DIRT : GRASS[(x + y) % 2], 1);
        g.fillRect(this.sx(x), this.sy(y), c, c);
      }
    // Path edge
    g.lineStyle(Math.max(1, c * 0.06), DIRT_EDGE, 1);
    for (const [x, y] of PATH.pathCells()) g.strokeRect(this.sx(x) + 1, this.sy(y) + 1, c - 2, c - 2);
    // Yard: the path continues out of the field into the Mill's yard
    const exit = PATH.points[PATH.points.length - 1];
    const yardTop = this.sy(rows);
    g.fillStyle(0xb9d98a, 1);
    g.fillRect(this.sx(0), yardTop, c * cols, c * (YARD_DRAWN + 1));
    g.fillStyle(DIRT, 1);
    g.fillRect(this.sx(exit.x - 0.5), yardTop, c, this.sy(MILL.y) - yardTop);
    // Fence
    g.lineStyle(Math.max(1, c * 0.08), 0x8a5a2b, 1);
    g.lineBetween(this.sx(0), yardTop, this.sx(exit.x - 0.5), yardTop);
    g.lineBetween(this.sx(exit.x + 0.5), yardTop, this.sx(cols), yardTop);
    // Field border
    g.lineStyle(Math.max(2, c * 0.08), 0x5f7d3a, 1);
    g.strokeRect(this.sx(0), this.sy(0), c * cols, c * rows);
    // Entry arrow
    const start = PATH.points[0];
    g.fillStyle(0x8a5a2b, 0.8);
    g.fillTriangle(
      this.sx(start.x - 0.25),
      this.sy(start.y - 0.45),
      this.sx(start.x + 0.25),
      this.sy(start.y - 0.45),
      this.sx(start.x),
      this.sy(start.y - 0.1),
    );
  }

  private drawMill(hpFrac: number, cannon: number, team: number): void {
    const g = this.g;
    const c = this.cell;
    const x = this.sx(MILL.x);
    const y = this.sy(MILL.y);
    // Tower
    g.fillStyle(0xf3e3c3, 1);
    g.lineStyle(Math.max(2, c * 0.08), OUTLINE, 1);
    g.beginPath();
    g.moveTo(x - c * 0.55, y + c * 0.55);
    g.lineTo(x + c * 0.55, y + c * 0.55);
    g.lineTo(x + c * 0.35, y - c * 0.6);
    g.lineTo(x - c * 0.35, y - c * 0.6);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.fillStyle(hex(TEAM_COLORS[team]), 1);
    g.fillRect(x - c * 0.14, y + c * 0.1, c * 0.28, c * 0.45);
    // Blades
    const hub = { x, y: y - c * 0.55 };
    g.lineStyle(Math.max(2, c * 0.12), hpFrac > 0.3 ? 0x8a5a2b : 0x5a3a1b, 1);
    for (let i = 0; i < 4; i++) {
      const a = this.millAngle + (i * Math.PI) / 2;
      const len = c * (0.9 * (hpFrac > 0.15 || i % 2 === 0 ? 1 : 0.4));
      g.lineBetween(hub.x, hub.y, hub.x + Math.cos(a) * len, hub.y + Math.sin(a) * len);
    }
    g.fillStyle(OUTLINE, 1);
    g.fillCircle(hub.x, hub.y, c * 0.1);
    // Cannon level pips
    for (let i = 0; i < cannon; i++) {
      g.fillStyle(0x333333, 1);
      g.fillCircle(x + c * (0.8 + i * 0.22), y + c * 0.4, c * 0.08);
    }
  }

  private drawDefenders(me: SnapPlayer): void {
    const g = this.g;
    const c = this.cell;
    const ids = DATA.defenderIds;
    for (const [id, typeIdx, col, row, level, spored] of me.d) {
      const type = ids[typeIdx];
      const x = this.sx(col + 0.5);
      const y = this.sy(row + 0.5);
      const s = c * 0.78;
      g.fillStyle(0x000000, 0.18);
      g.fillRoundedRect(x - s / 2 + c * 0.05, y - s / 2 + c * 0.07, s, s, c * 0.14);
      g.fillStyle(hex(DEFENDER_COLORS[type] ?? "#999999"), 1);
      g.fillRoundedRect(x - s / 2, y - s / 2, s, s, c * 0.14);
      g.lineStyle(level >= 3 ? Math.max(2, c * 0.12) : Math.max(1.5, c * 0.07), level >= 3 ? 0xffd23f : OUTLINE, 1);
      g.strokeRoundedRect(x - s / 2, y - s / 2, s, s, c * 0.14);
      if (id === this.view.selectedId) {
        g.lineStyle(2, 0xffffff, 1);
        g.strokeRoundedRect(x - s / 2 - 3, y - s / 2 - 3, s + 6, s + 6, c * 0.18);
      }
      this.glyph(type, x, y, s);
      for (let i = 0; i < level; i++) {
        g.fillStyle(0xffffff, 1);
        g.fillCircle(x - s * 0.28 + i * s * 0.28, y + s * 0.36, c * 0.06);
        g.lineStyle(1, OUTLINE, 1);
        g.strokeCircle(x - s * 0.28 + i * s * 0.28, y + s * 0.36, c * 0.06);
      }
      if (spored) {
        g.fillStyle(0x8e44ad, 0.45);
        g.fillCircle(x + s * 0.3, y - s * 0.3, c * 0.12);
      }
    }
  }

  private glyph(type: string, x: number, y: number, s: number): void {
    const g = this.g;
    const k = s / 2;
    g.lineStyle(Math.max(1.5, s * 0.09), OUTLINE, 1);
    switch (type) {
      case "scarecrow":
        g.lineBetween(x, y - k * 0.55, x, y + k * 0.45);
        g.lineBetween(x - k * 0.55, y - k * 0.15, x + k * 0.55, y - k * 0.15);
        g.fillStyle(0xf3e3c3, 1);
        g.fillCircle(x, y - k * 0.55, k * 0.2);
        break;
      case "pumpkin":
        g.fillStyle(0xffb347, 1);
        g.fillCircle(x, y, k * 0.5);
        g.strokeCircle(x, y, k * 0.5);
        g.lineBetween(x, y - k * 0.5, x + k * 0.15, y - k * 0.75);
        break;
      case "ballista":
        g.lineBetween(x - k * 0.55, y + k * 0.55, x + k * 0.5, y - k * 0.5);
        g.lineBetween(x + k * 0.5, y - k * 0.5, x + k * 0.1, y - k * 0.5);
        g.lineBetween(x + k * 0.5, y - k * 0.5, x + k * 0.5, y - k * 0.1);
        break;
      case "owl":
        g.fillStyle(0xffffff, 1);
        g.fillCircle(x - k * 0.25, y - k * 0.1, k * 0.22);
        g.fillCircle(x + k * 0.25, y - k * 0.1, k * 0.22);
        g.fillStyle(OUTLINE, 1);
        g.fillCircle(x - k * 0.25, y - k * 0.1, k * 0.1);
        g.fillCircle(x + k * 0.25, y - k * 0.1, k * 0.1);
        g.fillStyle(0xf2c230, 1);
        g.fillTriangle(x - k * 0.1, y + k * 0.1, x + k * 0.1, y + k * 0.1, x, y + k * 0.3);
        break;
      case "sprinkler":
        g.fillStyle(0xffffff, 1);
        for (const [dx, dy] of [
          [-0.3, -0.2],
          [0.3, -0.2],
          [0, 0.2],
        ])
          g.fillCircle(x + dx * k, y + dy * k, k * 0.14);
        break;
      case "bell":
        g.fillStyle(0xfff1a8, 1);
        g.fillTriangle(x, y - k * 0.55, x - k * 0.45, y + k * 0.3, x + k * 0.45, y + k * 0.3);
        g.strokeTriangle(x, y - k * 0.55, x - k * 0.45, y + k * 0.3, x + k * 0.45, y + k * 0.3);
        g.fillStyle(OUTLINE, 1);
        g.fillCircle(x, y + k * 0.38, k * 0.1);
        break;
      case "feeder":
        g.fillStyle(0xf2c230, 1);
        for (const [dx, dy] of [
          [-0.25, 0],
          [0.25, 0],
          [0, -0.3],
          [0, 0.3],
        ])
          g.fillCircle(x + dx * k, y + dy * k, k * 0.12);
        break;
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

    // Draw back-to-front so the leading enemy is on top.
    const list = [...me.e].sort((a, b) => a[2] - b[2]);
    for (const [id, typeIdx, prog100, hp, maxHp, shield, senderIdx] of list) {
      const type = ids[typeIdx];
      const def = DATA.balance.enemies[type];
      const p0 = prevProgress.get(id);
      const prog = (p0 === undefined ? prog100 : p0 + (prog100 - p0) * alpha) / 100;
      const pos = drawPos(prog);
      const x = this.sx(pos.x);
      const y = this.sy(pos.y);
      const r = c * (ENEMY_RADIUS[type] ?? 0.25);
      const boss = r >= c * 0.44;
      if (def.flying) {
        g.fillStyle(0x000000, 0.18);
        g.fillEllipse(x, y + c * 0.32, r * 1.8, r * 0.7);
      }
      g.fillStyle(hex(armorColor(def.armor)), 1);
      g.lineStyle(boss ? Math.max(3, c * 0.1) : Math.max(1.5, c * 0.06), OUTLINE, 1);
      if (def.flying) {
        const yy = y - c * 0.08;
        g.fillTriangle(x - r * 1.3, yy - r * 0.2, x + r * 1.3, yy - r * 0.2, x, yy + r);
        g.strokeTriangle(x - r * 1.3, yy - r * 0.2, x + r * 1.3, yy - r * 0.2, x, yy + r);
      } else {
        g.fillCircle(x, y, r);
        g.strokeCircle(x, y, r);
      }
      if (shield > 0) {
        g.lineStyle(Math.max(2, c * 0.06), 0x9ad7ff, 0.9);
        g.strokeCircle(x, y, r + c * 0.07);
      }
      if (hp < maxHp || boss) {
        const w = Math.max(c * 0.5, r * 2.2);
        g.fillStyle(0x3b2a1a, 0.8);
        g.fillRect(x - w / 2, y - r - c * 0.16, w, c * 0.08);
        g.fillStyle(0x5bd46b, 1);
        g.fillRect(x - w / 2, y - r - c * 0.16, (w * Math.max(0, hp)) / maxHp, c * 0.08);
      }
      // "Посылка с подписью": single-unit sends carry the sender's name.
      if (senderIdx >= 0) {
        const sender = s.players[senderIdx];
        const sendDef = Object.values(DATA.balance.sends).find((sd) => sd.units.some(([u]) => u === type));
        const count = sendDef?.units.reduce((a, [, n]) => a + n, 0) ?? 1;
        g.fillStyle(hex(TEAM_COLORS[sender?.team ?? 1]), 1);
        g.fillCircle(x + r * 0.8, y - r * 0.8, Math.max(2, c * 0.07));
        // Only expensive single-unit sends get a name tag, so busy lanes stay readable.
        if (count === 1 && sender && (sendDef?.lureCost ?? 0) >= SIGNED_SEND_MIN_COST) {
          alive.add(id);
          let t = this.labels.get(id);
          if (!t) {
            t = this.add
              .text(0, 0, `от ${sender.name}`, {
                fontFamily: "Nunito, system-ui, sans-serif",
                fontSize: `${Math.max(10, Math.round(c * 0.3))}px`,
                color: "#3b2a1a",
                backgroundColor: "#fff7e0",
                padding: { x: 3, y: 1 },
              })
              .setOrigin(0.5, 1)
              .setDepth(5);
            this.labels.set(id, t);
          }
          t.setPosition(x, y - r - c * 0.2);
        }
      }
    }
    for (const [id, t] of this.labels)
      if (!alive.has(id)) {
        t.destroy();
        this.labels.delete(id);
      }
  }

  private drawShots(me: SnapPlayer): void {
    const g = this.g;
    const c = this.cell;
    const now = this.time.now;
    const byId = new Map(me.d.map((d) => [d[0], d]));
    for (const [tick, from, x10, y10, kind] of me.s) {
      const key = `${tick}:${from}:${x10}:${y10}`;
      if (this.seenShots.has(key)) continue;
      this.seenShots.add(key);
      const d = byId.get(from);
      const src = from === -1 ? { x: MILL.x, y: MILL.y - 0.5 } : d ? { x: d[2] + 0.5, y: d[3] + 0.5 } : null;
      if (src) this.shots.push({ x0: src.x, y0: src.y, x1: x10 / 10, y1: y10 / 10, kind, born: now });
    }
    if (this.seenShots.size > 2000) this.seenShots.clear();
    const life = 160;
    this.shots = this.shots.filter((f) => now - f.born < life);
    for (const f of this.shots) {
      const a = 1 - (now - f.born) / life;
      if (f.kind === "spray") {
        g.lineStyle(2, 0x3ec1d3, a * 0.8);
        const def = DATA.balance.defenders.sprinkler;
        g.strokeCircle(this.sx(f.x0), this.sy(f.y0), c * (def.rangeCells ?? 2) * (1.1 - a * 0.5));
        continue;
      }
      const color = f.kind === "splash" ? 0xf08a24 : f.kind === "pierce" ? 0x4a4a4a : f.kind === "air" ? 0x9c7bd1 : f.kind === "cannon" ? 0xd9480f : 0x8a5a2b;
      g.lineStyle(f.kind === "pierce" || f.kind === "cannon" ? 3 : 2, color, a);
      g.lineBetween(this.sx(f.x0), this.sy(f.y0), this.sx(f.x1), this.sy(f.y1));
      if (f.kind === "splash") {
        g.fillStyle(0xf08a24, a * 0.35);
        g.fillCircle(this.sx(f.x1), this.sy(f.y1), c * (DATA.balance.defenders.pumpkin.splashRadiusCells ?? 1));
      }
    }
  }

  private drawOverlay(me: SnapPlayer): void {
    const g = this.g;
    const c = this.cell;
    const placing = this.view.placing;
    if (placing && this.hover) {
      const { col, row } = this.hover;
      const def = DATA.balance.defenders[placing];
      const blocked = PATH.isPathCell(col, row) || me.d.some((d) => d[2] === col && d[3] === row);
      const afford = me.grain >= def.cost;
      g.fillStyle(blocked || !afford ? 0xe74c3c : 0xffffff, 0.45);
      g.fillRect(this.sx(col), this.sy(row), c, c);
      const range = def.rangeCells ?? def.auraRangeCells;
      if (range) {
        g.lineStyle(2, 0xffffff, 0.9);
        g.fillStyle(0xffffff, 0.12);
        g.fillCircle(this.sx(col + 0.5), this.sy(row + 0.5), range * c);
        g.strokeCircle(this.sx(col + 0.5), this.sy(row + 0.5), range * c);
      }
    }
    const sel = me.d.find((d) => d[0] === this.view.selectedId);
    if (sel) {
      const def = DATA.balance.defenders[DATA.defenderIds[sel[1]]];
      const range = def.rangeCells ?? def.auraRangeCells;
      if (range) {
        g.lineStyle(2, 0xffffff, 0.9);
        g.fillStyle(0xffffff, 0.1);
        g.fillCircle(this.sx(sel[2] + 0.5), this.sy(sel[3] + 0.5), range * c);
        g.strokeCircle(this.sx(sel[2] + 0.5), this.sy(sel[3] + 0.5), range * c);
      }
    }
    const now = performance.now();
    this.view.marks = this.view.marks.filter((m) => m.until > now);
    for (const m of this.view.marks) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 120);
      g.lineStyle(3, hex(m.color), 0.9);
      g.strokeCircle(this.sx(m.col + 0.5), this.sy(m.row + 0.5), c * (0.4 + pulse * 0.2));
    }
  }
}
