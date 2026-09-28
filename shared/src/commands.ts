import { z } from "zod";

export const PING_KINDS = [
  "raidHere",
  "needHelp",
  "savingGoat",
  "noAirEnemy",
  "thanks",
  "haha",
  "gooseHappy",
  "gooseAngry",
  "gooseCry",
  "gooseCool",
] as const;
export type PingKind = (typeof PING_KINDS)[number];

const id = z.number().int().nonnegative();
const cell = z.number().int().min(0).max(99);
const playerId = z.string().min(1).max(64);

/** Everything a client may ask the simulation to do. Parsed on the server before reaching the match. */
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("build"), defender: z.string().max(32), col: cell, row: cell }),
  z.object({ type: z.literal("upgrade"), id }),
  z.object({ type: z.literal("sell"), id }),
  z.object({ type: z.literal("send"), sendId: z.string().max(32) }),
  z.object({ type: z.literal("target"), playerId }),
  z.object({ type: z.literal("gift"), playerId }),
  z.object({ type: z.literal("cannon") }),
  z.object({ type: z.literal("raid"), targetId: playerId }),
  z.object({
    type: z.literal("ping"),
    ping: z.enum(PING_KINDS),
    targetId: playerId.optional(),
    col: cell.optional(),
    row: cell.optional(),
  }),
]);
export type Command = z.infer<typeof commandSchema>;

export type CommandResult = { ok: true } | { ok: false; error: string };
