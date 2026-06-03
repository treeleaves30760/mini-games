import { describe, it, expect } from "vitest";
import { isValid, generateSudoku } from "~/utils/sudoku";

// ---- helpers used only by the tests ----
function rowsColsBoxesComplete(b: number[]): boolean {
  const groupOk = (vals: number[]) =>
    vals.length === 9 && new Set(vals).size === 9 && vals.every((v) => v >= 1 && v <= 9);
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

// Count solutions up to `limit` (independent re-implementation, to verify uniqueness).
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
});

describe("generateSudoku", () => {
  it("produces a fully valid, complete solution grid", () => {
    for (let t = 0; t < 5; t++) {
      const { solution } = generateSudoku(40);
      expect(solution).toHaveLength(81);
      expect(rowsColsBoxesComplete(solution)).toBe(true);
    }
  });

  it("every given in the puzzle matches the solution", () => {
    const { puzzle, solution } = generateSudoku(45);
    for (let i = 0; i < 81; i++) {
      if (puzzle[i] !== 0) expect(puzzle[i]).toBe(solution[i]);
    }
  });

  it("the puzzle has exactly one solution, and it is the solution grid", () => {
    for (let t = 0; t < 3; t++) {
      const { puzzle, solution } = generateSudoku(40);
      expect(countSolutions(puzzle.slice(), 2)).toBe(1);
      // solving must reproduce the solution
      const solved = puzzle.slice();
      const solve = (b: number[]): boolean => {
        const idx = b.indexOf(0);
        if (idx < 0) return true;
        for (let n = 1; n <= 9; n++) {
          if (isValid(b, idx, n)) {
            b[idx] = n;
            if (solve(b)) return true;
            b[idx] = 0;
          }
        }
        return false;
      };
      solve(solved);
      expect(solved).toEqual(solution);
    }
  });

  it("removes at most the requested number of cells (uniqueness may block some)", () => {
    const target = 40;
    const { puzzle } = generateSudoku(target);
    const removed = puzzle.filter((v) => v === 0).length;
    expect(removed).toBeGreaterThan(0);
    expect(removed).toBeLessThanOrEqual(target);
  });
});
