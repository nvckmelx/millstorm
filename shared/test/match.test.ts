import { describe, expect, it } from "vitest";
import balanceJson from "../data/balance.json";
import wavesJson from "../data/waves.json";
import { Bot, DATA, Match, loadData, makeSnapshot, type Enemy, type MatchPlayerConfig } from "../src/index";

const duel = (): MatchPlayerConfig[] => [
  { id: "a", name: "Аня", team: 0 },
  { id: "b", name: "Боря", team: 1 },
];

function newMatch(players = duel(), extra: Partial<ConstructorParameters<typeof Match>[0]> = {}) {
  return new Match({ players, seed: 7, ...extra });
}

/** Skip to the prep phase before `wave` (sends for `wave` are open, nothing spawned). */
function toPrepBefore(m: Match, wave: number) {
  while (!(m.phase === "prep" && m.nextWave === wave)) m.step();
}

function enemy(m: Match, type: string, progress: number, senderId: string | null = null): Enemy {
  const hp = m.data.balance.enemies[type].hp;
  return {
    id: 999,
    type,
    hp,
    maxHp: hp,
    shield: 0,
    shielded: false,
    progress,
    ...m.path.pos(progress),
    slowTimer: 0,
    slowAmount: 0,
    sprinklerSlow: 0,
    leaked: false,
    senderId,
    sendValue: senderId ? 20 / 6 : 0,
  };
}

describe("data", () => {
  it("loads bundled balance and waves", () => {
    expect(DATA.waves).toHaveLength(18);
    expect(DATA.defenderIds).toContain("scarecrow");
  });

  it("rejects unknown enemy references", () => {
    const bad = structuredClone(wavesJson);
    bad.waves[0].units[0].type = "dragon";
    expect(() => loadData(balanceJson, bad)).toThrow(/unknown enemy dragon/);
  });

  it("reads numbers from JSON, not code", () => {
    const b = structuredClone(balanceJson);
    b.economy.startGrain = 999;
    const m = new Match({ players: duel(), data: loadData(b, wavesJson) });
    expect(m.player("a")!.grain).toBe(999);
  });
});

describe("damage", () => {
  it("applies type multipliers", () => {
    const m = newMatch();
    const a = m.player("a")!;
    const mouse = enemy(m, "mouse", 1);
    const beetle = enemy(m, "beetle", 1);
    m.damage(a, mouse, 10, "splash", false); // swift ×1.5
    m.damage(a, beetle, 10, "splash", false); // armored ×0.5
    expect(mouse.maxHp - mouse.hp).toBe(15);
    expect(beetle.maxHp - beetle.hp).toBe(5);
    const beetle2 = enemy(m, "beetle", 1);
    m.damage(a, beetle2, 10, "pierce", false); // armored ×1.5
    expect(beetle2.maxHp - beetle2.hp).toBe(15);
  });

  it("shields absorb damage unless pierced", () => {
    const m = newMatch();
    const a = m.player("a")!;
    const e = enemy(m, "beetle", 1);
    e.shield = 50;
    m.damage(a, e, 20, "basic", false);
    expect(e.shield).toBe(30);
    expect(e.hp).toBe(e.maxHp);
    m.damage(a, e, 20, "basic", true);
    expect(e.shield).toBe(30);
    expect(e.hp).toBe(e.maxHp - 20);
  });

  it("ground defenders ignore flyers, owls hit them", () => {
    const m = newMatch();
    const a = m.player("a")!;
    a.grain = 1000;
    expect(m.apply("a", { type: "build", defender: "pumpkin", col: 2, row: 1 }).ok).toBe(true);
    const crow = enemy(m, "crow", 2);
    a.enemies.push(crow);
    m.run(3);
    expect(a.enemies[0]?.hp ?? 0).toBe(crow.maxHp);
    a.enemies = [enemy(m, "crow", 2)];
    expect(m.apply("a", { type: "build", defender: "owl", col: 3, row: 1 }).ok).toBe(true);
    m.run(3);
    expect(a.enemies.find((e) => e.type === "crow")).toBeUndefined();
  });
});

describe("economy", () => {
  it("wave income matches the design doc example (wave 5, 3 mice sends, clean = 71)", () => {
    const m = newMatch();
    toPrepBefore(m, 5);
    const a = m.player("a")!;
    a.lure = 150;
    for (let i = 0; i < 3; i++) expect(m.apply("a", { type: "send", sendId: "mice" })).toEqual({ ok: true });
    a.leaksSinceIncome = 0;
    expect(m.incomeFor(a, 5)).toBe(71);
  });

  it("pays income at the end of each wave", () => {
    const m = newMatch();
    const a = m.player("a")!;
    a.grain = 1000; // enough scarecrows to make wave 1 a clean wave
    for (const [c, r] of [[0, 1], [2, 1], [0, 3], [2, 3]]) m.apply("a", { type: "build", defender: "scarecrow", col: c, row: r });
    const before = a.grain;
    while (m.wave < 1 || m.phase === "combat") m.step();
    const bounty = a.stats.bountyGrain;
    expect(a.grain - before - bounty).toBe(30 + 4 * 1 + 15);
  });

  it("refunds 100% in the same phase and 70% later", () => {
    const m = newMatch();
    const a = m.player("a")!;
    m.apply("a", { type: "build", defender: "scarecrow", col: 0, row: 0 });
    const id = a.defenders[0].id;
    expect(m.sellValue(a.defenders[0])).toBe(40);
    m.run(31); // into wave 1 combat
    expect(m.sellValue(a.defenders[0])).toBe(28);
    m.apply("a", { type: "sell", id });
    expect(a.defenders).toHaveLength(0);
  });

  it("caps lure", () => {
    const m = newMatch();
    m.run(200);
    expect(m.player("a")!.lure).toBeLessThanOrEqual(150);
  });
});

describe("building", () => {
  it("rejects building on the path, out of bounds and on occupied cells", () => {
    const m = newMatch();
    const [c, r] = m.data.balance.map.path[0];
    expect(m.apply("a", { type: "build", defender: "scarecrow", col: c, row: r }).ok).toBe(false);
    expect(m.apply("a", { type: "build", defender: "scarecrow", col: 10, row: 0 }).ok).toBe(false);
    expect(m.apply("a", { type: "build", defender: "scarecrow", col: 0, row: 0 }).ok).toBe(true);
    expect(m.apply("a", { type: "build", defender: "scarecrow", col: 0, row: 0 }).ok).toBe(false);
  });

  it("rejects without grain and caps feeders", () => {
    const m = newMatch();
    const a = m.player("a")!;
    a.grain = 10;
    expect(m.apply("a", { type: "build", defender: "ballista", col: 0, row: 0 })).toEqual({ ok: false, error: "Не хватает Зерна" });
    a.grain = 10_000;
    for (let i = 0; i < 4; i++) expect(m.apply("a", { type: "build", defender: "feeder", col: 9, row: i + 12 }).ok).toBe(true);
    expect(m.apply("a", { type: "build", defender: "feeder", col: 3, row: 0 }).ok).toBe(false);
  });

  it("upgrades up to level 3", () => {
    const m = newMatch();
    const a = m.player("a")!;
    a.grain = 1000;
    m.apply("a", { type: "build", defender: "scarecrow", col: 0, row: 0 });
    const id = a.defenders[0].id;
    expect(m.apply("a", { type: "upgrade", id }).ok).toBe(true);
    expect(m.apply("a", { type: "upgrade", id }).ok).toBe(true);
    expect(m.apply("a", { type: "upgrade", id }).ok).toBe(false);
    expect(a.defenders[0].level).toBe(3);
    expect(a.grain).toBe(1000 - 40 - 50 - 90);
  });
});

describe("sends", () => {
  it("are locked before wave 4 and during the last 3 seconds of prep", () => {
    const m = newMatch();
    m.player("a")!.lure = 150;
    expect(m.apply("a", { type: "send", sendId: "mice" }).ok).toBe(false);
    toPrepBefore(m, 4);
    expect(m.apply("a", { type: "send", sendId: "crows" }).ok).toBe(false);
    expect(m.apply("a", { type: "send", sendId: "mice" }).ok).toBe(true);
    while (m.timeLeft > 2) m.step();
    expect(m.apply("a", { type: "send", sendId: "mice" }).ok).toBe(false);
  });

  it("arrive on the target's lane with the next wave and raise income forever", () => {
    const m = newMatch();
    toPrepBefore(m, 4);
    const a = m.player("a")!;
    const b = m.player("b")!;
    a.lure = 150;
    m.apply("a", { type: "send", sendId: "mice" });
    expect(a.sendIncome).toBe(2);
    expect(m.incoming(b)).toEqual([{ from: "a", sendId: "mice" }]);
    while (m.phase !== "combat") m.step();
    const fromA = b.pending.filter((s) => s.senderId === "a").length + b.enemies.filter((e) => e.senderId === "a").length;
    expect(fromA).toBe(6);
    expect(a.pending.some((s) => s.senderId)).toBe(false);
    expect(a.queue).toHaveLength(0);
  });

  it("killing a sent pest pays 30% of its price", () => {
    const m = newMatch();
    const b = m.player("b")!;
    const grain = b.grain;
    const e = enemy(m, "mouse", 1, "a");
    b.enemies.push(e);
    m.damage(b, e, 1000, "basic", false);
    expect(b.grain - grain).toBe(Math.round(1 + 0.3 * (20 / 6)));
  });
});

describe("mill and victory", () => {
  it("a leak reduces team HP", () => {
    const m = newMatch();
    const a = m.player("a")!;
    a.enemies.push(enemy(m, "beetle", m.path.totalLength - 0.01));
    m.step();
    expect(m.teams[0].hp).toBe(98);
    expect(a.stats.leaksAllowed).toBe(1);
  });

  it("team with Mill HP 0 loses", () => {
    const m = newMatch();
    m.teams[1].hp = 1;
    m.player("b")!.enemies.push(enemy(m, "goat", m.path.totalLength - 0.01, "a"));
    m.step();
    expect(m.phase).toBe("ended");
    expect(m.result?.winner).toBe(0);
    expect(m.result?.finisher).toEqual({ playerId: "a", enemy: "goat" });
  });

  it("scales Mill HP with team size", () => {
    const players: MatchPlayerConfig[] = ["a", "b", "c", "d"].map((id, i) => ({ id, name: id, team: (i % 2) as 0 | 1 }));
    const m = newMatch(players);
    expect(m.teams[0].maxHp).toBe(200);
    expect(m.player("a")!.targetId).toBe("b");
    expect(m.player("c")!.targetId).toBe("d");
  });

  it("gift moves grain between allies with a fee", () => {
    const players: MatchPlayerConfig[] = ["a", "b", "c", "d"].map((id, i) => ({ id, name: id, team: (i % 2) as 0 | 1 }));
    const m = newMatch(players);
    expect(m.apply("a", { type: "gift", playerId: "c" })).toEqual({ ok: true });
    expect(m.player("a")!.grain).toBe(140);
    expect(m.player("c")!.grain).toBe(250);
    expect(m.apply("a", { type: "gift", playerId: "c" }).ok).toBe(false);
    expect(m.apply("a", { type: "gift", playerId: "b" }).ok).toBe(false);
  });
});

describe("full match", () => {
  it("bots finish a deterministic 1v1", () => {
    const run = () => {
      const m = newMatch(
        duel().map((p) => ({ ...p, isBot: true })),
        { seed: 3 },
      );
      const bots = m.players.map((p) => new Bot(m, p.id, { seed: 5 }));
      while (m.phase !== "ended" && m.time < 40 * 60) {
        bots.forEach((b) => b.tick());
        m.step();
      }
      return m;
    };
    const m1 = run();
    const m2 = run();
    expect(m1.phase).toBe("ended");
    expect(m1.result).toEqual(m2.result);
    expect(m1.result!.durationSec).toBeGreaterThan(10 * 60);
    const snap = makeSnapshot(m1, 0);
    expect(snap.result?.winner).toBe(m1.result!.winner);
    expect(snap.players[0].stats).toBeDefined();
  });

  it("tutorial ends after maxWaves", () => {
    const m = newMatch(duel(), { maxWaves: 2 });
    m.run(30 + 50 * 3);
    expect(m.phase).toBe("ended");
    expect(m.result?.reason).not.toBe("mill");
  });
});
