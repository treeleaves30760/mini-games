/* Flood It — framework-free game logic.
   Shared by the Vue component and the unit tests.

   Pure, deterministic functions only:
   - board generation (seeded RNG)
   - flood-fill on colour pick
   - controlled-region BFS
   - win detection

   Vue/DOM/animation/localStorage/timer stay in FloodGame.vue. */

import type { Rng } from "~/utils/rng";
import { makeRng } from "~/utils/rng";

// ---- palette (accessible, dark-theme-friendly) ----
export const PALETTE = [
  "#ff6b6b",
  "#ffd93d",
  "#6bcb77",
  "#4d96ff",
  "#c77dff",
  "#ff9f43",
] as const;

export type PaletteIndex = 0 | 1 | 2 | 3 | 4 | 5;

// ---- board size presets ----
export const SIZES = [10, 14, 18] as const;
export type BoardSize = (typeof SIZES)[number];

/** Step-limit for each supported board size. */
export const LIMITS: Record<BoardSize, number> = { 10: 20, 14: 25, 18: 32 };

// ---- board representation ----
/** Flat row-major array of colour indices (each in 0..PALETTE.length-1). */
export type Board = number[];

/**
 * Generate a random board of `size × size` cells.
 * Pass an Rng for deterministic output, or a seed value (string | number | null)
 * which is forwarded to makeRng so tests can use a plain seed string.
 */
export function generateBoard(
  size: BoardSize | number,
  rngOrSeed: Rng | string | number | null = null
): Board {
  const rng: Rng =
    rngOrSeed !== null &&
    typeof rngOrSeed === "object" &&
    typeof (rngOrSeed as Rng).int === "function"
      ? (rngOrSeed as Rng)
      : makeRng(rngOrSeed as string | number | null);

  const cells = size * size;
  const board: Board = new Array(cells);
  for (let i = 0; i < cells; i++) {
    board[i] = rng.int(0, PALETTE.length - 1);
  }
  return board;
}

/**
 * BFS from cell 0 (top-left): collect all cells that are part of the current
 * connected region (i.e. reachable from [0,0] through same-coloured neighbours).
 *
 * Returns a Uint8Array indexed by flat cell position; 1 = in region, 0 = not.
 */
export function getRegion(board: Board, size: number): Uint8Array {
  const startColor = board[0];
  const visited = new Uint8Array(size * size);
  const queue: number[] = [0];
  visited[0] = 1;

  while (queue.length) {
    const idx = queue.shift()!;
    const r = (idx / size) | 0;
    const c = idx % size;
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
      const ni = nr * size + nc;
      if (!visited[ni] && board[ni] === startColor) {
        visited[ni] = 1;
        queue.push(ni);
      }
    }
  }

  return visited;
}

/**
 * Apply a colour pick: flood the origin-connected region (and any immediately
 * adjacent same-coloured cells) to `colorIdx`.
 *
 * Returns a NEW board array — the input is not mutated.
 *
 * If `colorIdx` equals the current origin colour the board is returned unchanged
 * (same reference), mirroring the component's no-op guard.
 */
export function applyPick(
  board: Board,
  size: number,
  colorIdx: number
): Board {
  const currentColor = board[0];
  if (colorIdx === currentColor) return board;

  const b = board.slice();
  const visited = new Uint8Array(size * size);
  const queue: number[] = [0];
  visited[0] = 1;
  b[0] = colorIdx;

  while (queue.length) {
    const idx = queue.shift()!;
    const r = (idx / size) | 0;
    const c = idx % size;
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
      const ni = nr * size + nc;
      if (!visited[ni] && (b[ni] === currentColor || b[ni] === colorIdx)) {
        visited[ni] = 1;
        b[ni] = colorIdx;
        queue.push(ni);
      }
    }
  }

  return b;
}

/**
 * True when every cell of the board is the same colour — the win condition.
 */
export function isWon(board: Board): boolean {
  if (board.length === 0) return false;
  const first = board[0];
  return board.every((c) => c === first);
}
