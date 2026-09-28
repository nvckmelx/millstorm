import { DATA } from "@millstorm/shared";

/** Runtime art (Art Pack 01, built by tools/build_art.py). Relative so the offline build works. */
export const ART_URL = `${import.meta.env.BASE_URL}art/`;

/** Visual constants: team colours, sizes, labels. */
export const TEAM_COLORS = ["#2F80ED", "#F2994A"] as const;
export const TEAM_NAMES = ["Синие", "Оранжевые"] as const;

export const DEFENDER_COLORS: Record<string, string> = {
  scarecrow: "#C9A26B",
  pumpkin: "#F08A24",
  ballista: "#7A6E64",
  owl: "#9C7BD1",
  sprinkler: "#3EC1D3",
  bell: "#E8C547",
  feeder: "#6DBE45",
};

export const ENEMY_RADIUS: Record<string, number> = {
  mouse: 0.17,
  beetle: 0.3,
  ferret: 0.22,
  crow: 0.21,
  snail: 0.28,
  spore: 0.25,
  goat: 0.38,
  badger: 0.44,
  locustQueen: 0.46,
  stormcloud: 0.5,
};

export const ATTACK_LABEL: Record<string, string> = {
  basic: "Обычная",
  splash: "Россыпь",
  pierce: "Пробой",
  air: "Зенит",
  none: "—",
};

/** Which armor an attack type is strong against (for the "что против чего" colour strip). */
export function strongAgainst(attackType: string): string | null {
  const m = DATA.balance.damageMultipliers[attackType];
  if (!m) return null;
  let best: string | null = null;
  let v = 1;
  for (const [armor, mult] of Object.entries(m)) if (mult > v) (v = mult), (best = armor);
  return best;
}

export function armorColor(armor: string | null): string {
  return armor ? (DATA.balance.armorTypes[armor as "swift"]?.color ?? "#888") : "#888";
}

export function hex(c: string): number {
  return parseInt(c.slice(1), 16);
}

export function enemyName(type: string): string {
  return DATA.balance.enemies[type]?.name.replace(/\s*\(босс\)/, "") ?? type;
}

/** Russian plural helper: plural(5, "ворона", "вороны", "ворон"). */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
