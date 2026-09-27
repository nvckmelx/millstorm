import { Room, type Client } from "colyseus";
import {
  BOT_NAMES,
  Bot,
  DATA,
  Match,
  ROOM_CODE_ALPHABET,
  cleanName,
  commandSchema,
  lobbyMessages,
  makeSnapshot,
  type LobbyState,
  type MatchPlayerConfig,
  type Mode,
  type SlotView,
  type Stage,
  type TeamId,
} from "@millstorm/shared";

interface Member {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
}

interface CreateOptions {
  public?: boolean;
  mode?: Mode;
  name?: string;
}

const usedCodes = new Set<string>();
const LOADING_SECONDS = 4;
const PUBLIC_WAIT_SECONDS = 20;
const SNAPSHOT_EVERY_TICKS = 2;
/** Testing only: SIM_SPEED=10 runs matches ten times faster. */
const SIM_SPEED = Math.max(1, Math.floor(Number(process.env.SIM_SPEED) || 1));

/**
 * One room = one party. It lives through lobby → loading → match → results → (rematch | lobby).
 * The match simulation runs only here; clients send commands and render snapshots.
 */
export class GameRoom extends Room {
  private code = "";
  private mode: Mode = 1;
  private isPublic = false;
  private leaderId = "";
  private stage: Stage = "lobby";
  private members = new Map<string, Member>();
  /** slots[team][index] = member id | null */
  private slots: (string | null)[][] = [[null], [null]];
  private series: [number, number] = [0, 0];
  private rematch = new Set<string>();
  private chat: { name: string; text: string }[] = [];
  private countdown: number | null = null;
  private countdownTimer: { clear(): void } | null = null;

  private match: Match | null = null;
  private bots = new Map<string, Bot>();
  private lastEventId = 0;
  private lastShotTick = 0;

  override onCreate(options: CreateOptions): void {
    this.code = makeCode();
    this.roomId = this.code;
    this.isPublic = !!options.public;
    this.mode = options.mode && [1, 2, 3].includes(options.mode) ? options.mode : this.isPublic ? 1 : 2;
    this.resizeSlots(this.mode);
    this.maxClients = this.isPublic ? this.mode * 2 : 6;
    if (!this.isPublic) void this.setPrivate(true);
    void this.setMetadata({ mode: this.mode, public: this.isPublic });

    this.onMessage("setName", (c, raw) => {
      const m = this.members.get(c.sessionId);
      const msg = lobbyMessages.setName.safeParse(raw);
      if (!m || !msg.success) return;
      m.name = cleanName(msg.data.name);
      this.pushLobby();
    });

    this.onMessage("mode", (c, raw) => {
      const msg = lobbyMessages.mode.safeParse(raw);
      if (!msg.success || c.sessionId !== this.leaderId || this.stage !== "lobby" || this.isPublic) return;
      if (this.members.size > msg.data.mode * 2) return this.error(c, "В пати больше игроков, чем мест в этом режиме");
      this.mode = msg.data.mode;
      this.resizeSlots(this.mode);
      for (const m of this.members.values()) m.ready = false;
      this.pushLobby();
    });

    this.onMessage("slot", (c, raw) => {
      const msg = lobbyMessages.slot.safeParse(raw);
      if (!msg.success || this.stage !== "lobby" || this.isPublic) return;
      const { team, index } = msg.data;
      if (index >= this.mode || this.slots[team][index] !== null) return;
      this.removeFromSlots(c.sessionId);
      this.slots[team][index] = c.sessionId;
      this.pushLobby();
    });

    this.onMessage("ready", (c, raw) => {
      const msg = lobbyMessages.ready.safeParse(raw);
      const m = this.members.get(c.sessionId);
      if (!msg.success || !m || this.stage !== "lobby") return;
      m.ready = msg.data.ready;
      this.pushLobby();
    });

    this.onMessage("start", (c) => {
      if (this.stage !== "lobby" || c.sessionId !== this.leaderId || this.isPublic) return;
      const notReady = [...this.members.values()].filter((m) => !m.ready);
      if (notReady.length) return this.error(c, `Не готовы: ${notReady.map((m) => m.name).join(", ")}`);
      this.beginLoading();
    });

    this.onMessage("chat", (c, raw) => {
      const msg = lobbyMessages.chat.safeParse(raw);
      const m = this.members.get(c.sessionId);
      // Free chat only among friends in a private party; public games use pings only.
      if (!msg.success || !m || this.isPublic) return;
      const text = msg.data.text.replace(/[\u0000-\u001f\u007f]/g, "").trim();
      if (!text) return;
      this.chat.push({ name: m.name, text });
      if (this.chat.length > 30) this.chat.shift();
      this.pushLobby();
    });

    this.onMessage("cmd", (c, raw) => {
      if (this.stage !== "match" || !this.match) return;
      const cmd = commandSchema.safeParse(raw);
      if (!cmd.success) return this.error(c, "Неверная команда");
      const res = this.match.apply(c.sessionId, cmd.data);
      if (!res.ok) this.error(c, res.error);
    });

    this.onMessage("rematch", (c) => {
      if (this.stage !== "results" || !this.members.has(c.sessionId)) return;
      this.rematch.add(c.sessionId);
      const humans = [...this.members.values()].filter((m) => m.connected);
      if (humans.every((m) => this.rematch.has(m.id))) this.beginLoading();
      else this.pushLobby();
    });

    this.onMessage("toLobby", (c) => {
      if (this.stage !== "results" || !this.members.has(c.sessionId)) return;
      if (this.isPublic) return;
      this.toLobby();
    });

    this.onMessage("latency", (c, raw) => {
      const msg = lobbyMessages.latency.safeParse(raw);
      if (msg.success) c.send("latency", msg.data);
    });

    this.setSimulationInterval(() => this.tick(), 1000 / DATA.balance.match.tickRate);
  }

  override onJoin(client: Client, options: CreateOptions = {}): void {
    if (this.stage !== "lobby") throw new Error("Матч уже идёт");
    const free = this.freeSlot();
    if (!free) throw new Error("Пати заполнена");
    this.members.set(client.sessionId, { id: client.sessionId, name: cleanName(options.name), ready: this.isPublic, connected: true });
    this.slots[free[0]][free[1]] = client.sessionId;
    if (!this.leaderId) this.leaderId = client.sessionId;
    client.send("welcome", { you: client.sessionId, code: this.code });
    if (this.isPublic) this.publicAutostart();
    this.pushLobby();
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    const id = client.sessionId;
    const member = this.members.get(id);
    if (!member) return;

    if (this.stage === "lobby" || this.stage === "loading" || consented) {
      this.dropMember(id);
      return;
    }

    // Mid-match or on the results screen: a bot holds the lane while the player may come back.
    member.connected = false;
    this.setMatchConnection(id, false);
    this.pushLobby();
    try {
      await this.allowReconnection(client, DATA.balance.match.reconnectSeconds);
      member.connected = true;
      this.setMatchConnection(id, true);
      client.send("welcome", { you: id, code: this.code });
      this.pushLobby();
      if (this.match) client.send("snap", makeSnapshot(this.match, 0));
    } catch {
      this.dropMember(id);
    }
  }

  override onDispose(): void {
    usedCodes.delete(this.code);
  }

  // ------------------------------------------------------------ lobby

  private resizeSlots(mode: Mode): void {
    const ids = this.slots.flat().filter((x): x is string => !!x);
    this.slots = [Array(mode).fill(null), Array(mode).fill(null)];
    for (const id of ids) {
      const f = this.freeSlot();
      if (f) this.slots[f[0]][f[1]] = id;
    }
  }

  private freeSlot(): [TeamId, number] | null {
    const count = (t: number) => this.slots[t].filter(Boolean).length;
    const order: TeamId[] = count(0) <= count(1) ? [0, 1] : [1, 0];
    for (const t of order) {
      const i = this.slots[t].indexOf(null);
      if (i >= 0) return [t, i];
    }
    return null;
  }

  private removeFromSlots(id: string): void {
    for (const team of this.slots) {
      const i = team.indexOf(id);
      if (i >= 0) team[i] = null;
    }
  }

  private dropMember(id: string): void {
    this.members.delete(id);
    this.removeFromSlots(id);
    this.rematch.delete(id);
    if (this.leaderId === id) this.leaderId = this.members.keys().next().value ?? "";
    // Anyone who leaves mid-match for good is replaced by a bot for the rest of the match.
    this.setMatchConnection(id, false);
    if (this.stage === "results" && this.rematch.size && [...this.members.values()].every((m) => this.rematch.has(m.id)))
      this.beginLoading();
    this.pushLobby();
  }

  private publicAutostart(): void {
    const full = this.slots.flat().every(Boolean);
    if (full) {
      this.startCountdown(3, () => this.beginLoading());
    } else if (this.countdown === null) {
      this.startCountdown(PUBLIC_WAIT_SECONDS, () => this.beginLoading());
    }
  }

  private startCountdown(seconds: number, done: () => void): void {
    this.countdownTimer?.clear();
    this.countdown = seconds;
    const timer = this.clock.setInterval(() => {
      if (this.countdown === null) return;
      this.countdown--;
      if (this.countdown <= 0) {
        timer.clear();
        this.countdown = null;
        this.countdownTimer = null;
        done();
      }
      this.pushLobby();
    }, 1000);
    this.countdownTimer = timer;
  }

  private beginLoading(): void {
    if (!this.members.size) return;
    this.stage = "loading";
    this.rematch.clear();
    void this.lock();
    this.startCountdown(LOADING_SECONDS, () => this.startMatch());
    this.pushLobby();
  }

  private startMatch(): void {
    const players: MatchPlayerConfig[] = [];
    let botN = 0;
    const botNames = [...BOT_NAMES];
    for (const team of [0, 1] as TeamId[]) {
      for (let i = 0; i < this.mode; i++) {
        const id = this.slots[team][i];
        const m = id ? this.members.get(id) : undefined;
        if (m) players.push({ id: m.id, name: m.name, team });
        else players.push({ id: `bot-${team}-${i}`, name: botNames[botN++ % botNames.length], team, isBot: true });
      }
    }
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    this.match = new Match({ players, seed });
    this.bots.clear();
    for (const p of this.match.players) {
      if (p.isBot) this.bots.set(p.id, new Bot(this.match, p.id, { seed: seed + p.slot * 7 + p.team }));
      else if (!this.members.get(p.id)?.connected) this.setMatchConnection(p.id, false);
    }
    this.lastEventId = 0;
    this.lastShotTick = 0;
    this.stage = "match";
    this.pushLobby();
  }

  private setMatchConnection(id: string, connected: boolean): void {
    const p = this.match?.player(id);
    if (!p || !this.match) return;
    p.connected = connected;
    if (connected) this.bots.delete(id);
    else if (!this.bots.has(id)) this.bots.set(id, new Bot(this.match, id, { style: "fortress" }));
  }

  private toLobby(): void {
    this.stage = "lobby";
    this.match = null;
    this.bots.clear();
    this.rematch.clear();
    for (const m of this.members.values()) m.ready = false;
    // Players who left for good during the match no longer hold a slot.
    for (const team of this.slots) for (let i = 0; i < team.length; i++) if (team[i] && !this.members.has(team[i]!)) team[i] = null;
    void this.unlock();
    this.pushLobby();
  }

  // ------------------------------------------------------------ match loop

  private tick(): void {
    const m = this.match;
    if (!m || this.stage !== "match") return;
    for (let i = 0; i < SIM_SPEED && m.phase !== "ended"; i++) {
      for (const b of this.bots.values()) b.tick();
      m.step();
    }
    if (m.tick % SNAPSHOT_EVERY_TICKS === 0 || SIM_SPEED > 1 || m.phase === "ended") {
      this.broadcast("snap", makeSnapshot(m, this.lastEventId, this.lastShotTick));
      this.lastEventId = m.eventSeq;
      this.lastShotTick = m.tick;
    }
    if (m.phase === "ended") {
      const w = m.result?.winner;
      if (w === 0 || w === 1) this.series[w]++;
      this.stage = "results";
      this.pushLobby();
    }
  }

  // ------------------------------------------------------------ messaging

  private lobbyState(): LobbyState {
    const view = (id: string | null): SlotView | null => {
      const m = id ? this.members.get(id) : undefined;
      return m ? { id: m.id, name: m.name, ready: m.ready, bot: false, connected: m.connected } : null;
    };
    return {
      code: this.code,
      mode: this.mode,
      isPublic: this.isPublic,
      leaderId: this.leaderId,
      stage: this.stage,
      slots: this.slots.map((t) => t.map(view)),
      series: this.series,
      rematch: [...this.rematch],
      chat: this.chat,
      countdown: this.countdown,
    };
  }

  private pushLobby(): void {
    this.broadcast("lobby", this.lobbyState());
  }

  private error(c: Client, text: string): void {
    c.send("error", { text });
  }
}

function makeCode(): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < 4; i++) code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      return code;
    }
  }
}
