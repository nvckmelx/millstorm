import type { Match, MatchEvent, MatchResult, Phase, PlayerStats, TeamId } from "./match";

/** [id, defenderIndex, col, row, level, spored 0|1] */
export type SnapDefender = [number, number, number, number, number, number];
/** [id, enemyIndex, progress×100, hp, maxHp, shield, senderPlayerIndex (-1 = wave)] */
export type SnapEnemy = [number, number, number, number, number, number, number];
/** [tick, fromDefenderId (-1 = Mill cannon), x×10, y×10, kind] */
export type SnapShot = [number, number, number, number, string];

export interface SnapPlayer {
  id: string;
  name: string;
  team: TeamId;
  slot: number;
  isBot: boolean;
  connected: boolean;
  grain: number;
  lure: number;
  lureRegen: number;
  income: number;
  lastIncome: number;
  sendIncome: number;
  targetId: string;
  giftReady: boolean;
  status: "ok" | "warn" | "bad";
  leaksThisWave: number;
  d: SnapDefender[];
  e: SnapEnemy[];
  /** Outgoing queue: [sendIndex, targetId] */
  q: [number, string][];
  s: SnapShot[];
  stats?: PlayerStats;
}

export interface SnapTeam {
  hp: number;
  maxHp: number;
  cannonLevel: number;
  cannonContrib: Record<string, number>;
  raid: { by: string; targetId: string; participants: string[] } | null;
  secondWind: boolean;
  damageDealt: number;
}

export interface Snapshot {
  tick: number;
  time: number;
  phase: Phase;
  timeLeft: number;
  wave: number;
  nextWave: number;
  suddenDeath: boolean;
  sendsOpen: boolean;
  teams: SnapTeam[];
  players: SnapPlayer[];
  events: MatchEvent[];
  result: MatchResult | null;
  hpHistory: [number, number][];
}

export function makeSnapshot(m: Match, sinceEventId: number, sinceShotTick = m.tick - 2): Snapshot {
  const { defenderIds, enemyIds, sendIds } = m.data;
  const pIndex = new Map(m.players.map((p, i) => [p.id, i]));
  const ended = m.phase === "ended";
  return {
    tick: m.tick,
    time: round(m.time, 2),
    phase: m.phase,
    timeLeft: round(m.timeLeft, 2),
    wave: m.wave,
    nextWave: m.nextWave,
    suddenDeath: m.suddenDeath,
    sendsOpen: m.sendsOpen(),
    teams: m.teams.map((t) => ({
      hp: t.hp,
      maxHp: t.maxHp,
      cannonLevel: t.cannonLevel,
      cannonContrib: t.cannonContrib,
      raid: t.raid ? { by: t.raid.byId, targetId: t.raid.targetId, participants: [...t.raid.participants] } : null,
      secondWind: t.secondWind,
      damageDealt: t.damageDealt,
    })),
    players: m.players.map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      slot: p.slot,
      isBot: p.isBot,
      connected: p.connected,
      grain: Math.floor(p.grain),
      lure: round(p.lure, 1),
      lureRegen: round(m.lureRegen(p), 2),
      income: m.incomeFor(p, m.phase === "combat" ? m.wave : m.nextWave),
      lastIncome: p.lastIncome,
      sendIncome: p.sendIncome,
      targetId: p.targetId,
      giftReady: m.wave >= p.giftReadyWave,
      status: m.laneStatus(p),
      leaksThisWave: p.leaksThisWave,
      d: p.defenders.map((d) => [d.id, defenderIds.indexOf(d.type), d.col, d.row, d.level, d.sporeTimer > 0 ? 1 : 0]),
      e: p.enemies.map((e) => [
        e.id,
        enemyIds.indexOf(e.type),
        Math.round(e.progress * 100),
        Math.ceil(e.hp),
        Math.ceil(e.maxHp),
        Math.ceil(e.shield),
        e.senderId ? (pIndex.get(e.senderId) ?? -1) : -1,
      ]),
      q: p.queue.map((q) => [sendIds.indexOf(q.sendId), q.targetId]),
      s: p.shots.filter((s) => s.tick > sinceShotTick).map((s) => [s.tick, s.from, Math.round(s.x * 10), Math.round(s.y * 10), s.kind]),
      stats: ended ? p.stats : undefined,
    })),
    events: m.eventsSince(sinceEventId),
    result: m.result,
    hpHistory: m.hpHistory,
  };
}

function round(v: number, digits: number): number {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}
