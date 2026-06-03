/* 2048 — framework-free grid logic, shared by the Vue component and unit tests.
   Grid is represented as a flat number[16] array, index = row*4 + col, 0 = empty.
   All functions are pure (no side effects, no Vue reactivity, no DOM, no RNG). */

export const SIZE = 4;

/** A flat 16-element grid; index = row*4 + col; 0 = empty cell. */
export type Grid = number[];

/** Result returned by moveGrid. */
export interface MoveResult {
  /** New grid after the move. */
  grid: Grid;
  /** Whether any tile changed position or merged. */
  moved: boolean;
  /** Score gained this move (sum of all newly merged tile values). */
  gained: number;
}

/** Return a fresh empty grid (16 zeros). */
export function emptyGrid(): Grid {
  return Array(SIZE * SIZE).fill(0);
}

/**
 * Slide and merge a single row/column line of 4 values towards index 0.
 * This is the canonical "left-slide" operation; rotate the grid to use for
 * other directions.
 *
 * Rules:
 *   1. Compact: remove zeros, pack non-zero values to the left.
 *   2. Merge: scan left-to-right; merge adjacent equal values once. A tile
 *      produced by a merge cannot merge again in the same move.
 *   3. Pad: fill remaining positions with zeros.
 *
 * Returns { line: merged line of length 4, gained: score added }.
 */
export function slideLine(line: readonly number[]): { line: number[]; gained: number } {
  // Step 1: compact — remove zeros
  const compact = line.filter((v) => v !== 0);

  // Step 2: merge adjacent equal pairs (left-to-right, once per tile)
  let gained = 0;
  const merged: number[] = [];
  let i = 0;
  while (i < compact.length) {
    if (i + 1 < compact.length && compact[i] === compact[i + 1]) {
      const newVal = compact[i] * 2;
      merged.push(newVal);
      gained += newVal;
      i += 2; // skip the absorbed tile
    } else {
      merged.push(compact[i]);
      i++;
    }
  }

  // Step 3: pad with zeros to length SIZE
  while (merged.length < SIZE) merged.push(0);

  return { line: merged, gained };
}

/**
 * Apply a full move in the given direction to the grid.
 * Returns the new grid, a moved flag, and the score gained.
 * The original grid is not mutated.
 */
export function moveGrid(grid: Grid, dir: "left" | "right" | "up" | "down"): MoveResult {
  // Extract lines from the grid depending on direction, slide them, put them back.
  // For "right" and "down" we reverse the line before sliding (so sliding always
  // compacts toward index 0) then reverse the result back.

  const next: Grid = grid.slice();
  let moved = false;
  let gained = 0;

  if (dir === "left" || dir === "right") {
    for (let r = 0; r < SIZE; r++) {
      const line = [next[r * SIZE], next[r * SIZE + 1], next[r * SIZE + 2], next[r * SIZE + 3]];
      const rev = dir === "right";
      const input = rev ? line.slice().reverse() : line;
      const { line: out, gained: g } = slideLine(input);
      const result = rev ? out.slice().reverse() : out;
      for (let c = 0; c < SIZE; c++) {
        if (next[r * SIZE + c] !== result[c]) moved = true;
        next[r * SIZE + c] = result[c];
      }
      gained += g;
    }
  } else {
    // up / down — operate on columns
    for (let c = 0; c < SIZE; c++) {
      const line = [next[c], next[SIZE + c], next[SIZE * 2 + c], next[SIZE * 3 + c]];
      const rev = dir === "down";
      const input = rev ? line.slice().reverse() : line;
      const { line: out, gained: g } = slideLine(input);
      const result = rev ? out.slice().reverse() : out;
      for (let r = 0; r < SIZE; r++) {
        if (next[r * SIZE + c] !== result[r]) moved = true;
        next[r * SIZE + c] = result[r];
      }
      gained += g;
    }
  }

  return { grid: next, moved, gained };
}

/** True when any cell in the grid holds a 2048 (or higher) tile. */
export function hasWon(grid: Grid): boolean {
  return grid.some((v) => v >= 2048);
}

/**
 * True when the board is completely locked: every cell is occupied AND no two
 * adjacent cells (horizontally or vertically) share the same value.
 * If either condition fails the game can continue.
 */
export function isGameOver(grid: Grid): boolean {
  // Any empty cell means the game is not over
  if (grid.some((v) => v === 0)) return false;

  // Check horizontal adjacency
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE - 1; c++) {
      if (grid[r * SIZE + c] === grid[r * SIZE + c + 1]) return false;
    }
  }
  // Check vertical adjacency
  for (let r = 0; r < SIZE - 1; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r * SIZE + c] === grid[(r + 1) * SIZE + c]) return false;
    }
  }

  return true;
}
