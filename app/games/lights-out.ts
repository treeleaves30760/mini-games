/* Lights Out — framework-free game logic, shared by the Vue component and
   the unit tests. Only pure, deterministic logic lives here: cell-press
   effect, board generation (guaranteed solvable), and win detection.
   Vue state, timers, localStorage, and animations stay in the component. */

import type { Rng } from "~/utils/rng";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A flat row-major board of 0 (off) or 1 (on). */
export type Board = number[];

/** The result of generateBoard — includes the solution hint. */
export interface GeneratedBoard {
  /** Flat row-major array of 0/1. Length = size * size. */
  board: Board;
  /**
   * The set of (row, col) presses that were applied from the all-off state
   * to produce `board`. Replaying these presses on `board` returns it to
   * all-off. This is one known solution.
   */
  solution: Array<[number, number]>;
  /** The N used to generate this board (board.length === size * size). */
  size: number;
}

// ---------------------------------------------------------------------------
// Core press logic
// ---------------------------------------------------------------------------

/**
 * Apply a press at cell (r, c) on a board of size N × N.
 * Toggles (r, c) and its 4 orthogonal neighbours in place.
 * Out-of-bounds neighbours are silently ignored (edge/corner cells flip fewer).
 */
export function applyPress(board: Board, r: number, c: number, N: number): void {
  const toggle = (rr: number, cc: number): void => {
    if (rr >= 0 && rr < N && cc >= 0 && cc < N) {
      board[rr * N + cc] ^= 1;
    }
  };
  toggle(r, c);
  toggle(r - 1, c);
  toggle(r + 1, c);
  toggle(r, c - 1);
  toggle(r, c + 1);
}

/**
 * Apply a press and return a NEW board (non-mutating convenience wrapper).
 */
export function pressCell(board: Board, r: number, c: number, N: number): Board {
  const next = [...board];
  applyPress(next, r, c, N);
  return next;
}

// ---------------------------------------------------------------------------
// Win detection
// ---------------------------------------------------------------------------

/**
 * True when every cell on the board is off (0). This matches the component's
 * win condition: `board.every(v => v === 0)`.
 */
export function isWon(board: Board): boolean {
  return board.every((v) => v === 0);
}

// ---------------------------------------------------------------------------
// Board generation (guaranteed solvable)
// ---------------------------------------------------------------------------

/**
 * Generate a scrambled board that is guaranteed solvable by starting from the
 * all-off state and applying `numPresses` random presses.
 * Replaying the returned `solution` presses on the resulting board brings it
 * back to all-off.
 *
 * @param N    Grid dimension (board is N × N).
 * @param rng  A seeded (or unseeded) Rng — use makeRng(seed) for determinism.
 * @param numPresses  How many random presses to apply. Defaults to N*N
 *                    (matches the component's `Math.max(N*N, floor(N*N*0.7))`
 *                    which always equals N*N since N*N >= N*N*0.7).
 */
export function generateBoard(
  N: number,
  rng: Rng,
  numPresses: number = N * N,
): GeneratedBoard {
  const board: Board = new Array(N * N).fill(0);
  const solution: Array<[number, number]> = [];

  for (let i = 0; i < numPresses; i++) {
    const r = rng.int(0, N - 1);
    const c = rng.int(0, N - 1);
    applyPress(board, r, c, N);
    solution.push([r, c]);
  }

  // Edge case: if the board is already all-off (astronomically unlikely but
  // possible), press the centre cell so there's actually something to solve.
  if (board.every((v) => v === 0)) {
    const r = Math.floor(N / 2);
    const c = Math.floor(N / 2);
    applyPress(board, r, c, N);
    solution.push([r, c]);
  }

  return { board, solution, size: N };
}

/**
 * Convenience overload: accept a seed (string | number | null | undefined)
 * instead of a pre-built Rng, creating one internally.
 */
export function generateBoardFromSeed(
  N: number,
  seed?: string | number | null,
  numPresses: number = N * N,
): GeneratedBoard {
  return generateBoard(N, makeRng(seed), numPresses);
}
