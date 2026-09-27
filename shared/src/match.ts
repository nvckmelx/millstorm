import type { Command, CommandResult, PingKind } from "./commands";
import { DATA, type DefenderDef, type EnemyDef, type GameData, type WaveDef } from "./data";
import { LanePath, dist, type Vec } from "./path";
import { Rng } from "./rng";

export type Phase = "start" | "prep" | "combat" | "ended";
export type TeamId = 0 | 1;

export interface Defender {
  id: number;
  type: string;
  col: number;
  row: number;
  x: number;
  y: number;
  level: number;
  cooldown: number;
  shots: number;
  /** Grain spent in earlier phase windows (refunded at sellRefund). */
  oldSpent: number;
  /** Grain spent in `window` (refunded in full while the window lasts). */
  newSpent: number;
  window: number;
  sporeTimer: number;
  sporeSlow: number;
}

export interface Enemy {
  id: number;
  type: string;
  hp: number;
  maxHp: number;
  shield: number;
  shielded: boolean;
  progress: number;
  x: number;
  y: number;
  slowTimer: number;
  slowAmount: number;
  sprinklerSlow: number;
  leaked: boolean;
  senderId: string | null;
  /** Lure value of this unit, used for the defender's bounty share. */
  sendValue: number;
}

interface Spawn {
  type: string;
  hpMult: number;
  senderId: string | null;
  sendValue: number;
  delay: number;
}

export interface Shot {
  tick: number;
  from: number;
  x: number;
  y: number;
  kind: string;
}

export interface QueuedSend {
  sendId: string;
  targetId: string;
  raid: boolean;
}

export interface PlayerStats {
  kills: number;
  bountyGrain: number;
  leaksAllowed: number;
  leaksByType: Record<string, number>;
  lureSpent: number;
  sendDamage: number;
  goatLure: number;
  giftsGiven: number;
  cannonGiven: number;
}

export interface Player {
  id: string;
  name: string;
  team: TeamId;
  slot: number;
  isBot: boolean;
  connected: boolean;
  grain: number;
  lure: number;
  sendIncome: number;
  targetId: string;
  giftReadyWave: number;
  lastPingTick: number;
  leaksThisWave: number;
  leaksSinceIncome: number;
  leakSignalled: boolean;
  lastIncome: number;
  defenders: Defender[];
  enemies: Enemy[];
  pending: Spawn[];
  spawnClock: number;
  queue: QueuedSend[];
  shots: Shot[];
  stats: PlayerStats;
}

export interface Raid {
  byId: string;
  targetId: string;
  forWave: number;
  participants: string[];
}

export interface Team {
  id: TeamId;
  hp: number;
  maxHp: number;
  cannonLevel: number;
  cannonCooldown: number;
  cannonContrib: Record<string, number>;
  raid: Raid | null;
  raidUsedWave: number;
  damageDealt: number;
  secondWind: boolean;
}

export type MatchEvent = { id: number; t: number } & (
  | { kind: "wave"; wave: number; boss: boolean; suddenDeath: boolean }
  | { kind: "send"; from: string; to: string; sendId: string }
  | { kind: "goatIncoming"; from: string; to: string }
  | { kind: "leak"; playerId: string; enemy: string; damage: number }
  | { kind: "leaking"; playerId: string; leaks: number }
  | { kind: "gift"; from: string; to: string; amount: number }
  | { kind: "cannon"; playerId: string; level: number }
  | { kind: "raid"; by: string; targetId: string }
  | { kind: "raidResolved"; team: TeamId; targetId: string; participants: number; active: boolean }
  | { kind: "ping"; playerId: string; ping: PingKind; targetId?: string; col?: number; row?: number }
  | { kind: "secondWind"; team: TeamId; on: boolean }
  | { kind: "income"; wave: number }
  | { kind: "ended"; winner: TeamId | null }
);
type EventBody = MatchEvent extends infer E ? (E extends MatchEvent ? Omit<E, "id" | "t"> : never) : never;

export interface MatchResult {
  winner: TeamId | null;
  reason: "mill" | "tiebreak" | "waves" | "draw";
  /** Who landed the last hit on the losing Mill, for the "Mill broken by X's goat" banner. */
  finisher: { playerId: string | null; enemy: string } | null;
  durationSec: number;
  waves: number;
}

export interface MatchPlayerConfig {
  id: string;
  name: string;
  team: TeamId;
  isBot?: boolean;
}

export interface MatchConfig {
  players: MatchPlayerConfig[];
  seed?: number;
  /** Tutorial: end the match after this wave, winner by Mill HP. */
  maxWaves?: number;
  data?: GameData;
}

const MAX_EVENTS = 200;

export class Match {
  readonly data: GameData;
  readonly path: LanePath;
  readonly dt: number;
  readonly rng: Rng;
  readonly maxWaves: number | undefined;
  tick = 0;
  phase: Phase = "start";
  phaseTicks: number;
  /** Wave currently (or last) in combat; 0 before wave 1. */
  wave = 0;
  window = 0;
  players: Player[] = [];
  teams: [Team, Team];
  events: MatchEvent[] = [];
  eventSeq = 0;
  result: MatchResult | null = null;
  hpHistory: [number, number][] = [];
  private nextId = 1;
  private finisher: MatchResult["finisher"] = null;

  constructor(cfg: MatchConfig) {
    this.data = cfg.data ?? DATA;
    const b = this.data.balance;
    this.dt = 1 / b.match.tickRate;
    this.rng = new Rng(cfg.seed ?? 1);
    this.maxWaves = cfg.maxWaves;
    this.path = new LanePath(b.map.path, b.map.yardLengthCells);
    this.phaseTicks = this.secToTicks(b.match.startBuildSeconds);

    const slots: [number, number] = [0, 0];
    for (const pc of cfg.players) {
      this.players.push({
        id: pc.id,
        name: pc.name,
        team: pc.team,
        slot: slots[pc.team]++,
        isBot: !!pc.isBot,
        connected: true,
        grain: b.economy.startGrain,
        lure: b.economy.startLure,
        sendIncome: 0,
        targetId: "",
        giftReadyWave: 0,
        lastPingTick: -1000,
        leaksThisWave: 0,
        leaksSinceIncome: 0,
        leakSignalled: false,
        lastIncome: 0,
        defenders: [],
        enemies: [],
        pending: [],
        spawnClock: 0,
        queue: [],
        shots: [],
        stats: {
          kills: 0,
          bountyGrain: 0,
          leaksAllowed: 0,
          leaksByType: {},
          lureSpent: 0,
          sendDamage: 0,
          goatLure: 0,
          giftsGiven: 0,
          cannonGiven: 0,
        },
      });
    }
    const mkTeam = (id: TeamId): Team => {
      const size = Math.max(1, slots[id]);
      return {
        id,
        hp: b.match.millHpPerPlayer * size,
        maxHp: b.match.millHpPerPlayer * size,
        cannonLevel: 0,
        cannonCooldown: 0,
        cannonContrib: {},
        raid: null,
        raidUsedWave: 0,
        damageDealt: 0,
        secondWind: false,
      };
    };
    this.teams = [mkTeam(0), mkTeam(1)];
    for (const p of this.players) p.targetId = this.mirrorTarget(p)?.id ?? "";
  }

  // ---------------------------------------------------------------- queries

  get time(): number {
    return this.tick * this.dt;
  }

  get timeLeft(): number {
    return this.phaseTicks * this.dt;
  }

  /** The wave whose combat starts next (sends queued now arrive with it). */
  get nextWave(): number {
    return this.phase === "start" ? 1 : this.wave + 1;
  }

  get suddenDeath(): boolean {
    return this.wave >= this.data.balance.match.suddenDeath.fromWave;
  }

  player(id: string): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  opponents(p: Player): Player[] {
    return this.players.filter((o) => o.team !== p.team);
  }

  allies(p: Player): Player[] {
    return this.players.filter((o) => o.team === p.team && o.id !== p.id);
  }

  waveDef(n: number): WaveDef {
    const { waves } = this.data;
    const total = this.data.balance.match.wavesTotal;
    if (n <= total) return waves[n - 1];
    const tpl = this.data.balance.match.suddenDeath.waveTemplates;
    return waves[tpl[(n - total - 1) % tpl.length] - 1];
  }

  waveHpMult(n: number): number {
    const m = this.data.balance.match;
    const total = m.wavesTotal;
    if (n <= total) return this.data.waves[n - 1].hpMultiplier;
    const growth = Math.pow(1 + m.suddenDeath.hpGrowthPerWave, n - Math.max(total, m.suddenDeath.fromWave - 1));
    return this.data.waves[total - 1].hpMultiplier * growth;
  }

  /** Grain a player would get at the end of wave `n` with the current state. */
  incomeFor(p: Player, n: number): number {
    const e = this.data.balance.economy;
    let income = e.incomeBase + e.incomePerWave * n + p.sendIncome;
    if (p.leaksSinceIncome === 0) income += e.cleanWaveBonus;
    if (this.teams[p.team].secondWind) income *= 1 + e.secondWind.grainIncomeBonus;
    return Math.floor(income);
  }

  lureRegen(p: Player): number {
    const b = this.data.balance;
    const feeders = p.defenders.filter((d) => d.type === "feeder").length;
    const bonus = b.defenders.feeder?.lureRegenBonus ?? 0;
    let regen = b.economy.lureRegenPerSecond + feeders * bonus;
    if (this.teams[p.team].secondWind) regen *= 1 + b.economy.secondWind.lureRegenBonus;
    return regen;
  }

  sendsOpen(): boolean {
    if (this.phase === "ended") return false;
    if (this.phase === "combat") return true;
    return this.timeLeft > this.data.balance.match.sendLockBeforeWaveSeconds + 1e-9;
  }

  sendUnlocked(sendId: string): boolean {
    const s = this.data.balance.sends[sendId];
    return !!s && this.nextWave >= Math.max(s.unlockWave, this.data.balance.match.sendsUnlockWave);
  }

  /** Sends queued by opponents that will arrive on this player's lane with the next wave. */
  incoming(p: Player): { from: string; sendId: string }[] {
    const out: { from: string; sendId: string }[] = [];
    for (const o of this.opponents(p)) for (const q of o.queue) if (q.targetId === p.id) out.push({ from: o.id, sendId: q.sendId });
    return out;
  }

  canBuildAt(p: Player, col: number, row: number): boolean {
    const m = this.data.balance.map;
    if (!Number.isInteger(col) || !Number.isInteger(row)) return false;
    if (col < 0 || row < 0 || col >= m.cols || row >= m.rows) return false;
    if (this.path.isPathCell(col, row)) return false;
    return !p.defenders.some((d) => d.col === col && d.row === row);
  }

  laneStatus(p: Player): "ok" | "warn" | "bad" {
    return p.leaksThisWave >= 3 ? "bad" : p.leaksThisWave > 0 ? "warn" : "ok";
  }

  // ---------------------------------------------------------------- commands

  apply(playerId: string, cmd: Command): CommandResult {
    const p = this.player(playerId);
    if (!p) return fail("Нет такого игрока");
    if (this.phase === "ended") return fail("Матч окончен");
    const b = this.data.balance;
    switch (cmd.type) {
      case "build": {
        const def = b.defenders[cmd.defender];
        if (!def) return fail("Неизвестный Страж");
        if (!this.canBuildAt(p, cmd.col, cmd.row)) return fail("Здесь нельзя строить");
        if (def.maxPerPlayer !== undefined && p.defenders.filter((d) => d.type === cmd.defender).length >= def.maxPerPlayer)
          return fail(`Не больше ${def.maxPerPlayer}`);
        if (p.grain < def.cost) return fail("Не хватает Зерна");
        p.grain -= def.cost;
        p.defenders.push({
          id: this.nextId++,
          type: cmd.defender,
          col: cmd.col,
          row: cmd.row,
          x: cmd.col + 0.5,
          y: cmd.row + 0.5,
          level: 1,
          cooldown: 0,
          shots: 0,
          oldSpent: 0,
          newSpent: def.cost,
          window: this.window,
          sporeTimer: 0,
          sporeSlow: 0,
        });
        return ok();
      }
      case "upgrade": {
        const d = p.defenders.find((x) => x.id === cmd.id);
        if (!d) return fail("Нет такого Стража");
        const def = b.defenders[d.type];
        const cost = def.upgradeCost[d.level - 1];
        if (cost === undefined) return fail("Максимальный уровень");
        if (p.grain < cost) return fail("Не хватает Зерна");
        p.grain -= cost;
        this.spend(d, cost);
        d.level++;
        return ok();
      }
      case "sell": {
        const idx = p.defenders.findIndex((x) => x.id === cmd.id);
        if (idx < 0) return fail("Нет такого Стража");
        p.grain += this.sellValue(p.defenders[idx]);
        p.defenders.splice(idx, 1);
        return ok();
      }
      case "send": {
        const s = b.sends[cmd.sendId];
        if (!s) return fail("Неизвестная отправка");
        if (!this.sendUnlocked(cmd.sendId)) return fail(`Откроется на волне ${Math.max(s.unlockWave, b.match.sendsUnlockWave)}`);
        if (!this.sendsOpen()) return fail("Очередь закрыта до начала волны");
        const target = this.player(p.targetId);
        if (!target || target.team === p.team) return fail("Нет цели");
        if (p.lure < s.lureCost) return fail("Не хватает Приманки");
        p.lure -= s.lureCost;
        p.sendIncome += s.incomeGain;
        p.stats.lureSpent += s.lureCost;
        if (cmd.sendId === "goat") p.stats.goatLure += s.lureCost;
        const raid = this.teams[p.team].raid;
        const inRaid = !!raid && raid.forWave === this.nextWave && raid.targetId === target.id;
        if (inRaid && !raid.participants.includes(p.id)) raid.participants.push(p.id);
        p.queue.push({ sendId: cmd.sendId, targetId: target.id, raid: inRaid });
        this.emit({ kind: "send", from: p.id, to: target.id, sendId: cmd.sendId });
        if (s.units.some(([u]) => u === "goat")) this.emit({ kind: "goatIncoming", from: p.id, to: target.id });
        return ok();
      }
      case "target": {
        const t = this.player(cmd.playerId);
        if (!t || t.team === p.team) return fail("Цель должна быть соперником");
        p.targetId = t.id;
        return ok();
      }
      case "gift": {
        const t = this.player(cmd.playerId);
        const g = b.economy.gift;
        if (!t || t.team !== p.team || t.id === p.id) return fail("Подарок — только союзнику");
        if (this.wave < p.giftReadyWave) return fail("Подарок перезаряжается");
        if (p.grain < g.cost) return fail("Не хватает Зерна");
        p.grain -= g.cost;
        t.grain += g.amount;
        p.giftReadyWave = this.wave + g.cooldownWaves;
        p.stats.giftsGiven += g.amount;
        this.emit({ kind: "gift", from: p.id, to: t.id, amount: g.amount });
        return ok();
      }
      case "cannon": {
        const c = b.economy.millCannon;
        const team = this.teams[p.team];
        if (team.cannonLevel >= c.maxLevel) return fail("Пушка на максимуме");
        if (this.suddenDeath && b.match.suddenDeath.millCannonDisabled) return fail("Пушка выключена");
        if (p.grain < c.costPerLevel) return fail("Не хватает Зерна");
        p.grain -= c.costPerLevel;
        team.cannonLevel++;
        team.cannonContrib[p.id] = (team.cannonContrib[p.id] ?? 0) + 1;
        p.stats.cannonGiven += c.costPerLevel;
        this.emit({ kind: "cannon", playerId: p.id, level: team.cannonLevel });
        return ok();
      }
      case "raid": {
        const team = this.teams[p.team];
        const t = this.player(cmd.targetId);
        if (!t || t.team === p.team) return fail("Налёт — только на соперника");
        if (team.raidUsedWave === this.nextWave) return fail("Налёт уже объявлен на эту волну");
        if (!this.sendsOpen()) return fail("Очередь закрыта до начала волны");
        team.raid = { byId: p.id, targetId: t.id, forWave: this.nextWave, participants: [] };
        team.raidUsedWave = this.nextWave;
        p.targetId = t.id;
        this.emit({ kind: "raid", by: p.id, targetId: t.id });
        return ok();
      }
      case "ping": {
        if (this.tick - p.lastPingTick < b.match.tickRate) return fail("Слишком часто");
        p.lastPingTick = this.tick;
        this.emit({ kind: "ping", playerId: p.id, ping: cmd.ping, targetId: cmd.targetId, col: cmd.col, row: cmd.row });
        return ok();
      }
    }
  }

  sellValue(d: Defender): number {
    const e = this.data.balance.economy;
    if (d.window === this.window) return Math.floor(d.newSpent * e.sellRefundSamePrep + d.oldSpent * e.sellRefund);
    return Math.floor((d.oldSpent + d.newSpent) * e.sellRefund);
  }

  private spend(d: Defender, cost: number): void {
    if (d.window !== this.window) {
      d.oldSpent += d.newSpent;
      d.newSpent = 0;
      d.window = this.window;
    }
    d.newSpent += cost;
  }

  // ---------------------------------------------------------------- simulation

  step(): void {
    if (this.phase === "ended") return;
    this.tick++;
    const b = this.data.balance;

    this.phaseTicks--;
    if (this.phaseTicks <= 0) {
      if (this.phase === "combat") {
        this.endWave();
        if (this.result) return;
        this.setPhase("prep", b.match.prepSeconds);
      } else {
        this.startWave(this.nextWave);
      }
    }

    this.updateSecondWind();
    for (const p of this.players) {
      p.lure = Math.min(b.economy.lureCap, p.lure + this.lureRegen(p) * this.dt);
      this.stepLane(p);
    }
    for (const t of this.teams) this.stepCannon(t);
    for (const p of this.players) this.cleanupLane(p);
    this.checkEnd();
  }

  /** Runs the simulation for `seconds` of game time (tests, bots, headless runs). */
  run(seconds: number): void {
    const n = Math.round(seconds / this.dt);
    for (let i = 0; i < n && this.phase !== "ended"; i++) this.step();
  }

  private secToTicks(s: number): number {
    return Math.round(s / this.dt);
  }

  private setPhase(phase: Phase, seconds: number): void {
    this.phase = phase;
    this.phaseTicks = this.secToTicks(seconds);
    this.window++;
  }

  private startWave(n: number): void {
    const b = this.data.balance;
    this.wave = n;
    this.setPhase("combat", b.match.waveSeconds);
    const def = this.waveDef(n);
    const hpMult = this.waveHpMult(n);

    const raidActive: Record<string, boolean> = {};
    for (const t of this.teams) {
      if (t.raid && t.raid.forWave === n) {
        const active = t.raid.participants.length >= b.economy.raid.minParticipants;
        raidActive[t.id] = active;
        this.emit({ kind: "raidResolved", team: t.id, targetId: t.raid.targetId, participants: t.raid.participants.length, active });
      }
      t.raid = null;
    }

    for (const p of this.players) {
      p.leaksThisWave = 0;
      p.leakSignalled = false;
      const scripted: Spawn[] = [];
      for (const u of def.units) for (let i = 0; i < u.count; i++) scripted.push(spawn(u.type, hpMult, null, 0));
      const sent: Spawn[] = [];
      for (const o of this.opponents(p)) {
        for (const q of o.queue) {
          if (q.targetId !== p.id) continue;
          const s = b.sends[q.sendId];
          const unitCount = s.units.reduce((a, [, c]) => a + c, 0);
          const mult = hpMult * (q.raid && raidActive[o.team] ? 1 + b.economy.raid.hpBonus : 1);
          for (const [type, count] of s.units)
            for (let i = 0; i < count; i++) sent.push(spawn(type, mult, o.id, s.lureCost / unitCount));
        }
      }
      // Interleave scripted and sent units so sends don't all arrive in one clump at the end.
      const order: Spawn[] = [];
      for (let i = 0; i < Math.max(scripted.length, sent.length); i++) {
        if (scripted[i]) order.push(scripted[i]);
        if (sent[i]) order.push(sent[i]);
      }
      order.forEach((s, i) => (s.delay = p.spawnClock + i * def.spawnIntervalSec));
      p.pending.push(...order);
    }
    for (const p of this.players) p.queue = [];
    this.emit({ kind: "wave", wave: n, boss: def.boss, suddenDeath: this.suddenDeath });
  }

  private endWave(): void {
    for (const p of this.players) {
      const income = this.incomeFor(p, this.wave);
      p.grain += income;
      p.lastIncome = income;
      p.leaksSinceIncome = 0;
    }
    this.hpHistory.push([this.teams[0].hp, this.teams[1].hp]);
    this.emit({ kind: "income", wave: this.wave });
    if (this.maxWaves !== undefined && this.wave >= this.maxWaves) this.finish("waves");
  }

  private updateSecondWind(): void {
    const th = this.data.balance.economy.secondWind.hpGapThreshold;
    const frac = this.teams.map((t) => t.hp / t.maxHp);
    for (const t of this.teams) {
      const on = frac[t.id] + th <= frac[1 - t.id];
      if (on !== t.secondWind) {
        t.secondWind = on;
        this.emit({ kind: "secondWind", team: t.id, on });
      }
    }
  }

  private stepLane(p: Player): void {
    const b = this.data.balance;
    const dt = this.dt;
    const path = this.path;

    // Spawns
    p.spawnClock += dt;
    if (p.pending.length) {
      const due = p.pending.filter((s) => s.delay <= p.spawnClock);
      if (due.length) {
        p.pending = p.pending.filter((s) => s.delay > p.spawnClock);
        for (const s of due) {
          const ed = b.enemies[s.type];
          const hp = ed.hp * s.hpMult;
          p.enemies.push({
            id: this.nextId++,
            type: s.type,
            hp,
            maxHp: hp,
            shield: 0,
            shielded: false,
            progress: 0,
            ...path.pos(0),
            slowTimer: 0,
            slowAmount: 0,
            sprinklerSlow: 0,
            leaked: false,
            senderId: s.senderId,
            sendValue: s.sendValue,
          });
        }
      }
    } else {
      p.spawnClock = 0;
    }

    // Sprinkler slow is continuous; recompute each tick.
    for (const e of p.enemies) e.sprinklerSlow = 0;
    for (const d of p.defenders) {
      const def = b.defenders[d.type];
      if (!def.slow) continue;
      const slow = def.slow[d.level - 1] ?? 0;
      for (const e of p.enemies) {
        if (e.hp <= 0 || b.enemies[e.type].flying || e.progress >= path.laneLength) continue;
        if (dist(d, e) <= (def.rangeCells ?? 0)) e.sprinklerSlow = Math.max(e.sprinklerSlow, slow);
      }
    }

    // Movement and leaks
    for (const e of p.enemies) {
      if (e.hp <= 0) continue;
      const ed = b.enemies[e.type];
      if (e.slowTimer > 0) e.slowTimer -= dt;
      const slow = Math.max(e.sprinklerSlow, e.slowTimer > 0 ? e.slowAmount : 0);
      e.progress += ed.speed * (1 - slow) * dt;
      Object.assign(e, path.pos(e.progress));
      if (!e.leaked && e.progress >= path.laneLength) {
        e.leaked = true;
        p.leaksThisWave++;
        p.leaksSinceIncome++;
        p.stats.leaksAllowed++;
        p.stats.leaksByType[e.type] = (p.stats.leaksByType[e.type] ?? 0) + 1;
        if (p.leaksThisWave >= 3 && !p.leakSignalled) {
          p.leakSignalled = true;
          this.emit({ kind: "leaking", playerId: p.id, leaks: p.leaksThisWave });
        }
      }
      if (e.progress >= path.totalLength) this.reachMill(p, e);
    }

    // Shield auras (each unit gets shielded once, by the first shield-bearer it meets)
    for (const s of p.enemies) {
      const aura = b.enemies[s.type].shieldAura;
      if (!aura || s.hp <= 0) continue;
      const amount = aura.shieldHp * (s.maxHp / b.enemies[s.type].hp);
      for (const e of p.enemies) {
        if (e.hp > 0 && !e.shielded && dist(s, e) <= aura.radiusCells) {
          e.shielded = true;
          e.shield = amount;
        }
      }
    }

    // Defenders
    const auras = this.bellAuras(p);
    for (const d of p.defenders) {
      if (d.sporeTimer > 0) d.sporeTimer -= dt;
      const def = b.defenders[d.type];
      if (def.attackType === "none") continue;
      const bell = auras.get(d.id);
      const spored = d.sporeTimer > 0 && !bell?.sporeImmune;
      const speed = (1 + (bell?.bonus ?? 0)) * (spored ? 1 - d.sporeSlow : 1);
      d.cooldown -= dt * speed;
      if (d.cooldown > 0) continue;
      if (this.fire(p, d, def)) d.cooldown += def.attackInterval!;
      else d.cooldown = 0;
    }
    const keepFrom = this.tick - 4;
    if (p.shots.length && p.shots[0].tick < keepFrom) p.shots = p.shots.filter((s) => s.tick >= keepFrom);
  }

  private bellAuras(p: Player): Map<number, { bonus: number; sporeImmune: boolean }> {
    const out = new Map<number, { bonus: number; sporeImmune: boolean }>();
    const b = this.data.balance;
    for (const bell of p.defenders) {
      const def = b.defenders[bell.type];
      if (!def.attackSpeedBonus || def.auraRangeCells === undefined) continue;
      const bonus = def.attackSpeedBonus[bell.level - 1] ?? 0;
      const immune = def.sporeImmunityFromLevel !== undefined && bell.level >= def.sporeImmunityFromLevel;
      for (const d of p.defenders) {
        if (d === bell || dist(d, bell) > def.auraRangeCells) continue;
        const cur = out.get(d.id) ?? { bonus: 0, sporeImmune: false };
        cur.bonus = Math.max(cur.bonus, bonus);
        cur.sporeImmune ||= immune;
        out.set(d.id, cur);
      }
    }
    return out;
  }

  private targetable(d: Defender, def: DefenderDef, e: Enemy): boolean {
    if (e.hp <= 0 || e.progress >= this.path.laneLength) return false;
    const ed = this.data.balance.enemies[e.type];
    if (ed.flying && !def.hitsFlying) return false;
    if ((this.data.balance.damageMultipliers[def.attackType]?.[ed.armor] ?? 0) <= 0) return false;
    return dist(d, e) <= (def.rangeCells ?? 0);
  }

  /** Returns true if the defender attacked this tick. */
  private fire(p: Player, d: Defender, def: DefenderDef): boolean {
    const b = this.data.balance;
    const lvl = d.level - 1;
    const dmg = def.damage![lvl] ?? def.damage![def.damage!.length - 1];

    if (def.slow) {
      // Sprinkler: small damage to everything on the ground in range.
      const inRange = p.enemies.filter((e) => this.targetable(d, def, e));
      if (!inRange.length) return false;
      const strip = def.stripShieldsFromLevel !== undefined && d.level >= def.stripShieldsFromLevel;
      for (const e of inRange) {
        if (strip) e.shield = 0;
        this.damage(p, e, dmg, def.attackType, false);
      }
      this.shot(p, d, d, "spray");
      return true;
    }

    const candidates = p.enemies.filter((e) => this.targetable(d, def, e));
    if (!candidates.length) return false;
    candidates.sort((a, c) => c.progress - a.progress);
    let target = candidates[0];
    if (def.priority && d.level >= def.priority.fromLevel) {
      const pr = candidates.find((e) => def.priority!.enemies.includes(e.type));
      if (pr) target = pr;
    }
    this.shot(p, d, target, def.attackType);

    if (def.splashRadiusCells !== undefined) {
      const center: Vec = { x: target.x, y: target.y };
      const puddle = def.puddle && d.level >= def.puddle.fromLevel ? def.puddle : null;
      for (const e of p.enemies) {
        if (e.hp <= 0 || e.progress >= this.path.laneLength || b.enemies[e.type].flying) continue;
        if (dist(center, e) > def.splashRadiusCells) continue;
        this.damage(p, e, dmg, def.attackType, !!def.ignoresShields);
        if (puddle) {
          e.slowAmount = e.slowTimer > 0 ? Math.max(e.slowAmount, puddle.slow) : puddle.slow;
          e.slowTimer = puddle.durationSec;
        }
      }
      return true;
    }

    const pierce = def.pierceTargets?.[lvl] ?? 1;
    const hits = pierce > 1 ? [target, ...candidates.filter((e) => e !== target).slice(0, pierce - 1)] : [target];
    d.shots++;
    const double = def.doubleShot && d.level >= def.doubleShot.fromLevel && d.shots % def.doubleShot.every === 0;
    for (const e of hits) this.damage(p, e, double ? dmg * 2 : dmg, def.attackType, !!def.ignoresShields);
    return true;
  }

  private shot(p: Player, d: Defender, to: Vec, kind: string): void {
    p.shots.push({ tick: this.tick, from: d.id, x: to.x, y: to.y, kind });
  }

  /** Applies typed damage; shields absorb first unless ignored. */
  damage(p: Player, e: Enemy, raw: number, attackType: string, ignoreShields: boolean): void {
    const b = this.data.balance;
    const mult = b.damageMultipliers[attackType]?.[b.enemies[e.type].armor] ?? 0;
    let amount = raw * mult;
    if (!ignoreShields && e.shield > 0) {
      const absorbed = Math.min(e.shield, amount);
      e.shield -= absorbed;
      amount -= absorbed;
    }
    const wasAlive = e.hp > 0;
    e.hp -= amount;
    if (wasAlive && e.hp <= 0) this.onKill(p, e);
  }

  private onKill(p: Player, e: Enemy): void {
    const b = this.data.balance;
    const ed = b.enemies[e.type];
    let reward = ed.bounty;
    if (e.senderId) reward += b.economy.sentPestBountyShare * e.sendValue;
    reward = Math.round(reward);
    p.grain += reward;
    p.stats.kills++;
    p.stats.bountyGrain += reward;
    if (ed.onDeath) {
      const auras = this.bellAuras(p);
      for (const d of p.defenders) {
        if (auras.get(d.id)?.sporeImmune) continue;
        if (dist(d, e) <= ed.onDeath.radiusCells) {
          d.sporeTimer = ed.onDeath.durationSec;
          d.sporeSlow = ed.onDeath.towerAttackSlow;
        }
      }
    }
  }

  private reachMill(p: Player, e: Enemy): void {
    const b = this.data.balance;
    const ed = b.enemies[e.type];
    const team = this.teams[p.team];
    const dmg = ed.leakDamage * (this.suddenDeath ? b.match.suddenDeath.leakDamageMultiplier : 1);
    const before = team.hp;
    team.hp = Math.max(0, team.hp - dmg);
    e.hp = 0;
    e.progress = this.path.totalLength;
    const sender = e.senderId ? this.player(e.senderId) : undefined;
    if (sender) {
      sender.stats.sendDamage += dmg;
      this.teams[sender.team].damageDealt += dmg;
      if (ed.stealGrainOnLeak) {
        const stolen = Math.min(p.grain, ed.stealGrainOnLeak);
        p.grain -= stolen;
        sender.grain += stolen;
      }
    }
    if (before > 0 && team.hp <= 0 && !this.finisher) this.finisher = { playerId: e.senderId, enemy: e.type };
    this.emit({ kind: "leak", playerId: p.id, enemy: e.type, damage: dmg });
  }

  private stepCannon(t: Team): void {
    const c = this.data.balance.economy.millCannon;
    const sd = this.data.balance.match.suddenDeath;
    if (t.cannonLevel <= 0 || (this.suddenDeath && sd.millCannonDisabled)) return;
    t.cannonCooldown -= this.dt;
    if (t.cannonCooldown > 0) return;
    let best: { p: Player; e: Enemy } | null = null;
    for (const p of this.players) {
      if (p.team !== t.id) continue;
      for (const e of p.enemies) {
        if (e.hp <= 0 || e.progress < this.path.laneLength) continue;
        if (!best || e.progress > best.e.progress) best = { p, e };
      }
    }
    if (!best) {
      t.cannonCooldown = 0;
      return;
    }
    const dmg = c.damagePerLevel[t.cannonLevel] ?? c.damagePerLevel[c.damagePerLevel.length - 1];
    this.damage(best.p, best.e, dmg, "basic", false);
    best.p.shots.push({ tick: this.tick, from: -1, x: best.e.x, y: best.e.y, kind: "cannon" });
    t.cannonCooldown += c.attackInterval;
  }

  private cleanupLane(p: Player): void {
    if (p.enemies.some((e) => e.hp <= 0)) p.enemies = p.enemies.filter((e) => e.hp > 0);
  }

  private checkEnd(): void {
    if (this.phase === "ended") return;
    const dead = this.teams.filter((t) => t.hp <= 0);
    if (dead.length) this.finish(dead.length === 2 ? "tiebreak" : "mill");
  }

  private finish(reason: "mill" | "tiebreak" | "waves"): void {
    const [a, c] = this.teams;
    let winner: TeamId | null;
    if (reason === "mill") winner = a.hp <= 0 ? 1 : 0;
    else {
      const fa = a.hp / a.maxHp;
      const fc = c.hp / c.maxHp;
      if (reason === "waves" && fa !== fc) winner = fa > fc ? 0 : 1;
      else winner = a.damageDealt === c.damageDealt ? null : a.damageDealt > c.damageDealt ? 0 : 1;
    }
    this.phase = "ended";
    this.phaseTicks = 0;
    this.result = {
      winner,
      reason: winner === null ? "draw" : reason,
      finisher: reason === "waves" ? null : this.finisher,
      durationSec: this.time,
      waves: this.wave,
    };
    if (reason !== "waves") this.hpHistory.push([a.hp, c.hp]);
    this.emit({ kind: "ended", winner });
  }

  emit(body: EventBody): void {
    this.events.push({ ...body, id: ++this.eventSeq, t: this.time } as MatchEvent);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  eventsSince(id: number): MatchEvent[] {
    return this.events.filter((e) => e.id > id);
  }

  private mirrorTarget(p: Player): Player | undefined {
    const opp = this.opponents(p);
    return opp.find((o) => o.slot === p.slot) ?? opp[0];
  }

  /** Scripted enemy composition of a wave, for UI and bots. */
  waveUnits(n: number): { type: string; count: number }[] {
    return this.waveDef(n).units;
  }

  enemyDef(type: string): EnemyDef {
    return this.data.balance.enemies[type];
  }
}

function spawn(type: string, hpMult: number, senderId: string | null, sendValue: number): Spawn {
  return { type, hpMult, senderId, sendValue, delay: 0 };
}

function ok(): CommandResult {
  return { ok: true };
}

function fail(error: string): CommandResult {
  return { ok: false, error };
}
