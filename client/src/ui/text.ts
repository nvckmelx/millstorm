import { DATA, type MatchEvent, type PingKind, type Snapshot } from "@millstorm/shared";
import { TEAM_NAMES, enemyName } from "../game/look";

export const PING_TEXT: Record<PingKind, string> = {
  raidHere: "Налёт сюда!",
  needHelp: "Нужна помощь!",
  savingGoat: "Коплю на тарана",
  noAirEnemy: "У врага нет зенита",
  thanks: "Спасибо!",
  haha: "Ха-ха!",
  gooseHappy: "Гусь доволен: га-га!",
  gooseAngry: "Гусь негодует",
  gooseCry: "Гусь плачет",
  gooseCool: "Гусь невозмутим",
};

export const PING_WHEEL: PingKind[] = ["raidHere", "needHelp", "savingGoat", "noAirEnemy", "thanks", "haha"];
export const STICKERS: PingKind[] = ["gooseHappy", "gooseAngry", "gooseCry", "gooseCool"];

export const LOADING_TIPS = [
  "Вредители идут по тропе к твоей Мельнице. Ставь Стражей за Зерно.",
  "Цвет врага = цвет полоски на кнопке Стража, который его лучше бьёт.",
  "Трать Приманку, чтобы наслать вредителей на соперника. Каждая отправка навсегда повышает твой доход.",
  "Очередь твоих отправок видна сопернику. Отправь в последние секунды — он не успеет ответить.",
  "Кормушка — жадное решение: больше Приманки потом, но слабее защита сейчас.",
  "Убитый чужой вредитель приносит 30% его цены. Слепые отправки кормят соперника.",
];

/** Feed line for an event, from the viewer's perspective. null = don't show. */
export function eventText(e: MatchEvent, s: Snapshot, you: string): { text: string; tone: "info" | "good" | "bad" | "ping" } | null {
  const name = (id: string) => s.players.find((p) => p.id === id)?.name ?? "?";
  const me = s.players.find((p) => p.id === you);
  const teamOf = (id: string) => s.players.find((p) => p.id === id)?.team;
  const ally = (id: string) => teamOf(id) === me?.team;
  switch (e.kind) {
    case "wave":
      if (e.suddenDeath && e.wave === DATA.balance.match.suddenDeath.fromWave)
        return { text: `Волна ${e.wave}: Внезапная смерть! Урон по Мельнице ×2, пушка выключена`, tone: "bad" };
      return { text: `Волна ${e.wave}${e.boss ? " — БОСС!" : ""}`, tone: e.boss ? "bad" : "info" };
    case "send":
      if (e.to === you) return { text: `${name(e.from)} шлёт тебе: ${DATA.balance.sends[e.sendId].name}`, tone: "bad" };
      if (ally(e.from)) return { text: `${name(e.from)} → ${name(e.to)}: ${DATA.balance.sends[e.sendId].name}`, tone: "good" };
      return null;
    case "goatIncoming":
      return { text: `На ${e.to === you ? "тебя" : name(e.to)} идёт Козёл-таран!`, tone: ally(e.to) ? "bad" : "good" };
    case "leaking":
      if (!ally(e.playerId)) return { text: `${name(e.playerId)} течёт — ${e.leaks} утечки`, tone: "good" };
      return { text: `${e.playerId === you ? "Ты течёшь" : `${name(e.playerId)} течёт`} — ${e.leaks} утечки`, tone: "bad" };
    case "gift":
      return ally(e.from) ? { text: `${name(e.from)} подарил ${name(e.to)} ${e.amount} Зерна`, tone: "good" } : null;
    case "cannon":
      return ally(e.playerId) ? { text: `${name(e.playerId)} улучшил пушку Мельницы до ур. ${e.level}`, tone: "good" } : null;
    case "raid":
      return ally(e.by) ? { text: `${name(e.by)} объявил Налёт на ${name(e.targetId)}!`, tone: "ping" } : null;
    case "raidResolved":
      if (!e.active) return e.team === me?.team ? { text: `Налёт не состоялся: нужно 2+ участника`, tone: "info" } : null;
      return { text: `Налёт на ${name(e.targetId)}: ${e.participants} участника, +15% HP вредителям`, tone: e.team === me?.team ? "good" : "bad" };
    case "ping":
      return ally(e.playerId) ? { text: `${name(e.playerId)}: ${PING_TEXT[e.ping]}${e.targetId ? ` (${name(e.targetId)})` : ""}`, tone: "ping" } : null;
    case "secondWind":
      if (!e.on) return null;
      return { text: `Второе дыхание у команды «${TEAM_NAMES[e.team]}»: +20% дохода`, tone: e.team === me?.team ? "good" : "info" };
    case "ended":
    case "income":
    case "leak":
      return null;
  }
}

export function sendUnitsText(sendId: string): string {
  const s = DATA.balance.sends[sendId];
  return s.units.map(([u, n]) => `${enemyName(u)}${n > 1 ? ` ×${n}` : ""}`).join(", ");
}
