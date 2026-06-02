/* =========================================================================
   Sudoku engine — randomized full-solution generator, backtracking solver,
   and puzzle carving with a guaranteed-unique solution.
   Auto-imported by Nuxt (app/utils).
   ========================================================================= */

export function isValid(b: number[], idx: number, n: number): boolean {
  const r = (idx / 9) | 0;
  const c = idx % 9;
  for (let i = 0; i < 9; i++) {
    if (b[r * 9 + i] === n) return false;
    if (b[i * 9 + c] === n) return false;
  }
  const br = r - (r % 3);
  const bc = c - (c % 3);
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) if (b[(br + y) * 9 + (bc + x)] === n) return false;
  return true;
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function solveFull(b: number[]): boolean {
  const idx = b.indexOf(0);
  if (idx < 0) return true;
  for (const n of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (isValid(b, idx, n)) {
      b[idx] = n;
      if (solveFull(b)) return true;
      b[idx] = 0;
    }
  }
  return false;
}

// counts solutions up to `limit` (early-out) — mutates b
function countSolutions(b: number[], limit: number): number {
  const idx = b.indexOf(0);
  if (idx < 0) return 1;
  let count = 0;
  for (let n = 1; n <= 9; n++) {
    if (isValid(b, idx, n)) {
      b[idx] = n;
      count += countSolutions(b, limit);
      b[idx] = 0;
      if (count >= limit) break;
    }
  }
  return count;
}

export interface Puzzle {
  puzzle: number[];
  solution: number[];
}

export function generateSudoku(targetRemovals: number): Puzzle {
  const solution = new Array(81).fill(0);
  solveFull(solution);
  const puzzle = solution.slice();
  let removed = 0;
  for (const i of shuffle([...Array(81).keys()])) {
    if (removed >= targetRemovals) break;
    const backup = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle.slice(), 2) !== 1) puzzle[i] = backup;
    else removed++;
  }
  return { puzzle, solution };
}
