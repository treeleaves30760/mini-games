/* Reversi (Othello) — framework-free pure game logic.
   Shared by the Vue component and the unit tests. */
import type { Rng } from "~/utils/rng";

// ---- constants ----
export const EMPTY = 0 as const;
export const BLACK = 1 as const;
export const WHITE = 2 as const;
export type Player = typeof BLACK | typeof WHITE;
export type Cell = typeof EMPTY | Player;
export type Board = Cell[]; // flat 64-element array, row-major

/** 8 cardinal + diagonal directions as [dRow, dCol] pairs. */
export const DIRS: readonly (readonly [number, number])[] = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],          [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
];

/** Positional weight table used by the AI heuristic. */
export const WEIGHTS: readonly (readonly number[])[] = [
  [120, -20,  20,  5,  5,  20, -20, 120],
  [-20, -40,  -5, -5, -5,  -5, -40, -20],
  [ 20,  -5,  15,  3,  3,  15,  -5,  20],
  [  5,  -5,   3,  3,  3,   3,  -5,   5],
  [  5,  -5,   3,  3,  3,   3,  -5,   5],
  [ 20,  -5,  15,  3,  3,  15,  -5,  20],
  [-20, -40,  -5, -5, -5,  -5, -40, -20],
  [120, -20,  20,  5,  5,  20, -20, 120],
];

// ---- coordinate helpers ----
export function idx(r: number, c: number): number { return r * 8 + c; }
export function rowOf(pos: number): number { return Math.floor(pos / 8); }
export function colOf(pos: number): number { return pos % 8; }
export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

/** Initial standard Reversi/Othello starting position. */
export function initBoard(): Board {
  const b: Cell[] = new Array(64).fill(EMPTY);
  b[27] = WHITE; b[28] = BLACK;
  b[35] = BLACK; b[36] = WHITE;
  return b;
}

/**
 * Return the indices of opponent discs that would be flipped if `player`
 * placed at (r, c) on board `b`. An empty result means the move is illegal.
 */
export function getFlips(b: Board, r: number, c: number, player: Player): number[] {
  if (b[idx(r, c)] !== EMPTY) return [];
  const opp: Player = player === BLACK ? WHITE : BLACK;
  const all: number[] = [];
  for (const [dr, dc] of DIRS) {
    const line: number[] = [];
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc) && b[idx(nr, nc)] === opp) {
      line.push(idx(nr, nc));
      nr += dr; nc += dc;
    }
    if (line.length > 0 && inBounds(nr, nc) && b[idx(nr, nc)] === player) {
      all.push(...line);
    }
  }
  return all;
}

/**
 * Return all legal move positions (flat indices) for `player` on board `b`.
 * A position is legal if placing there flips at least one opponent disc.
 */
export function getLegal(b: Board, player: Player): number[] {
  const moves: number[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (getFlips(b, r, c, player).length > 0) {
        moves.push(idx(r, c));
      }
    }
  }
  return moves;
}

/**
 * Apply a move: place `player`'s disc at `pos` and flip all captured discs.
 * Returns a new board (does not mutate) and the list of flipped indices.
 */
export function applyMove(
  b: Board,
  pos: number,
  player: Player,
): { board: Board; flips: number[] } {
  const nb = [...b] as Board;
  const r = rowOf(pos), c = colOf(pos);
  const flips = getFlips(nb, r, c, player);
  nb[pos] = player;
  for (const f of flips) nb[f] = player;
  return { board: nb, flips };
}

/** Count discs for each colour. */
export function countDiscs(b: Board): { black: number; white: number } {
  let black = 0, white = 0;
  for (const v of b) {
    if (v === BLACK) black++;
    else if (v === WHITE) white++;
  }
  return { black, white };
}

/**
 * Determine the winner by disc count.
 * Returns BLACK, WHITE, or EMPTY (draw).
 */
export function getWinner(b: Board): Cell {
  const { black, white } = countDiscs(b);
  if (black > white) return BLACK;
  if (white > black) return WHITE;
  return EMPTY;
}

/**
 * True when neither player has a legal move — the game is over.
 */
export function isGameOver(b: Board): boolean {
  return getLegal(b, BLACK).length === 0 && getLegal(b, WHITE).length === 0;
}

/**
 * 1-ply positional + mobility heuristic score for the AI placing at `move`.
 */
export function aiScore(b: Board, move: number, player: Player): number {
  const { board: nb } = applyMove(b, move, player);
  const r = rowOf(move), c = colOf(move);
  const opp: Player = player === BLACK ? WHITE : BLACK;
  const myMob  = getLegal(nb, player).length;
  const oppMob = getLegal(nb, opp).length;
  return WEIGHTS[r][c] * 2 + myMob * 3 - oppMob * 4;
}

/**
 * Pick the best move for WHITE using a 1-ply heuristic.
 * `rng` is used only to break exact score ties deterministically.
 * Returns -1 if WHITE has no legal moves.
 */
export function aiMove(b: Board, rng?: Rng): number {
  const moves = getLegal(b, WHITE);
  if (moves.length === 0) return -1;
  let best = -Infinity;
  let bestMoves: number[] = [];
  for (const m of moves) {
    const s = aiScore(b, m, WHITE);
    if (s > best) { best = s; bestMoves = [m]; }
    else if (s === best) { bestMoves.push(m); }
  }
  // Deterministic tie-break: first in scan order when no rng supplied
  if (bestMoves.length === 1 || !rng) return bestMoves[0];
  return rng.pick(bestMoves);
}
