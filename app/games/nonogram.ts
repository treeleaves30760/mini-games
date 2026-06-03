/* Nonogram (Picross) — framework-free pure game logic.
   Shared by NonogramGame.vue and the Vitest test suite.
   Only deterministic, side-effect-free functions live here:
   solution generation, clue computation, win detection.
   Vue reactivity, timer, drag state, and localStorage stay in the component. */

import type { Rng } from "~/utils/rng";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A flat (row-major) boolean grid: 1 = filled, 0 = empty. Length = N*N. */
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
 * Given a flat grid of length N*N and the grid size N, return the row and
 * column run-length clues exactly as a nonogram puzzle displays them.
 *
 * A row/column with no filled cells produces [0].
 * A row/column fully filled produces [N].
 * Consecutive filled cells are counted as one run; gaps reset the counter.
 */
export function computeClues(grid: Grid, N: number): NonogramClues {
  const rows: Clue[] = [];
  const cols: Clue[] = [];

  // Row clues
  for (let r = 0; r < N; r++) {
    const runs: number[] = [];
    let run = 0;
    for (let c = 0; c < N; c++) {
      if (grid[r * N + c]) {
        run++;
      } else if (run) {
        runs.push(run);
        run = 0;
      }
    }
    if (run) runs.push(run);
    rows.push(runs.length ? runs : [0]);
  }

  // Column clues
  for (let c = 0; c < N; c++) {
    const runs: number[] = [];
    let run = 0;
    for (let r = 0; r < N; r++) {
      if (grid[r * N + c]) {
        run++;
      } else if (run) {
        runs.push(run);
        run = 0;
      }
    }
    if (run) runs.push(run);
    cols.push(runs.length ? runs : [0]);
  }

  return { rows, cols };
}

// ---------------------------------------------------------------------------
// Solution generation
// ---------------------------------------------------------------------------

/**
 * Generate a random N×N binary solution grid using a seeded Rng.
 * Each cell is filled with ~55% probability, matching the original component.
 * Pass a pre-built Rng for fine-grained control (e.g. in tests), or a seed
 * string/number to build one internally.
 */
export function generateSolution(N: number, rngOrSeed: Rng | string | number | null = null): Grid {
  const rng: Rng =
    rngOrSeed !== null && typeof rngOrSeed === "object" && "bool" in rngOrSeed
      ? (rngOrSeed as Rng)
      : makeRng(rngOrSeed as string | number | null);
  return Array.from({ length: N * N }, () => (rng.bool(0.55) ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Win / solved detection
// ---------------------------------------------------------------------------

/**
 * Return true when every cell of the player's board matches the solution's
 * filled cells — i.e. filled where solution is 1, and not-filled (0 or 2)
 * where solution is 0.
 *
 * Cell values: 0 = empty, 1 = filled, 2 = X-marked.
 * X-marks on cells that should be empty are acceptable (the puzzle is still
 * solved). A cell that should be filled but is X-marked is NOT a win.
 */
export function isSolved(board: Grid, solution: Grid): boolean {
  if (board.length !== solution.length) return false;
  return solution.every((v, i) => (v === 1) === (board[i] === 1));
}
