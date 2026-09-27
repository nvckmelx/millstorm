import { DATA, type LobbyState, type Mode, type SnapPlayer, type Snapshot } from "@millstorm/shared";
import { TEAM_COLORS, TEAM_NAMES, enemyName, plural } from "../game/look";
import type { Session } from "../net";
import { h, toast } from "./dom";
import { LOADING_TIPS } from "./text";

export const OFFLINE_BUILD = import.meta.env.MODE === "offline";

const NAME_KEY = "millstorm.name";

export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveName(n: string): void {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* private mode */
  }
}

export interface MenuActions {
  party(name: string): void;
  join(code: string, name: string): void;
  quickplay(mode: Mode, name: string): void;
  offline(mode: Mode, name: string): void;
  tutorial(name: string): void;
}

function logo(): HTMLElement {
  return h("div.logo", {}, h("span.mill-o"), h("h1", {}, "Millstorm"), h("p", {}, "Защищай свою небесную ферму и насылай вредителей на соседей"));
}

export function menuScreen(a: MenuActions, invite?: string): HTMLElement {
  const name = h("input.name", { placeholder: "Твой ник", maxlength: 16, value: savedName() }) as HTMLInputElement;
  const getName = (): string | null => {
    const n = name.value.trim();
    if (!n) {
      toast("Сначала введи ник");
      name.focus();
      return null;
    }
    saveName(n);
    return n;
  };
  const code = h("input.code", { placeholder: "КОД", maxlength: 4 }) as HTMLInputElement;
  code.addEventListener("input", () => (code.value = code.value.toUpperCase()));
  const modes: Mode[] = [1, 2, 3];
  const pick = (label: string, onPick: (m: Mode) => void) =>
    h("div.mode-pick", {}, h("span", {}, label), ...modes.map((m) => h("button.small", { onclick: () => onPick(m) }, `${m}v${m}`)));

  if (invite) {
    return h(
      "div.screen.menu",
      {},
      logo(),
      h(
        "div.panel",
        {},
        h("h2", {}, `Тебя позвали в пати ${invite}`),
        name,
        h("button.primary.big", { onclick: () => { const n = getName(); if (n) a.join(invite, n); } }, "Войти в лобби"),
        h("button.ghost", { onclick: () => (history.replaceState(null, "", "/"), location.reload()) }, "В главное меню"),
      ),
    );
  }

  const online = OFFLINE_BUILD
    ? h(
        "div.panel.note",
        {},
        h("b", {}, "Это офлайн-версия."),
        " Здесь можно сыграть против ботов. Игра с друзьями по ссылке работает, когда игра запущена с сервером (см. README).",
      )
    : h(
        "div.panel",
        {},
        h("button.primary.big", { onclick: () => { const n = getName(); if (n) a.party(n); } }, "Играть с друзьями"),
        h("div.join", {}, code, h("button", { onclick: () => { const n = getName(); if (n && code.value.length === 4) a.join(code.value, n); else if (n) toast("Код — 4 символа"); } }, "Войти по коду")),
        pick("Найти матч:", (m) => { const n = getName(); if (n) a.quickplay(m, n); }),
      );

  return h(
    "div.screen.menu",
    {},
    logo(),
    h("div.panel", {}, h("label", {}, "Ник"), name),
    online,
    h(
      "div.panel",
      {},
      h("button.big", { onclick: () => { const n = getName(); if (n) a.tutorial(n); } }, "Обучение (≈7 мин против бота)"),
      pick("Против ботов:", (m) => { const n = getName(); if (n) a.offline(m, n); }),
    ),
    h("p.foot", {}, "Управление: Q–U — Стражи, 1–7 — отправки, Z — улучшить, X — продать, Alt+клик — пинг, Esc — отмена"),
  );
}

// ------------------------------------------------------------------ lobby

export function lobbyScreen(l: LobbyState, session: Session, onLeave: () => void): HTMLElement {
  const you = session.you;
  const isLeader = l.leaderId === you;
  const members = l.slots.flat().filter(Boolean).length;
  const link = `${location.origin}/p/${l.code}`;
  const me = l.slots.flat().find((s) => s?.id === you);

  const copy = () => {
    void navigator.clipboard?.writeText(link).then(
      () => toast("Ссылка скопирована — отправь её друзьям", "info"),
      () => toast(link, "info"),
    );
  };

  const teams = [0, 1].map((team) =>
    h(
      "div.team",
      { style: `--team:${TEAM_COLORS[team]}` },
      h("h3", {}, TEAM_NAMES[team]),
      ...l.slots[team].map((s, index) =>
        s
          ? h(
              `div.slot.filled${s.id === you ? ".you" : ""}`,
              {},
              h("b", {}, s.name),
              s.id === l.leaderId ? h("small", {}, " лидер") : "",
              h("span", {}, !s.connected ? "переподключается…" : s.ready ? "✔ готов" : "не готов"),
            )
          : h(
              "button.slot.empty",
              { onclick: () => !l.isPublic && session.send("slot", { team, index }), disabled: l.isPublic },
              l.isPublic ? "Ищем игрока… (или бот)" : "Пусто — займёт бот · нажми, чтобы пересесть",
            ),
      ),
    ),
  );

  const modes = h(
    "div.modes",
    {},
    ...([1, 2, 3] as Mode[]).map((m) =>
      h(
        `button.mode${l.mode === m ? ".active" : ""}`,
        { onclick: () => session.send("mode", { mode: m }), disabled: !isLeader || l.isPublic || members > m * 2 },
        `${m}v${m}`,
      ),
    ),
  );

  const chatInput = h("input", { placeholder: "Сообщение пати", maxlength: 200 }) as HTMLInputElement;
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && chatInput.value.trim()) {
      session.send("chat", { text: chatInput.value });
      chatInput.value = "";
    }
  });

  const status = l.isPublic
    ? h("p.status", {}, `Ищем игроков: ${members}/${l.mode * 2}.`, l.countdown !== null ? ` Старт через ${l.countdown} с — пустые места займут боты.` : "")
    : h("p.status", {}, isLeader ? "Когда все готовы — жми «Старт». Пустые места займут боты." : "Ждём, пока лидер нажмёт «Старт».");

  return h(
    "div.screen.lobby",
    {},
    h(
      "div.lobby-head",
      {},
      h("h2", {}, l.isPublic ? "Поиск матча" : "Пати"),
      !l.isPublic
        ? h("div.invite", {}, h("span", {}, "Код: ", h("b.code", {}, l.code)), h("button.primary", { onclick: copy }, "Скопировать ссылку"), h("small", {}, link))
        : "",
    ),
    modes,
    h("div.teams", {}, ...teams),
    status,
    h(
      "div.row",
      {},
      !l.isPublic && me
        ? h(`button.big${me.ready ? "" : ".primary"}`, { onclick: () => session.send("ready", { ready: !me.ready }) }, me.ready ? "Не готов" : "Готов")
        : "",
      isLeader && !l.isPublic ? h("button.big.primary", { onclick: () => session.send("start") }, "Старт") : "",
      h("button.ghost", { onclick: onLeave }, "Выйти"),
    ),
    l.series[0] + l.series[1] > 0 ? h("p.series", {}, `Счёт серии: ${TEAM_NAMES[0]} ${l.series[0]} : ${l.series[1]} ${TEAM_NAMES[1]}`) : "",
    !l.isPublic ? h("div.chat", {}, h("div.chat-log", {}, ...l.chat.map((c) => h("div", {}, h("b", {}, c.name, ": "), c.text))), chatInput) : "",
  );
}

export function loadingScreen(l: LobbyState, tutorial: boolean): HTMLElement {
  const tips = tutorial ? LOADING_TIPS.slice(0, 3) : [LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]];
  return h(
    "div.screen.loading",
    {},
    h("h2", {}, tutorial ? "Обучение: игра за 60 секунд" : "Загрузка матча"),
    h(
      "div.versus",
      {},
      ...[0, 1].map((team) =>
        h(
          "div.team",
          { style: `--team:${TEAM_COLORS[team]}` },
          h("h3", {}, TEAM_NAMES[team]),
          ...l.slots[team].map((s, i) => h("div.slot.filled", {}, s ? s.name : `Бот ${i + 1}`)),
        ),
      ),
    ),
    h("div.tips", {}, ...tips.map((t, i) => h("div.tip", {}, tutorial ? h("b", {}, `${i + 1}. `) : "", t))),
    h("p.countdown", {}, l.countdown !== null ? `Старт через ${l.countdown}…` : ""),
  );
}

// ------------------------------------------------------------------ results

export function resultsScreen(l: LobbyState, s: Snapshot, session: Session, onLeave: () => void, onMenu: () => void): HTMLElement {
  const you = session.you;
  const me = s.players.find((p) => p.id === you);
  const r = s.result!;
  const won = me && r.winner === me.team;
  const title = r.winner === null ? "Ничья" : won ? "Победа!" : "Поражение";
  const name = (id: string | null) => s.players.find((p) => p.id === id)?.name;

  let finisher = "";
  if (r.finisher) {
    const who = name(r.finisher.playerId);
    finisher = who ? `Мельницу сломал ${enemyName(r.finisher.enemy)} игрока ${who}` : `Мельницу сломал ${enemyName(r.finisher.enemy)} из волны`;
  } else if (r.reason === "waves") finisher = "Обучение пройдено: победа по HP Мельницы";

  const awards = awardsFor(s.players);
  const humans = l.slots.flat().filter((x) => x && !x.bot && x.connected).length;
  const voted = l.rematch.includes(you);

  return h(
    "div.screen.results",
    {},
    h(`h1.${won ? "win" : r.winner === null ? "draw" : "lose"}`, {}, title),
    finisher ? h("div.finisher", {}, finisher) : "",
    h("p", {}, `Матч длился ${Math.floor(r.durationSec / 60)}:${String(Math.floor(r.durationSec % 60)).padStart(2, "0")}, волн: ${r.waves}`),
    hpChart(s, me?.team ?? 0),
    h("div.awards", {}, ...awards.map((a) => h("div.award", {}, h("small", {}, a.title), h("b", {}, a.name), h("span", {}, a.detail)))),
    me ? h("p.tip", {}, tipFor(me, !!won)) : "",
    l.series[0] + l.series[1] > 0 ? h("p.series", {}, `Счёт серии: ${TEAM_NAMES[0]} ${l.series[0]} : ${l.series[1]} ${TEAM_NAMES[1]}`) : "",
    h(
      "div.row",
      {},
      h(
        `button.big.primary${voted ? ".voted" : ""}`,
        { onclick: () => session.send("rematch"), disabled: voted },
        session.offline ? "Реванш" : `Реванш (${l.rematch.length}/${humans})`,
      ),
      !session.offline && !l.isPublic ? h("button.big", { onclick: () => session.send("toLobby") }, "В лобби") : "",
      h("button.ghost", { onclick: session.offline ? onMenu : onLeave }, "В меню"),
    ),
  );
}

function awardsFor(players: SnapPlayer[]): { title: string; name: string; detail: string }[] {
  const out: { title: string; name: string; detail: string }[] = [];
  const best = (f: (p: SnapPlayer) => number): SnapPlayer | undefined => [...players].sort((a, b) => f(b) - f(a))[0];
  const def = best((p) => p.stats?.kills ?? 0);
  if (def?.stats) out.push({ title: "Лучший защитник", name: def.name, detail: `${def.stats.kills} ${plural(def.stats.kills, "вредитель", "вредителя", "вредителей")}` });
  const pest = best((p) => p.stats?.sendDamage ?? 0);
  if (pest?.stats?.sendDamage) out.push({ title: "Главный вредитель", name: pest.name, detail: `${pest.stats.sendDamage} урона по Мельнице` });
  const goat = best((p) => p.stats?.goatLure ?? 0);
  if (goat?.stats?.goatLure) out.push({ title: "Самый дорогой таран", name: goat.name, detail: `${goat.stats.goatLure} Приманки на козлов` });
  return out;
}

function tipFor(me: SnapPlayer, won: boolean): string {
  const leaks = Object.entries(me.stats?.leaksByType ?? {}).sort((a, b) => b[1] - a[1]);
  if (!leaks.length) return won ? "Ни одной утечки на твоей линии. Идеальная защита!" : "Твоя линия не текла — давление пришло с линий союзников.";
  const [type, n] = leaks[0];
  const def = DATA.balance.enemies[type];
  const counter = def.flying ? "Нужен Зенит: Сова-дозорный." : def.armor === "armored" ? "Против панцирных — Вилы-баллиста (Пробой)." : "Против шустрых — Тыквомёт (Россыпь) и Разбрызгиватель.";
  return `${won ? "Совет" : "Главная причина"}: ${n} ${plural(n, "раз", "раза", "раз")} прорвался «${enemyName(type)}». ${counter}`;
}

function hpChart(s: Snapshot, myTeam: number): HTMLElement {
  const canvas = h("canvas.chart", { width: 560, height: 180 }) as HTMLCanvasElement;
  const hist = s.hpHistory;
  const ctx = canvas.getContext("2d");
  if (!ctx || !hist.length) return canvas;
  const W = canvas.width;
  const H = canvas.height;
  const pad = 28;
  ctx.fillStyle = "#fff8e7";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#e3d3b0";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad / 2 + 6 + ((H - pad - 6) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W - 8, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#6b5a45";
  ctx.font = "12px Nunito, sans-serif";
  ctx.fillText("HP Мельниц по волнам", pad, 11);
  const points = [[s.teams[0].maxHp, s.teams[1].maxHp], ...hist];
  for (const team of [0, 1]) {
    ctx.strokeStyle = TEAM_COLORS[team];
    ctx.lineWidth = team === myTeam ? 3.5 : 2.5;
    ctx.beginPath();
    points.forEach((pt, i) => {
      const x = pad + ((W - pad - 8) * i) / Math.max(1, points.length - 1);
      const y = pad / 2 + 6 + (H - pad - 6) * (1 - pt[team] / s.teams[team].maxHp);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  return canvas;
}
