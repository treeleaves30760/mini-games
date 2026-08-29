import { describe, it, expect } from "vitest";
import {
  isValid,
  generateSudoku,
  generateSudokuSolution,
  carveSudoku,
  countSudokuSolutions,
} from "~/utils/sudoku";
import { makeRng } from "~/utils/rng";

/* Difficulty table mirrored from app/components/games/SudokuGame.vue (DIFF).
   Every level the UI offers must yield a puzzle with exactly this many blanks
   and exactly one solution, for every seed. Keep in sync with the component. */
const DIFFICULTIES = { easy: 40, medium: 48, hard: 54 } as const;
const SEEDS_PER_LEVEL = 60;

// ---- independent reference implementation (no code shared with the module) ----
function canPlace(b: number[], idx: number, n: number): boolean {
  const r = Math.floor(idx / 9);
  const c = idx % 9;
  for (let i = 0; i < 9; i++) {
    if (b[r * 9 + i] === n || b[i * 9 + c] === n) return false;
  }
  const br = r - (r % 3);
  const bc = c - (c % 3);
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) if (b[(br + y) * 9 + (bc + x)] === n) return false;
  return true;
}

/** Plain first-blank backtracking solution counter, capped at `limit`.
    Restores `b` before returning. */
function refCount(b: number[], limit: number): number {
  const idx = b.indexOf(0);
  if (idx < 0) return 1;
  let count = 0;
  for (let n = 1; n <= 9; n++) {
    if (canPlace(b, idx, n)) {
      b[idx] = n;
      count += refCount(b, limit);
      b[idx] = 0;
      if (count >= limit) break;
    }
  }
  return count;
}

/** Solves `b` in place (first solution in digit order); false when unsolvable. */
function refSolve(b: number[]): boolean {
  const idx = b.indexOf(0);
  if (idx < 0) return true;
  for (let n = 1; n <= 9; n++) {
    if (canPlace(b, idx, n)) {
      b[idx] = n;
      if (refSolve(b)) return true;
      b[idx] = 0;
    }
  }
  return false;
}

/** Rule-based check of a finished grid: 81 cells, every row/column/box is a
    permutation of 1–9. */
function isCompleteValidGrid(b: number[]): boolean {
  if (b.length !== 81) return false;
  const groupOk = (vals: number[]) =>
    new Set(vals).size === 9 && vals.every((v) => Number.isInteger(v) && v >= 1 && v <= 9);
  for (let i = 0; i < 9; i++) {
    const row = Array.from({ length: 9 }, (_, c) => b[i * 9 + c]);
    const col = Array.from({ length: 9 }, (_, r) => b[r * 9 + i]);
    if (!groupOk(row) || !groupOk(col)) return false;
  }
  for (let br = 0; br < 9; br += 3)
    for (let bc = 0; bc < 9; bc += 3) {
      const box: number[] = [];
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) box.push(b[(br + y) * 9 + (bc + x)]);
      if (!groupOk(box)) return false;
    }
  return true;
}

/** The component's win test (SudokuGame.vue `checkWin`): every cell equals the
    stored solution. Under the unique-solution guarantee this is exactly
    "the grid is a valid completion of the puzzle". */
function componentWinCheck(values: number[], solution: number[]): boolean {
  for (let k = 0; k < 81; k++) if (values[k] !== solution[k]) return false;
  return true;
}

const blanks = (b: number[]) => b.filter((v) => v === 0).length;

describe("isValid", () => {
  it("rejects a duplicate in the same row", () => {
    const b = new Array(81).fill(0);
    b[0] = 5; // row 0, col 0
    expect(isValid(b, 1, 5)).toBe(false); // row 0, col 1
    expect(isValid(b, 1, 6)).toBe(true);
  });

  it("rejects a duplicate in the same column", () => {
    const b = new Array(81).fill(0);
    b[0] = 7;
    expect(isValid(b, 9, 7)).toBe(false); // col 0, row 1
    expect(isValid(b, 9, 8)).toBe(true);
  });

  it("rejects a duplicate in the same 3x3 box", () => {
    const b = new Array(81).fill(0);
    b[0] = 3; // box (0,0)
    expect(isValid(b, 10, 3)).toBe(false); // r1,c1 — same box
    expect(isValid(b, 10, 4)).toBe(true);
  });

  it("agrees with the reference rule check on a real solution grid", () => {
    const sol = generateSudokuSolution(makeRng("isValid-agreement"));
    for (let idx = 0; idx < 81; idx += 7) {
      const b = sol.slice();
      b[idx] = 0;
      for (let n = 1; n <= 9; n++) expect(isValid(b, idx, n)).toBe(canPlace(b, idx, n));
      // only the original digit fits back into the hole
      expect(isValid(b, idx, sol[idx])).toBe(true);
    }
  });
});

describe("countSudokuSolutions", () => {
  it("matches the reference counter on 0 / 1 / 2+ solution grids and restores the grid", () => {
    const rng = makeRng("counter-check");
    const solution = generateSudokuSolution(rng);
    const puzzle = carveSudoku(solution, 50, rng);

    // exactly one
    const snapshot = puzzle.slice();
    expect(countSudokuSolutions(puzzle, 2)).toBe(1);
    expect(puzzle).toEqual(snapshot); // left unchanged
    expect(refCount(puzzle.slice(), 2)).toBe(1);

    // two or more: keep blanking givens until the reference counter sees a 2nd solution
    const ambiguous = puzzle.slice();
    for (let i = 0; i < 81 && refCount(ambiguous.slice(), 2) < 2; i++) ambiguous[i] = 0;
    expect(refCount(ambiguous.slice(), 2)).toBe(2);
    expect(countSudokuSolutions(ambiguous, 2)).toBe(2);
    expect(countSudokuSolutions(ambiguous, 5)).toBeGreaterThanOrEqual(2);

    // zero: a contradiction (a digit repeated in its row) — nothing can complete it
    const broken = puzzle.slice();
    const hole = broken.indexOf(0);
    const rowStart = hole - (hole % 9);
    const rowDigit = broken.slice(rowStart, rowStart + 9).find((v) => v !== 0) as number;
    broken[hole] = rowDigit;
    expect(refCount(broken.slice(), 2)).toBe(0);
    expect(countSudokuSolutions(broken, 2)).toBe(0);

    // the empty grid has many solutions — the cap is respected, not exceeded
    const empty = new Array(81).fill(0);
    expect(countSudokuSolutions(empty, 2)).toBe(2);
    expect(countSudokuSolutions(empty, 1)).toBe(1);
    expect(empty.every((v) => v === 0)).toBe(true);
  });
});

describe("generateSudokuSolution", () => {
  it("produces complete, valid grids that differ between seeds", () => {
    const a = generateSudokuSolution(makeRng("sol-a"));
    const b = generateSudokuSolution(makeRng("sol-b"));
    expect(isCompleteValidGrid(a)).toBe(true);
    expect(isCompleteValidGrid(b)).toBe(true);
    expect(a).not.toEqual(b);
    expect(generateSudokuSolution(makeRng("sol-a"))).toEqual(a);
  });
});

describe("generateSudoku — every UI difficulty, many seeds", () => {
  for (const [level, remove] of Object.entries(DIFFICULTIES)) {
    it(`${level} (${remove} blanks): exact blank count, unique solution, win check agrees`, () => {
      for (let s = 0; s < SEEDS_PER_LEVEL; s++) {
        const { puzzle, solution } = generateSudoku(remove, makeRng(`${level}-${s}`));
        const tag = `${level}-${s}`;

        // (d) exactly `remove` blanks — the difficulty's promise
        expect([tag, blanks(puzzle)]).toEqual([tag, remove]);
        expect(puzzle.every((v) => Number.isInteger(v) && v >= 0 && v <= 9)).toBe(true);

        // (b) stored solution is a valid full grid consistent with the givens
        expect(isCompleteValidGrid(solution)).toBe(true);
        for (let i = 0; i < 81; i++) if (puzzle[i] !== 0) expect(puzzle[i]).toBe(solution[i]);

        // (a) exactly one solution, and it is the stored one (independent solver)
        expect([tag, refCount(puzzle.slice(), 2)]).toEqual([tag, 1]);
        const solved = puzzle.slice();
        expect(refSolve(solved)).toBe(true);
        expect(solved).toEqual(solution);

        // (c) the win check accepts the valid completion …
        expect(componentWinCheck(solution, solution)).toBe(true);
        // … and rejects the unfinished puzzle, a wrong digit, and a valid-looking swap
        expect(componentWinCheck(puzzle, solution)).toBe(false);
        const firstBlank = puzzle.indexOf(0);
        const wrong = solution.slice();
        wrong[firstBlank] = (solution[firstBlank] % 9) + 1;
        expect(componentWinCheck(wrong, solution)).toBe(false);
        expect(isCompleteValidGrid(wrong)).toBe(false);
      }
    });
  }

  it("is deterministic for a seed and varies across seeds / unseeded calls", () => {
    const a = generateSudoku(DIFFICULTIES.hard, makeRng("det"));
    const b = generateSudoku(DIFFICULTIES.hard, makeRng("det"));
    const c = generateSudoku(DIFFICULTIES.hard, makeRng("det-2"));
    expect(a).toEqual(b);
    expect(a.puzzle).not.toEqual(c.puzzle);

    // no rng → fresh random puzzle, same guarantees
    const r1 = generateSudoku(DIFFICULTIES.medium);
    const r2 = generateSudoku(DIFFICULTIES.medium);
    expect(blanks(r1.puzzle)).toBe(DIFFICULTIES.medium);
    expect(isCompleteValidGrid(r1.solution)).toBe(true);
    expect(refCount(r1.puzzle.slice(), 2)).toBe(1);
    expect(r1.puzzle).not.toEqual(r2.puzzle);
  });

  it("targetRemovals 0 returns the full solution as the puzzle", () => {
    const { puzzle, solution } = generateSudoku(0, makeRng("zero"));
    expect(puzzle).toEqual(solution);
    expect(isCompleteValidGrid(puzzle)).toBe(true);
  });

  it("an unreachable target still yields a unique puzzle with the most blanks found", () => {
    // 64 blanks = 17 givens, the theoretical minimum; random carving cannot get
    // there, so all MAX_ATTEMPTS run and the best (still unique) attempt wins.
    const { puzzle, solution } = generateSudoku(64, makeRng("unreachable"));
    const removed = blanks(puzzle);
    expect(removed).toBeLessThan(64);
    expect(removed).toBeGreaterThanOrEqual(DIFFICULTIES.hard);
    expect(refCount(puzzle.slice(), 2)).toBe(1);
    const solved = puzzle.slice();
    expect(refSolve(solved)).toBe(true);
    expect(solved).toEqual(solution);
  });
});

describe("carveSudoku", () => {
  it("never blanks a cell that would break uniqueness, and stops at the target", () => {
    const rng = makeRng("carve");
    const solution = generateSudokuSolution(rng);
    const puzzle = carveSudoku(solution, 45, rng);
    expect(blanks(puzzle)).toBe(45);
    expect(refCount(puzzle.slice(), 2)).toBe(1);
    // putting any blank back keeps it unique; every given is load-bearing or the
    // carve would have removed more — check a handful of givens for the latter
    let removable = 0;
    for (let i = 0; i < 81; i++) {
      if (puzzle[i] === 0) continue;
      const probe = puzzle.slice();
      probe[i] = 0;
      if (refCount(probe.slice(), 2) === 1) removable++;
    }
    // 45 was reached before the pass ran out of cells, so spare givens remain
    expect(removable).toBeGreaterThan(0);
    expect(solution.every((v) => v >= 1 && v <= 9)).toBe(true); // input untouched
  });
});
