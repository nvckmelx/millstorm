import { z } from "zod";
import balanceJson from "../data/balance.json";
import wavesJson from "../data/waves.json";

const num = z.number();
const nonNeg = z.number().nonnegative();

const armor = z.enum(["swift", "armored", "flying"]);
export type Armor = z.infer<typeof armor>;

const attackType = z.enum(["basic", "splash", "pierce", "air", "none"]);
export type AttackType = z.infer<typeof attackType>;

const defenderSchema = z.object({
  name: z.string(),
  hotkey: z.string(),
  cost: nonNeg,
  upgradeCost: z.array(nonNeg),
  attackType,
  hitsFlying: z.boolean().optional(),
  damage: z.array(nonNeg).optional(),
  attackInterval: z.number().positive().optional(),
  rangeCells: nonNeg.optional(),
  splashRadiusCells: nonNeg.optional(),
  ignoresShields: z.boolean().optional(),
  slow: z.array(nonNeg).optional(),
  auraRangeCells: nonNeg.optional(),
  attackSpeedBonus: z.array(nonNeg).optional(),
  lureRegenBonus: nonNeg.optional(),
  maxPerPlayer: z.number().int().positive().optional(),
  doubleShot: z.object({ fromLevel: z.number().int(), every: z.number().int().positive() }).optional(),
  puddle: z.object({ fromLevel: z.number().int(), slow: nonNeg, durationSec: nonNeg }).optional(),
  pierceTargets: z.array(z.number().int().positive()).optional(),
  priority: z.object({ fromLevel: z.number().int(), enemies: z.array(z.string()) }).optional(),
  stripShieldsFromLevel: z.number().int().optional(),
  sporeImmunityFromLevel: z.number().int().optional(),
  lvl3: z.string().optional(),
});
export type DefenderDef = z.infer<typeof defenderSchema>;

const enemySchema = z.object({
  name: z.string(),
  armor,
  hp: z.number().positive(),
  speed: z.number().positive(),
  bounty: nonNeg,
  leakDamage: nonNeg,
  flying: z.boolean().optional(),
  stealGrainOnLeak: nonNeg.optional(),
  shieldAura: z.object({ radiusCells: nonNeg, shieldHp: nonNeg }).optional(),
  onDeath: z
    .object({ radiusCells: nonNeg, towerAttackSlow: z.number().min(0).max(0.95), durationSec: nonNeg })
    .optional(),
});
export type EnemyDef = z.infer<typeof enemySchema>;

const sendSchema = z.object({
  name: z.string(),
  hotkey: z.string(),
  lureCost: z.number().positive(),
  incomeGain: nonNeg,
  unlockWave: z.number().int().positive(),
  units: z.array(z.tuple([z.string(), z.number().int().positive()])),
});
export type SendDef = z.infer<typeof sendSchema>;

const balanceSchema = z.object({
  match: z.object({
    tickRate: z.number().int().positive(),
    startBuildSeconds: z.number().positive(),
    prepSeconds: z.number().positive(),
    waveSeconds: z.number().positive(),
    wavesTotal: z.number().int().positive(),
    sendsUnlockWave: z.number().int().positive(),
    sendLockBeforeWaveSeconds: nonNeg,
    waveHpGrowth: nonNeg,
    millHpPerPlayer: z.number().positive(),
    reconnectSeconds: z.number().positive(),
    suddenDeath: z.object({
      fromWave: z.number().int().positive(),
      hpGrowthPerWave: nonNeg,
      leakDamageMultiplier: nonNeg,
      millCannonDisabled: z.boolean(),
      waveTemplates: z.array(z.number().int().positive()).min(1),
    }),
  }),
  map: z.object({
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
    cellPx: z.number().positive(),
    yardLengthCells: z.number().positive(),
    path: z.array(z.tuple([num, num])).min(2),
  }),
  economy: z.object({
    startGrain: nonNeg,
    startLure: nonNeg,
    lureRegenPerSecond: nonNeg,
    lureCap: z.number().positive(),
    incomeBase: nonNeg,
    incomePerWave: nonNeg,
    cleanWaveBonus: nonNeg,
    sentPestBountyShare: nonNeg,
    sellRefund: nonNeg,
    sellRefundSamePrep: nonNeg,
    secondWind: z.object({ hpGapThreshold: nonNeg, grainIncomeBonus: nonNeg, lureRegenBonus: nonNeg }),
    gift: z.object({ amount: nonNeg, cost: nonNeg, cooldownWaves: z.number().int().nonnegative() }),
    raid: z.object({ hpBonus: nonNeg, minParticipants: z.number().int().positive() }),
    millCannon: z.object({
      costPerLevel: z.number().positive(),
      maxLevel: z.number().int().positive(),
      damagePerLevel: z.array(nonNeg),
      attackInterval: z.number().positive(),
      rangeCells: nonNeg,
    }),
  }),
  armorTypes: z.record(armor, z.object({ color: z.string(), label: z.string() })),
  damageMultipliers: z.record(z.string(), z.record(armor, nonNeg)),
  defenders: z.record(z.string(), defenderSchema),
  enemies: z.record(z.string(), enemySchema),
  sends: z.record(z.string(), sendSchema),
});
export type Balance = z.infer<typeof balanceSchema>;

const waveSchema = z.object({
  wave: z.number().int().positive(),
  boss: z.boolean(),
  units: z.array(z.object({ type: z.string(), count: z.number().int().positive() })),
  hpMultiplier: z.number().positive(),
  spawnIntervalSec: z.number().positive(),
});
export type WaveDef = z.infer<typeof waveSchema>;

const wavesSchema = z.object({ waves: z.array(waveSchema).min(1) });

export interface GameData {
  balance: Balance;
  waves: WaveDef[];
  defenderIds: string[];
  enemyIds: string[];
  sendIds: string[];
}

/** Validates raw JSON and checks cross-references (unit ids, wave numbering). Throws on bad data. */
export function loadData(rawBalance: unknown, rawWaves: unknown): GameData {
  const balance = balanceSchema.parse(rawBalance);
  const { waves } = wavesSchema.parse(rawWaves);
  const enemyIds = Object.keys(balance.enemies);
  const problems: string[] = [];
  for (const [id, s] of Object.entries(balance.sends)) {
    for (const [unit] of s.units) if (!balance.enemies[unit]) problems.push(`send ${id}: unknown enemy ${unit}`);
  }
  waves.forEach((w, i) => {
    if (w.wave !== i + 1) problems.push(`waves[${i}] has number ${w.wave}, expected ${i + 1}`);
    for (const u of w.units) if (!balance.enemies[u.type]) problems.push(`wave ${w.wave}: unknown enemy ${u.type}`);
  });
  for (const [id, d] of Object.entries(balance.defenders)) {
    if (d.attackType !== "none" && !balance.damageMultipliers[d.attackType])
      problems.push(`defender ${id}: no damageMultipliers for ${d.attackType}`);
    if (d.attackType !== "none" && (!d.damage || !d.attackInterval || d.rangeCells === undefined))
      problems.push(`defender ${id}: attacking defender needs damage, attackInterval, rangeCells`);
  }
  if (waves.length < balance.match.wavesTotal) problems.push(`waves.json has fewer than ${balance.match.wavesTotal} waves`);
  for (const t of balance.match.suddenDeath.waveTemplates)
    if (!waves[t - 1]) problems.push(`suddenDeath.waveTemplates: no wave ${t}`);
  if (problems.length) throw new Error("Invalid game data:\n" + problems.join("\n"));
  return {
    balance,
    waves,
    defenderIds: Object.keys(balance.defenders),
    enemyIds,
    sendIds: Object.keys(balance.sends),
  };
}

export const DATA: GameData = loadData(balanceJson, wavesJson);
