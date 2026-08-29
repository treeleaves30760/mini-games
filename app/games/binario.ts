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

/** Row `r` of a flat `size × size` board. */
export function getRow(arr: (0 | 1 | null)[], size: number, r: number): (0 | 1 | null)[] {
  return arr.slice(r * size, r * size + size);
}

/** Column `c` of a flat `size × size` board. */
export function getCol(arr: (0 | 1 | null)[], size: number, c: number): (0 | 1 | null)[] {
  const col: (0 | 1 | null)[] = [];
  for (let r = 0; r < size; r++) col.push(arr[r * size + c]);
  return col;
}

/**
 * Indices of the lines that are complete (length `size`, no null) and
 * identical to at least one other complete line.  Incomplete lines are
 * ignored so the helper is usable for live highlighting on a partial board.
 */
function duplicateIndices(lines: (0 | 1 | null)[][], size: number): number[] {
  const byKey = new Map<string, number[]>();
  lines.forEach((line, i) => {
    // Only complete lines take part: exactly `size` cells, every one 0 or 1.
    if (line.length !== size || line.some((v) => v !== 0 && v !== 1)) return;
    const key = line.join("");
    const bucket = byKey.get(key);
    if (bucket) bucket.push(i);
    else byKey.set(key, [i]);
  });
  const out: number[] = [];
  for (const bucket of byKey.values()) {
    if (bucket.length > 1) out.push(...bucket);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Rows and columns that violate the "every row / column is unique" rule:
 * the indices of every complete row that equals another complete row, and
 * of every complete column that equals another complete column.
 * Used for win detection and for the component's live violation highlight.
 */
export function findDuplicateLines(
  arr: (0 | 1 | null)[],
  size: number
): { rows: number[]; cols: number[] } {
  const rows = duplicateIndices(Array.from({ length: size }, (_, r) => getRow(arr, size, r)), size);
  const cols = duplicateIndices(Array.from({ length: size }, (_, c) => getCol(arr, size, c)), size);
  return { rows, cols };
}

/** True when no two complete rows and no two complete columns are identical. */
export function linesUnique(arr: (0 | 1 | null)[], size: number): boolean {
  const { rows, cols } = findDuplicateLines(arr, size);
  return rows.length === 0 && cols.length === 0;
}

/**
 * Validate a complete board against every rule the player is told:
 *   - every row and every column satisfies `validateLine`
 *     (fully filled, balanced, no three in a row),
 *   - no two rows are identical and no two columns are identical.
 *
 * Returns true iff the board is a fully valid Binario solution.  Any grid
 * that obeys the rules is accepted — it need not equal the stored solution.
 */
export function validateAll(arr: (0 | 1 | null)[], size: number): boolean {
  for (let r = 0; r < size; r++) {
    if (!validateLine(getRow(arr, size, r))) return false;
  }
  for (let c = 0; c < size; c++) {
    if (!validateLine(getCol(arr, size, c))) return false;
  }
  return linesUnique(arr, size);
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

  // Cells are filled in index order, so when cell (r, c) is being decided every
  // cell to its right in the row and below it in the column is still -1.  The
  // "no three in a row" rule therefore only needs to look backwards (left / up).
  function rowOk(g: (0 | 1 | -1)[], r: number, c: number, v: 0 | 1): boolean {
    const base = r * size;
    // no three consecutive
    if (c >= 2 && g[base + c - 1] === v && g[base + c - 2] === v) return false;
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
    // Only check once the column is fully filled (r === size - 1); every cell
    // above (r, c) was filled earlier by the index-order backtracking.
    if (r < size - 1) return true;
    const col: (0 | 1 | -1)[] = [];
    for (let i = 0; i <= r; i++) col.push(g[i * size + c]);
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
