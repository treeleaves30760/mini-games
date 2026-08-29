/* 數字推盤 15 Puzzle — framework-free game logic.
   Shared by the Vue component and the unit tests.
   Supports any NxN grid (N >= 2).

   A board is a flat number[] of length N*N.
   Blank is represented as 0.
   Solved state: [1, 2, ..., N*N-1, 0].
*/
import type { Rng } from "~/utils/rng";

// ---- Types ----------------------------------------------------------------

/** A direction from the blank's perspective: the blank "moves" that way,
    meaning the tile in that adjacent cell slides into the blank. */
export type Direction = "up" | "down" | "left" | "right";

// ---- Goal state -----------------------------------------------------------

/**
 * Return the solved (goal) state for an NxN board:
 * tiles 1..N*N-1 in order, blank (0) at the end.
 */
export function goalState(n: number): number[] {
  const arr: number[] = [];
  for (let i = 1; i < n * n; i++) arr.push(i);
  arr.push(0);
  return arr;
}

// ---- Win detection --------------------------------------------------------

/**
 * True when the board matches the goal state:
 * 1, 2, ..., N*N-1, 0.
 */
export function isSolved(board: number[]): boolean {
  for (let i = 0; i < board.length - 1; i++) {
    if (board[i] !== i + 1) return false;
  }
  return board[board.length - 1] === 0;
}

// ---- Blank position -------------------------------------------------------

/** Row and column of the blank (0) in a board of side length n. */
export function blankPos(board: number[], n: number): { r: number; c: number } {
  const i = board.indexOf(0);
  return { r: (i / n) | 0, c: i % n };
}

// ---- Legal moves ----------------------------------------------------------

/**
 * Which directions can the blank legally move?
 * "up" means blank moves up (the tile above slides down into blank).
 */
export function legalMoves(board: number[], n: number): Direction[] {
  const { r, c } = blankPos(board, n);
  const moves: Direction[] = [];
  if (r > 0) moves.push("up");
  if (r < n - 1) moves.push("down");
  if (c > 0) moves.push("left");
  if (c < n - 1) moves.push("right");
  return moves;
}

/**
 * Is the tile at flat index `tileIdx` adjacent to the blank?
 * (i.e. is it a legal single-step move?)
 */
export function isMovable(board: number[], n: number, tileIdx: number): boolean {
  const bi = board.indexOf(0);
  const br = (bi / n) | 0;
  const bc = bi % n;
  const tr = (tileIdx / n) | 0;
  const tc = tileIdx % n;
  // Adjacent means same row/col AND differ by exactly 1 step.
  return (
    (tr === br && Math.abs(tc - bc) === 1) ||
    (tc === bc && Math.abs(tr - br) === 1)
  );
}

// ---- Apply a single slide -------------------------------------------------

/**
 * Return a new board with the blank moved one step in `dir`
 * (the adjacent tile slides into the blank).
 * Throws if the move is not legal (the blank sits on that edge, or `dir` is not
 * a Direction), so a caller can never obtain a wrapped-around or out-of-range
 * board — which would silently break the solvability invariant.
 */
export function applyMove(board: number[], dir: Direction, n: number): number[] {
  if (!legalMoves(board, n).includes(dir)) {
    throw new Error(`Illegal move "${dir}": the blank cannot slide that way`);
  }
  const next = board.slice();
  const bi = next.indexOf(0);
  const r = (bi / n) | 0;
  const c = bi % n;
  let ti: number;
  if (dir === "up") ti = (r - 1) * n + c;
  else if (dir === "down") ti = (r + 1) * n + c;
  else if (dir === "left") ti = r * n + (c - 1);
  else ti = r * n + (c + 1);
  next[bi] = next[ti];
  next[ti] = 0;
  return next;
}

// ---- Slide a whole run (what a click does in the UI) ----------------------

/**
 * Slide the whole run of tiles between flat index `idx` and the blank one cell
 * toward the blank, leaving the blank at `idx` — the effect of clicking a tile
 * in the UI. `idx` must share a row or a column with the blank; otherwise (or
 * when `idx` is the blank itself / out of range) returns null and the board is
 * left untouched. A run slide is exactly 1..N-1 consecutive `applyMove` steps
 * in one direction, so it can never break solvability.
 */
export function slideRun(board: number[], n: number, idx: number): number[] | null {
  const bi = board.indexOf(0);
  if (idx < 0 || idx >= board.length || idx === bi) return null;
  const tr = (idx / n) | 0;
  const tc = idx % n;
  const br = (bi / n) | 0;
  const bc = bi % n;
  if (tr !== br && tc !== bc) return null; // not aligned with the blank
  // Step from the blank toward the clicked tile: ±1 within a row, ±n within a column.
  const step = tr === br ? (tc > bc ? 1 : -1) : tr > br ? n : -n;
  const next = board.slice();
  let cursor = bi;
  while (cursor !== idx) {
    const from = cursor + step;
    next[cursor] = next[from];
    cursor = from;
  }
  next[idx] = 0;
  return next;
}

// ---- Solvability check (inversion count + blank-row parity) ---------------

/**
 * Count inversions in a board (ignoring the blank).
 * An inversion is a pair (i, j) with i < j and board[i] > board[j],
 * where neither is 0.
 */
export function countInversions(board: number[]): number {
  const tiles = board.filter((v) => v !== 0);
  let count = 0;
  for (let i = 0; i < tiles.length - 1; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      if (tiles[i] > tiles[j]) count++;
    }
  }
  return count;
}

/**
 * Check whether a board is solvable for an NxN grid.
 *
 * Rules:
 *  - N odd:  solvable iff inversion count is even.
 *  - N even: solvable iff (inversion count + blank's row from bottom) is odd.
 *            "row from bottom" = N - blankRow (1-indexed from bottom).
 */
export function isBoardSolvable(board: number[], n: number): boolean {
  const inv = countInversions(board);
  if (n % 2 === 1) {
    // Odd grid: solvable iff even inversions
    return inv % 2 === 0;
  } else {
    // Even grid: solvable iff (inv + blank row from bottom) is odd
    const bi = board.indexOf(0);
    const blankRow = (bi / n) | 0; // 0-indexed from top
    const rowFromBottom = n - blankRow; // 1-indexed from bottom
    return (inv + rowFromBottom) % 2 === 1;
  }
}

// ---- Shuffle / generation -------------------------------------------------

const OPP: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

/**
 * Generate a scrambled, always-SOLVABLE, never-already-solved board of side
 * length n (n >= 2), using the provided Rng for deterministic output.
 *
 * Strategy: start from the solved state and apply many random legal moves,
 * never immediately reversing the last move. This guarantees solvability by
 * construction (every state reachable from the solved state is solvable).
 */
export function generateBoard(n: number, rng: Rng): number[] {
  if (!Number.isInteger(n) || n < 2) {
    throw new RangeError(`Board size must be an integer >= 2, got ${n}`);
  }
  let board = goalState(n);
  const steps = Math.max(120, n * n * 30);
  let last: Direction | null = null;
  for (let i = 0; i < steps; i++) {
    // For n >= 2 the blank always has >= 2 legal moves, so excluding the single
    // reverse move always leaves at least one candidate to pick from.
    const reverse = last ? OPP[last] : null;
    const moves = legalMoves(board, n).filter((m) => m !== reverse);
    const m = rng.pick(moves);
    board = applyMove(board, m, n);
    last = m;
  }
  // The walk can land back on the goal: on a 2×2 the non-reversing walk is a
  // fixed 12-move cycle and 120 steps is a whole number of laps. One extra
  // legal move always fixes it — every neighbour of the goal is unsolved and,
  // being reachable, still solvable.
  if (isSolved(board)) board = applyMove(board, rng.pick(legalMoves(board, n)), n);
  return board;
}
