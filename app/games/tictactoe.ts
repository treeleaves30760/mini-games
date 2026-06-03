/* Tic-Tac-Toe — framework-free pure game logic.
   Shared between TicTacToeGame.vue and unit tests.
   No Vue, no DOM, no timers, no localStorage. */
import type { Rng } from "~/utils/rng";

// ---- constants ----
export const EMPTY = 0;
export const X = 1;
export const O = 2;

export type Player = typeof X | typeof O;
export type Cell = typeof EMPTY | Player;
export type Board = Cell[];

export const WIN_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],             // diagonals
];

export interface WinResult {
  winner: Player;
  line: readonly [number, number, number];
}

/**
 * Check if the board has a winner.
 * Returns { winner, line } if there is one, or null otherwise.
 */
export function checkWinner(b: Board): WinResult | null {
  for (const line of WIN_LINES) {
    const [a, c, d] = line;
    if (b[a] !== EMPTY && b[a] === b[c] && b[c] === b[d]) {
      return { winner: b[a] as Player, line };
    }
  }
  return null;
}

/**
 * Returns true if the board is full with no winner — a draw.
 */
export function isDraw(b: Board): boolean {
  return b.every((v) => v !== EMPTY) && checkWinner(b) === null;
}

/**
 * Minimax with alpha-beta pruning.
 * O is the maximising player (AI), X is the minimising player (human).
 * Returns a score: positive = O advantage, negative = X advantage.
 */
export function minimax(
  b: Board,
  depth: number,
  isMaximizing: boolean,
  alpha: number,
  beta: number
): number {
  const result = checkWinner(b);
  if (result) return result.winner === O ? 10 - depth : depth - 10;
  if (b.every((v) => v !== EMPTY)) return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i] === EMPTY) {
        b[i] = O;
        best = Math.max(best, minimax(b, depth + 1, false, alpha, beta));
        b[i] = EMPTY;
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i] === EMPTY) {
        b[i] = X;
        best = Math.min(best, minimax(b, depth + 1, true, alpha, beta));
        b[i] = EMPTY;
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
    }
    return best;
  }
}

/**
 * Get the best move for O (the AI) on the given board.
 *
 * - difficulty "hard": full minimax — optimal play, never loses.
 *   When multiple moves share the highest score, an optional `rng` is used to
 *   break ties (omit for deterministic first-index tie-breaking, useful in tests).
 * - difficulty "easy": pick a random empty cell using the provided `rng`.
 */
export function getBestMove(
  b: Board,
  difficulty: "easy" | "hard" = "hard",
  rng?: Rng
): number {
  if (difficulty === "easy") {
    const empties = b
      .map((v, i) => (v === EMPTY ? i : -1))
      .filter((i) => i >= 0);
    if (rng) return rng.pick(empties);
    return empties[0];
  }

  // hard: minimax
  let bestScore = -Infinity;
  let bestMoves: number[] = [];
  const tmp = [...b] as Board;
  for (let i = 0; i < 9; i++) {
    if (tmp[i] === EMPTY) {
      tmp[i] = O;
      const score = minimax(tmp, 0, false, -Infinity, Infinity);
      tmp[i] = EMPTY;
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [i];
      } else if (score === bestScore) {
        bestMoves.push(i);
      }
    }
  }

  if (bestMoves.length === 1) return bestMoves[0];
  if (rng) return rng.pick(bestMoves);
  return bestMoves[0]; // deterministic fallback (first best)
}
