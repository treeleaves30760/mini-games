/* =========================================================================
   Sudoku engine — seeded full-solution generator, backtracking solution
   counter (most-constrained-cell-first), and puzzle carving with a
   guaranteed-unique solution and an exact number of blanks.
   Auto-imported by Nuxt (app/utils).
   ========================================================================= */
import { makeRng, type Rng } from "~/utils/rng";

export interface Puzzle {
  /** 81 cells, row-major; 0 = blank. Every non-zero cell equals `solution`. */
  puzzle: number[];
  /** The one and only completion of `puzzle`. */
  solution: number[];
}

/** Carve attempts before settling for the best (still unique) puzzle found. */
const MAX_ATTEMPTS = 8;

/** Bitmask of digits (bit n set = digit n) that can be placed at `idx`
    without clashing with the row, column or 3×3 box. The cell's own current
    value counts as a clash, so the mask is meaningful for filled cells too. */
function candidates(b: number[], idx: number): number {
  const r = (idx / 9) | 0;
  const c = idx % 9;
  let used = 0;
  for (let i = 0; i < 9; i++) {
    used |= 1 << b[r * 9 + i];
    used |= 1 << b[i * 9 + c];
  }
  const br = r - (r % 3);
  const bc = c - (c % 3);
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) used |= 1 << b[(br + y) * 9 + (bc + x)];
  return ~used & 0x3fe;
}

function digitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let n = 1; n <= 9; n++) if (mask & (1 << n)) out.push(n);
  return out;
}

/** True when digit `n` may be placed at `idx` (row, column and box are free). */
export function isValid(b: number[], idx: number, n: number): boolean {
  return (candidates(b, idx) & (1 << n)) !== 0;
}

/** Index of the blank cell with the fewest candidates, or -1 when the grid is
    full. A cell with no candidates is returned at once — the caller then has
    nothing to try and the dead branch is pruned immediately. */
function mostConstrained(b: number[]): number {
  let best = -1;
  let fewest = 10;
  for (let i = 0; i < 81; i++) {
    if (b[i] !== 0) continue;
    const n = digitsOf(candidates(b, i)).length;
    if (n < fewest) {
      best = i;
      fewest = n;
      if (n === 0) break;
    }
  }
  return best;
}

/** Fills every blank of `b` in place, trying digits in random order; false
    (with the cell restored) only when the current partial grid is a dead end. */
function fillGrid(b: number[], rng: Rng): boolean {
  const idx = mostConstrained(b);
  if (idx < 0) return true;
  for (const n of rng.shuffle(digitsOf(candidates(b, idx)))) {
    b[idx] = n;
    if (fillGrid(b, rng)) return true;
  }
  b[idx] = 0;
  return false;
}

/** Number of completions of `b`, counting no further than `limit` (so
    `countSudokuSolutions(b, 2)` is a uniqueness test). `b` is left unchanged. */
export function countSudokuSolutions(b: number[], limit: number): number {
  const idx = mostConstrained(b);
  if (idx < 0) return 1;
  let count = 0;
  for (const n of digitsOf(candidates(b, idx))) {
    b[idx] = n;
    count += countSudokuSolutions(b, limit);
    if (count >= limit) break;
  }
  b[idx] = 0;
  return count;
}

/** A random complete, valid 9×9 grid. */
export function generateSudokuSolution(rng: Rng): number[] {
  const grid = new Array<number>(81).fill(0);
  fillGrid(grid, rng);
  return grid;
}

/** One carving pass: visits the cells in random order and blanks a cell only
    when the puzzle keeps exactly one solution, stopping once `targetRemovals`
    cells are blank. Can fall short of the target when the order is unlucky. */
export function carveSudoku(solution: number[], targetRemovals: number, rng: Rng): number[] {
  const puzzle = solution.slice();
  let removed = 0;
  for (const i of rng.shuffle([...Array(81).keys()])) {
    if (removed >= targetRemovals) break;
    puzzle[i] = 0;
    if (countSudokuSolutions(puzzle, 2) === 1) removed++;
    else puzzle[i] = solution[i];
  }
  return puzzle;
}

/**
 * Generate a puzzle with exactly `targetRemovals` blanks and a unique solution.
 * Deterministic for a given `rng` (pass `makeRng(seed)`); random otherwise.
 * Every attempt carves a fresh solution grid; the first one that reaches the
 * target is returned. Targets far beyond what the game offers (the UI tops out
 * at 54; uniqueness caps removals at 64) may be unreachable by carving — after
 * MAX_ATTEMPTS the attempt with the most blanks is returned, still unique.
 */
export function generateSudoku(targetRemovals: number, rng: Rng = makeRng()): Puzzle {
  let best: Puzzle | null = null;
  let bestRemoved = -1;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const solution = generateSudokuSolution(rng);
    const puzzle = carveSudoku(solution, targetRemovals, rng);
    const removed = puzzle.filter((v) => v === 0).length;
    if (removed >= targetRemovals) return { puzzle, solution };
    if (removed > bestRemoved) {
      best = { puzzle, solution };
      bestRemoved = removed;
    }
  }
  // MAX_ATTEMPTS >= 1, so at least one attempt was recorded above.
  return best as Puzzle;
}
