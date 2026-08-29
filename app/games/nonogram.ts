/* Nonogram (Picross) — framework-free pure game logic.
   Shared by NonogramGame.vue and the Vitest test suite.
   Only deterministic, side-effect-free functions live here:
   solution generation, clue computation, win detection.
   Vue reactivity, timer, drag state, and localStorage stay in the component.

   Win detection is CLUE-based: a random picture very often admits several
   fillings with identical row/column clues, and every one of them is a valid
   answer. Comparing the player's board against the source picture would make
   such puzzles unwinnable, so the board's own clues are compared instead. */

import type { Rng } from "~/utils/rng";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A flat (row-major) grid of length N*N. 1 = filled; anything else (0 = empty,
    2 = X-marked on a player board) counts as not filled. */
export type Grid = number[];

/** Clue groups for one row or column: a list of run lengths. An empty line is [0]. */
export type Clue = number[];

/** All row clues and all column clues for an N×N grid. */
export interface NonogramClues {
  rows: Clue[];
  cols: Clue[];
}

// ---------------------------------------------------------------------------
// Clue computation
// ---------------------------------------------------------------------------

/**
 * Run-length clue of a single line of cells, exactly as a nonogram displays it:
 * consecutive filled cells form one run, gaps separate runs, no run → [0].
 * Only the value 1 is "filled", so a player board with X-marks (2) can be
 * passed as-is.
 */
export function lineClue(cells: number[]): Clue {
  const runs: number[] = [];
  let run = 0;
  for (const v of cells) {
    if (v === 1) {
      run++;
    } else if (run) {
      runs.push(run);
      run = 0;
    }
  }
  if (run) runs.push(run);
  return runs.length ? runs : [0];
}

/**
 * Given a flat grid of length N*N and the grid size N, return the row and
 * column run-length clues.
 *
 * A row/column with no filled cells produces [0].
 * A row/column fully filled produces [N].
 */
export function computeClues(grid: Grid, N: number): NonogramClues {
  const rows: Clue[] = [];
  const cols: Clue[] = [];
  for (let r = 0; r < N; r++) rows.push(lineClue(grid.slice(r * N, r * N + N)));
  for (let c = 0; c < N; c++) {
    const line: number[] = [];
    for (let r = 0; r < N; r++) line.push(grid[r * N + c]);
    cols.push(lineClue(line));
  }
  return { rows, cols };
}

/** True when two clues list the same run lengths in the same order. */
export function cluesEqual(a: Clue, b: Clue): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ---------------------------------------------------------------------------
// Solution generation
// ---------------------------------------------------------------------------

/**
 * Generate a random N×N binary picture using a seeded Rng.
 * Each cell is filled with ~55% probability. The picture always contains at
 * least one filled cell: an all-empty picture would be "solved" by the
 * untouched board, so the (astronomically rare, p = 0.45^(N*N)) empty draw is
 * redrawn from the same stream, keeping the result seed-deterministic.
 * Pass a pre-built Rng for fine-grained control (e.g. in tests), or a seed
 * string/number to build one internally.
 */
export function generateSolution(N: number, rngOrSeed: Rng | string | number | null = null): Grid {
  const rng: Rng =
    rngOrSeed !== null && typeof rngOrSeed === "object" && "bool" in rngOrSeed
      ? (rngOrSeed as Rng)
      : makeRng(rngOrSeed as string | number | null);
  let grid: Grid;
  do {
    grid = Array.from({ length: N * N }, () => (rng.bool(0.55) ? 1 : 0));
  } while (N > 0 && !grid.includes(1));
  return grid;
}

// ---------------------------------------------------------------------------
// Win / solved detection
// ---------------------------------------------------------------------------

/**
 * Return true when the clues derived from the player's board equal the
 * puzzle's clues — i.e. the board is ANY valid solution, not necessarily the
 * picture the clues were generated from.
 *
 * Cell values: 0 = empty, 1 = filled, 2 = X-marked. X-marks count as empty,
 * so marking cells that must stay empty never blocks a win, while an X on a
 * cell that has to be filled does.
 */
export function matchesClues(board: Grid, clues: NonogramClues): boolean {
  const N = clues.rows.length;
  if (clues.cols.length !== N || board.length !== N * N) return false;
  const got = computeClues(board, N);
  for (let i = 0; i < N; i++) {
    if (!cluesEqual(got.rows[i], clues.rows[i]) || !cluesEqual(got.cols[i], clues.cols[i])) return false;
  }
  return true;
}

/**
 * Convenience wrapper: is `board` a solution of the puzzle whose clues come
 * from `solution`? Delegates to `matchesClues`, so any filling with the same
 * clues as `solution` wins, not only the picture itself.
 * `N` defaults to the side length implied by `solution`; non-square inputs or
 * mismatched lengths are never solved.
 */
export function isSolved(
  board: Grid,
  solution: Grid,
  N: number = Math.round(Math.sqrt(solution.length)),
): boolean {
  if (board.length !== solution.length || solution.length !== N * N) return false;
  return matchesClues(board, computeClues(solution, N));
}
