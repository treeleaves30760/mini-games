/* Water Sort — framework-free game logic.
   Tubes hold up to CAPACITY units of coloured liquid. Only the top colour of a
   tube pours, only onto the same colour or into an empty tube, and only as many
   units as fit. The puzzle is solved when every non-empty tube is full of one
   colour. Shared by the Vue component and the unit tests. */

import type { Rng } from "~/utils/rng";

/** Units of liquid a tube can hold. */
export const CAPACITY = 4;

/** One tube: colour ids from bottom (index 0) to top (last). */
export type Tube = number[];
/** The whole board. */
export type State = Tube[];
/** A pour: [from tube index, to tube index]. */
export type Move = [number, number];

/** Difficulty presets offered in free play; daily uses 普通. */
export const DIFFICULTIES = [
  { label: "簡單", colors: 4 },
  { label: "普通", colors: 6 },
  { label: "困難", colors: 8 },
] as const;

/** Number of consecutive units of the top colour (0 for an empty tube). */
export function topRun(tube: Tube): number {
  let n = 0;
  for (let i = tube.length - 1; i >= 0 && tube[i] === tube[tube.length - 1]; i--) n++;
  return n;
}

/** True when the tube is full of a single colour. */
export function isComplete(tube: Tube): boolean {
  return tube.length === CAPACITY && topRun(tube) === CAPACITY;
}

/** Can the top of `from` be poured into `to`? */
export function canPour(state: State, from: number, to: number): boolean {
  if (from === to) return false;
  const src = state[from];
  const dst = state[to];
  if (src.length === 0 || dst.length >= CAPACITY) return false;
  return dst.length === 0 || dst[dst.length - 1] === src[src.length - 1];
}

/** Pour as much of the top run as fits. Returns a new state; the input is not mutated. */
export function pour(state: State, from: number, to: number): State {
  const next = state.map((t) => [...t]);
  const src = next[from];
  const dst = next[to];
  const n = Math.min(topRun(src), CAPACITY - dst.length);
  for (let i = 0; i < n; i++) dst.push(src.pop()!);
  return next;
}

/** Solved when every tube is empty or complete. */
export function isSolved(state: State): boolean {
  return state.every((t) => t.length === 0 || isComplete(t));
}

/** Canonical key: tube order does not matter. */
function stateKey(state: State): string {
  return state.map((t) => t.join(",")).sort().join("|");
}

/** Legal pours worth exploring, most promising first. */
function candidateMoves(state: State): Move[] {
  const scored: Array<[number, Move]> = [];
  const firstEmpty = state.findIndex((t) => t.length === 0);
  for (let from = 0; from < state.length; from++) {
    const src = state[from];
    if (src.length === 0 || isComplete(src)) continue;
    const run = topRun(src);
    const uniform = run === src.length;
    for (let to = 0; to < state.length; to++) {
      if (!canPour(state, from, to)) continue;
      const dst = state[to];
      if (dst.length === 0) {
        // A one-colour tube gains nothing from moving to an empty tube, and
        // all empty tubes are interchangeable, so only try the first one.
        if (uniform || to !== firstEmpty) continue;
        scored.push([2, [from, to]]);
      } else {
        scored.push([run <= CAPACITY - dst.length ? 0 : 1, [from, to]]);
      }
    }
  }
  return scored.sort((a, b) => a[0] - b[0]).map((s) => s[1]);
}

/**
 * Bounded depth-first search with a visited set. Returns a list of pours that
 * reaches a solved state, or null if none was found within `maxNodes` states.
 */
export function solve(state: State, maxNodes = 40000): Move[] | null {
  const visited = new Set<string>();
  const path: Move[] = [];
  let budget = maxNodes;
  function dfs(s: State): boolean {
    if (isSolved(s)) return true;
    const key = stateKey(s);
    if (visited.has(key) || budget <= 0) return false;
    visited.add(key);
    budget--;
    for (const move of candidateMoves(s)) {
      path.push(move);
      if (dfs(pour(s, move[0], move[1]))) return true;
      path.pop();
    }
    return false;
  }
  return dfs(state) ? path : null;
}

export interface PuzzleOptions {
  /** Number of colours; each gets CAPACITY units and one tube. */
  colors: number;
  /** Extra empty tubes (default 2). */
  emptyTubes?: number;
}

/** Bound on generation attempts before giving up. */
export const MAX_ATTEMPTS = 100;

/**
 * Shuffle `colors × CAPACITY` units into `colors` full tubes plus empty tubes,
 * rejecting starts with an already complete tube, until the solver confirms the
 * puzzle can be finished. Deterministic for a given rng.
 */
export function generatePuzzle(rng: Rng, { colors, emptyTubes = 2 }: PuzzleOptions): State {
  const units: number[] = [];
  for (let c = 0; c < colors; c++) for (let i = 0; i < CAPACITY; i++) units.push(c);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    rng.shuffle(units);
    const state: State = [];
    for (let t = 0; t < colors; t++) state.push(units.slice(t * CAPACITY, (t + 1) * CAPACITY));
    if (state.some(isComplete)) continue;
    for (let e = 0; e < emptyTubes; e++) state.push([]);
    if (solve(state) !== null) return state;
  }
  throw new Error("water-sort: could not generate a solvable puzzle");
}
