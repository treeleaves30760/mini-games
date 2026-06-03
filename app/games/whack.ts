/* Whack-a-Mole — framework-free game logic, shared by the Vue component and
   the unit tests. Timers, animation, and reactive state stay in the component;
   only pure scoring / scheduling rules live here. */
import type { Rng } from "~/utils/rng";
import { makeRng } from "~/utils/rng";

// ─── constants ────────────────────────────────────────────────────────────────

export const HOLE_COUNT = 9;
export const ROUND_DURATION = 30_000; // ms
export const MOLE_BASE_SCORE = 10;
export const BOMB_SCORE_PENALTY = 15;
export const BOMB_TIME_PENALTY = 3_000; // ms subtracted from elapsed → fewer remaining seconds

// ─── types ────────────────────────────────────────────────────────────────────

export type EntityType = "mole" | "bomb";

/** One entry in the pre-built event schedule. */
export interface ScheduleEntry {
  /** 0-based hole index (0..HOLE_COUNT-1) */
  hole: number;
  /** time (ms elapsed) at which the entity should pop up */
  at: number;
  /** how long the entity stays visible before auto-escaping (ms) */
  dur: number;
  type: EntityType;
}

/** Minimal shape of an active entity that whack logic needs to inspect. */
export interface ActiveEntity {
  hole: number;
  type: EntityType;
  /** game-clock ms at which this entity was spawned */
  spawnedAt: number;
  dur: number;
  /** true once the player has hit it (or it escaped) */
  whacked: boolean;
}

// ─── schedule builder ─────────────────────────────────────────────────────────

/**
 * Build the full deterministic event schedule for one round.
 *
 * @param seed       - same value passed to the component's makeRng (may be null)
 * @param holeCount  - number of holes on the board (default HOLE_COUNT)
 * @param roundMs    - round duration in ms (default ROUND_DURATION)
 */
export function buildSchedule(
  seed: string | number | null | undefined,
  holeCount = HOLE_COUNT,
  roundMs = ROUND_DURATION,
): ScheduleEntry[] {
  const r = makeRng(String(seed ?? "null") + "-sched");
  const sched: ScheduleEntry[] = [];
  let t = 500; // first pop after 0.5 s
  while (t < roundMs - 500) {
    const hole = r.int(0, holeCount - 1);
    const isBomb = r.bool(0.15);
    const dur = r.int(900, 2200);
    const gap = r.int(200, 700);
    sched.push({ hole, at: t, dur, type: isBomb ? "bomb" : "mole" });
    t += gap;
  }
  return sched;
}

// ─── hole picker (single-step, for use without a full schedule) ───────────────

/**
 * Pick the next hole index using a seeded RNG.
 * All returned values are in [0, holeCount).
 */
export function pickHole(rng: Rng, holeCount = HOLE_COUNT): number {
  return rng.int(0, holeCount - 1);
}

// ─── scoring ──────────────────────────────────────────────────────────────────

/**
 * Points awarded for whacking a mole.
 *
 * @param elapsed    - game-clock ms that have elapsed when the hit lands
 * @param roundMs    - total round duration in ms
 */
export function calcMoleScore(elapsed: number, roundMs = ROUND_DURATION): number {
  const timeBonus = Math.max(0, Math.floor((roundMs - elapsed) / 3000));
  return MOLE_BASE_SCORE + timeBonus;
}

/**
 * New score after hitting a bomb (clamped to 0).
 *
 * @param currentScore - score before the hit
 */
export function applyBombPenalty(currentScore: number): number {
  return Math.max(0, currentScore - BOMB_SCORE_PENALTY);
}

/**
 * New elapsed-ms value after hitting a bomb (fast-forwards time, clamped to
 * roundMs so the game doesn't run past the end).
 *
 * @param elapsed   - current game-clock ms
 * @param roundMs   - total round duration in ms
 */
export function applyBombTimePenalty(elapsed: number, roundMs = ROUND_DURATION): number {
  return Math.min(roundMs, elapsed + BOMB_TIME_PENALTY);
}

// ─── hit validity ─────────────────────────────────────────────────────────────

/**
 * Find the whackable entity at `holeIdx`, if any.
 *
 * Rules:
 *  - Returns the entity only when it exists at that hole, is not already
 *    whacked, and is currently "active" (within its visible window).
 *  - An empty hole, an already-whacked entity, or an entity that has already
 *    escaped all return null (no score change should occur).
 *
 * @param holeIdx        - the hole the player clicked/tapped
 * @param activeEntities - current list of entities on the board
 * @param elapsed        - current game-clock ms (used to verify entity is still visible)
 */
export function findWhackableEntity(
  holeIdx: number,
  activeEntities: ActiveEntity[],
  elapsed: number,
): ActiveEntity | null {
  const entity = activeEntities.find((e) => e.hole === holeIdx && !e.whacked);
  if (!entity) return null;
  // Verify the entity is still within its visible window
  const age = elapsed - entity.spawnedAt;
  if (age > entity.dur) return null;
  return entity;
}
