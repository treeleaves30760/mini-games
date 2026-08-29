/* Flood It — framework-free game logic.
   Shared by the Vue component and the unit tests.

   Pure, deterministic functions only:
   - board generation (seeded RNG)
   - flood-fill on colour pick (classic Flood It rule)
   - controlled-region BFS
   - win detection
   - a deterministic heuristic solver that certifies the move limit shown to
     the player is reachable on every generated board

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

/**
 * Base step-limit for each supported board size (the classic Flood It caps).
 * `computeLimit` raises the cap for the rare board the built-in solver cannot
 * finish within it, so the limit shown to the player is always reachable.
 */
export const LIMITS: Record<BoardSize, number> = { 10: 20, 14: 25, 18: 32 };

// ---- board representation ----
/** Flat row-major array of colour indices (each in 0..PALETTE.length-1). */
export type Board = number[];

/** A generated board together with its certified move limit. */
export interface FloodPuzzle {
  board: Board;
  limit: number;
}

/** Orthogonal neighbour offsets (row, col). */
const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

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

  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    const r = (idx / size) | 0;
    const c = idx % size;
    for (const [dr, dc] of DIRS) {
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
 * Apply a colour pick (classic Flood It rule): the origin-connected region
 * takes `colorIdx` and merges with every `colorIdx`-coloured cell reachable
 * from it through `colorIdx`-coloured cells. Cells of the old colour that are
 * not part of the region are never touched — even when they sit right behind
 * a merged cell.
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

  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    // Only cells of the old region may pull in further old-colour cells; from a
    // freshly merged new-colour cell the flood continues through new-colour
    // cells only. `board` (the untouched input) still holds the old colours.
    const fromRegion = board[idx] === currentColor;
    const r = (idx / size) | 0;
    const c = idx % size;
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
      const ni = nr * size + nc;
      if (visited[ni]) continue;
      if (board[ni] === colorIdx || (fromRegion && board[ni] === currentColor)) {
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

// ---- built-in heuristic solver ----

/** One beam-search candidate: the flooded region and the picks that made it. */
interface SolverState {
  region: Uint8Array;
  /** Number of flooded cells. */
  area: number;
  /** Non-region cells that touch the region (unique). */
  frontier: number[];
  path: number[];
  /** Ranking key: bigger is more promising. */
  score: number;
}

/**
 * Build a state from a region mask: collects the frontier and counts the
 * colours still present outside the region. The score favours flooded area,
 * a wide frontier (more choice next turn) and, above all, having eliminated
 * colours — each remaining colour is at least one more move.
 */
function makeState(
  board: Board,
  size: number,
  region: Uint8Array,
  area: number,
  path: number[]
): SolverState {
  const total = size * size;
  const frontier: number[] = [];
  let colourMask = 0;
  for (let idx = 0; idx < total; idx++) {
    if (region[idx]) continue;
    colourMask |= 1 << board[idx];
    const r = (idx / size) | 0;
    const c = idx % size;
    if (
      (r > 0 && region[idx - size]) ||
      (r < size - 1 && region[idx + size]) ||
      (c > 0 && region[idx - 1]) ||
      (c < size - 1 && region[idx + 1])
    ) {
      frontier.push(idx);
    }
  }
  let coloursLeft = 0;
  while (colourMask) {
    coloursLeft += colourMask & 1;
    colourMask >>>= 1;
  }
  const score = area + frontier.length - coloursLeft * total;
  return { region, area, frontier, path, score };
}

/**
 * Flood `colour` into the region of `s` (classic rule). Returns null when no
 * frontier cell has that colour, i.e. the pick would gain nothing.
 */
function expandState(
  board: Board,
  size: number,
  s: SolverState,
  colour: number
): SolverState | null {
  const region = s.region.slice();
  const stack: number[] = [];
  for (const f of s.frontier) {
    if (board[f] === colour) {
      region[f] = 1;
      stack.push(f);
    }
  }
  if (!stack.length) return null;

  let area = s.area + stack.length;
  while (stack.length) {
    const idx = stack.pop()!;
    const r = (idx / size) | 0;
    const c = idx % size;
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
      const ni = nr * size + nc;
      if (!region[ni] && board[ni] === colour) {
        region[ni] = 1;
        area++;
        stack.push(ni);
      }
    }
  }
  return makeState(board, size, region, area, [...s.path, colour]);
}

/**
 * Deterministic beam-search solver. Returns a sequence of colour picks that
 * floods the whole board; replaying it with `applyPick` wins in exactly
 * `path.length` moves. `width` is the beam width (1 = plain greedy).
 *
 * Throws only for boards holding a colour outside the palette — such cells
 * can never be flooded, so no move sequence exists.
 */
export function solveHeuristic(board: Board, size: number, width = 16): number[] {
  const total = size * size;
  const beamWidth = Math.max(1, width | 0);

  const first = getRegion(board, size);
  let firstArea = 0;
  for (let i = 0; i < total; i++) firstArea += first[i];
  if (firstArea === total) return [];

  let states: SolverState[] = [makeState(board, size, first, firstArea, [])];
  while (states.length) {
    const next: SolverState[] = [];
    const seen = new Set<string>();
    for (const s of states) {
      for (let colour = 0; colour < PALETTE.length; colour++) {
        const t = expandState(board, size, s, colour);
        if (!t) continue;
        if (t.area === total) return t.path;
        // Different pick orders often reach the same region — keep one.
        const key = t.region.join("");
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(t);
      }
    }
    // Stable sort → deterministic tie-breaking (insertion order).
    next.sort((a, b) => b.score - a.score);
    states = next.slice(0, beamWidth);
  }
  throw new Error("flood: board holds a colour outside the palette");
}

/**
 * Move limit for a concrete board: the classic cap for its size, raised to the
 * built-in solver's move count on the rare board the solver cannot finish
 * within the cap — so the limit shown to the player is always reachable.
 * Sizes without a preset cap (only used by tests) get the solver's count.
 */
export function computeLimit(board: Board, size: number): number {
  const base = LIMITS[size as BoardSize] ?? 0;
  return Math.max(base, solveHeuristic(board, size).length);
}

/**
 * Generate a board together with its certified move limit. Consumes exactly
 * the same RNG values as `generateBoard`, so seeded boards are unchanged.
 */
export function generatePuzzle(
  size: BoardSize | number,
  rngOrSeed: Rng | string | number | null = null
): FloodPuzzle {
  const board = generateBoard(size, rngOrSeed);
  return { board, limit: computeLimit(board, size) };
}
