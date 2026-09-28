import { z } from "zod";

export type Mode = 1 | 2 | 3;
export type Stage = "lobby" | "loading" | "match" | "results";

export interface SlotView {
  id: string;
  name: string;
  ready: boolean;
  bot: boolean;
  connected: boolean;
}

/** Party room state, sent to clients as the "lobby" message whenever it changes. */
export interface LobbyState {
  code: string;
  mode: Mode;
  isPublic: boolean;
  leaderId: string;
  stage: Stage;
  /** slots[team][index]; null = empty (filled with a bot on start) */
  slots: (SlotView | null)[][];
  series: [number, number];
  rematch: string[];
  chat: { name: string; text: string }[];
  /** Seconds until an automatic start (public matchmaking) or the loading screen ends. */
  countdown: number | null;
}

/** Messages a client may send to the room (besides "cmd", which carries a match Command). */
export const lobbyMessages = {
  setName: z.object({ name: z.string().max(40) }),
  mode: z.object({ mode: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
  slot: z.object({ team: z.union([z.literal(0), z.literal(1)]), index: z.number().int().min(0).max(2) }),
  ready: z.object({ ready: z.boolean() }),
  chat: z.object({ text: z.string().min(1).max(200) }),
  latency: z.object({ t: z.number() }),
};

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function cleanName(raw: unknown, fallback = "Фермер"): string {
  const s = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 16) : "";
  return s || fallback;
}

export const BOT_NAMES = ["Бот Репка", "Бот Тыковка", "Бот Горошек", "Бот Редиска", "Бот Кукуруза", "Бот Морковка"];
