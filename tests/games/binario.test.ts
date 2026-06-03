import { describe, it, expect } from "vitest";
import {
  hasTriple,
  validateLine,
  validateAll,
  checkWinCondition,
  generateSolution,
  removeCells,
  generatePuzzle,
} from "~/games/binario";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// hasTriple
// ---------------------------------------------------------------------------

describe("hasTriple", () => {
  it("detects a run of 3 at the end of the line", () => {
    expect(hasTriple([0, 1, 1, 1], 3)).toBe(true);
  });

  it("detects a run of 3 at the start of the line", () => {
    expect(hasTriple([0, 0, 0, 1], 0)).toBe(true);
  });

  it("detects a run of 3 in the middle", () => {
    expect(hasTriple([1, 0, 0, 0, 1, 1], 2)).toBe(true);
  });

  it("returns false for a pair (run of 2)", () => {
    expect(hasTriple([1, 0, 0, 1], 2)).toBe(false);
  });

  it("returns false for an alternating line", () => {
    expect(hasTriple([0, 1, 0, 1, 0, 1], 3)).toBe(false);
  });

  it("returns false when the cell is null", () => {
    expect(hasTriple([0, 0, null, 0, 1], 2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateLine
// ---------------------------------------------------------------------------

describe("validateLine", () => {
  it("accepts a valid balanced alternating line", () => {
    expect(validateLine([0, 1, 0, 1])).toBe(true);
  });

  it("accepts a valid balanced non-trivial 6-cell line", () => {
    expect(validateLine([0, 1, 1, 0, 0, 1])).toBe(true);
  });

  it("rejects a line with three consecutive 0s", () => {
    expect(validateLine([0, 0, 0, 1, 1, 1])).toBe(false);
  });

  it("rejects a line with three consecutive 1s", () => {
    expect(validateLine([0, 1, 1, 1, 0, 0])).toBe(false);
  });

  it("rejects an unbalanced line (too many 1s)", () => {
    expect(validateLine([0, 1, 0, 1, 1, 1])).toBe(false);
  });

  it("rejects an unbalanced line (too many 0s)", () => {
    expect(validateLine([0, 0, 0, 0, 1, 1])).toBe(false);
  });

  it("rejects a line with a null cell", () => {
    expect(validateLine([0, null, 1, 0, 1, 0])).toBe(false);
  });

  it("accepts a valid 8-cell line", () => {
    expect(validateLine([0, 1, 0, 1, 1, 0, 1, 0])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateAll — explicit small boards
// ---------------------------------------------------------------------------

describe("validateAll — valid 4×4 board", () => {
  // Build a known-valid 4×4 board:
  //   Row 0: 0 1 0 1
  //   Row 1: 1 0 1 0
  //   Row 2: 0 1 1 0
  //   Row 3: 1 0 0 1
  // Each row and col: 2 zeros + 2 ones, no triple.
  const board: (0 | 1)[] = [
    0, 1, 0, 1,
    1, 0, 1, 0,
    0, 1, 1, 0,
    1, 0, 0, 1,
  ];

  it("accepts the valid board", () => {
    expect(validateAll(board, 4)).toBe(true);
  });
});

describe("validateAll — rejects boards with a triple", () => {
  // Row 0 has 0,0,0 — invalid triple
  const boardWithTriple: (0 | 1)[] = [
    0, 0, 0, 1,
    1, 1, 0, 0,
    0, 0, 1, 1,
    1, 1, 1, 0,
  ];

  it("rejects a board with a row-triple of 0s", () => {
    expect(validateAll(boardWithTriple, 4)).toBe(false);
  });
});

describe("validateAll — rejects boards where all rows are valid but a column fails", () => {
  // Each row has exactly 2 zeros and 2 ones, no triples.
  // But every column is all-zeros or all-ones → column validation fails.
  // Row 0: 0 1 0 1  → valid
  // Row 1: 0 1 0 1  → valid
  // Row 2: 0 1 0 1  → valid
  // Row 3: 0 1 0 1  → valid
  // Column 0: 0 0 0 0 → invalid (too many zeros, also a quadruple)
  const boardValidRowsBadCols: (0 | 1)[] = [
    0, 1, 0, 1,
    0, 1, 0, 1,
    0, 1, 0, 1,
    0, 1, 0, 1,
  ];

  it("rejects a board where rows pass but columns fail (covers column validation branch)", () => {
    expect(validateAll(boardValidRowsBadCols, 4)).toBe(false);
  });
});

describe("validateAll — rejects boards with unbalanced counts", () => {
  // Row 0 has 3 ones — unbalanced
  const boardUnbalanced: (0 | 1)[] = [
    1, 1, 1, 0,
    0, 0, 0, 1,
    1, 0, 0, 1,
    0, 1, 1, 0,
  ];

  it("rejects a board with an unbalanced row", () => {
    expect(validateAll(boardUnbalanced, 4)).toBe(false);
  });
});

describe("validateAll — rejects a board with a null cell", () => {
  const incomplete: (0 | 1 | null)[] = [
    0, 1, 0, 1,
    1, 0, null, 0,
    0, 1, 1, 0,
    1, 0, 0, 1,
  ];

  it("rejects an incomplete board", () => {
    expect(validateAll(incomplete, 4)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkWinCondition
// ---------------------------------------------------------------------------

describe("checkWinCondition", () => {
  const validBoard: (0 | 1)[] = [
    0, 1, 0, 1,
    1, 0, 1, 0,
    0, 1, 1, 0,
    1, 0, 0, 1,
  ];

  it("returns true for a completed valid board", () => {
    expect(checkWinCondition(validBoard, 4)).toBe(true);
  });

  it("returns false when any cell is null", () => {
    const partial: (0 | 1 | null)[] = [...validBoard];
    partial[5] = null;
    expect(checkWinCondition(partial, 4)).toBe(false);
  });

  it("returns false when the board has a triple violation", () => {
    const bad: (0 | 1)[] = [
      0, 0, 0, 1,
      1, 1, 0, 0,
      0, 0, 1, 1,
      1, 1, 1, 0,
    ];
    expect(checkWinCondition(bad, 4)).toBe(false);
  });

  it("returns false when the board has an unbalanced line", () => {
    const bad: (0 | 1)[] = [
      1, 1, 1, 0,
      0, 0, 0, 1,
      1, 0, 0, 1,
      0, 1, 1, 0,
    ];
    expect(checkWinCondition(bad, 4)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateSolution — seeded, verifiable
// ---------------------------------------------------------------------------

describe("generateSolution", () => {
  it("produces a grid of exactly size*size cells, all 0 or 1", () => {
    for (const size of [4, 6, 8]) {
      const rng = makeRng(`sol-test-${size}`);
      const grid = generateSolution(size, rng);
      expect(grid).toHaveLength(size * size);
      for (const v of grid) {
        expect(v === 0 || v === 1).toBe(true);
      }
    }
  });

  it("produces a grid that passes validateAll for sizes 4, 6 and 8", () => {
    for (const size of [4, 6, 8]) {
      const rng = makeRng(`sol-validate-${size}`);
      const grid = generateSolution(size, rng);
      expect(validateAll(grid, size), `size=${size} grid failed validateAll`).toBe(true);
    }
  });

  it("each row has exactly half 0s and half 1s", () => {
    const size = 6;
    const rng = makeRng("row-balance");
    const grid = generateSolution(size, rng);
    for (let r = 0; r < size; r++) {
      const row = grid.slice(r * size, r * size + size);
      const zeros = row.filter((v) => v === 0).length;
      const ones = row.filter((v) => v === 1).length;
      expect(zeros).toBe(size / 2);
      expect(ones).toBe(size / 2);
    }
  });

  it("each column has exactly half 0s and half 1s", () => {
    const size = 6;
    const rng = makeRng("col-balance");
    const grid = generateSolution(size, rng);
    for (let c = 0; c < size; c++) {
      const col = Array.from({ length: size }, (_, r) => grid[r * size + c]);
      const zeros = col.filter((v) => v === 0).length;
      const ones = col.filter((v) => v === 1).length;
      expect(zeros).toBe(size / 2);
      expect(ones).toBe(size / 2);
    }
  });

  it("no row contains three consecutive equal values", () => {
    const size = 6;
    const rng = makeRng("no-row-triple");
    const grid = generateSolution(size, rng);
    for (let r = 0; r < size; r++) {
      const row = grid.slice(r * size, r * size + size);
      for (let c = 0; c + 2 < size; c++) {
        expect(
          row[c] === row[c + 1] && row[c + 1] === row[c + 2],
          `row ${r} has triple at col ${c}`
        ).toBe(false);
      }
    }
  });

  it("no column contains three consecutive equal values", () => {
    const size = 6;
    const rng = makeRng("no-col-triple");
    const grid = generateSolution(size, rng);
    for (let c = 0; c < size; c++) {
      for (let r = 0; r + 2 < size; r++) {
        expect(
          grid[r * size + c] === grid[(r + 1) * size + c] &&
            grid[(r + 1) * size + c] === grid[(r + 2) * size + c],
          `col ${c} has triple at row ${r}`
        ).toBe(false);
      }
    }
  });

  it("no two rows are identical", () => {
    for (const size of [4, 6, 8]) {
      const rng = makeRng(`unique-rows-${size}`);
      const grid = generateSolution(size, rng);
      const rows = Array.from({ length: size }, (_, r) =>
        grid.slice(r * size, r * size + size).join("")
      );
      const unique = new Set(rows);
      expect(unique.size).toBe(size);
    }
  });

  it("no two columns are identical", () => {
    for (const size of [4, 6, 8]) {
      const rng = makeRng(`unique-cols-${size}`);
      const grid = generateSolution(size, rng);
      const cols = Array.from({ length: size }, (_, c) =>
        Array.from({ length: size }, (_, r) => grid[r * size + c]).join("")
      );
      const unique = new Set(cols);
      expect(unique.size).toBe(size);
    }
  });

  it("is deterministic: same seed produces same grid", () => {
    const rng1 = makeRng("deterministic-42");
    const rng2 = makeRng("deterministic-42");
    const g1 = generateSolution(6, rng1);
    const g2 = generateSolution(6, rng2);
    expect(g1).toEqual(g2);
  });

  it("different seeds produce different grids (high probability)", () => {
    const g1 = generateSolution(6, makeRng("seed-A"));
    const g2 = generateSolution(6, makeRng("seed-B"));
    // With a 6×6 grid there are astronomically many valid grids; collision is negligible.
    expect(g1.join("")).not.toBe(g2.join(""));
  });
});

// ---------------------------------------------------------------------------
// removeCells
// ---------------------------------------------------------------------------

describe("removeCells", () => {
  it("removes approximately 50% of cells (marks them false)", () => {
    const size = 6;
    const sol = generateSolution(size, makeRng("rc-sol"));
    const given = removeCells(sol, size, makeRng("rc-mask"));
    const trueCount = given.filter(Boolean).length;
    // Exactly 50% removed → 50% given (floor rounding).
    expect(trueCount).toBe(size * size - Math.floor(size * size * 0.5));
  });

  it("never reveals a cell value that differs from the solution", () => {
    const size = 6;
    const sol = generateSolution(size, makeRng("rc-sol2"));
    const given = removeCells(sol, size, makeRng("rc-mask2"));
    const cells = sol.map((v, i) => (given[i] ? v : null));
    for (let i = 0; i < size * size; i++) {
      if (given[i]) {
        expect(cells[i]).toBe(sol[i]);
      } else {
        expect(cells[i]).toBeNull();
      }
    }
  });

  it("is deterministic: same inputs produce same mask", () => {
    const size = 6;
    const sol = generateSolution(size, makeRng("rc-det"));
    const g1 = removeCells(sol, size, makeRng("rc-det-mask"));
    const g2 = removeCells(sol, size, makeRng("rc-det-mask"));
    expect(g1).toEqual(g2);
  });
});

// ---------------------------------------------------------------------------
// generatePuzzle — integration
// ---------------------------------------------------------------------------

describe("generatePuzzle", () => {
  it("produces a puzzle whose solution passes validateAll", () => {
    for (const size of [4, 6, 8]) {
      const { solution } = generatePuzzle(size, makeRng(`puzzle-${size}`));
      expect(validateAll(solution, size)).toBe(true);
    }
  });

  it("given cells in cells[] match their value in solution[]", () => {
    const size = 6;
    const { solution, given, cells } = generatePuzzle(size, makeRng("puzzle-match"));
    for (let i = 0; i < size * size; i++) {
      if (given[i]) {
        expect(cells[i]).toBe(solution[i]);
      } else {
        expect(cells[i]).toBeNull();
      }
    }
  });

  it("is deterministic: same seed always yields same puzzle", () => {
    const p1 = generatePuzzle(6, makeRng("puzzle-det"));
    const p2 = generatePuzzle(6, makeRng("puzzle-det"));
    expect(p1.solution).toEqual(p2.solution);
    expect(p1.given).toEqual(p2.given);
    expect(p1.cells).toEqual(p2.cells);
  });

  it("filling all null cells with the solution values produces a win", () => {
    const size = 6;
    const { solution, given, cells } = generatePuzzle(size, makeRng("puzzle-win"));
    const filled = cells.map((v, i) => (v === null ? solution[i] : v)) as (0 | 1)[];
    expect(checkWinCondition(filled, size)).toBe(true);
  });

  it("an empty board (all nulls) does not satisfy win condition", () => {
    const size = 6;
    const { given } = generatePuzzle(size, makeRng("puzzle-nowin"));
    const emptyCells = new Array(size * size).fill(null);
    expect(checkWinCondition(emptyCells, size)).toBe(false);
  });
});
