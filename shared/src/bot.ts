import type { Command } from "./commands";
import type { Match, Player } from "./match";
import { dist } from "./path";
import { Rng } from "./rng";

export type BotDifficulty = "easy" | "normal";
export type BotStyle = "greedy" | "fortress" | "raider";

export interface BotOptions {
  difficulty?: BotDifficulty;
  style?: BotStyle;
  seed?: number;
}

const BUILD_PLAN = ["scarecrow", "scarecrow", "pumpkin", "scarecrow", "ballista", "sprinkler", "pumpkin", "ballista", "bell"];
const LATE_CYCLE = ["pumpkin", "ballista", "scarecrow", "ballista", "owl"];

/**
 * Rule-based bot. Issues the same commands a human would, through Match.apply,
 * so it can never cheat. Used for empty slots, disconnected players and the tutorial.
 */
export class Bot {
  readonly playerId: string;
  private readonly difficulty: BotDifficulty;
  private readonly style: BotStyle;
  private readonly rng: Rng;
  private readonly cellRank = new Map<number, [number, number][]>();
  private nextThinkTick = 0;

  constructor(
    private readonly match: Match,
    playerId: string,
    opts: BotOptions = {},
  ) {
    this.playerId = playerId;
    this.difficulty = opts.difficulty ?? "normal";
    this.rng = new Rng(opts.seed ?? hash(playerId));
    this.style = opts.style ?? this.rng.pick(["greedy", "fortress", "raider"] as const);
  }

  /** Call once per simulation tick. Returns the commands it issued (for logging/tests). */
  tick(): Command[] {
    const m = this.match;
    if (m.phase === "ended" || m.tick < this.nextThinkTick) return [];
    const every = this.difficulty === "easy" ? 1.5 : 0.5;
    this.nextThinkTick = m.tick + Math.round(every / m.dt) + this.rng.int(3);
    const p = m.player(this.playerId);
    if (!p) return [];
    const issued: Command[] = [];
    const run = (c: Command | null): boolean => {
      if (!c) return false;
      const r = m.apply(p.id, c);
      if (r.ok) issued.push(c);
      return r.ok;
    };
    run(this.teamwork(p));
    run(this.defense(p));
    run(this.offense(p));
    return issued;
  }

  // ------------------------------------------------------------ defense

  private defense(p: Player): Command | null {
    const m = this.match;
    const defs = m.data.balance.defenders;
    const count = (t: string) => p.defenders.filter((d) => d.type === t).length;
    const next = m.nextWave;
    const easy = this.difficulty === "easy";

    const flyingThreat =
      m.waveUnits(next).some((u) => m.enemyDef(u.type).flying) ||
      m.incoming(p).some((s) => m.data.balance.sends[s.sendId].units.some(([u]) => m.enemyDef(u).flying)) ||
      p.enemies.some((e) => m.enemyDef(e.type).flying) ||
      next >= 7;
    const wantOwls = flyingThreat ? (easy ? 1 : 1 + Math.floor(next / 4)) : 0;
    if (count("owl") < wantOwls && p.grain >= defs.owl.cost) return this.build(p, "owl");

    const wantFeeders = easy ? 0 : this.style === "greedy" ? 4 : this.style === "raider" ? 2 : 1;
    if (next >= 2 && count("feeder") < wantFeeders && p.grain >= defs.feeder.cost + 40) return this.build(p, "feeder");

    const attackers = p.defenders.filter((d) => defs[d.type].attackType !== "none").length;
    const maxAttackers = easy ? 3 + Math.floor(next / 2) : 7 + next;
    const upgradeFirst = attackers >= (easy ? 99 : 6 + Math.floor(next / 2));

    if (!upgradeFirst && attackers < maxAttackers) {
      const planned = attackers < BUILD_PLAN.length ? BUILD_PLAN[attackers] : LATE_CYCLE[attackers % LATE_CYCLE.length];
      if (p.grain >= defs[planned].cost) return this.build(p, planned);
      return null;
    }

    // Upgrade the best-placed lowest-level defender.
    const maxLevel = easy ? 2 : 3;
    const upgradable = p.defenders
      .filter((d) => d.level < maxLevel && defs[d.type].upgradeCost[d.level - 1] !== undefined)
      .sort((a, c) => a.level - c.level || this.coverage(c.type, c.col, c.row) - this.coverage(a.type, a.col, a.row));
    const u = upgradable[0];
    if (u && p.grain >= defs[u.type].upgradeCost[u.level - 1]) return { type: "upgrade", id: u.id };
    if (!u && attackers < maxAttackers + 6) {
      const planned = LATE_CYCLE[attackers % LATE_CYCLE.length];
      if (p.grain >= defs[planned].cost) return this.build(p, planned);
    }
    return null;
  }

  private build(p: Player, type: string): Command | null {
    const def = this.match.data.balance.defenders[type];
    const cells = this.rankedCells(type === "bell" || type === "feeder" ? 2 : (def.rangeCells ?? 2));
    const free = cells.filter(([c, r]) => this.match.canBuildAt(p, c, r));
    if (!free.length) return null;
    let cell: [number, number];
    if (type === "bell") {
      // Put the bell where it touches the most attackers.
      const range = def.auraRangeCells ?? 2;
      cell = free
        .slice(0, 40)
        .map((cr) => ({ cr, n: p.defenders.filter((d) => dist(d, { x: cr[0] + 0.5, y: cr[1] + 0.5 }) <= range).length }))
        .sort((a, b) => b.n - a.n)[0].cr;
    } else if (type === "feeder") {
      cell = free[free.length - 1 - this.rng.int(Math.min(5, free.length))];
    } else {
      // Small randomness so bots don't all build identical fields.
      cell = free[this.rng.int(Math.min(this.difficulty === "easy" ? 12 : 3, free.length))];
    }
    return { type: "build", defender: type, col: cell[0], row: cell[1] };
  }

  /** Cells sorted by how much of the lane a defender with this range covers. */
  private rankedCells(range: number): [number, number][] {
    const cached = this.cellRank.get(range);
    if (cached) return cached;
    const { cols, rows } = this.match.data.balance.map;
    const cells: { cr: [number, number]; score: number }[] = [];
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) {
        if (this.match.path.isPathCell(c, r)) continue;
        cells.push({ cr: [c, r], score: this.coverage2(range, c, r) });
      }
    const ranked = cells.sort((a, b) => b.score - a.score).map((x) => x.cr);
    this.cellRank.set(range, ranked);
    return ranked;
  }

  private coverage(type: string, col: number, row: number): number {
    return this.coverage2(this.match.data.balance.defenders[type].rangeCells ?? 2, col, row);
  }

  private coverage2(range: number, col: number, row: number): number {
    const path = this.match.path;
    const center = { x: col + 0.5, y: row + 0.5 };
    let n = 0;
    for (let s = 0; s < path.laneLength; s += 0.25) if (dist(center, path.pos(s)) <= range) n++;
    return n;
  }

  // ------------------------------------------------------------ offense

  private offense(p: Player): Command | null {
    const m = this.match;
    if (!m.sendsOpen()) return null;
    const sends = m.data.balance.sends;
    const target = m.player(p.targetId);
    if (!target) return null;
    const easy = this.difficulty === "easy";
    const has = (t: string) => target.defenders.some((d) => d.type === t);
    const open = (id: string) => sends[id] && m.sendUnlocked(id);

    // Save up for a goat as fortress / late game.
    if (!easy && open("goat") && (this.style === "fortress" || m.nextWave >= 12)) {
      if (p.lure >= sends.goat.lureCost) return { type: "send", sendId: "goat" };
      if (this.style === "fortress" && p.lure < sends.goat.lureCost) return null;
    }

    let pick: string;
    if (easy) pick = this.rng.next() < 0.7 ? "mice" : "beetle";
    else if (open("crows") && !has("owl")) pick = "crows";
    else if (!has("pumpkin") && !has("sprinkler")) pick = "mice";
    else if (!has("ballista")) pick = "beetle";
    else if (open("snail") && this.rng.next() < 0.3) pick = "snail";
    else if (open("spore") && this.rng.next() < 0.3) pick = "spore";
    else if (this.rng.next() < 0.2) pick = "ferret";
    else pick = this.rng.pick(["mice", "beetle", ...(open("crows") ? ["crows"] : [])]);
    if (!open(pick)) pick = "mice";
    if (!open(pick)) return null;

    const keep = easy ? 30 : this.style === "raider" ? 0 : this.style === "greedy" ? 10 : 40;
    if (p.lure >= sends[pick].lureCost + keep) return { type: "send", sendId: pick };
    return null;
  }

  // ------------------------------------------------------------ teamwork

  private teamwork(p: Player): Command | null {
    const m = this.match;
    if (this.difficulty === "easy") return null;
    const team = m.teams[p.team];
    // Join an ally's raid.
    if (team.raid && team.raid.forWave === m.nextWave && p.targetId !== team.raid.targetId)
      return { type: "target", playerId: team.raid.targetId };
    // Help a leaking ally.
    const struggling = m.allies(p).find((a) => m.laneStatus(a) === "bad" && a.grain < 100);
    if (struggling && p.grain > 220 && m.wave >= p.giftReadyWave) return { type: "gift", playerId: struggling.id };
    // Insure the Mill when it is getting low.
    const c = m.data.balance.economy.millCannon;
    if (team.hp / team.maxHp < 0.6 && team.cannonLevel < 3 && p.grain > c.costPerLevel + 150) return { type: "cannon" };
    return null;
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
