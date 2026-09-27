import { DATA, LanePath, type SnapPlayer, type Snapshot } from "@millstorm/shared";
import type { FieldView } from "../game/FieldScene";

const B = DATA.balance;
const HINT_SECONDS = 9;

interface Hint {
  id: string;
  text: string;
  when(s: Snapshot, me: SnapPlayer, h: Hints): boolean;
  /** Hide early once the player did the thing. */
  done?(s: Snapshot, me: SnapPlayer): boolean;
}

const count = (me: SnapPlayer, type: string) => me.d.filter((d) => DATA.defenderIds[d[1]] === type).length;

const HINTS: Hint[] = [
  {
    id: "start",
    text: "Поставь Пугало: нажми Q (или кнопку внизу) и кликни по траве у поворота тропы — подсвечены хорошие клетки.",
    when: (s) => s.phase === "start",
    done: (_s, me) => me.d.length >= 2,
  },
  {
    id: "leak",
    text: "Вредитель прорвался! Поставь ещё Стража или улучши старого (клик по Стражу → Улучшить).",
    when: (_s, me) => me.leaksThisWave > 0,
  },
  {
    id: "grain",
    text: "Зерно не защищает — потрать его на Стражей или улучшения.",
    when: (s, me, h) => s.phase !== "start" && h.grainIdle(me) > 5,
    done: (_s, me) => me.grain < 150,
  },
  {
    id: "sends",
    text: "Теперь можно атаковать! Жми 1 — «Стая мышей» уйдёт сопернику со следующей волной, а твой доход вырастет навсегда.",
    when: (s) => s.sendsOpen && s.nextWave >= B.match.sendsUnlockWave,
    done: (_s, me) => me.q.length > 0 || me.sendIncome > 0,
  },
  {
    id: "air",
    text: "Летят вороны, нужен Зенит! Поставь Сову (R) — наземные Стражи летунов не бьют.",
    when: (s, me) => count(me, "owl") === 0 && flyingComing(s, me),
    done: (_s, me) => count(me, "owl") > 0,
  },
  {
    id: "feeder",
    text: "Кормушка (U) — инвестиция: больше Приманки для атак, но меньше защиты сейчас.",
    when: (s, me) => s.wave >= 3 && me.grain >= B.defenders.feeder.cost + 40,
  },
];

function flyingComing(s: Snapshot, me: SnapPlayer): boolean {
  const next = DATA.waves[s.nextWave - 1];
  if (next?.units.some((u) => B.enemies[u.type].flying)) return true;
  return s.players.some((p) => p.team !== me.team && p.q.some(([idx, tid]) => tid === me.id && B.sends[DATA.sendIds[idx]].units.some(([u]) => B.enemies[u].flying)));
}

/** Tutorial: one contextual hint at a time, each shown once. */
export class Hints {
  private shown = new Set<string>();
  private current: { hint: Hint; until: number } | null = null;
  private grainSince: number | null = null;
  private markedCells = false;

  constructor(private readonly view: FieldView) {}

  grainIdle(me: SnapPlayer): number {
    const now = performance.now();
    if (me.grain < 150) this.grainSince = null;
    else this.grainSince ??= now;
    return this.grainSince === null ? 0 : (now - this.grainSince) / 1000;
  }

  update(s: Snapshot, me: SnapPlayer, show: (text: string | null) => void): void {
    const now = performance.now();
    if (this.current) {
      if (now > this.current.until || this.current.hint.done?.(s, me) || s.phase === "ended") {
        this.current = null;
        show(null);
      } else return;
    }
    if (s.phase === "ended") return;
    for (const hint of HINTS) {
      if (this.shown.has(hint.id) || !hint.when(s, me, this) || hint.done?.(s, me)) continue;
      this.shown.add(hint.id);
      this.current = { hint, until: now + HINT_SECONDS * 1000 };
      show(hint.text);
      if (hint.id === "start" && !this.markedCells) this.markBestCells();
      return;
    }
  }

  private markBestCells(): void {
    this.markedCells = true;
    const path = new LanePath(B.map.path, B.map.yardLengthCells);
    const range = B.defenders.scarecrow.rangeCells ?? 3;
    const scored: { col: number; row: number; n: number }[] = [];
    for (let col = 0; col < B.map.cols; col++)
      for (let row = 0; row < B.map.rows; row++) {
        if (path.isPathCell(col, row)) continue;
        let n = 0;
        for (let p = 0; p < path.laneLength; p += 0.5) {
          const q = path.pos(p);
          if (Math.hypot(q.x - col - 0.5, q.y - row - 0.5) <= range) n++;
        }
        scored.push({ col, row, n });
      }
    scored.sort((a, b) => b.n - a.n);
    const until = performance.now() + 12000;
    for (const c of scored.slice(0, 4)) this.view.marks.push({ col: c.col, row: c.row, until, color: "#fff7a8" });
  }
}
