import { Client, type Room } from "colyseus.js";
import {
  BOT_NAMES,
  Bot,
  DATA,
  Match,
  commandSchema,
  makeSnapshot,
  type LobbyState,
  type MatchPlayerConfig,
  type Mode,
  type Snapshot,
  type TeamId,
} from "@millstorm/shared";

export interface SessionEvents {
  lobby: LobbyState;
  snap: Snapshot;
  error: { text: string };
  latency: number;
  closed: { reason: string };
}

type Handler<K extends keyof SessionEvents> = (payload: SessionEvents[K]) => void;

/** What the UI talks to: an online Colyseus room or a local match against bots. */
export abstract class Session {
  you = "";
  abstract readonly offline: boolean;
  /** Tutorial matches show hints and end after a few waves. */
  tutorial = false;
  private handlers: { [K in keyof SessionEvents]?: Handler<K>[] } = {};

  on<K extends keyof SessionEvents>(type: K, cb: Handler<K>): void {
    (this.handlers[type] ??= [] as never[]).push(cb as never);
  }

  protected emit<K extends keyof SessionEvents>(type: K, payload: SessionEvents[K]): void {
    for (const h of this.handlers[type] ?? []) (h as Handler<K>)(payload);
  }

  abstract send(type: string, payload?: unknown): void;
  abstract leave(): void;
}

// ------------------------------------------------------------------ online

const RECONNECT_KEY = "millstorm.reconnect";

export function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  if (location.port === "5173") return `ws://${location.hostname}:2567`;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
}

export class OnlineSession extends Session {
  readonly offline = false;
  private latencyTimer: number | undefined;

  private constructor(private readonly room: Room) {
    super();
    this.you = room.sessionId;
    room.onMessage("welcome", (m: { you: string }) => (this.you = m.you));
    room.onMessage("lobby", (l: LobbyState) => this.emit("lobby", l));
    room.onMessage("snap", (s: Snapshot) => this.emit("snap", s));
    room.onMessage("error", (e: { text: string }) => this.emit("error", e));
    room.onMessage("latency", (m: { t: number }) => this.emit("latency", Math.round(performance.now() - m.t)));
    room.onLeave((code) => {
      clearInterval(this.latencyTimer);
      if (code !== 1000) sessionStorage.removeItem(RECONNECT_KEY);
      this.emit("closed", { reason: code === 1000 || code === 4000 ? "" : "Соединение с сервером потеряно" });
    });
    sessionStorage.setItem(RECONNECT_KEY, room.reconnectionToken);
    this.latencyTimer = window.setInterval(() => this.send("latency", { t: performance.now() }), 2000);
  }

  private static client(): Client {
    return new Client(serverUrl());
  }

  static async createParty(name: string): Promise<OnlineSession> {
    return new OnlineSession(await this.client().create("game", { name }));
  }

  static async joinParty(code: string, name: string): Promise<OnlineSession> {
    return new OnlineSession(await this.client().joinById(code.toUpperCase(), { name }));
  }

  static async quickplay(mode: Mode, name: string): Promise<OnlineSession> {
    return new OnlineSession(await this.client().joinOrCreate("game", { public: true, mode, name }));
  }

  static async tryReconnect(): Promise<OnlineSession | null> {
    const token = sessionStorage.getItem(RECONNECT_KEY);
    if (!token) return null;
    try {
      return new OnlineSession(await this.client().reconnect(token));
    } catch {
      sessionStorage.removeItem(RECONNECT_KEY);
      return null;
    }
  }

  send(type: string, payload?: unknown): void {
    this.room.send(type, payload);
  }

  leave(): void {
    sessionStorage.removeItem(RECONNECT_KEY);
    clearInterval(this.latencyTimer);
    void this.room.leave(true);
  }
}

// ------------------------------------------------------------------ offline

export interface OfflineOptions {
  name: string;
  mode: Mode;
  tutorial?: boolean;
}

/** Runs the shared simulation in the browser against bots. No server needed. */
export class OfflineSession extends Session {
  readonly offline = true;
  private match: Match | null = null;
  private bots: Bot[] = [];
  private timer: number | undefined;
  private lastEvent = 0;
  private lastShot = 0;
  private series: [number, number] = [0, 0];
  private stage: LobbyState["stage"] = "loading";
  private countdown: number | null = null;
  private acc = 0;
  private last = 0;
  private closed = false;

  constructor(private readonly opts: OfflineOptions) {
    super();
    this.you = "you";
    this.tutorial = !!opts.tutorial;
    queueMicrotask(() => this.load());
  }

  private lobby(): LobbyState {
    const n = this.opts.mode;
    const slots = [0, 1].map((team) =>
      Array.from({ length: n }, (_, i) =>
        team === 0 && i === 0
          ? { id: this.you, name: this.opts.name, ready: true, bot: false, connected: true }
          : { id: `bot-${team}-${i}`, name: BOT_NAMES[(team * 3 + i) % BOT_NAMES.length], ready: true, bot: true, connected: true },
      ),
    );
    return {
      code: "",
      mode: n,
      isPublic: false,
      leaderId: this.you,
      stage: this.stage,
      slots,
      series: this.series,
      rematch: [],
      chat: [],
      countdown: this.countdown,
    };
  }

  private load(): void {
    this.stage = "loading";
    this.countdown = this.tutorial ? 6 : 3;
    this.emit("lobby", this.lobby());
    const t = window.setInterval(() => {
      if (this.closed) return clearInterval(t);
      this.countdown = (this.countdown ?? 1) - 1;
      if (this.countdown <= 0) {
        clearInterval(t);
        this.countdown = null;
        this.start();
      } else this.emit("lobby", this.lobby());
    }, 1000);
  }

  private start(): void {
    const n = this.opts.mode;
    const players: MatchPlayerConfig[] = [];
    for (const team of [0, 1] as TeamId[])
      for (let i = 0; i < n; i++) {
        if (team === 0 && i === 0) players.push({ id: this.you, name: this.opts.name, team });
        else players.push({ id: `bot-${team}-${i}`, name: BOT_NAMES[(team * 3 + i) % BOT_NAMES.length], team, isBot: true });
      }
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    this.match = new Match({ players, seed, maxWaves: this.tutorial ? 8 : undefined });
    this.bots = this.match.players
      .filter((p) => p.isBot)
      .map((p) => new Bot(this.match!, p.id, { seed: seed + p.slot * 13 + p.team, difficulty: this.tutorial ? "easy" : "normal" }));
    this.lastEvent = 0;
    this.lastShot = 0;
    this.stage = "match";
    this.emit("lobby", this.lobby());
    this.last = performance.now();
    this.acc = 0;
    this.timer = window.setInterval(() => this.loop(), 25);
  }

  private loop(): void {
    const m = this.match;
    if (!m) return;
    const now = performance.now();
    this.acc += Math.min(0.5, (now - this.last) / 1000) * SPEED;
    this.last = now;
    let stepped = false;
    while (this.acc >= m.dt) {
      this.acc -= m.dt;
      for (const b of this.bots) b.tick();
      m.step();
      stepped = true;
      if (m.phase === "ended") break;
    }
    if (stepped && (m.tick % 2 === 0 || m.phase === "ended")) {
      this.emit("snap", makeSnapshot(m, this.lastEvent, this.lastShot));
      this.lastEvent = m.eventSeq;
      this.lastShot = m.tick;
    }
    if (m.phase === "ended") {
      clearInterval(this.timer);
      const w = m.result?.winner;
      if (w === 0 || w === 1) this.series[w]++;
      this.stage = "results";
      this.emit("lobby", this.lobby());
    }
  }

  send(type: string, payload?: unknown): void {
    if (type === "cmd" && this.match && this.stage === "match") {
      const cmd = commandSchema.safeParse(payload);
      if (!cmd.success) return;
      const r = this.match.apply(this.you, cmd.data);
      if (!r.ok) this.emit("error", { text: r.error });
    } else if (type === "rematch" && this.stage === "results") {
      this.load();
    } else if (type === "latency") {
      this.emit("latency", 0);
    }
  }

  leave(): void {
    this.closed = true;
    clearInterval(this.timer);
    this.match = null;
  }
}

export const TICK_RATE = DATA.balance.match.tickRate;

/** Dev only: `?speed=10` fast-forwards offline matches for testing. */
const SPEED = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("speed")) || 1 : 1;
