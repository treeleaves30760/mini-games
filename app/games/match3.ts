/* Match 3 (寶石消除) — framework-free game logic.
   Shared by the Vue component and unit tests.
   No Vue reactivity, no DOM, no async — pure data transformations. */

import type { Rng } from "~/utils/rng";
import { makeRng } from "~/utils/rng";

export const SIZE = 8;
export const GEM_TYPES = 6;

/** A 2-D board: number = gem type (0–GEM_TYPES-1), null = empty cell. */
export type Board = (number | null)[][];

// ---------------------------------------------------------------------------
// Match detection
// ---------------------------------------------------------------------------

/**
 * Return the set of cell keys ("r,c") that belong to a horizontal or vertical
 * run of 3 or more identical (non-null) gems.
 */
export function findMatches(grid: Board): Set<string> {
  const matched = new Set<string>();

  // horizontal runs
  for (let r = 0; r < SIZE; r++) {
    let run = 1;
    for (let c = 1; c < SIZE; c++) {
      if (grid[r][c] !== null && grid[r][c] === grid[r][c - 1]) {
        run++;
      } else {
        if (run >= 3) {
          for (let k = c - run; k < c; k++) matched.add(`${r},${k}`);
        }
        run = 1;
      }
    }
    if (run >= 3) {
      for (let k = SIZE - run; k < SIZE; k++) matched.add(`${r},${k}`);
    }
  }

  // vertical runs
  for (let c = 0; c < SIZE; c++) {
    let run = 1;
    for (let r = 1; r < SIZE; r++) {
      if (grid[r][c] !== null && grid[r][c] === grid[r - 1][c]) {
        run++;
      } else {
        if (run >= 3) {
          for (let k = r - run; k < r; k++) matched.add(`${k},${c}`);
        }
        run = 1;
      }
    }
    if (run >= 3) {
      for (let k = SIZE - run; k < SIZE; k++) matched.add(`${k},${c}`);
    }
  }

  return matched;
}

/** True when the board contains at least one match (quick early-exit scan). */
export function hasMatch(grid: Board): boolean {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE - 2; c++) {
      if (
        grid[r][c] !== null &&
        grid[r][c] === grid[r][c + 1] &&
        grid[r][c] === grid[r][c + 2]
      )
        return true;
    }
  }
  for (let c = 0; c < SIZE; c++) {
    for (let r = 0; r < SIZE - 2; r++) {
      if (
        grid[r][c] !== null &&
        grid[r][c] === grid[r + 1][c] &&
        grid[r][c] === grid[r + 2][c]
      )
        return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Swap legality
// ---------------------------------------------------------------------------

/**
 * True when swapping (r1,c1) ↔ (r2,c2) would create at least one match.
 * The grid is mutated and restored — callers must not rely on its intermediate state.
 */
export function swapCreatesMatch(
  grid: Board,
  r1: number,
  c1: number,
  r2: number,
  c2: number
): boolean {
  const tmp = grid[r1][c1];
  grid[r1][c1] = grid[r2][c2];
  grid[r2][c2] = tmp;
  const ok = findMatches(grid).size > 0;
  grid[r2][c2] = grid[r1][c1];
  grid[r1][c1] = tmp;
  return ok;
}

/**
 * True when (r1,c1) and (r2,c2) are orthogonally adjacent AND the swap would
 * create at least one match.  This is the single public "is this a legal move?"
 * predicate the component and tests use.
 */
export function isLegalSwap(
  grid: Board,
  r1: number,
  c1: number,
  r2: number,
  c2: number
): boolean {
  const dist = Math.abs(r1 - r2) + Math.abs(c1 - c2);
  if (dist !== 1) return false;
  return swapCreatesMatch(grid, r1, c1, r2, c2);
}

/** True when at least one legal swap exists on the board. */
export function hasValidMove(grid: Board): boolean {
  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
  ];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= SIZE || nc >= SIZE) continue;
        const tmp = grid[r][c];
        grid[r][c] = grid[nr][nc];
        grid[nr][nc] = tmp;
        const ok = hasMatch(grid);
        grid[nr][nc] = grid[r][c];
        grid[r][c] = tmp;
        if (ok) return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Gravity / collapse
// ---------------------------------------------------------------------------

/**
 * Apply gravity: slide non-null cells down within each column, leaving nulls at
 * the top. Returns a NEW board (does not mutate the input).
 */
export function applyGravity(grid: Board): Board {
  const next: Board = grid.map((row) => [...row]);
  for (let c = 0; c < SIZE; c++) {
    let write = SIZE - 1;
    for (let r = SIZE - 1; r >= 0; r--) {
      if (next[r][c] !== null) {
        next[write][c] = next[r][c];
        if (r !== write) next[r][c] = null;
        write--;
      }
    }
    // cells above write are already null from the downward sweep
    // (they were either moved or were already null)
  }
  return next;
}

/**
 * Clear matched cells (set to null), apply gravity, then fill each remaining
 * null from the top of its column using the provided Rng.
 * Returns a NEW board.
 */
export function clearAndRefill(grid: Board, matched: Set<string>, rng: Rng): Board {
  // 1. clear matched cells
  let next: Board = grid.map((row) => [...row]);
  for (const key of matched) {
    const [r, c] = key.split(",").map(Number);
    next[r][c] = null;
  }

  // 2. gravity
  next = applyGravity(next);

  // 3. refill nulls from the top
  for (let c = 0; c < SIZE; c++) {
    for (let r = 0; r < SIZE; r++) {
      if (next[r][c] === null) {
        next[r][c] = rng.int(0, GEM_TYPES - 1);
      }
    }
  }

  return next;
}

// ---------------------------------------------------------------------------
// Board generation
// ---------------------------------------------------------------------------

/**
 * Generate an 8×8 board seeded by `seed` that:
 *   - Has no pre-existing matches of 3+.
 *   - Has at least one valid move available.
 *
 * Uses a "-board" suffix on the seed so the board RNG is independent of the
 * component's refill RNG (which uses the raw seed).
 */
export function generateBoard(seed: string | number | null | undefined): Board {
  const r2 = makeRng(String(seed ?? "null") + "-board");

  let grid: Board = [];
  let attempts = 0;

  do {
    grid = [];
    for (let r = 0; r < SIZE; r++) {
      const row: (number | null)[] = [];
      for (let c = 0; c < SIZE; c++) {
        let gem: number;
        let tries = 0;
        do {
          gem = r2.int(0, GEM_TYPES - 1);
          tries++;
        } while (
          tries < 20 &&
          ((c >= 2 && row[c - 1] === gem && row[c - 2] === gem) ||
            (r >= 2 && grid[r - 1][c] === gem && grid[r - 2][c] === gem))
        );
        row.push(gem);
      }
      grid.push(row);
    }
    attempts++;
  } while (/* v8 ignore next */(hasMatch(grid) || !hasValidMove(grid)) && attempts < 50);

  return grid;
}
