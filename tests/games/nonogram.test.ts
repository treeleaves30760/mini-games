import { describe, it, expect } from "vitest";
import {
  computeClues,
  cluesEqual,
  generateSolution,
  isSolved,
  lineClue,
  matchesClues,
} from "~/games/nonogram";
import type { Clue, Grid, NonogramClues } from "~/games/nonogram";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Independent reference solver (written from the rules, NOT from the module)
//
// A nonogram line clue lists the lengths of the maximal runs of filled cells,
// left→right / top→bottom, with at least one empty cell between runs; a line
// without filled cells shows [0]. A board solves the puzzle when every row and
// column clue is satisfied — nothing else (in particular NOT "equals the
// picture the clues were generated from").
// ---------------------------------------------------------------------------

/** Reference run-length clue of one line (1 = filled, anything else = empty). */
function refClue(line: number[]): number[] {
  const out: number[] = [];
  let run = 0;
  for (const v of line) {
    if (v === 1) run++;
    else if (run > 0) {
      out.push(run);
      run = 0;
    }
  }
  if (run > 0) out.push(run);
  return out.length ? out : [0];
}

function sameClue(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Reference clue set of a picture, independent of the module. */
function refClues(grid: number[], N: number): NonogramClues {
  const rows: number[][] = [];
  const cols: number[][] = [];
  for (let r = 0; r < N; r++) rows.push(refClue(grid.slice(r * N, r * N + N)));
  for (let c = 0; c < N; c++) {
    const col: number[] = [];
    for (let r = 0; r < N; r++) col.push(grid[r * N + c]);
    cols.push(refClue(col));
  }
  return { rows, cols };
}

/** Reference "does this board satisfy these clues" check, independent of the module. */
function refSatisfies(board: number[], N: number, clues: NonogramClues): boolean {
  for (let r = 0; r < N; r++) {
    if (!sameClue(refClue(board.slice(r * N, r * N + N)), clues.rows[r])) return false;
  }
  for (let c = 0; c < N; c++) {
    const col: number[] = [];
    for (let r = 0; r < N; r++) col.push(board[r * N + c]);
    if (!sameClue(refClue(col), clues.cols[c])) return false;
  }
  return true;
}

// Solver cell state: -1 unknown, 0 empty, 1 filled.
type Cell = -1 | 0 | 1;

/** Blocks of a clue as the solver needs them: the empty-line clue [0] has no blocks. */
function blocksOf(clue: number[]): number[] {
  return clue.length === 1 && clue[0] === 0 ? [] : clue;
}

/**
 * Line solver. For a line with partially known cells, decide for every cell
 * whether at least one placement of `blocks` (consistent with `known`) fills
 * it and whether at least one leaves it empty. Returns null if no placement
 * exists. Standard prefix/suffix feasibility DP:
 *   F[b][p] — blocks b.. fit in cells p..L-1
 *   B[b][p] — blocks 0..b-1 fit in cells 0..p-1
 */
function lineOptions(known: Cell[], blocks: number[]): { fill: boolean[]; empty: boolean[] } | null {
  const L = known.length;
  const k = blocks.length;
  const canFill = (s: number, e: number): boolean => {
    for (let i = s; i < e; i++) if (known[i] === 0) return false;
    return true;
  };

  const F: boolean[][] = Array.from({ length: k + 1 }, () => new Array<boolean>(L + 1).fill(false));
  F[k][L] = true;
  for (let p = L - 1; p >= 0; p--) F[k][p] = known[p] !== 1 && F[k][p + 1];
  for (let b = k - 1; b >= 0; b--) {
    const len = blocks[b];
    for (let p = L - 1; p >= 0; p--) {
      let ok = known[p] !== 1 && F[b][p + 1]; // leave cell p empty
      if (!ok && p + len <= L && canFill(p, p + len)) {
        const e = p + len;
        ok = e === L ? F[b + 1][L] : known[e] !== 1 && F[b + 1][e + 1];
      }
      F[b][p] = ok;
    }
  }
  if (!F[0][0]) return null;

  const B: boolean[][] = Array.from({ length: k + 1 }, () => new Array<boolean>(L + 1).fill(false));
  B[0][0] = true;
  for (let p = 1; p <= L; p++) B[0][p] = known[p - 1] !== 1 && B[0][p - 1];
  for (let b = 1; b <= k; b++) {
    const len = blocks[b - 1];
    for (let p = 1; p <= L; p++) {
      let ok = known[p - 1] !== 1 && B[b][p - 1]; // leave cell p-1 empty
      if (!ok && p - len >= 0 && canFill(p - len, p)) {
        const s = p - len;
        ok = s === 0 ? B[b - 1][0] : known[s - 1] !== 1 && B[b - 1][s - 1];
      }
      B[b][p] = ok;
    }
  }

  const fill = new Array<boolean>(L).fill(false);
  const empty = new Array<boolean>(L).fill(false);
  // Cell i can be empty: some split b puts blocks 0..b-1 before i and b.. after it.
  for (let i = 0; i < L; i++) {
    if (known[i] === 1) continue;
    for (let b = 0; b <= k; b++) {
      if (B[b][i] && F[b][i + 1]) {
        empty[i] = true;
        break;
      }
    }
  }
  // Block b can sit at [s, e): prefix blocks fit before s with a gap, suffix after e with a gap.
  for (let b = 0; b < k; b++) {
    const len = blocks[b];
    for (let s = 0; s + len <= L; s++) {
      const e = s + len;
      const pre = s === 0 ? b === 0 : known[s - 1] !== 1 && B[b][s - 1];
      const post = e === L ? b === k - 1 : known[e] !== 1 && F[b + 1][e + 1];
      if (pre && post && canFill(s, e)) for (let i = s; i < e; i++) fill[i] = true;
    }
  }
  return { fill, empty };
}

/**
 * Full solver: line propagation to a fixed point, then backtracking on the
 * first unknown cell. Returns up to `limit` solutions as flat 0/1 grids.
 */
function solveNonogram(clues: NonogramClues, N: number, limit = 1): number[][] {
  const rowBlocks = clues.rows.map(blocksOf);
  const colBlocks = clues.cols.map(blocksOf);
  const found: number[][] = [];

  function propagate(cells: Cell[]): boolean {
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < N; r++) {
        const line = cells.slice(r * N, r * N + N);
        const opt = lineOptions(line, rowBlocks[r]);
        if (!opt) return false;
        for (let c = 0; c < N; c++) {
          if (line[c] !== -1 || opt.fill[c] === opt.empty[c]) continue;
          cells[r * N + c] = opt.fill[c] ? 1 : 0;
          changed = true;
        }
      }
      for (let c = 0; c < N; c++) {
        const line: Cell[] = [];
        for (let r = 0; r < N; r++) line.push(cells[r * N + c]);
        const opt = lineOptions(line, colBlocks[c]);
        if (!opt) return false;
        for (let r = 0; r < N; r++) {
          if (line[r] !== -1 || opt.fill[r] === opt.empty[r]) continue;
          cells[r * N + c] = opt.fill[r] ? 1 : 0;
          changed = true;
        }
      }
    }
    return true;
  }

  function search(cells: Cell[]): void {
    if (!propagate(cells)) return;
    const i = cells.indexOf(-1);
    if (i === -1) {
      found.push(cells.slice());
      return;
    }
    for (const guess of [1, 0] as const) {
      const next = cells.slice();
      next[i] = guess;
      search(next);
      if (found.length >= limit) return;
    }
  }

  search(new Array<Cell>(N * N).fill(-1));
  return found;
}

/** "YYYY-MM-DD" seeds for every day of a year — the Daily Challenge seed format. */
function datesOfYear(year: number): string[] {
  const out: string[] = [];
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Sizes the component offers (SIZES = [5, 10, 15]; daily plays the default 10×10). */
const SIZES = [5, 10, 15];

// ---------------------------------------------------------------------------
// Reference solver self-checks (so the sweep below rests on a verified tool)
// ---------------------------------------------------------------------------

describe("reference solver — self-checks", () => {
  it("2×2 checkerboard clues have exactly two solutions, both verified by refSatisfies", () => {
    const clues: NonogramClues = { rows: [[1], [1]], cols: [[1], [1]] };
    const sols = solveNonogram(clues, 2, 10);
    expect(sols.map((s) => s.join(""))).toEqual(["1001", "0110"]);
    for (const s of sols) expect(refSatisfies(s, 2, clues)).toBe(true);
  });

  it("unsolvable clues yield no solution", () => {
    // Row wants 2 filled, but columns allow none.
    const clues: NonogramClues = { rows: [[2], [0]], cols: [[0], [0]] };
    expect(solveNonogram(clues, 2, 10)).toEqual([]);
  });

  it("a plus sign is unique and is found by pure propagation", () => {
    const N = 3;
    const picture = [0, 1, 0, 1, 1, 1, 0, 1, 0];
    const clues: NonogramClues = { rows: [[1], [3], [1]], cols: [[1], [3], [1]] };
    expect(solveNonogram(clues, N, 10)).toEqual([picture]);
  });

  it("finds every solution: matches brute force on all 512 3×3 pictures and sampled 4×4 pictures", () => {
    const bruteCount = (N: number, clues: NonogramClues): number => {
      const cells = N * N;
      let count = 0;
      for (let mask = 0; mask < 1 << cells; mask++) {
        const board = Array.from({ length: cells }, (_, i) => (mask >> i) & 1);
        if (refSatisfies(board, N, clues)) count++;
      }
      return count;
    };
    for (let mask = 0; mask < 512; mask++) {
      const picture = Array.from({ length: 9 }, (_, i) => (mask >> i) & 1);
      const clues = refClues(picture, 3);
      const sols = solveNonogram(clues, 3, Infinity);
      expect(sols.length).toBe(bruteCount(3, clues));
      expect(sols.map((x) => x.join(""))).toContain(picture.join(""));
    }
    for (let s = 0; s < 12; s++) {
      const picture = generateSolution(4, `brute-4-${s}`);
      const clues = refClues(picture, 4);
      const sols = solveNonogram(clues, 4, Infinity);
      expect(sols.length).toBe(bruteCount(4, clues));
      expect(new Set(sols.map((x) => x.join(""))).size).toBe(sols.length);
      for (const sol of sols) expect(refSatisfies(sol, 4, clues)).toBe(true);
    }
  });

  it("lineOptions: fully determined, partially determined and contradictory lines", () => {
    // [3] in 3 cells: everything forced filled.
    expect(lineOptions([-1, -1, -1], [3])).toEqual({ fill: [true, true, true], empty: [false, false, false] });
    // [2] in 3 cells: middle cell forced, ends optional.
    expect(lineOptions([-1, -1, -1], [2])).toEqual({ fill: [true, true, true], empty: [true, false, true] });
    // [1,1] in 3 cells: unique placement X.X
    expect(lineOptions([-1, -1, -1], [1, 1])).toEqual({ fill: [true, false, true], empty: [false, true, false] });
    // empty clue: all cells forced empty
    expect(lineOptions([-1, -1], [])).toEqual({ fill: [false, false], empty: [true, true] });
    // known cells prune placements: [2] with the first cell known empty → cells 1,2
    expect(lineOptions([0, -1, -1], [2])).toEqual({ fill: [false, true, true], empty: [true, false, false] });
    // contradiction: a filled cell where the empty clue allows none
    expect(lineOptions([1, -1], [])).toBeNull();
    // contradiction: block too long
    expect(lineOptions([-1, -1], [3])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// lineClue / computeClues — hand-built grids
// ---------------------------------------------------------------------------

describe("lineClue", () => {
  it("matches the reference clue on every 6-cell 0/1 pattern", () => {
    for (let mask = 0; mask < 64; mask++) {
      const line = Array.from({ length: 6 }, (_, i) => (mask >> i) & 1);
      expect(lineClue(line)).toEqual(refClue(line));
    }
  });

  it("treats X-marks (2) as empty, exactly like 0", () => {
    expect(lineClue([1, 2, 1])).toEqual([1, 1]);
    expect(lineClue([2, 2, 2])).toEqual([0]);
    expect(lineClue([2, 1, 1, 2, 0, 1])).toEqual([2, 1]);
  });

  it("empty input → [0]", () => {
    expect(lineClue([])).toEqual([0]);
  });
});

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

  it("X-marks (2) on a player board are ignored in both rows and columns", () => {
    // 2×2 board: r0 = [1, 2], r1 = [2, 1] → rows [1],[1]; cols [1],[1]
    const { rows, cols } = computeClues([1, 2, 2, 1], 2);
    expect(rows).toEqual([[1], [1]]);
    expect(cols).toEqual([[1], [1]]);
  });

  it("agrees with the reference clue on every row/column of generated pictures", () => {
    for (const N of SIZES) {
      for (let s = 0; s < 20; s++) {
        const grid = generateSolution(N, `clue-ref-${N}-${s}`);
        const clues = computeClues(grid, N);
        expect(refSatisfies(grid, N, clues)).toBe(true);
      }
    }
  });
});

describe("cluesEqual", () => {
  it("equal / different length / different content", () => {
    expect(cluesEqual([1, 2], [1, 2])).toBe(true);
    expect(cluesEqual([0], [0])).toBe(true);
    expect(cluesEqual([1, 2], [1, 2, 1])).toBe(false);
    expect(cluesEqual([1, 2], [2, 1])).toBe(false);
    expect(cluesEqual([], [])).toBe(true);
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

  it("null seed (free play) still yields a well-formed picture", () => {
    const grid = generateSolution(5, null);
    expect(grid).toHaveLength(25);
    expect(grid).toContain(1);
    const grid2 = generateSolution(5);
    expect(grid2).toHaveLength(25);
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

  it("never returns an all-empty picture: an empty draw is redrawn from the same stream", () => {
    // An all-empty picture would be "solved" by the untouched board. Force the
    // first N*N draws to be empty through a wrapped Rng and check the redraw.
    const real = makeRng("redraw");
    let calls = 0;
    const fake = { ...real, bool: (p?: number) => (calls++ < 25 ? false : real.bool(p)) };
    const grid = generateSolution(5, fake);
    expect(calls).toBe(50); // one full empty draw, then one real draw
    expect(grid).toHaveLength(25);
    expect(grid).toContain(1);
    // The 25 forced-empty draws never touched the real stream, so the redraw is
    // exactly the picture the seed produces on its own.
    expect(grid).toEqual(generateSolution(5, "redraw"));
  });

  it("N = 0 yields an empty grid without looping", () => {
    expect(generateSolution(0, "zero")).toEqual([]);
  });

  it("every generated picture for every size has at least one filled cell", () => {
    for (const N of SIZES) {
      for (let s = 0; s < 100; s++) expect(generateSolution(N, `nonempty-${N}-${s}`)).toContain(1);
    }
  });
});

// ---------------------------------------------------------------------------
// isSolved — win detection (clue-based)
// ---------------------------------------------------------------------------

describe("isSolved — win detection", () => {
  it("an empty board is NOT a win (assuming non-empty solution)", () => {
    // Updated: the old test used a non-square 10-cell grid; boards are N×N.
    const solution = [1, 0, 1, 0, 1, 0, 1, 0, 1]; // 3×3
    const board = new Array(9).fill(0);
    expect(isSolved(board, solution)).toBe(false);
  });

  it("board exactly matching solution (only filled cells) IS a win", () => {
    // Updated: the old test used a non-square 5-cell grid; boards are N×N.
    const solution = [1, 0, 1, 1];
    const board    = [1, 0, 1, 1];
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
    // explicit N works too
    expect(isSolved(board, grid, 5)).toBe(true);
  });

  it("mismatched lengths returns false", () => {
    expect(isSolved([1, 0], [1, 0, 1])).toBe(false);
  });

  it("non-square grids are never solved", () => {
    expect(isSolved([1, 0, 1], [1, 0, 1])).toBe(false);
    // wrong explicit N
    expect(isSolved([1, 0, 0, 1], [1, 0, 0, 1], 3)).toBe(false);
  });

  it("all-zero solution with all-zero board IS a win (all empty puzzle)", () => {
    const solution = [0, 0, 0, 0];
    const board    = [0, 0, 0, 0];
    expect(isSolved(board, solution)).toBe(true);
  });

  it("ANY filling with the same clues wins, not only the source picture", () => {
    // 2×2 checkerboard: rows [1],[1], cols [1],[1] — two valid fillings.
    const picture = [1, 0, 0, 1];
    const other   = [0, 1, 1, 0];
    expect(isSolved(picture.slice(), picture)).toBe(true);
    expect(isSolved(other, picture)).toBe(true);
    // ...with X-marks on the empty cells as well
    expect(isSolved([2, 1, 1, 2], picture)).toBe(true);
    // 3×3 diagonal vs anti-diagonal: rows/cols all [1]
    const diag = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const anti = [0, 0, 1, 0, 1, 0, 1, 0, 0];
    expect(isSolved(anti, diag)).toBe(true);
    expect(isSolved(diag, anti)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// matchesClues — the component's win check
// ---------------------------------------------------------------------------

describe("matchesClues", () => {
  const checker: NonogramClues = { rows: [[1], [1]], cols: [[1], [1]] };

  it("accepts both fillings of the 2×2 checkerboard", () => {
    expect(matchesClues([1, 0, 0, 1], checker)).toBe(true);
    expect(matchesClues([0, 1, 1, 0], checker)).toBe(true);
    expect(matchesClues([2, 1, 1, 2], checker)).toBe(true);
  });

  it("rejects empty, over-filled and X-blocked boards", () => {
    expect(matchesClues([0, 0, 0, 0], checker)).toBe(false);
    expect(matchesClues([1, 1, 0, 0], checker)).toBe(false);
    expect(matchesClues([1, 1, 1, 1], checker)).toBe(false);
    expect(matchesClues([2, 2, 2, 2], checker)).toBe(false);
    expect(matchesClues([1, 0, 0, 2], checker)).toBe(false);
  });

  it("rejects a board whose rows match but a column does not", () => {
    // rows [2],[0] and cols [1],[1]: [1,1,0,0] matches; rows-only match [1,1,0,0] vs cols [2],[0] fails
    expect(matchesClues([1, 1, 0, 0], { rows: [[2], [0]], cols: [[1], [1]] })).toBe(true);
    expect(matchesClues([1, 1, 0, 0], { rows: [[2], [0]], cols: [[2], [0]] })).toBe(false);
  });

  it("rejects malformed input: wrong board length or ragged clues", () => {
    expect(matchesClues([1, 0, 0], checker)).toBe(false);
    expect(matchesClues([1, 0, 0, 1], { rows: [[1], [1]], cols: [[1]] })).toBe(false);
  });

  it("agrees with the independent reference check on random boards", () => {
    const rng = makeRng("matches-vs-ref");
    for (let t = 0; t < 300; t++) {
      const N = rng.pick([2, 3, 4, 5]);
      const clues = computeClues(generateSolution(N, rng), N);
      const board = Array.from({ length: N * N }, () => rng.int(0, 2));
      expect(matchesClues(board, clues)).toBe(refSatisfies(board.map((v) => (v === 1 ? 1 : 0)), N, clues));
    }
  });
});

// ---------------------------------------------------------------------------
// Solvability sweep: every seed × every size the UI offers
// ---------------------------------------------------------------------------

/** Assert the full contract for one generated puzzle; returns the solver's solution. */
function checkPuzzle(N: number, seed: string | number): { picture: Grid; clues: NonogramClues; solved: number[] } {
  const picture = generateSolution(N, seed);
  const clues = computeClues(picture, N);
  // (a) the clues really derive from the stored picture (reference check) …
  expect(refSatisfies(picture, N, clues)).toBe(true);
  // … so a solution exists by construction, and the module agrees.
  expect(matchesClues(picture, clues)).toBe(true);
  expect(isSolved(picture, picture, N)).toBe(true);
  // An independent solver finds a solution, and the win check accepts it even
  // when it is not the picture (b).
  const sols = solveNonogram(clues, N, 1);
  expect(sols).toHaveLength(1);
  const solved = sols[0];
  expect(refSatisfies(solved, N, clues)).toBe(true);
  expect(matchesClues(solved, clues)).toBe(true);
  expect(isSolved(solved, picture)).toBe(true);
  // (c) the untouched board is never a win (every picture has a filled cell).
  expect(matchesClues(new Array(N * N).fill(0), clues)).toBe(false);
  return { picture, clues, solved };
}

describe("solvability sweep — generated puzzles", () => {
  it("5×5: 500 seeds", () => {
    for (let s = 0; s < 500; s++) checkPuzzle(5, `sweep-5-${s}`);
  });

  it("10×10: 500 seeds", () => {
    for (let s = 0; s < 500; s++) checkPuzzle(10, `sweep-10-${s}`);
  });

  it("15×15: 300 seeds", () => {
    for (let s = 0; s < 300; s++) checkPuzzle(15, `sweep-15-${s}`);
  });

  it("numeric seeds", () => {
    for (const N of SIZES) for (let s = 1; s <= 30; s++) checkPuzzle(N, s * 7919);
  });

  it("Daily Challenge: every date of 2026 and 2027 at the daily 10×10 size", () => {
    for (const year of [2026, 2027]) {
      const dates = datesOfYear(year);
      expect(dates).toHaveLength(365);
      for (const d of dates) checkPuzzle(10, d);
    }
  });

  it("Daily Challenge: date seeds at every size (in case the daily size changes)", () => {
    for (const N of SIZES) for (const d of datesOfYear(2026).slice(0, 40)) checkPuzzle(N, d);
  });
});

// ---------------------------------------------------------------------------
// Multiple solutions are common — the reason the win check must be clue-based
// ---------------------------------------------------------------------------

describe("multiple solutions", () => {
  it("many generated puzzles admit a second solution; every one of them is accepted", () => {
    const stats: Record<number, { total: number; multi: number }> = {};
    for (const N of [5, 10, 15]) {
      stats[N] = { total: 0, multi: 0 };
      for (let s = 0; s < 100; s++) {
        const picture = generateSolution(N, `multi-${N}-${s}`);
        const clues = computeClues(picture, N);
        const sols = solveNonogram(clues, N, 2);
        stats[N].total++;
        expect(sols.length).toBeGreaterThanOrEqual(1);
        if (sols.length === 2) {
          stats[N].multi++;
          expect(sols[0]).not.toEqual(sols[1]);
          for (const sol of sols) {
            expect(refSatisfies(sol, N, clues)).toBe(true);
            expect(matchesClues(sol, clues)).toBe(true);
            expect(isSolved(sol, picture)).toBe(true);
          }
          // At least one of the two differs from the picture: the old
          // picture-comparison win check would have rejected it.
          const alt = sols.find((sol) => sol.some((v, i) => v !== picture[i]))!;
          expect(alt).toBeDefined();
          const pictureCompare = picture.every((v, i) => (v === 1) === (alt[i] === 1));
          expect(pictureCompare).toBe(false);
        }
      }
    }
    // Observed for these fixed seeds: 19/100 (5×5), 34/100 (10×10), 36/100
    // (15×15) puzzles have more than one solution — with a picture-based win
    // check roughly a third of the puzzles could be "solved" without winning.
    expect(stats[5].total).toBe(100);
    expect(stats[5].multi).toBeGreaterThan(10);
    expect(stats[10].multi).toBeGreaterThan(25);
    expect(stats[15].multi).toBeGreaterThan(25);
  });

  it("a solver solution that differs from the picture is accepted for 15×15 too", () => {
    let alternatives = 0;
    for (let s = 0; s < 40; s++) {
      const { picture, clues, solved } = checkPuzzle(15, `alt-15-${s}`);
      if (solved.some((v, i) => v !== picture[i])) {
        alternatives++;
        expect(matchesClues(solved, clues)).toBe(true);
      }
    }
    expect(alternatives).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Wrong / incomplete states are never a win
// ---------------------------------------------------------------------------

describe("wrong and incomplete boards", () => {
  it("toggling any single cell of a solution breaks it (row sum changes)", () => {
    for (const N of SIZES) {
      const picture = generateSolution(N, `toggle-${N}`);
      const clues = computeClues(picture, N);
      for (let i = 0; i < N * N; i++) {
        const board = picture.slice();
        board[i] = board[i] === 1 ? 0 : 1;
        expect(matchesClues(board, clues)).toBe(false);
      }
    }
  });

  it("X-marking a required cell breaks it; X-marking every empty cell does not", () => {
    for (const N of SIZES) {
      const picture = generateSolution(N, `xmark-${N}`);
      const clues = computeClues(picture, N);
      const marked = picture.map((v) => (v === 1 ? 1 : 2));
      expect(matchesClues(marked, clues)).toBe(true);
      const firstFilled = picture.indexOf(1);
      const broken = marked.slice();
      broken[firstFilled] = 2;
      expect(matchesClues(broken, clues)).toBe(false);
    }
  });

  it("a partially filled board (any strict prefix of the picture) is not a win", () => {
    const N = 10;
    const picture = generateSolution(N, "prefix-10");
    const clues = computeClues(picture, N);
    const board = new Array(N * N).fill(0);
    for (let i = 0; i < N * N - 1; i++) {
      board[i] = picture[i];
      if (picture.slice(i + 1).includes(1)) expect(matchesClues(board, clues)).toBe(false);
    }
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
    expect(grid.some((v) => v === 1)).toBe(true);
    expect(isSolved(new Array(N * N).fill(0), grid)).toBe(false);
  });

  it("the component's line-done feedback (cluesEqual on board clues) is clue-based", () => {
    // Row 0 of the checkerboard can be completed by either filling; both dim the clue.
    const clues: NonogramClues = { rows: [[1], [1]], cols: [[1], [1]] };
    for (const board of [[1, 0, 0, 0], [0, 1, 0, 0]]) {
      const got = computeClues(board, 2);
      expect(cluesEqual(got.rows[0], clues.rows[0])).toBe(true);
      expect(cluesEqual(got.rows[1], clues.rows[1])).toBe(false);
    }
    const typed: Clue = [1];
    expect(cluesEqual(typed, clues.rows[0])).toBe(true);
  });
});
