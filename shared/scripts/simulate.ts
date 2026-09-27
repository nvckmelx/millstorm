// Headless bot-vs-bot matches for balance checks: `npm run sim -- [teamSize] [matches]`
import { Bot, Match, type BotStyle, type MatchPlayerConfig } from "../src/index";

const size = Number(process.argv[2] ?? 1);
const runs = Number(process.argv[3] ?? 20);
const styles: BotStyle[] = ["greedy", "fortress", "raider"];
const wins: Record<string, number> = {};
const games: Record<string, number> = {};
let totalTime = 0;

for (let i = 0; i < runs; i++) {
  const players: MatchPlayerConfig[] = [];
  for (let t = 0 as 0 | 1; t < 2; t = (t + 1) as 0 | 1)
    for (let s = 0; s < size; s++) players.push({ id: `t${t}p${s}`, name: `Bot ${t}${s}`, team: t, isBot: true });
  const m = new Match({ players, seed: i + 1 });
  const bots = m.players.map((p, k) => new Bot(m, p.id, { style: styles[(i + k) % 3], seed: i * 31 + k }));
  while (m.phase !== "ended" && m.time < 40 * 60) {
    for (const b of bots) b.tick();
    m.step();
  }
  const r = m.result!;
  totalTime += r.durationSec;
  const styleOf = (team: number) => bots.filter((_, k) => m.players[k].team === team).map((b) => (b as any).style).join("+");
  for (const t of [0, 1]) {
    const st = styleOf(t);
    games[st] = (games[st] ?? 0) + 1;
    if (r.winner === t) wins[st] = (wins[st] ?? 0) + 1;
  }
  console.log(
    `#${i + 1} ${(r.durationSec / 60).toFixed(1)} min, wave ${r.waves}, winner ${r.winner} (${r.reason}) hp ${m.teams[0].hp}/${m.teams[1].hp} ${styleOf(0)} vs ${styleOf(1)} finisher ${r.finisher?.enemy ?? "-"}`,
  );
}
console.log(`avg ${(totalTime / runs / 60).toFixed(1)} min`);
for (const k of Object.keys(games)) console.log(`${k}: ${wins[k] ?? 0}/${games[k]}`);
