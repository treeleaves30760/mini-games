import { describe, it, expect } from "vitest";
import {
  hasTriple,
  validateLine,
  validateAll,
  checkWinCondition,
  getRow,
  getCol,
  findDuplicateLines,
  linesUnique,
  generateSolution,
  removeCells,
  generatePuzzle,
} from "~/games/binario";
import { makeRng, todaySeed } from "~/utils/rng";

type Cell = 0 | 1 | null;

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
// getRow / getCol
// ---------------------------------------------------------------------------

describe("getRow / getCol", () => {
  const board: Cell[] = [
    0, 1, 0, 1,
    1, 0, 1, 0,
    0, 1, 1, null,
    1, 0, 0, 1,
  ];

  it("extracts rows", () => {
    expect(getRow(board, 4, 0)).toEqual([0, 1, 0, 1]);
    expect(getRow(board, 4, 2)).toEqual([0, 1, 1, null]);
  });

  it("extracts columns", () => {
    expect(getCol(board, 4, 0)).toEqual([0, 1, 0, 1]);
    expect(getCol(board, 4, 3)).toEqual([1, 0, null, 1]);
  });
});

// ---------------------------------------------------------------------------
// findDuplicateLines / linesUnique
// ---------------------------------------------------------------------------

describe("findDuplicateLines / linesUnique", () => {
  it("reports nothing for a board with unique rows and columns", () => {
    const board: Cell[] = [
      0, 1, 0, 1,
      1, 0, 1, 0,
      0, 1, 1, 0,
      1, 0, 0, 1,
    ];
    expect(findDuplicateLines(board, 4)).toEqual({ rows: [], cols: [] });
    expect(linesUnique(board, 4)).toBe(true);
  });

  it("reports every member of a duplicate group, sorted, for rows and columns", () => {
    // Rows 0 & 1 equal, rows 2 & 3 equal; columns 0 & 2 equal, columns 1 & 3 equal.
    const board: Cell[] = [
      0, 1, 0, 1,
      0, 1, 0, 1,
      1, 0, 1, 0,
      1, 0, 1, 0,
    ];
    expect(findDuplicateLines(board, 4)).toEqual({ rows: [0, 1, 2, 3], cols: [0, 1, 2, 3] });
    expect(linesUnique(board, 4)).toBe(false);
  });

  it("flags duplicate columns even when every row is unique", () => {
    const board: Cell[] = [
      0, 0, 0, 0,
      1, 1, 1, 1,
      0, 0, 1, 1,
      1, 1, 0, 0,
    ];
    expect(findDuplicateLines(board, 4)).toEqual({ rows: [], cols: [0, 1, 2, 3] });
    expect(linesUnique(board, 4)).toBe(false);
  });

  it("ignores incomplete lines on a partially filled board", () => {
    // Rows 0 and 1 are complete and identical; row 2 would match them but has
    // a blank, so only rows 0 and 1 are reported.  Column 3 is incomplete.
    const board: Cell[] = [
      0, 1, 0, 1,
      0, 1, 0, 1,
      0, 1, 0, null,
      1, 0, 1, 0,
    ];
    expect(findDuplicateLines(board, 4)).toEqual({ rows: [0, 1], cols: [0, 2] });
    expect(linesUnique(board, 4)).toBe(false);
  });

  it("treats an empty board as having no duplicates", () => {
    // The component's reactive state starts as [] before the first generate().
    expect(findDuplicateLines([], 4)).toEqual({ rows: [], cols: [] });
    expect(linesUnique([], 4)).toBe(true);
    expect(linesUnique(new Array(16).fill(null), 4)).toBe(true);
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

describe("validateAll — enforces the 'every row and column is unique' rule", () => {
  // The rules panel tells the player that every row and every column must be
  // unique, so a board that only breaks that rule must not validate.

  it("rejects a balanced, triple-free board with duplicate rows (and columns)", () => {
    // Rows 0101/0101/1010/1010; columns 0011/1100/0011/1100 — every line is
    // balanced with no triple, but rows and columns repeat.
    const board: (0 | 1)[] = [
      0, 1, 0, 1,
      0, 1, 0, 1,
      1, 0, 1, 0,
      1, 0, 1, 0,
    ];
    expect(validateAll(board, 4)).toBe(false);
    expect(checkWinCondition(board, 4)).toBe(false);
  });

  // 6×6 board whose rows are all different but whose columns 2 and 5 are
  // identical; every row and column is balanced and triple-free.
  const dupColsOnly: (0 | 1)[] = [
    0, 0, 1, 0, 1, 1,
    0, 0, 1, 1, 0, 1,
    1, 1, 0, 0, 1, 0,
    0, 1, 0, 1, 1, 0,
    1, 0, 1, 0, 0, 1,
    1, 1, 0, 1, 0, 0,
  ];
  const transpose = (b: (0 | 1)[], n: number) =>
    Array.from({ length: n * n }, (_, i) => b[(i % n) * n + ((i / n) | 0)]);
  const dupRowsOnly = transpose(dupColsOnly, 6);

  it("rejects a board whose only violation is two identical columns", () => {
    for (let r = 0; r < 6; r++) expect(validateLine(getRow(dupColsOnly, 6, r))).toBe(true);
    for (let c = 0; c < 6; c++) expect(validateLine(getCol(dupColsOnly, 6, c))).toBe(true);
    expect(findDuplicateLines(dupColsOnly, 6)).toEqual({ rows: [], cols: [2, 5] });
    expect(validateAll(dupColsOnly, 6)).toBe(false);
    expect(checkWinCondition(dupColsOnly, 6)).toBe(false);
  });

  it("rejects a board whose only violation is two identical rows", () => {
    expect(findDuplicateLines(dupRowsOnly, 6)).toEqual({ rows: [2, 5], cols: [] });
    expect(validateAll(dupRowsOnly, 6)).toBe(false);
    expect(checkWinCondition(dupRowsOnly, 6)).toBe(false);
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

  it("keeps the daily puzzle stable across generator edits (pinned output)", () => {
    // The Daily Challenge seeds the game with a "YYYY-MM-DD" string and every
    // player must get the same board, so the generator's output for a fixed
    // seed is pinned here.  Update these literals only when a change to the
    // generator is intentional.
    const { solution, given } = generatePuzzle(6, makeRng("2026-08-29"));
    expect(solution.join("")).toBe("011010001101110100001011110010100101");
    expect(given.map((g) => (g ? 1 : 0)).join("")).toBe("101110010101100100000101011101011001");
  });

  it("filling all null cells with the solution values produces a win", () => {
    const size = 6;
    const { solution, cells } = generatePuzzle(size, makeRng("puzzle-win"));
    const filled = cells.map((v, i) => (v === null ? solution[i] : v)) as (0 | 1)[];
    expect(checkWinCondition(filled, size)).toBe(true);
  });

  it("an empty board (all nulls) does not satisfy win condition", () => {
    const size = 6;
    const emptyCells = new Array(size * size).fill(null);
    expect(checkWinCondition(emptyCells, size)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Solvability audit — independent backtracking solver
// ---------------------------------------------------------------------------
//
// The solver below is written from the rules shown to the player in
// BinarioGame.vue and shares no code with app/games/binario.ts:
//   1. every cell is 0 or 1,
//   2. every row and every column has the same number of 0s and 1s,
//   3. no three identical values are adjacent in a row or column,
//   4. every row is unique and every column is unique.
// It is run over every size the UI offers (4, 6, 8; the Daily Challenge is
// fixed at 6) for hundreds of seeds, including "YYYY-MM-DD" daily seeds.

/** Independent full-grid validator.  `unique` toggles rule 4. */
function rulesValid(grid: number[], n: number, unique: boolean): boolean {
  if (grid.length !== n * n) return false;
  const half = n / 2;
  const seenRows = new Set<string>();
  const seenCols = new Set<string>();
  for (let r = 0; r < n; r++) {
    let ones = 0;
    let key = "";
    for (let c = 0; c < n; c++) {
      const v = grid[r * n + c];
      if (v !== 0 && v !== 1) return false;
      ones += v;
      key += v;
      if (c >= 2 && grid[r * n + c - 1] === v && grid[r * n + c - 2] === v) return false;
    }
    if (ones !== half) return false;
    if (unique && seenRows.has(key)) return false;
    seenRows.add(key);
  }
  for (let c = 0; c < n; c++) {
    let ones = 0;
    let key = "";
    for (let r = 0; r < n; r++) {
      const v = grid[r * n + c];
      ones += v;
      key += v;
      if (r >= 2 && grid[(r - 1) * n + c] === v && grid[(r - 2) * n + c] === v) return false;
    }
    if (ones !== half) return false;
    if (unique && seenCols.has(key)) return false;
    seenCols.add(key);
  }
  return true;
}

/**
 * Backtracking solver: returns up to `cap` completions of `cells` that obey
 * rules 1–3 and, when `unique` is set, rule 4.  Givens are never changed.
 */
function solveIndependently(cells: Cell[], n: number, cap: number, unique: boolean): number[][] {
  const g = new Int8Array(n * n);
  for (let i = 0; i < n * n; i++) g[i] = cells[i] === null ? -1 : (cells[i] as number);
  const half = n / 2;
  const rowCnt = [new Int8Array(n), new Int8Array(n)];
  const colCnt = [new Int8Array(n), new Int8Array(n)];
  const empties: number[] = [];
  for (let i = 0; i < n * n; i++) {
    if (g[i] < 0) empties.push(i);
    else {
      rowCnt[g[i]][(i / n) | 0]++;
      colCnt[g[i]][i % n]++;
    }
  }
  const lineKey = (idx: (k: number) => number) =>
    Array.from({ length: n }, (_, k) => g[idx(k)]).join("");
  const rowKey = (r: number) => lineKey((c) => r * n + c);
  const colKey = (c: number) => lineKey((r) => r * n + c);
  const rowComplete = (r: number) => !rowKey(r).includes("-");
  const colComplete = (c: number) => !colKey(c).includes("-");

  function tripleAt(idx: number): boolean {
    const r = (idx / n) | 0;
    const c = idx % n;
    const v = g[idx];
    for (let s = Math.max(0, c - 2); s + 2 < n && s <= c; s++) {
      if (g[r * n + s] === v && g[r * n + s + 1] === v && g[r * n + s + 2] === v) return true;
    }
    for (let s = Math.max(0, r - 2); s + 2 < n && s <= r; s++) {
      if (g[s * n + c] === v && g[(s + 1) * n + c] === v && g[(s + 2) * n + c] === v) return true;
    }
    return false;
  }
  function duplicateRow(r: number): boolean {
    const key = rowKey(r);
    for (let o = 0; o < n; o++) if (o !== r && rowComplete(o) && rowKey(o) === key) return true;
    return false;
  }
  function duplicateCol(c: number): boolean {
    const key = colKey(c);
    for (let o = 0; o < n; o++) if (o !== c && colComplete(o) && colKey(o) === key) return true;
    return false;
  }

  // The givens themselves must not already break a rule.
  for (let i = 0; i < n * n; i++) if (g[i] >= 0 && tripleAt(i)) return [];
  for (let k = 0; k < n; k++) {
    if (rowCnt[0][k] > half || rowCnt[1][k] > half) return [];
    if (colCnt[0][k] > half || colCnt[1][k] > half) return [];
  }

  const out: number[][] = [];
  function dfs(k: number): boolean {
    if (k === empties.length) {
      out.push(Array.from(g));
      return out.length >= cap;
    }
    const idx = empties[k];
    const r = (idx / n) | 0;
    const c = idx % n;
    for (const v of [0, 1] as const) {
      if (rowCnt[v][r] >= half || colCnt[v][c] >= half) continue;
      g[idx] = v;
      let ok = !tripleAt(idx);
      if (ok && unique) {
        if ((rowComplete(r) && duplicateRow(r)) || (colComplete(c) && duplicateCol(c))) ok = false;
      }
      if (ok) {
        rowCnt[v][r]++;
        colCnt[v][c]++;
        const stop = dfs(k + 1);
        rowCnt[v][r]--;
        colCnt[v][c]--;
        if (stop) {
          g[idx] = -1;
          return true;
        }
      }
      g[idx] = -1;
    }
    return false;
  }
  dfs(0);
  return out;
}

const UI_SIZES = [4, 6, 8];
const DAILY_SIZE = 6;

const AUDIT_SEEDS: (string | number)[] = [];
for (let i = 0; i < 300; i++) AUDIT_SEEDS.push(`audit-${i}`);
for (let i = 0; i < 50; i++) AUDIT_SEEDS.push(i * 7919);

// Every daily seed from 2024-01-01 to 2027-12-31.
const DAILY_SEEDS: string[] = [];
for (let y = 2024; y <= 2027; y++) {
  for (let m = 0; m < 12; m++) {
    for (let d = 1; d <= 31; d++) {
      const date = new Date(y, m, d);
      if (date.getMonth() === m) DAILY_SEEDS.push(todaySeed(date));
    }
  }
}

describe("solvability audit — every UI size × hundreds of seeds", () => {
  it("independent solver sanity: rejects givens that already break a rule", () => {
    // Three 0s in a row among the givens → no completion.
    const badTriple: Cell[] = [0, 0, 0, null, null, null, null, null, null, null, null, null, null, null, null, null];
    expect(solveIndependently(badTriple, 4, 1, true)).toEqual([]);
    // Three 1s in one row of a 4-wide grid → count violation → no completion.
    const badCount: Cell[] = [1, null, 1, 1, null, null, null, null, null, null, null, null, null, null, null, null];
    expect(solveIndependently(badCount, 4, 1, true)).toEqual([]);
    // Three 1s in one column → count violation → no completion.
    const badColCount: Cell[] = [1, null, null, null, 1, null, null, null, null, null, null, null, 1, null, null, null];
    expect(solveIndependently(badColCount, 4, 1, true)).toEqual([]);
    expect(rulesValid([0, 1], 4, true)).toBe(false);
  });

  for (const size of UI_SIZES) {
    it(`size ${size}: every seeded puzzle is solvable and any rule-valid completion wins`, () => {
      const seeds: (string | number)[] = [...AUDIT_SEEDS];
      if (size === DAILY_SIZE) seeds.push(...DAILY_SEEDS);
      const expectedGivens = size * size - Math.floor(size * size * 0.5);
      let alternativeCompletions = 0;
      let multiSolution = 0;
      let lenientOnlyCompletions = 0;

      for (const seed of seeds) {
        const label = `size=${size} seed=${seed}`;
        const { solution, given, cells } = generatePuzzle(size, makeRng(seed));

        // (d) shape + non-degenerate: half the cells are givens, half are blanks.
        expect(solution, label).toHaveLength(size * size);
        expect(given, label).toHaveLength(size * size);
        expect(cells, label).toHaveLength(size * size);
        const givenCount = given.filter(Boolean).length;
        expect(givenCount, label).toBe(expectedGivens);
        expect(givenCount, label).toBeGreaterThan(0);
        expect(givenCount, label).toBeLessThan(size * size);

        // (c) stored solution obeys every stated rule; givens agree with it.
        expect(rulesValid(solution, size, true), `${label}: stored solution breaks a rule`).toBe(true);
        for (let i = 0; i < size * size; i++) {
          expect(cells[i], `${label}: cell ${i}`).toBe(given[i] ? solution[i] : null);
        }

        // (a) an independent solver finds a rule-valid completion of the givens.
        const found = solveIndependently(cells, size, 2, true);
        expect(found.length, `${label}: no completion found`).toBeGreaterThanOrEqual(1);
        if (found.length > 1) multiSolution++;
        const completion = found[0];
        expect(rulesValid(completion, size, true), label).toBe(true);
        for (let i = 0; i < size * size; i++) {
          if (given[i]) expect(completion[i], `${label}: given ${i} changed`).toBe(solution[i]);
        }
        if (completion.join("") !== solution.join("")) alternativeCompletions++;

        // (b) the game's win check accepts the stored solution and the
        //     independently found completion, and rejects wrong / partial boards.
        expect(checkWinCondition(solution, size), `${label}: stored solution not a win`).toBe(true);
        expect(checkWinCondition(completion as Cell[], size), `${label}: valid completion not a win`).toBe(true);
        const firstBlank = cells.indexOf(null);
        const flipped = completion.slice() as Cell[];
        flipped[firstBlank] = completion[firstBlank] === 0 ? 1 : 0;
        expect(checkWinCondition(flipped, size), `${label}: flipped cell still wins`).toBe(false);
        const partial = completion.slice() as Cell[];
        partial[firstBlank] = null;
        expect(checkWinCondition(partial, size), `${label}: partial board wins`).toBe(false);
        expect(checkWinCondition(cells, size), `${label}: starting board wins`).toBe(false);

        // Regression: a completion that is balanced and triple-free but repeats
        // a row/column breaks the uniqueness rule the player is told and must
        // not be accepted (checkWinCondition used to ignore rule 4).
        const lenient = solveIndependently(cells, size, 64, false);
        for (const cand of lenient) {
          if (!rulesValid(cand, size, true)) {
            lenientOnlyCompletions++;
            expect(checkWinCondition(cand as Cell[], size), `${label}: duplicate-line board wins`).toBe(false);
          }
        }
      }

      // The puzzles are not always unique, so the win check must not compare
      // against the stored solution — make sure that path was really exercised.
      expect(multiSolution).toBeGreaterThan(0);
      expect(alternativeCompletions).toBeGreaterThan(0);
      expect(lenientOnlyCompletions).toBeGreaterThan(0);
    });
  }
});
