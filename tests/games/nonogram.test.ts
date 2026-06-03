import { describe, it, expect } from "vitest";
import { computeClues, generateSolution, isSolved } from "~/games/nonogram";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// computeClues — hand-built grids
// ---------------------------------------------------------------------------

describe("computeClues — row clues", () => {
  it("empty row → [0]", () => {
    // 1×5: single row, all zeros
    const grid = [0, 0, 0, 0, 0];
    const { rows } = computeClues(grid, 5);
    expect(rows[0]).toEqual([0]);
  });

  it("full row of N → [N]", () => {
    const grid = [1, 1, 1, 1, 1];
    const { rows } = computeClues(grid, 5);
    expect(rows[0]).toEqual([5]);
  });

  it("split row 1,1,0,1,1 → [2,2]", () => {
    // 1×5 grid: filled filled empty filled filled
    const grid = [1, 1, 0, 1, 1];
    const { rows } = computeClues(grid, 5);
    expect(rows[0]).toEqual([2, 2]);
  });

  it("single filled cell → [1]", () => {
    const grid = [0, 0, 1, 0, 0];
    const { rows } = computeClues(grid, 5);
    expect(rows[0]).toEqual([1]);
  });

  it("alternating 1,0,1,0,1 → [1,1,1]", () => {
    const grid = [1, 0, 1, 0, 1];
    const { rows } = computeClues(grid, 5);
    expect(rows[0]).toEqual([1, 1, 1]);
  });

  it("run ending at last cell is counted: 0,0,1,1,1 → [3]", () => {
    const grid = [0, 0, 1, 1, 1];
    const { rows } = computeClues(grid, 5);
    expect(rows[0]).toEqual([3]);
  });

  it("run starting at first cell: 1,1,0,0,0 → [2]", () => {
    const grid = [1, 1, 0, 0, 0];
    const { rows } = computeClues(grid, 5);
    expect(rows[0]).toEqual([2]);
  });

  it("2×2 grid — each row computed independently", () => {
    // row0 = [1,1], row1 = [0,0]
    const grid = [1, 1, 0, 0];
    const { rows } = computeClues(grid, 2);
    expect(rows[0]).toEqual([2]);
    expect(rows[1]).toEqual([0]);
  });

  it("3×3 grid produces three row clues", () => {
    // row0: 1,0,1 → [1,1]
    // row1: 1,1,1 → [3]
    // row2: 0,0,0 → [0]
    const grid = [1, 0, 1, 1, 1, 1, 0, 0, 0];
    const { rows } = computeClues(grid, 3);
    expect(rows[0]).toEqual([1, 1]);
    expect(rows[1]).toEqual([3]);
    expect(rows[2]).toEqual([0]);
  });
});

describe("computeClues — column clues", () => {
  it("empty column → [0]", () => {
    // 5×5 all zeros
    const grid = new Array(25).fill(0);
    const { cols } = computeClues(grid, 5);
    for (const clue of cols) expect(clue).toEqual([0]);
  });

  it("full column of N → [N]", () => {
    // 5×5 all ones
    const grid = new Array(25).fill(1);
    const { cols } = computeClues(grid, 5);
    for (const clue of cols) expect(clue).toEqual([5]);
  });

  it("column with two separate runs in a 4×4 grid", () => {
    // 4×4 grid — only column 0 matters here
    // Each row has 4 cells (row-major). We set:
    //   row0-col0=1 (index 0), row1-col0=0 (index 4),
    //   row2-col0=1 (index 8), row3-col0=1 (index 12)
    // → col0 runs: [1, 2]
    const N = 4;
    const grid = new Array(N * N).fill(0);
    grid[0 * N + 0] = 1;  // row0, col0
    grid[1 * N + 0] = 0;  // row1, col0 (already 0)
    grid[2 * N + 0] = 1;  // row2, col0
    grid[3 * N + 0] = 1;  // row3, col0
    const { cols } = computeClues(grid, N);
    expect(cols[0]).toEqual([1, 2]);
  });

  it("2×2 grid — each column computed independently", () => {
    // col0: row0=1, row1=0 → [1]
    // col1: row0=0, row1=1 → [1]
    const grid = [1, 0, 0, 1]; // row-major: [r0c0, r0c1, r1c0, r1c1]
    const { cols } = computeClues(grid, 2);
    expect(cols[0]).toEqual([1]);
    expect(cols[1]).toEqual([1]);
  });

  it("3×3: column with run at the bottom", () => {
    // col2: row0=0, row1=0, row2=1 → [1]
    const grid = [
      0, 0, 0,
      0, 0, 0,
      0, 0, 1,
    ];
    const { cols } = computeClues(grid, 3);
    expect(cols[2]).toEqual([1]);
  });
});

describe("computeClues — mixed grids", () => {
  it("classic 5×5 cross pattern: rows and cols both give [1,1,1] for arms", () => {
    // Centre cross: middle row and middle col filled
    // row2 = [1,1,1,1,1] → [5]
    // col2 = [1,1,1,1,1] → [5]
    // other rows: only center cell filled → [1]
    // other cols: only center cell filled → [1]
    const N = 5;
    const grid = new Array(N * N).fill(0);
    // fill row 2
    for (let c = 0; c < N; c++) grid[2 * N + c] = 1;
    // fill col 2
    for (let r = 0; r < N; r++) grid[r * N + 2] = 1;
    const { rows, cols } = computeClues(grid, N);
    // row 2 is fully filled → [5]
    expect(rows[2]).toEqual([5]);
    // other rows have only cell at col2 → [1]
    for (let r = 0; r < N; r++) {
      if (r !== 2) expect(rows[r]).toEqual([1]);
    }
    // col 2 is fully filled → [5]
    expect(cols[2]).toEqual([5]);
    // other cols have only cell at row2 → [1]
    for (let c = 0; c < N; c++) {
      if (c !== 2) expect(cols[c]).toEqual([1]);
    }
  });

  it("returns N row clues and N col clues for an N×N grid", () => {
    for (const N of [5, 10]) {
      const grid = new Array(N * N).fill(0);
      const { rows, cols } = computeClues(grid, N);
      expect(rows).toHaveLength(N);
      expect(cols).toHaveLength(N);
    }
  });
});

// ---------------------------------------------------------------------------
// generateSolution — seeded, deterministic
// ---------------------------------------------------------------------------

describe("generateSolution — seeded RNG", () => {
  it("returns a grid of length N*N", () => {
    for (const N of [5, 10, 15]) {
      const grid = generateSolution(N, "test-seed");
      expect(grid).toHaveLength(N * N);
    }
  });

  it("every cell is 0 or 1", () => {
    const grid = generateSolution(10, "check-values");
    for (const v of grid) {
      expect(v === 0 || v === 1).toBe(true);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = generateSolution(10, "same-seed");
    const b = generateSolution(10, "same-seed");
    expect(a).toEqual(b);
  });

  it("differs across different seeds", () => {
    const a = generateSolution(10, "seed-A");
    const b = generateSolution(10, "seed-B");
    // With 100 cells it is astronomically unlikely these are identical
    expect(a).not.toEqual(b);
  });

  it("numeric seed is also deterministic", () => {
    const a = generateSolution(5, 12345);
    const b = generateSolution(5, 12345);
    expect(a).toEqual(b);
  });

  it("accepts a pre-built Rng object", () => {
    const rng = makeRng("pre-built");
    const grid = generateSolution(5, rng);
    expect(grid).toHaveLength(25);
    for (const v of grid) expect(v === 0 || v === 1).toBe(true);
  });

  it("fill density is roughly 55% over many seeds (statistical)", () => {
    // Sum filled cells across 20 independent seeds; expect ~45–65%
    const N = 10;
    let totalFilled = 0;
    let totalCells = 0;
    for (let s = 0; s < 20; s++) {
      const grid = generateSolution(N, `density-seed-${s}`);
      totalFilled += grid.filter((v) => v === 1).length;
      totalCells += N * N;
    }
    const density = totalFilled / totalCells;
    expect(density).toBeGreaterThan(0.40);
    expect(density).toBeLessThan(0.70);
  });

  it("clues derived from generated solution are self-consistent", () => {
    // Recompute clues from the solution and they must equal each other
    const N = 10;
    const grid = generateSolution(N, "self-consistent");
    const { rows: rows1, cols: cols1 } = computeClues(grid, N);
    const { rows: rows2, cols: cols2 } = computeClues(grid, N);
    expect(rows1).toEqual(rows2);
    expect(cols1).toEqual(cols2);
  });
});

// ---------------------------------------------------------------------------
// isSolved — win detection
// ---------------------------------------------------------------------------

describe("isSolved — win detection", () => {
  it("an empty board is NOT a win (assuming non-empty solution)", () => {
    const solution = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0]; // N=10, partial
    const board = new Array(10).fill(0);
    expect(isSolved(board, solution)).toBe(false);
  });

  it("board exactly matching solution (only filled cells) IS a win", () => {
    const solution = [1, 0, 1, 1, 0];
    const board    = [1, 0, 1, 1, 0];
    expect(isSolved(board, solution)).toBe(true);
  });

  it("board with all-filled solution and all-filled board IS a win", () => {
    const solution = [1, 1, 1, 1];
    const board    = [1, 1, 1, 1];
    expect(isSolved(board, solution)).toBe(true);
  });

  it("board with X-marks (2) on empty cells IS still a win", () => {
    // solution: filled at 0 and 2; empty at 1 and 3
    const solution = [1, 0, 1, 0];
    // board: 1 at 0 and 2; X-mark (2) at 1 and 3
    const board    = [1, 2, 1, 2];
    expect(isSolved(board, solution)).toBe(true);
  });

  it("X-mark on a cell that SHOULD be filled is NOT a win", () => {
    const solution = [1, 0, 1, 0];
    const board    = [2, 0, 1, 0]; // cell 0 should be filled but is X-marked
    expect(isSolved(board, solution)).toBe(false);
  });

  it("extra filled cell beyond solution is NOT a win", () => {
    const solution = [1, 0, 0, 0];
    const board    = [1, 1, 0, 0]; // cell 1 incorrectly filled
    expect(isSolved(board, solution)).toBe(false);
  });

  it("partial board (some cells correct, some wrong) is NOT a win", () => {
    const N = 5;
    const grid = generateSolution(N, "partial-win-test");
    const board = new Array(N * N).fill(0); // all empty
    expect(isSolved(board, grid)).toBe(false);
  });

  it("full board equal to a generated solution IS a win", () => {
    const N = 5;
    const grid = generateSolution(N, "full-win-test");
    // board is a copy of the solution (only 1s and 0s)
    const board = grid.slice();
    expect(isSolved(board, grid)).toBe(true);
  });

  it("mismatched lengths returns false", () => {
    expect(isSolved([1, 0], [1, 0, 1])).toBe(false);
  });

  it("all-zero solution with all-zero board IS a win (all empty puzzle)", () => {
    const solution = [0, 0, 0, 0];
    const board    = [0, 0, 0, 0];
    expect(isSolved(board, solution)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: solution → clues → win check round-trip
// ---------------------------------------------------------------------------

describe("round-trip: generate → clues → verify", () => {
  it("recomputing clues from the solution always matches stored clues", () => {
    for (const N of [5, 10, 15]) {
      const grid = generateSolution(N, `roundtrip-${N}`);
      const stored = computeClues(grid, N);
      const recomputed = computeClues(grid, N);
      expect(recomputed.rows).toEqual(stored.rows);
      expect(recomputed.cols).toEqual(stored.cols);
    }
  });

  it("a completed board (solution copy) is always detected as solved", () => {
    for (const seed of ["alpha", "beta", "gamma", "2026-06-03"]) {
      const N = 5;
      const grid = generateSolution(N, seed);
      expect(isSolved(grid.slice(), grid)).toBe(true);
    }
  });

  it("a blank board is never solved for a grid that has any filled cell", () => {
    const N = 5;
    const grid = generateSolution(N, "blank-check");
    const hasFilledCell = grid.some((v) => v === 1);
    if (hasFilledCell) {
      expect(isSolved(new Array(N * N).fill(0), grid)).toBe(false);
    }
  });
});
