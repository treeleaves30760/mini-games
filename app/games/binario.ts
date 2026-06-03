/* Binario (Takuzu) — framework-free game logic.
   Shared by the Vue component and Vitest tests.

   Rules:
   - No three consecutive equal values in any row or column.
   - Each row and column has exactly half 0s and half 1s.
   - No two rows are identical; no two columns are identical.

   The generator accepts an Rng (from makeRng) so tests are fully deterministic.
*/
import type { Rng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A flat grid of 0 | 1 values.  Length must equal size * size. */
export type Grid = (0 | 1)[];

/** A flat array of booleans: true = cell is a locked given, false = player fills. */
export type GivenMask = boolean[];

/** The complete puzzle produced by generatePuzzle. */
export interface BinarioPuzzle {
  /** The fully-solved grid. */
  solution: Grid;
  /** Which cells are revealed to the player as givens. */
  given: GivenMask;
  /** The player's starting state: given cells show their value, others are null. */
  cells: (0 | 1 | null)[];
}

// ---------------------------------------------------------------------------
// Rule validation helpers
// ---------------------------------------------------------------------------

/**
 * True if the sub-array of `line` centred at `pos` forms a run of 3 or more
 * identical non-null values including the value at `pos`.
 */
export function hasTriple(line: (0 | 1 | null)[], pos: number): boolean {
  const v = line[pos];
  if (v === null) return false;
  let streak = 1;
  let l = pos - 1;
  while (l >= 0 && line[l] === v) { streak++; l--; }
  let r = pos + 1;
  while (r < line.length && line[r] === v) { streak++; r++; }
  return streak >= 3;
}

/**
 * Validate a single fully-filled line (row or column):
 *   - no null values,
 *   - exactly half 0s and half 1s,
 *   - no three consecutive equal values.
 */
export function validateLine(line: (0 | 1 | null)[]): boolean {
  if (line.includes(null)) return false;
  const half = line.length / 2;
  const zeros = line.filter((v) => v === 0).length;
  const ones = line.filter((v) => v === 1).length;
  if (zeros !== half || ones !== half) return false;
  for (let i = 0; i + 2 < line.length; i++) {
    if (line[i] !== null && line[i] === line[i + 1] && line[i] === line[i + 2]) return false;
  }
  return true;
}

/**
 * Validate a complete board: every row and every column must satisfy
 * `validateLine`.  Does NOT check row/column uniqueness (that constraint is
 * enforced during generation, not needed for win-detection).
 *
 * Returns true iff the board is a fully valid Binario solution.
 */
export function validateAll(arr: (0 | 1 | null)[], size: number): boolean {
  for (let r = 0; r < size; r++) {
    const row = arr.slice(r * size, r * size + size) as (0 | 1 | null)[];
    if (!validateLine(row)) return false;
  }
  for (let c = 0; c < size; c++) {
    const col: (0 | 1 | null)[] = [];
    for (let r = 0; r < size; r++) col.push(arr[r * size + c]);
    if (!validateLine(col)) return false;
  }
  return true;
}

/**
 * True when the player's board is completely filled and satisfies all rules.
 * Drop-in win-detection for the component.
 */
export function checkWinCondition(cells: (0 | 1 | null)[], size: number): boolean {
  if (cells.includes(null)) return false;
  return validateAll(cells, size);
}

// ---------------------------------------------------------------------------
// Solution generator (backtracking + seeded RNG)
// ---------------------------------------------------------------------------

/**
 * Generate a valid, fully-solved Binario grid of `size × size` using the
 * supplied seeded RNG.  `size` must be even.
 *
 * The returned Grid satisfies:
 *   - No three consecutive equal values in any row or column.
 *   - Equal counts of 0s and 1s in every row and column.
 *   - No two rows are identical; no two columns are identical.
 */
export function generateSolution(size: number, rng: Rng): Grid {
  const grid: (0 | 1 | -1)[] = new Array(size * size).fill(-1);

  function rowOk(g: (0 | 1 | -1)[], r: number, c: number, v: 0 | 1): boolean {
    const base = r * size;
    // no three consecutive
    if (c >= 2 && g[base + c - 1] === v && g[base + c - 2] === v) return false;
    // Cells at c+1 and c+2 are always -1 (unfilled) during left-to-right backtracking;
    // the lookahead checks below are defensive and can never be triggered.
    /* v8 ignore start */
    if (c >= 1 && c + 1 < size && g[base + c - 1] === v && g[base + c + 1] === v) return false;
    if (c + 2 < size && g[base + c + 1] === v && g[base + c + 2] === v) return false;
    /* v8 ignore stop */
    // count constraint
    const halfSize = size / 2;
    const count = g.slice(base, base + size).filter((x) => x === v).length;
    if (count >= halfSize) return false;
    return true;
  }

  function colOk(g: (0 | 1 | -1)[], r: number, c: number, v: 0 | 1): boolean {
    const halfSize = size / 2;
    // no three consecutive
    if (r >= 2 && g[(r - 1) * size + c] === v && g[(r - 2) * size + c] === v) return false;
    // Cells at r+1 and r+2 are always -1 (unfilled) during top-to-bottom backtracking;
    // the lookahead checks below are defensive and can never be triggered.
    /* v8 ignore start */
    if (r >= 1 && r + 1 < size && g[(r - 1) * size + c] === v && g[(r + 1) * size + c] === v) return false;
    if (r + 2 < size && g[(r + 1) * size + c] === v && g[(r + 2) * size + c] === v) return false;
    /* v8 ignore stop */
    // count
    let count = 0;
    for (let i = 0; i < size; i++) if (g[i * size + c] === v) count++;
    if (count >= halfSize) return false;
    return true;
  }

  function rowsUnique(g: (0 | 1 | -1)[], r: number): boolean {
    const row = g.slice(r * size, r * size + size);
    if (row.includes(-1)) return true;
    for (let pr = 0; pr < r; pr++) {
      const prev = g.slice(pr * size, pr * size + size);
      if (prev.every((v, i) => v === row[i])) return false;
    }
    return true;
  }

  function colsUnique(g: (0 | 1 | -1)[], c: number, r: number): boolean {
    // only check when the column is fully filled (r === size - 1)
    if (r < size - 1) return true;
    const col: (0 | 1 | -1)[] = [];
    for (let i = 0; i <= r; i++) col.push(g[i * size + c]);
    // When r===size-1 all column cells are filled (0 or 1) by top-to-bottom backtracking; -1 is never present.
    /* v8 ignore start */ if (col.includes(-1)) return true; /* v8 ignore stop */
    for (let pc = 0; pc < c; pc++) {
      const prev: (0 | 1 | -1)[] = [];
      for (let i = 0; i < size; i++) prev.push(g[i * size + pc]);
      if (prev.every((v, i) => v === col[i])) return false;
    }
    return true;
  }

  function bt(idx: number): boolean {
    if (idx === size * size) return true;
    const r = (idx / size) | 0;
    const c = idx % size;
    const order: (0 | 1)[] = rng.bool() ? [0, 1] : [1, 0];
    for (const v of order) {
      if (!rowOk(grid, r, c, v)) continue;
      if (!colOk(grid, r, c, v)) continue;
      grid[idx] = v;
      if (!rowsUnique(grid, r)) { grid[idx] = -1; continue; }
      if (!colsUnique(grid, c, r)) { grid[idx] = -1; continue; }
      if (bt(idx + 1)) return true;
      grid[idx] = -1;
    }
    return false;
  }

  bt(0);
  // grid is fully filled at this point (bt always succeeds for valid even sizes)
  return grid as Grid;
}

// ---------------------------------------------------------------------------
// Puzzle (given-mask) generator
// ---------------------------------------------------------------------------

/**
 * Given a solved grid, produce a GivenMask that marks ~50 % of cells as
 * given (locked).  The mask is randomised via the supplied Rng so that
 * puzzles differ between seeds.
 */
export function removeCells(sol: Grid, size: number, rng: Rng): GivenMask {
  const indices = Array.from({ length: size * size }, (_, i) => i);
  rng.shuffle(indices);
  const toRemove = Math.floor(size * size * 0.5);
  const giv: GivenMask = new Array(size * size).fill(true);
  for (let i = 0; i < toRemove; i++) {
    giv[indices[i]] = false;
  }
  return giv;
}

// ---------------------------------------------------------------------------
// Top-level convenience: generate a complete puzzle in one call
// ---------------------------------------------------------------------------

/**
 * Generate a full Binario puzzle (solution + given mask + starting cells) for
 * a grid of `size × size` using the supplied seeded Rng.
 *
 * The Rng is consumed in order: first by generateSolution, then by removeCells.
 * Passing the same Rng state always produces the same puzzle.
 */
export function generatePuzzle(size: number, rng: Rng): BinarioPuzzle {
  const solution = generateSolution(size, rng);
  const given = removeCells(solution, size, rng);
  const cells = solution.map((v, i) => (given[i] ? v : null)) as (0 | 1 | null)[];
  return { solution, given, cells };
}
