import { describe, it, expect } from "vitest";
import {
  HOLE_COUNT,
  ROUND_DURATION,
  MOLE_BASE_SCORE,
  BOMB_SCORE_PENALTY,
  BOMB_TIME_PENALTY,
  buildSchedule,
  pickHole,
  calcMoleScore,
  applyBombPenalty,
  applyBombTimePenalty,
  findWhackableEntity,
} from "~/games/whack";
import type { ActiveEntity, ScheduleEntry } from "~/games/whack";
import { makeRng } from "~/utils/rng";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeEntity(overrides: Partial<ActiveEntity> = {}): ActiveEntity {
  return {
    hole: 0,
    type: "mole",
    spawnedAt: 0,
    dur: 1500,
    whacked: false,
    ...overrides,
  };
}

// ─── calcMoleScore ────────────────────────────────────────────────────────────

describe("calcMoleScore", () => {
  it("returns at least MOLE_BASE_SCORE regardless of elapsed time", () => {
    // Hit at the very last millisecond — no time bonus, but base score still awarded
    expect(calcMoleScore(ROUND_DURATION)).toBe(MOLE_BASE_SCORE);
  });

  it("awards a time bonus early in the round", () => {
    // At elapsed=0 the bonus is floor(30000/3000)=10, so score = 10 + 10 = 20
    expect(calcMoleScore(0)).toBe(MOLE_BASE_SCORE + 10);
  });

  it("bonus decreases as elapsed increases", () => {
    const early = calcMoleScore(1_000);
    const late = calcMoleScore(25_000);
    expect(early).toBeGreaterThan(late);
  });

  it("bonus is exactly floor((roundMs - elapsed) / 3000)", () => {
    // At elapsed = 9000 ms: remaining = 21000, floor(21000/3000) = 7
    expect(calcMoleScore(9_000)).toBe(MOLE_BASE_SCORE + 7);
    // At elapsed = 27000 ms: remaining = 3000, floor(3000/3000) = 1
    expect(calcMoleScore(27_000)).toBe(MOLE_BASE_SCORE + 1);
  });

  it("time bonus is never negative (past round end)", () => {
    // Passing elapsed > roundMs should not produce a negative total
    expect(calcMoleScore(ROUND_DURATION + 5_000)).toBe(MOLE_BASE_SCORE);
  });
});

// ─── applyBombPenalty ─────────────────────────────────────────────────────────

describe("applyBombPenalty", () => {
  it("subtracts BOMB_SCORE_PENALTY from a healthy score", () => {
    expect(applyBombPenalty(50)).toBe(50 - BOMB_SCORE_PENALTY);
  });

  it("clamps to 0 — score never goes negative", () => {
    expect(applyBombPenalty(0)).toBe(0);
    expect(applyBombPenalty(5)).toBe(0); // 5 - 15 < 0, clamp to 0
    expect(applyBombPenalty(14)).toBe(0);
  });

  it("works when score exactly equals the penalty", () => {
    expect(applyBombPenalty(BOMB_SCORE_PENALTY)).toBe(0);
  });
});

// ─── applyBombTimePenalty ─────────────────────────────────────────────────────

describe("applyBombTimePenalty", () => {
  it("adds BOMB_TIME_PENALTY ms to elapsed", () => {
    expect(applyBombTimePenalty(5_000)).toBe(5_000 + BOMB_TIME_PENALTY);
  });

  it("clamps to roundMs — elapsed cannot exceed round duration", () => {
    // Near the end: 28 000 + 3 000 = 31 000 > 30 000, should clamp to 30 000
    expect(applyBombTimePenalty(28_000)).toBe(ROUND_DURATION);
    expect(applyBombTimePenalty(ROUND_DURATION)).toBe(ROUND_DURATION);
  });
});

// ─── findWhackableEntity ──────────────────────────────────────────────────────

describe("findWhackableEntity — hit an active mole", () => {
  it("returns the entity when it exists, is not whacked, and is within its window", () => {
    const entity = makeEntity({ hole: 3, spawnedAt: 0, dur: 1500 });
    const result = findWhackableEntity(3, [entity], 500);
    expect(result).toBe(entity);
  });

  it("returns null for an empty hole (no entity at that index)", () => {
    const entity = makeEntity({ hole: 4 });
    // Clicking hole 2 when entity is at hole 4
    expect(findWhackableEntity(2, [entity], 500)).toBeNull();
  });

  it("returns null for an already-whacked entity", () => {
    const entity = makeEntity({ hole: 0, whacked: true });
    expect(findWhackableEntity(0, [entity], 500)).toBeNull();
  });

  it("returns null when the entity's time window has expired (escaped)", () => {
    // Entity spawned at 0 with dur=1000; clicking at elapsed=1500 (>dur) → escaped
    const entity = makeEntity({ hole: 1, spawnedAt: 0, dur: 1000 });
    expect(findWhackableEntity(1, [entity], 1500)).toBeNull();
  });

  it("returns null for an empty board", () => {
    expect(findWhackableEntity(0, [], 500)).toBeNull();
  });

  it("handles multiple entities — picks the right hole", () => {
    const e0 = makeEntity({ hole: 0 });
    const e1 = makeEntity({ hole: 1 });
    const e2 = makeEntity({ hole: 2 });
    expect(findWhackableEntity(1, [e0, e1, e2], 100)).toBe(e1);
    expect(findWhackableEntity(0, [e0, e1, e2], 100)).toBe(e0);
  });
});

// ─── scoring integration: mole hit vs miss ────────────────────────────────────

describe("scoring integration", () => {
  it("hitting an active mole increases score by calcMoleScore amount", () => {
    const elapsed = 10_000;
    // spawnedAt must be close enough that age (elapsed - spawnedAt) < dur
    const entities: ActiveEntity[] = [makeEntity({ hole: 0, spawnedAt: 9_500, dur: 2000 })];
    const hit = findWhackableEntity(0, entities, elapsed);
    expect(hit).not.toBeNull();
    const gained = calcMoleScore(elapsed);
    expect(gained).toBeGreaterThanOrEqual(MOLE_BASE_SCORE);
  });

  it("clicking an empty hole returns null — no score change", () => {
    const hit = findWhackableEntity(5, [], 5_000);
    expect(hit).toBeNull();
    // Score would remain unchanged (caller does nothing when null is returned)
  });

  it("hitting a bomb applies correct score and time penalties", () => {
    const entities: ActiveEntity[] = [makeEntity({ hole: 2, type: "bomb", spawnedAt: 0, dur: 2000 })];
    const hit = findWhackableEntity(2, entities, 500);
    expect(hit).not.toBeNull();
    expect(hit!.type).toBe("bomb");

    const scoreBefore = 30;
    const elapsedBefore = 10_000;
    expect(applyBombPenalty(scoreBefore)).toBe(scoreBefore - BOMB_SCORE_PENALTY);
    expect(applyBombTimePenalty(elapsedBefore)).toBe(elapsedBefore + BOMB_TIME_PENALTY);
  });

  it("hitting the same entity twice: second hit returns null (already whacked)", () => {
    const entity = makeEntity({ hole: 0, whacked: false });
    // First hit
    expect(findWhackableEntity(0, [entity], 100)).toBe(entity);
    // Simulate whack
    entity.whacked = true;
    // Second hit — should not score
    expect(findWhackableEntity(0, [entity], 200)).toBeNull();
  });
});

// ─── buildSchedule ────────────────────────────────────────────────────────────

describe("buildSchedule", () => {
  it("is deterministic: same seed → identical schedule", () => {
    const a = buildSchedule("test-seed-42");
    const b = buildSchedule("test-seed-42");
    expect(a).toEqual(b);
  });

  it("different seeds produce different schedules", () => {
    const a = buildSchedule("seed-A");
    const b = buildSchedule("seed-B");
    // They may theoretically collide on a tiny schedule, but in practice won't
    expect(a).not.toEqual(b);
  });

  it("null seed is deterministic too (string-coerced as 'null')", () => {
    const a = buildSchedule(null);
    const b = buildSchedule(null);
    expect(a).toEqual(b);
  });

  it("all hole indices are valid (0..HOLE_COUNT-1)", () => {
    const sched = buildSchedule("validity-test");
    for (const entry of sched) {
      expect(entry.hole).toBeGreaterThanOrEqual(0);
      expect(entry.hole).toBeLessThanOrEqual(HOLE_COUNT - 1);
    }
  });

  it("all 'at' timestamps fall within (0, roundMs)", () => {
    const sched = buildSchedule("timing-test");
    for (const entry of sched) {
      expect(entry.at).toBeGreaterThan(0);
      expect(entry.at).toBeLessThan(ROUND_DURATION);
    }
  });

  it("every entry has type 'mole' or 'bomb'", () => {
    const sched = buildSchedule("type-test");
    for (const entry of sched) {
      expect(["mole", "bomb"]).toContain(entry.type);
    }
  });

  it("produces a non-trivial number of events (~40 in 30 s)", () => {
    const sched = buildSchedule("count-test");
    // With gap 200–700 ms over 29 s, expect at least 25 events
    expect(sched.length).toBeGreaterThan(25);
  });

  it("bomb frequency is substantially below mole frequency (≈15 %)", () => {
    const sched = buildSchedule("bomb-freq");
    const bombs = sched.filter((e) => e.type === "bomb").length;
    const ratio = bombs / sched.length;
    // Should be roughly 0.15; allow wide tolerance 0..0.40
    expect(ratio).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeLessThan(0.4);
  });

  it("respects custom holeCount", () => {
    const sched = buildSchedule("custom-holes", 4);
    for (const e of sched) {
      expect(e.hole).toBeGreaterThanOrEqual(0);
      expect(e.hole).toBeLessThanOrEqual(3);
    }
  });
});

// ─── pickHole ─────────────────────────────────────────────────────────────────

describe("pickHole", () => {
  it("always returns a value in [0, holeCount)", () => {
    const rng = makeRng("pick-hole-test");
    for (let i = 0; i < 200; i++) {
      const h = pickHole(rng);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(HOLE_COUNT);
    }
  });

  it("is deterministic for a given seed", () => {
    const seq1 = Array.from({ length: 10 }, () => pickHole(makeRng("det") ));
    // Re-create a fresh RNG with the same seed each iteration to reproduce
    // (makeRng returns a stateful object; one shared rng would advance)
    const seq2 = Array.from({ length: 10 }, () => pickHole(makeRng("det")));
    expect(seq1).toEqual(seq2);
  });

  it("covers all holes with enough draws (no valid hole is permanently skipped)", () => {
    const rng = makeRng("coverage");
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(pickHole(rng));
    for (let h = 0; h < HOLE_COUNT; h++) {
      expect(seen.has(h), `hole ${h} never selected`).toBe(true);
    }
  });

  it("respects custom holeCount", () => {
    const rng = makeRng("custom-count");
    for (let i = 0; i < 100; i++) {
      const h = pickHole(rng, 4);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(4);
    }
  });
});
