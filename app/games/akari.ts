/* Akari / Light Up — framework-free game logic.
   Shared by the Vue component and unit tests.

   Rules:
     - Every non-wall cell must be illuminated by at least one bulb.
     - No two bulbs may see each other (share a row/column without a wall between them).
     - Numbered walls must have exactly that many orthogonally adjacent bulbs.

   The generator places walls randomly then greedily covers all white cells with
   bulbs so the solution is guaranteed valid and solvable. */

import type { Rng } from "~/utils/rng";
import { makeRng } from "~/utils/rng";

export type { Rng };

// ---- cell type ---------------------------------------------------------------

export interface AkariCell {
  /** true if this is a wall */
  wall: boolean;
  /** number shown on a numbered wall, or null */
  num: number | null;
  /** true if player placed a bulb here */
  bulb: boolean;
}

// ---- lighting result ---------------------------------------------------------

export interface LightingResult {
  /** indices of all illuminated (non-wall) cells, including the bulbs themselves */
  litSet: Set<number>;
  /** indices of bulbs that are in conflict (can see another bulb) */
  conflictSet: Set<number>;
}

// ---- index helpers -----------------------------------------------------------

/** Row-major flat index. */
export function cellIdx(r: number, c: number, size: number): number {
  return r * size + c;
}

/** [row, col] from flat index. */
export function cellRc(i: number, size: number): [number, number] {
  return [Math.floor(i / size), i % size];
}

/** True when (r, c) is inside the grid. */
export function inBounds(r: number, c: number, size: number): boolean {
  return r >= 0 && r < size && c >= 0 && c < size;
}

const DIRS4: readonly [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** All cell indices reachable from (r, c) in the four cardinal directions until
    a wall or the grid boundary is hit (bulb/non-wall cells are included, the
    start cell itself is NOT included). */
export function rayIndices(
  r: number,
  c: number,
  size: number,
  board: readonly AkariCell[],
): number[] {
  const rays: number[] = [];
  for (const [dr, dc] of DIRS4) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc, size)) {
      const ni = cellIdx(nr, nc, size);
      if (board[ni].wall) break;
      rays.push(ni);
      nr += dr;
      nc += dc;
    }
  }
  return rays;
}

// ---- illumination ------------------------------------------------------------

/** Compute which cells are lit and which bulbs are in conflict.
    A bulb illuminates itself and all cells it can see in four directions
    until a wall blocks the ray. If a ray reaches another bulb both are
    flagged as conflicting. */
export function computeLighting(
  board: readonly AkariCell[],
  size: number,
): LightingResult {
  const total = size * size;
  const litSet = new Set<number>();
  const conflictSet = new Set<number>();

  for (let i = 0; i < total; i++) {
    if (board[i].wall || !board[i].bulb) continue;
    litSet.add(i);
    const [r, c] = cellRc(i, size);
    for (const [dr, dc] of DIRS4) {
      let nr = r + dr;
      let nc = c + dc;
      while (inBounds(nr, nc, size)) {
        const ni = cellIdx(nr, nc, size);
        if (board[ni].wall) break;
        if (board[ni].bulb) {
          // mutual conflict — stop ray here (bulb itself blocks further cells)
          conflictSet.add(i);
          conflictSet.add(ni);
          break;
        }
        litSet.add(ni);
        nr += dr;
        nc += dc;
      }
    }
  }

  return { litSet, conflictSet };
}

// ---- constraint checks -------------------------------------------------------

/** How many orthogonally adjacent bulbs does the wall at index i have? */
export function wallAdjBulbCount(
  i: number,
  board: readonly AkariCell[],
  size: number,
): number {
  const [r, c] = cellRc(i, size);
  let count = 0;
  for (const [dr, dc] of DIRS4) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc, size)) {
      const ni = cellIdx(nr, nc, size);
      if (!board[ni].wall && board[ni].bulb) count++;
    }
  }
  return count;
}

/** True when the numbered wall at index i is satisfied (adjacent bulbs === num).
    Returns true for unnumbered walls (no constraint). */
export function isWallSatisfied(
  i: number,
  board: readonly AkariCell[],
  size: number,
): boolean {
  const cell = board[i];
  if (!cell.wall || cell.num === null) return true;
  return wallAdjBulbCount(i, board, size) === cell.num;
}

// ---- win check ---------------------------------------------------------------

/**
 * Returns true when the board is in a winning state:
 *   1. Every non-wall cell is lit.
 *   2. No two bulbs are in conflict.
 *   3. Every numbered wall is satisfied.
 */
export function checkWin(
  board: readonly AkariCell[],
  size: number,
  lighting: LightingResult,
): boolean {
  const total = size * size;

  // 1. All white cells lit
  for (let i = 0; i < total; i++) {
    if (!board[i].wall && !lighting.litSet.has(i)) return false;
  }

  // 2. No conflicts
  if (lighting.conflictSet.size > 0) return false;

  // 3. Every numbered wall satisfied
  for (let i = 0; i < total; i++) {
    if (!isWallSatisfied(i, board, size)) return false;
  }

  return true;
}

// ---- board generator ---------------------------------------------------------

/**
 * Generate a new Akari board.
 *
 * @param size  Grid side length (e.g. 7, 9, 11).
 * @param rng   Seeded RNG — pass `makeRng(seed)` for deterministic puzzles.
 *
 * The generator guarantees:
 *   - Every non-wall cell is reachable by the embedded solution.
 *   - The embedded solution has no two bulbs in mutual visibility.
 *   - Numbered walls carry the correct adjacent-bulb count from the solution.
 *
 * The returned `board` has `.bulb === false` on every cell (solution is erased);
 * the caller must let the player find their own placement.
 */
export function buildBoard(rng: Rng, size: number): AkariCell[] {
  const total = size * size;

  // Step 1: lay out walls (~17% of cells)
  const wallFraction = 0.17;
  const board: AkariCell[] = Array.from({ length: total }, () => ({
    wall: false,
    num: null,
    bulb: false,
  }));
  for (let i = 0; i < total; i++) {
    if (rng.bool(wallFraction)) board[i].wall = true;
  }

  // Step 2: greedy cover — scan in order; place a bulb on every uncovered
  // white cell. Because we only place on uncovered cells, no placed bulb is
  // ever within the ray of a previously placed bulb, so there are zero
  // mutual-visibility conflicts in the solution.
  const covered = new Array<boolean>(total).fill(false);
  const solutionBulbs = new Set<number>();

  for (let i = 0; i < total; i++) {
    if (board[i].wall) continue;
    if (covered[i]) continue;
    // Place bulb here
    solutionBulbs.add(i);
    covered[i] = true;
    const [r, c] = cellRc(i, size);
    for (const ni of rayIndices(r, c, size, board)) {
      covered[ni] = true;
    }
  }

  // Step 3: annotate walls with adjacent-bulb counts; reveal ~75%
  for (let i = 0; i < total; i++) {
    if (!board[i].wall) continue;
    const [r, c] = cellRc(i, size);
    let adjBulbs = 0;
    for (const [dr, dc] of DIRS4) {
      const ni = cellIdx(r + dr, c + dc, size);
      if (inBounds(r + dr, c + dc, size) && solutionBulbs.has(ni)) adjBulbs++;
    }
    if (rng.bool(0.75)) board[i].num = adjBulbs;
  }

  // The board is returned with all .bulb === false — solution hidden
  return board;
}

/** Convenience: build a board from a raw seed value. */
export function buildBoardFromSeed(
  seed: string | number | null | undefined,
  size: number,
): AkariCell[] {
  return buildBoard(makeRng(seed), size);
}
