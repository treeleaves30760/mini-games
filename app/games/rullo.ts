/* Rullo 數字開關 — framework-free game logic, shared by the Vue component and
   the unit tests. An N×N grid of numbers; every row and column carries a
   target sum. The player switches cells off until the active cells of every
   line add up to its target. Only pure, deterministic logic lives here. */

import type { Rng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export interface RulloPuzzle {
  /** Grid dimension N (grid is N × N). */
  size: number;
  /** Flat row-major cell values, each in 1..maxValue. Length = N * N. */
  values: number[];
  /** Target sum of each row, in row order. */
  rowTargets: number[];
  /** Target sum of each column, in column order. */
  colTargets: number[];
  /**
   * One known solution as a flat row-major active mask: true = the cell stays
   * on. Other masks that hit every target are equally valid.
   */
  solution: boolean[];
}

export interface Level {
  label: string;
  size: number;
  maxValue: number;
}

/** Difficulty presets offered by the component; the Daily uses 普通. */
export const LEVELS: Level[] = [
  { label: "簡單", size: 5, maxValue: 9 },
  { label: "普通", size: 6, maxValue: 9 },
  { label: "困難", size: 8, maxValue: 19 },
];

/** Probability that a cell stays on in the generated solution. */
const KEEP_P = 0.65;

// ---------------------------------------------------------------------------
// Sums / win check / toggle
// ---------------------------------------------------------------------------

/** Row and column sums of the active cells. */
export function sums(
  values: number[],
  active: boolean[],
  N: number,
): { rows: number[]; cols: number[] } {
  const rows: number[] = new Array(N).fill(0);
  const cols: number[] = new Array(N).fill(0);
  for (let i = 0; i < N * N; i++) {
    if (!active[i]) continue;
    rows[Math.floor(i / N)] += values[i]!;
    cols[i % N] += values[i]!;
  }
  return { rows, cols };
}

/**
 * True when every row and column of active cells sums to its target. Any
 * active set that matches counts — the puzzle does not require uniqueness.
 */
export function isSolved(
  values: number[],
  active: boolean[],
  rowTargets: number[],
  colTargets: number[],
  N: number,
): boolean {
  const { rows, cols } = sums(values, active, N);
  for (let i = 0; i < N; i++) {
    if (rows[i] !== rowTargets[i] || cols[i] !== colTargets[i]) return false;
  }
  return true;
}

/** Flip cell i and return a new active mask; the input is left untouched. */
export function toggle(active: boolean[], i: number): boolean[] {
  const next = [...active];
  next[i] = !next[i];
  return next;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Build a puzzle: random values in 1..maxValue, then a random kept subset
 * whose line sums become the targets, so a solution always exists.
 *
 * One cell per row is placed on a random permutation and always kept, which
 * guarantees every row and every column keeps at least one cell. Every other
 * cell is kept with probability KEEP_P. If that leaves the whole grid on,
 * one non-permutation cell is switched off so the starting state is never
 * already solved (needs N >= 2).
 */
export function generatePuzzle(rng: Rng, N: number, maxValue: number): RulloPuzzle {
  const values: number[] = [];
  for (let i = 0; i < N * N; i++) values.push(rng.int(1, maxValue));

  const perm: number[] = [];
  for (let c = 0; c < N; c++) perm.push(c);
  rng.shuffle(perm);

  const solution: boolean[] = new Array(N * N).fill(false);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      solution[r * N + c] = c === perm[r] || rng.bool(KEEP_P);
    }
  }

  if (solution.every(Boolean)) {
    const r = rng.int(0, N - 1);
    const c = (perm[r]! + 1 + rng.int(0, N - 2)) % N;
    solution[r * N + c] = false;
  }

  const { rows, cols } = sums(values, solution, N);
  return { size: N, values, rowTargets: rows, colTargets: cols, solution };
}
