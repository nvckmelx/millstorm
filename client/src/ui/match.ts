import Phaser from "phaser";
import { DATA, type Command, type PingKind, type SnapPlayer, type Snapshot } from "@millstorm/shared";
import { SnapBuffer } from "../game/buffer";
import { FieldScene, type FieldView } from "../game/FieldScene";
import { ATTACK_LABEL, DEFENDER_COLORS, TEAM_COLORS, armorColor, enemyName, strongAgainst } from "../game/look";
import { drawMiniField } from "../game/minimap";
import type { Session } from "../net";
import { h, setText, toast } from "./dom";
import { Hints } from "./hints";
import { PING_TEXT, PING_WHEEL, STICKERS, eventText, sendUnitsText } from "./text";

const B = DATA.balance;

interface PlayerCard {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  info: HTMLElement;
  actions: HTMLElement;
}

export class MatchScreen {
  readonly buffer = new SnapBuffer();
  private game: Phaser.Game | null = null;
  private view: FieldView;
  private el: Record<string, HTMLElement> = {};
  private buildBtns = new Map<string, HTMLButtonElement>();
  private sendBtns = new Map<string, HTMLButtonElement>();
  private cards = new Map<string, PlayerCard>();
  private feed: HTMLElement;
  private seenEvents = 0;
  private hints: Hints | null;
  private lastMiniDraw = 0;
  private onKey = (e: KeyboardEvent) => this.key(e);
  private wheel: HTMLElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly session: Session,
    private readonly onLeave: () => void,
  ) {
    this.view = { you: session.you, placing: null, selectedId: null, marks: [] };
    this.feed = h("div.feed-list");
    this.hints = session.tutorial ? new Hints(this.view) : null;
    root.replaceChildren(this.render());
    this.startPhaser();
    window.addEventListener("keydown", this.onKey);
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKey);
    this.game?.destroy(true);
    this.game = null;
    this.closeWheel();
  }

  private cmd(c: Command): void {
    this.session.send("cmd", c);
  }

  // ------------------------------------------------------------ layout

  private render(): HTMLElement {
    const e = this.el;
    const top = h(
      "header.topbar",
      {},
      h(
        "div.resources",
        {},
        h("div.res.grain", { title: "Зерно: постройка и улучшения" }, h("span.icon.grain-icon"), (e.grain = h("b", {}, "0")), (e.income = h("small", {}, ""))),
        h(
          "div.res.lure",
          { title: "Приманка: отправка вредителей. Потолок 150" },
          h("span.icon.lure-icon"),
          (e.lure = h("b", {}, "0")),
          h("div.lurebar", {}, (e.lureFill = h("div"))),
          (e.lureRegen = h("small", {}, "")),
        ),
      ),
      h(
        "div.scoreboard",
        {},
        h("div.mill.ours", {}, h("span", {}, "Мы"), h("div.hpbar", {}, (e.ourHp = h("div"))), (e.ourHpText = h("b", {}, ""))),
        h("div.wave", {}, (e.waveNo = h("div.wave-no", {}, "")), (e.timer = h("div.timer", {}, "")), (e.phase = h("div.phase", {}, ""))),
        h("div.mill.theirs", {}, (e.theirHpText = h("b", {}, "")), h("div.hpbar", {}, (e.theirHp = h("div"))), h("span", {}, "Они")),
      ),
      h(
        "div.sys",
        {},
        (e.latency = h("span.latency", {}, "")),
        h("button.ghost", { onclick: () => this.confirmLeave() }, "Выйти"),
      ),
    );

    const left = h(
      "aside.left",
      {},
      h("h4", {}, "События"),
      this.feed,
      h("h4", {}, "Пинги ", h("small", {}, "Alt+клик по полю")),
      h(
        "div.pings",
        {},
        ...[...PING_WHEEL, ...STICKERS].map((k) =>
          h("button.ping", { onclick: () => this.cmd({ type: "ping", ping: k }), title: PING_TEXT[k] }, PING_TEXT[k]),
        ),
      ),
    );

    const center = h(
      "main.center",
      {},
      (e.incoming = h("div.incoming", {}, "")),
      (e.banner = h("div.banner", {}, "")),
      (e.field = h("div.field", { id: "field" })),
      (e.hint = h("div.hint", {}, "")),
    );

    const right = h(
      "aside.right",
      {},
      (e.teamBox = h(
        "div.teambox",
        {},
        h("h4", {}, "Мельница команды"),
        (e.cannon = h("div.cannon", {}, "")),
        (e.cannonBtn = h(
          "button.small",
          { onclick: () => this.cmd({ type: "cannon" }), title: "Пушка во Дворе бьёт прорвавшихся вредителей" },
          `Вложить ${B.economy.millCannon.costPerLevel} в пушку`,
        )),
        (e.raid = h("div.raid", {}, "")),
      )),
      h("h4", {}, "Союзники"),
      (e.allies = h("div.cards")),
      h("h4", {}, "Соперники ", h("small", {}, "клик — сменить цель")),
      (e.enemies = h("div.cards")),
    );

    const defense = h("div.defense", {}, h("div.bar-title", {}, "Защита · Зерно"));
    const row = h("div.buttons");
    for (const id of DATA.defenderIds) {
      const d = B.defenders[id];
      const strong = strongAgainst(d.attackType);
      const btn = h(
        "button.build",
        {
          onclick: () => this.startPlacing(id),
          title: defenderTip(id),
        },
        h("span.swatch", { style: `background:${DEFENDER_COLORS[id]}` }),
        h("span.name", {}, d.name),
        h("span.cost", {}, d.cost),
        h("span.key", {}, d.hotkey),
        h("span.strip", { style: `background:${strong ? armorColor(strong) : d.attackType === "air" ? "#fff" : "transparent"}` }),
      );
      this.buildBtns.set(id, btn);
      row.append(btn);
    }
    defense.append(row);

    e.selection = h("div.selection", {}, "");

    const offense = h("div.offense", {}, h("div.bar-title", {}, "Давление · Приманка ", (e.target = h("span.target", {}, ""))));
    const srow = h("div.buttons");
    for (const id of DATA.sendIds) {
      const s = B.sends[id];
      const main = B.enemies[s.units[0][0]];
      const btn = h(
        "button.send",
        { onclick: () => this.cmd({ type: "send", sendId: id }), title: `${s.name}: ${sendUnitsText(id)}. +${s.incomeGain} к доходу навсегда` },
        h("span.swatch.round", { style: `background:${armorColor(main.armor)}` }),
        h("span.name", {}, s.name),
        h("span.cost", {}, `${s.lureCost} · +${s.incomeGain}`),
        h("span.key", {}, s.hotkey),
        h("span.lock", {}, ""),
      );
      this.sendBtns.set(id, btn);
      srow.append(btn);
    }
    offense.append(srow, (e.queue = h("div.queue", {}, "")));

    const bottom = h("footer.bottombar", {}, defense, e.selection, offense);
    return h("div.match", {}, top, left, center, right, bottom);
  }

  private startPhaser(): void {
    const scene = new FieldScene(this.buffer, this.view, {
      cellClick: (col, row, shift) => {
        if (this.view.placing) {
          this.cmd({ type: "build", defender: this.view.placing, col, row });
          if (!shift) this.view.placing = null;
          this.refreshSelection();
        } else {
          this.view.selectedId = null;
          this.refreshSelection();
        }
      },
      defenderClick: (id) => {
        this.view.selectedId = id;
        this.refreshSelection();
      },
      cancel: () => {
        this.view.placing = null;
        this.view.selectedId = null;
        this.refreshSelection();
      },
      ping: (col, row, x, y) => this.openWheel(x, y, col, row),
    });
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.el.field,
      backgroundColor: "#bfe3f5",
      scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
      scene,
      banner: false,
      render: { antialias: true },
      input: { mouse: { preventDefaultWheel: false } },
    });
  }

  // ------------------------------------------------------------ input

  private startPlacing(id: string): void {
    this.view.placing = this.view.placing === id ? null : id;
    this.view.selectedId = null;
    this.refreshSelection();
  }

  private key(e: KeyboardEvent): void {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    const k = e.key.toUpperCase();
    if (k === "ESCAPE") {
      this.view.placing = null;
      this.view.selectedId = null;
      this.closeWheel();
      this.refreshSelection();
      return;
    }
    const def = DATA.defenderIds.find((id) => B.defenders[id].hotkey.toUpperCase() === k);
    if (def) return this.startPlacing(def);
    const send = DATA.sendIds.find((id) => B.sends[id].hotkey === e.key);
    if (send) return this.cmd({ type: "send", sendId: send });
    if (this.view.selectedId !== null) {
      if (k === "Z") this.cmd({ type: "upgrade", id: this.view.selectedId });
      if (k === "X") {
        this.cmd({ type: "sell", id: this.view.selectedId });
        this.view.selectedId = null;
      }
    }
  }

  private openWheel(x: number, y: number, col: number, row: number): void {
    this.closeWheel();
    const opts: PingKind[] = PING_WHEEL;
    this.wheel = h(
      "div.wheel",
      { style: `left:${x}px;top:${y}px` },
      ...opts.map((k, i) => {
        const a = (i / opts.length) * Math.PI * 2 - Math.PI / 2;
        return h(
          "button.ping",
          {
            style: `transform:translate(calc(-50% + ${Math.cos(a) * 80}px), calc(-50% + ${Math.sin(a) * 60}px))`,
            onclick: () => {
              this.cmd({ type: "ping", ping: k, col, row });
              this.closeWheel();
            },
          },
          PING_TEXT[k],
        );
      }),
    );
    document.body.append(this.wheel);
    setTimeout(() => document.addEventListener("pointerdown", this.wheelOutside, { once: true }), 0);
  }

  private wheelOutside = (e: Event) => {
    if (this.wheel && !this.wheel.contains(e.target as Node)) this.closeWheel();
    else if (this.wheel) document.addEventListener("pointerdown", this.wheelOutside, { once: true });
  };

  private closeWheel(): void {
    this.wheel?.remove();
    this.wheel = null;
  }

  private confirmLeave(): void {
    const text = this.session.offline ? "Выйти в меню? Матч будет потерян." : "Выйти из матча? Твою линию возьмёт бот.";
    if (confirm(text)) this.onLeave();
  }

  // ------------------------------------------------------------ updates

  latency(ms: number): void {
    setText(this.el.latency, this.session.offline ? "офлайн" : `${ms} мс`);
  }

  update(s: Snapshot): void {
    this.buffer.push(s);
    const me = s.players.find((p) => p.id === this.session.you);
    if (!me) return;
    const e = this.el;
    const ours = s.teams[me.team];
    const theirs = s.teams[1 - me.team];

    setText(e.grain, me.grain);
    setText(e.income, `+${me.income} за волну`);
    setText(e.lure, Math.floor(me.lure));
    e.lureFill.style.width = `${(me.lure / B.economy.lureCap) * 100}%`;
    setText(e.lureRegen, `+${me.lureRegen.toFixed(2).replace(/\.?0+$/, "")}/с`);

    e.ourHp.style.width = `${(ours.hp / ours.maxHp) * 100}%`;
    e.ourHp.style.background = TEAM_COLORS[me.team];
    e.theirHp.style.width = `${(theirs.hp / theirs.maxHp) * 100}%`;
    e.theirHp.style.background = TEAM_COLORS[1 - me.team];
    setText(e.ourHpText, `${ours.hp}/${ours.maxHp}${ours.secondWind ? " ↑" : ""}`);
    setText(e.theirHpText, `${theirs.secondWind ? "↑ " : ""}${theirs.hp}/${theirs.maxHp}`);
    e.ourHpText.title = ours.secondWind ? "Второе дыхание: +20% дохода и Приманки" : "";
    e.theirHpText.title = theirs.secondWind ? "Второе дыхание у соперника" : "";

    const t = Math.ceil(s.timeLeft);
    const waveLabel = s.phase === "combat" ? `Волна ${s.wave}` : s.phase === "ended" ? `Волна ${s.wave}` : `Волна ${s.nextWave} через`;
    setText(e.waveNo, waveLabel + (s.suddenDeath ? " · Внезапная смерть" : ""));
    setText(e.timer, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);
    e.timer.classList.toggle("urgent", s.phase !== "combat" && t <= 5);
    setText(e.phase, s.phase === "combat" ? "бой" : s.phase === "ended" ? "конец" : s.sendsOpen ? "подготовка" : "очередь закрыта");

    this.updateButtons(s, me);
    this.updateIncoming(s, me);
    this.updateTeam(s, me);
    this.refreshSelection(me);
    this.updateFeed(s);
    this.hints?.update(s, me, (text) => this.showHint(text));

    const now = performance.now();
    if (now - this.lastMiniDraw > 150) {
      this.lastMiniDraw = now;
      this.updateCards(s, me);
    }
  }

  private updateButtons(s: Snapshot, me: SnapPlayer): void {
    for (const [id, btn] of this.buildBtns) {
      const d = B.defenders[id];
      const capped = d.maxPerPlayer !== undefined && me.d.filter((x) => DATA.defenderIds[x[1]] === id).length >= d.maxPerPlayer;
      btn.classList.toggle("poor", me.grain < d.cost || capped);
      btn.classList.toggle("active", this.view.placing === id);
    }
    const target = s.players.find((p) => p.id === me.targetId);
    for (const [id, btn] of this.sendBtns) {
      const sd = B.sends[id];
      const unlock = Math.max(sd.unlockWave, B.match.sendsUnlockWave);
      const locked = s.nextWave < unlock;
      btn.classList.toggle("locked", locked);
      btn.classList.toggle("poor", !locked && (me.lure < sd.lureCost || !s.sendsOpen));
      setText(btn.querySelector(".lock"), locked ? `в${unlock}` : "");
    }
    setText(this.el.target, target ? `→ цель: ${target.name}` : "");
    const q = me.q.map(([idx, tid]) => `${B.sends[DATA.sendIds[idx]].name}${s.players.length > 2 ? ` → ${nameOf(s, tid)}` : ""}`);
    setText(this.el.queue, q.length ? `Твоя очередь: ${q.join(", ")}` : s.sendsOpen ? "" : "Очередь закрыта — отправки уйдут со следующей волной");
  }

  private updateIncoming(s: Snapshot, me: SnapPlayer): void {
    const incoming: Record<string, number> = {};
    for (const p of s.players) {
      if (p.team === me.team) continue;
      for (const [idx, tid] of p.q) if (tid === me.id) incoming[DATA.sendIds[idx]] = (incoming[DATA.sendIds[idx]] ?? 0) + 1;
    }
    const el = this.el.incoming;
    const entries = Object.entries(incoming);
    const nextUnits = s.phase === "ended" ? [] : DATA.waves[Math.min(s.nextWave, DATA.waves.length) - 1]?.units ?? [];
    el.replaceChildren(
      h("span.label", {}, entries.length ? "Идут к тебе:" : "К тебе пока ничего не идёт"),
      ...entries.map(([id, n]) => {
        const main = B.enemies[B.sends[id].units[0][0]];
        return h("span.chip", { style: `border-color:${armorColor(main.armor)}` }, h("i", { style: `background:${armorColor(main.armor)}` }), `${B.sends[id].name} ×${n}`);
      }),
      h("span.next", {}, `Волна ${s.nextWave}: ${nextUnits.map((u) => `${enemyName(u.type)} ×${u.count}`).join(", ")}`),
    );
    el.classList.toggle("danger", entries.length > 0);
  }

  private updateTeam(s: Snapshot, me: SnapPlayer): void {
    const team = s.teams[me.team];
    const c = B.economy.millCannon;
    const contrib = Object.entries(team.cannonContrib)
      .map(([id, n]) => `${nameOf(s, id)} ×${n}`)
      .join(", ");
    setText(this.el.cannon, `Пушка ур. ${team.cannonLevel}/${c.maxLevel}${contrib ? ` (${contrib})` : ""}${s.suddenDeath ? " — выключена" : ""}`);
    (this.el.cannonBtn as HTMLButtonElement).disabled = team.cannonLevel >= c.maxLevel || me.grain < c.costPerLevel || s.suddenDeath;
    const raid = team.raid;
    if (raid) {
      const joined = raid.participants.includes(me.id);
      const children: (Node | string)[] = [`Налёт на ${nameOf(s, raid.targetId)} (${raid.participants.length} уч.)`];
      if (!joined && me.targetId !== raid.targetId)
        children.push(h("button.small", { onclick: () => this.cmd({ type: "target", playerId: raid.targetId }) }, "Присоединиться"));
      else if (!joined) children.push(h("small", {}, " — отправь кого-нибудь"));
      this.el.raid.replaceChildren(...children);
    } else if (this.el.raid.childNodes.length) this.el.raid.replaceChildren();
    this.el.teamBox.classList.toggle("solo", s.players.filter((p) => p.team === me.team).length === 1);
  }

  private updateCards(s: Snapshot, me: SnapPlayer): void {
    const seen = new Set<string>();
    for (const p of s.players) {
      if (p.id === me.id) continue;
      seen.add(p.id);
      const ally = p.team === me.team;
      let card = this.cards.get(p.id);
      if (!card) {
        const canvas = h("canvas.mini");
        const info = h("div.info");
        const actions = h("div.actions");
        const root = h("div.card", { onclick: () => !ally && this.cmd({ type: "target", playerId: p.id }) }, canvas, h("div.meta", {}, info, actions));
        card = { root, canvas, info, actions };
        this.cards.set(p.id, card);
        (ally ? this.el.allies : this.el.enemies).append(root);
      }
      card.root.className = `card ${p.status} ${ally ? "ally" : "enemy"}${me.targetId === p.id ? " targeted" : ""}`;
      card.root.style.setProperty("--team", TEAM_COLORS[p.team]);
      drawMiniField(card.canvas, p);
      const status = p.status === "ok" ? "держит" : p.status === "warn" ? "течёт" : "провал";
      card.info.replaceChildren(
        h("b", {}, p.name, p.isBot || !p.connected ? h("small", {}, p.isBot ? " (бот)" : " (бот, пока игрок вернётся)") : ""),
        h("span", {}, ally ? status : `Приманка ${Math.floor(p.lure)}`),
        !ally && p.lure >= 120 ? h("span.warn", {}, "копит на тарана?") : "",
      );
      const acts: Node[] = [];
      if (ally) {
        const g = B.economy.gift;
        const btn = h(
          "button.small",
          { onclick: (ev: Event) => (ev.stopPropagation(), this.cmd({ type: "gift", playerId: p.id })), title: `Стоит тебе ${g.cost}` },
          `Подарить ${g.amount}`,
        );
        btn.disabled = !me.giftReady || me.grain < g.cost;
        acts.push(btn);
      } else {
        const ourRaid = s.teams[me.team].raid;
        const teamSize = s.players.filter((x) => x.team === me.team).length;
        if (teamSize > 1 && !ourRaid && s.sendsOpen)
          acts.push(h("button.small", { onclick: (ev: Event) => (ev.stopPropagation(), this.cmd({ type: "raid", targetId: p.id })), title: "Все отправки команды в эту цель получат +15% HP, если участвуют 2+ игрока" }, "Налёт"));
        if (me.targetId === p.id) acts.push(h("span.tag", {}, "цель"));
      }
      card.actions.replaceChildren(...acts);
    }
    for (const [id, c] of this.cards)
      if (!seen.has(id)) {
        c.root.remove();
        this.cards.delete(id);
      }
  }

  private refreshSelection(me?: SnapPlayer): void {
    me ??= this.buffer.cur?.players.find((p) => p.id === this.session.you);
    const box = this.el.selection;
    if (!box) return;
    if (this.view.placing) {
      const d = B.defenders[this.view.placing];
      box.replaceChildren(h("b", {}, `Ставим: ${d.name}`), h("small", {}, "Клик — поставить, Shift — ещё, ПКМ/Esc — отмена"));
      return;
    }
    const sel = me?.d.find((d) => d[0] === this.view.selectedId);
    if (!sel || !me) {
      if (this.view.selectedId !== null && me) this.view.selectedId = null;
      box.replaceChildren(h("small.muted", {}, "Выбери Стража на поле, чтобы улучшить или продать"));
      return;
    }
    const type = DATA.defenderIds[sel[1]];
    const def = B.defenders[type];
    const level = sel[4];
    const upCost = def.upgradeCost[level - 1];
    const up = h("button.small", { onclick: () => this.cmd({ type: "upgrade", id: sel[0] }) }, upCost !== undefined ? `Улучшить ${upCost} [Z]` : "Макс. уровень");
    up.disabled = upCost === undefined || me.grain < upCost;
    const sell = h(
      "button.small.danger",
      {
        onclick: () => {
          this.cmd({ type: "sell", id: sel[0] });
          this.view.selectedId = null;
        },
      },
      `Продать +${sel[6]} [X]`,
    );
    const next = level === 2 && def.lvl3 ? h("small", {}, `Ур. 3: ${def.lvl3}`) : "";
    box.replaceChildren(h("b", {}, `${def.name} · ур. ${level}`), h("div.row", {}, up, sell), next);
  }

  private updateFeed(s: Snapshot): void {
    for (const ev of s.events) {
      if (ev.id <= this.seenEvents) continue;
      this.seenEvents = ev.id;
      if (ev.kind === "ping" && ev.col !== undefined && ev.row !== undefined) {
        const who = s.players.find((p) => p.id === ev.playerId);
        const me = s.players.find((p) => p.id === this.session.you);
        if (who && me && who.team === me.team) this.view.marks.push({ col: ev.col, row: ev.row, until: performance.now() + 3000, color: "#ffffff" });
      }
      if (ev.kind === "goatIncoming" && ev.to === this.session.you) this.flashBanner("На тебя идёт Козёл-таран!");
      if (ev.kind === "wave" && ev.boss) this.flashBanner(`Волна ${ev.wave}: босс!`);
      const line = eventText(ev, s, this.session.you);
      if (!line) continue;
      this.feed.prepend(h(`div.line.${line.tone}`, {}, line.text));
      while (this.feed.childNodes.length > 40) this.feed.lastChild?.remove();
    }
  }

  private flashBanner(text: string): void {
    const b = this.el.banner;
    b.textContent = text;
    b.classList.remove("show");
    void b.offsetWidth;
    b.classList.add("show");
  }

  private showHint(text: string | null): void {
    const el = this.el.hint;
    el.textContent = text ?? "";
    el.classList.toggle("show", !!text);
  }

  error(text: string): void {
    toast(text);
  }
}

function nameOf(s: Snapshot, id: string): string {
  return s.players.find((p) => p.id === id)?.name ?? "?";
}

function defenderTip(id: string): string {
  const d = B.defenders[id];
  const lines = [`${d.name} — ${d.cost} Зерна`];
  if (d.attackType !== "none") {
    lines.push(`Атака: ${ATTACK_LABEL[d.attackType]}, урон ${d.damage?.join("/")}, радиус ${d.rangeCells}`);
    const m = B.damageMultipliers[d.attackType];
    const strong = Object.entries(m).filter(([, v]) => v > 1).map(([a]) => B.armorTypes[a as "swift"]?.label ?? a);
    const weak = Object.entries(m).filter(([, v]) => v < 1).map(([a]) => B.armorTypes[a as "swift"]?.label ?? a);
    if (strong.length) lines.push(`Силён против: ${strong.join(", ")}`);
    if (weak.length) lines.push(`Слаб против: ${weak.join(", ")}${d.hitsFlying ? "" : " (летунов не бьёт)"}`);
  }
  if (d.slow) lines.push(`Замедление ${d.slow.map((x) => `${x * 100}%`).join("/")}`);
  if (d.attackSpeedBonus) lines.push(`Аура: +${d.attackSpeedBonus.map((x) => `${x * 100}%`).join("/")} к скорости атаки соседей`);
  if (d.lureRegenBonus) lines.push(`+${d.lureRegenBonus} Приманки/с, не больше ${d.maxPerPlayer}`);
  if (d.upgradeCost.length) lines.push(`Улучшения: ${d.upgradeCost.join(" / ")}`);
  if (d.lvl3) lines.push(`Ур. 3: ${d.lvl3}`);
  return lines.join("\n");
}
