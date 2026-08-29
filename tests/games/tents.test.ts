import { describe, it, expect } from "vitest";
import {
  buildPuzzle,
  tentTarget,
  MAX_PLACEMENT_ROUNDS,
  validateBoard,
  isWin,
  bipartiteMatch,
  cellIdx,
  inBounds,
  CELL_EMPTY,
  CELL_TREE,
  CELL_TENT,
  CELL_GRASS,
  ORTH,
  DIAG8,
} from "~/games/tents";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Helper: rebuild solution board from a puzzle (tents restored)
// ---------------------------------------------------------------------------
function solutionBoard(puzzle: ReturnType<typeof buildPuzzle>): number[] {
  return puzzle.solutionGrid;
}

// ---------------------------------------------------------------------------
// Independent reference solver — written from the rules as shown to the player
// and deliberately NOT reusing the module's helpers:
//   * every tree is paired 1:1 with an orthogonally adjacent tent
//   * tents never touch, not even diagonally
//   * row / column tent counts equal the clues
//   * tents only on empty cells
// Returns up to `limit` distinct tent layouts (each a sorted list of cell
// indices). Trees are assigned one at a time, most-constrained tree first.
// ---------------------------------------------------------------------------
const O4 = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
const A8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] as const;

function solveTents(
  grid: number[],
  rowClues: number[],
  colClues: number[],
  N: number,
  limit = 2,
): number[][] {
  const trees: number[] = [];
  for (let i = 0; i < N * N; i++) if (grid[i] === CELL_TREE) trees.push(i);
  const tent = new Array<boolean>(N * N).fill(false);
  const rowUsed = new Array<number>(N).fill(0);
  const colUsed = new Array<number>(N).fill(0);
  const assigned = new Array<boolean>(trees.length).fill(false);
  const found: number[][] = [];
  const seen = new Set<string>();

  function candidates(t: number): number[] {
    const r = Math.floor(trees[t] / N), c = trees[t] % N;
    const out: number[] = [];
    for (const [dr, dc] of O4) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      const i = nr * N + nc;
      if (grid[i] === CELL_TREE || tent[i]) continue;
      if (rowUsed[nr] >= rowClues[nr] || colUsed[nc] >= colClues[nc]) continue;
      let touching = false;
      for (const [er, ec] of A8) {
        const ar = nr + er, ac = nc + ec;
        if (ar < 0 || ar >= N || ac < 0 || ac >= N) continue;
        if (tent[ar * N + ac]) { touching = true; break; }
      }
      if (!touching) out.push(i);
    }
    return out;
  }

  // Returns true once `limit` layouts have been collected (stop searching).
  function search(): boolean {
    let best = -1;
    let bestCands: number[] = [];
    for (let t = 0; t < trees.length; t++) {
      if (assigned[t]) continue;
      const cs = candidates(t);
      if (cs.length === 0) return false;
      if (best === -1 || cs.length < bestCands.length) { best = t; bestCands = cs; }
    }
    if (best === -1) {
      for (let r = 0; r < N; r++) if (rowUsed[r] !== rowClues[r]) return false;
      for (let c = 0; c < N; c++) if (colUsed[c] !== colClues[c]) return false;
      const layout: number[] = [];
      for (let i = 0; i < N * N; i++) if (tent[i]) layout.push(i);
      const key = layout.join(",");
      if (!seen.has(key)) { seen.add(key); found.push(layout); }
      return found.length >= limit;
    }
    assigned[best] = true;
    for (const i of bestCands) {
      const r = Math.floor(i / N), c = i % N;
      tent[i] = true; rowUsed[r]++; colUsed[c]++;
      const done = search();
      tent[i] = false; rowUsed[r]--; colUsed[c]--;
      if (done) { assigned[best] = false; return true; }
    }
    assigned[best] = false;
    return false;
  }

  search();
  return found;
}

/** Player board with the given tent layout applied. */
function withTents(playerGrid: number[], layout: number[]): number[] {
  const board = playerGrid.slice();
  for (const i of layout) board[i] = CELL_TENT;
  return board;
}

/** Same layout as a sorted index list, for comparing tent sets. */
function tentLayout(board: number[]): number[] {
  const out: number[] = [];
  board.forEach((v, i) => { if (v === CELL_TENT) out.push(i); });
  return out;
}

// ---------------------------------------------------------------------------
// cellIdx / inBounds
// ---------------------------------------------------------------------------
describe("cellIdx / inBounds", () => {
  it("maps (r,c) to flat index correctly", () => {
    expect(cellIdx(0, 0, 8)).toBe(0);
    expect(cellIdx(1, 0, 8)).toBe(8);
    expect(cellIdx(2, 3, 8)).toBe(19);
    expect(cellIdx(7, 7, 8)).toBe(63);
  });

  it("inBounds returns false outside grid", () => {
    expect(inBounds(-1, 0, 8)).toBe(false);
    expect(inBounds(0, -1, 8)).toBe(false);
    expect(inBounds(8, 0, 8)).toBe(false);
    expect(inBounds(0, 8, 8)).toBe(false);
  });

  it("inBounds returns true for all interior cells", () => {
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        expect(inBounds(r, c, 8)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Solution invariants across several seeds
// ---------------------------------------------------------------------------
describe("buildPuzzle — solution invariants", () => {
  const SEEDS = ["seed-a", "seed-b", "seed-c", "2026-01-01", "tents-42", 99, 0];
  const SIZES = [6, 8, 10];

  for (const seed of SEEDS) {
    for (const N of SIZES) {
      describe(`seed=${seed}, N=${N}`, () => {
        const puzzle = buildPuzzle(makeRng(seed), N);
        const sol = solutionBoard(puzzle);

        it("solution grid has length N*N", () => {
          expect(sol.length).toBe(N * N);
        });

        it("equal number of tents and trees", () => {
          const tents = sol.filter(v => v === CELL_TENT).length;
          const trees = sol.filter(v => v === CELL_TREE).length;
          expect(tents).toBe(trees);
          expect(tents).toBeGreaterThan(0);
        });

        it("row clues match solution tent counts", () => {
          for (let r = 0; r < N; r++) {
            let count = 0;
            for (let c = 0; c < N; c++)
              if (sol[cellIdx(r, c, N)] === CELL_TENT) count++;
            expect(count).toBe(puzzle.rowClues[r]);
          }
        });

        it("col clues match solution tent counts", () => {
          for (let c = 0; c < N; c++) {
            let count = 0;
            for (let r = 0; r < N; r++)
              if (sol[cellIdx(r, c, N)] === CELL_TENT) count++;
            expect(count).toBe(puzzle.colClues[c]);
          }
        });

        it("no two tents are 8-directionally adjacent", () => {
          for (let i = 0; i < N * N; i++) {
            if (sol[i] !== CELL_TENT) continue;
            const r = Math.floor(i / N), c = i % N;
            for (const [dr, dc] of DIAG8) {
              const nr = r + dr, nc = c + dc;
              if (!inBounds(nr, nc, N)) continue;
              expect(sol[cellIdx(nr, nc, N)]).not.toBe(CELL_TENT);
            }
          }
        });

        it("every tent is orthogonally adjacent to at least one tree", () => {
          for (let i = 0; i < N * N; i++) {
            if (sol[i] !== CELL_TENT) continue;
            const r = Math.floor(i / N), c = i % N;
            let hasTree = false;
            for (const [dr, dc] of ORTH) {
              const nr = r + dr, nc = c + dc;
              if (!inBounds(nr, nc, N)) continue;
              if (sol[cellIdx(nr, nc, N)] === CELL_TREE) { hasTree = true; break; }
            }
            expect(hasTree).toBe(true);
          }
        });

        it("bipartite matching holds on solution tents and trees", () => {
          const tentCells = sol.map((v, i) => v === CELL_TENT ? i : -1).filter(i => i >= 0);
          const treeCells = sol.map((v, i) => v === CELL_TREE ? i : -1).filter(i => i >= 0);
          expect(bipartiteMatch(tentCells, treeCells, N)).toBe(true);
        });

        it("playerGrid has no tents (only trees and empty)", () => {
          expect(puzzle.playerGrid.every(v => v !== CELL_TENT)).toBe(true);
        });

        it("playerGrid trees match solution trees", () => {
          for (let i = 0; i < N * N; i++) {
            if (sol[i] === CELL_TREE) {
              expect(puzzle.playerGrid[i]).toBe(CELL_TREE);
            }
            if (sol[i] === CELL_TENT) {
              expect(puzzle.playerGrid[i]).toBe(CELL_EMPTY);
            }
          }
        });
      });
    }
  }
});

// ---------------------------------------------------------------------------
// validateBoard
// ---------------------------------------------------------------------------
describe("validateBoard", () => {
  it("accepts the solved board", () => {
    const puzzle = buildPuzzle(makeRng("validate-ok"), 8);
    const { valid } = validateBoard(puzzle.solutionGrid, puzzle.rowClues, puzzle.colClues, 8);
    expect(valid).toBe(true);
  });

  it("rejects an empty board", () => {
    const puzzle = buildPuzzle(makeRng("validate-empty"), 6);
    const board = puzzle.playerGrid.slice(); // no tents
    const { valid, errors } = validateBoard(board, puzzle.rowClues, puzzle.colClues, 6);
    expect(valid).toBe(false);
    expect(errors.some(e => e.kind === "empty-board")).toBe(true);
  });

  it("reports count-mismatch when number of tents differs from number of trees", () => {
    const N = 6;
    const board = new Array<number>(N * N).fill(CELL_EMPTY);
    // Place 2 tents but only 1 tree (mismatch: 2 ≠ 1)
    board[cellIdx(0, 0, N)] = CELL_TENT;
    board[cellIdx(2, 2, N)] = CELL_TENT;
    board[cellIdx(0, 1, N)] = CELL_TREE; // only one tree
    const rowClues = new Array<number>(N).fill(0);
    rowClues[0] = 2;
    const colClues = new Array<number>(N).fill(0);
    colClues[0] = 1;
    colClues[2] = 1;
    const { valid, errors } = validateBoard(board, rowClues, colClues, N);
    expect(valid).toBe(false);
    expect(errors.some(e => e.kind === "count-mismatch")).toBe(true);
  });

  it("rejects a board with two orthogonally-adjacent tents", () => {
    const N = 6;
    // Build a board with two tents side by side at (0,0) and (0,1) and a dummy tree somewhere
    const board = new Array<number>(N * N).fill(CELL_EMPTY);
    board[cellIdx(0, 0, N)] = CELL_TENT;
    board[cellIdx(0, 1, N)] = CELL_TENT;
    board[cellIdx(1, 0, N)] = CELL_TREE;
    board[cellIdx(1, 1, N)] = CELL_TREE;
    // Row clues that allow 2 tents in row 0
    const rowClues = new Array<number>(N).fill(0);
    rowClues[0] = 2;
    const colClues = new Array<number>(N).fill(0);
    colClues[0] = 1;
    colClues[1] = 1;
    const { valid, errors } = validateBoard(board, rowClues, colClues, N);
    expect(valid).toBe(false);
    expect(errors.some(e => e.kind === "diagonal-tent")).toBe(true);
  });

  it("rejects a board with two diagonally-adjacent tents", () => {
    const N = 6;
    const board = new Array<number>(N * N).fill(CELL_EMPTY);
    board[cellIdx(0, 0, N)] = CELL_TENT;
    board[cellIdx(1, 1, N)] = CELL_TENT;
    board[cellIdx(0, 1, N)] = CELL_TREE; // tree adjacent to tent@(0,0)
    board[cellIdx(1, 0, N)] = CELL_TREE; // tree adjacent to tent@(1,1)
    const rowClues = new Array<number>(N).fill(0);
    rowClues[0] = 1;
    rowClues[1] = 1;
    const colClues = new Array<number>(N).fill(0);
    colClues[0] = 1;
    colClues[1] = 1;
    const { valid, errors } = validateBoard(board, rowClues, colClues, N);
    expect(valid).toBe(false);
    expect(errors.some(e => e.kind === "diagonal-tent")).toBe(true);
  });

  it("rejects a board with wrong row count", () => {
    const puzzle = buildPuzzle(makeRng("validate-rowcount"), 8);
    // Clue says more tents in row 0 than actually placed
    const wrongRowClues = [...puzzle.rowClues];
    wrongRowClues[0] = wrongRowClues[0] + 1; // inflate one row clue
    const { valid, errors } = validateBoard(
      puzzle.solutionGrid,
      wrongRowClues,
      puzzle.colClues,
      8,
    );
    expect(valid).toBe(false);
    expect(errors.some(e => e.kind === "row-count")).toBe(true);
  });

  it("rejects a board with wrong col count", () => {
    const puzzle = buildPuzzle(makeRng("validate-colcount"), 8);
    const wrongColClues = [...puzzle.colClues];
    wrongColClues[0] = wrongColClues[0] + 1;
    const { valid, errors } = validateBoard(
      puzzle.solutionGrid,
      puzzle.rowClues,
      wrongColClues,
      8,
    );
    expect(valid).toBe(false);
    expect(errors.some(e => e.kind === "col-count")).toBe(true);
  });

  it("rejects a tent with no adjacent tree", () => {
    const N = 6;
    const board = new Array<number>(N * N).fill(CELL_EMPTY);
    // Place a tent in the middle with no tree neighbours
    board[cellIdx(3, 3, N)] = CELL_TENT;
    // Place matching tree far away with no adjacency to this tent
    board[cellIdx(0, 0, N)] = CELL_TREE;
    const rowClues = new Array<number>(N).fill(0);
    rowClues[3] = 1;
    const colClues = new Array<number>(N).fill(0);
    colClues[3] = 1;
    const { valid, errors } = validateBoard(board, rowClues, colClues, N);
    expect(valid).toBe(false);
    expect(errors.some(e => e.kind === "no-adjacent-tree")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isWin
// ---------------------------------------------------------------------------
describe("isWin", () => {
  it("returns true for the generated solution", () => {
    for (const seed of ["win-a", "win-b", "win-c", 123]) {
      const puzzle = buildPuzzle(makeRng(seed), 8);
      expect(isWin(puzzle.solutionGrid, puzzle.rowClues, puzzle.colClues, 8)).toBe(true);
    }
  });

  it("returns false for the player start board (no tents)", () => {
    const puzzle = buildPuzzle(makeRng("iswin-start"), 8);
    expect(isWin(puzzle.playerGrid, puzzle.rowClues, puzzle.colClues, 8)).toBe(false);
  });

  it("returns false when two tents are diagonally adjacent", () => {
    const N = 6;
    const board = new Array<number>(N * N).fill(CELL_EMPTY);
    board[cellIdx(0, 0, N)] = CELL_TENT;
    board[cellIdx(1, 1, N)] = CELL_TENT;
    board[cellIdx(0, 1, N)] = CELL_TREE;
    board[cellIdx(1, 0, N)] = CELL_TREE;
    const rowClues = new Array<number>(N).fill(0);
    rowClues[0] = 1; rowClues[1] = 1;
    const colClues = new Array<number>(N).fill(0);
    colClues[0] = 1; colClues[1] = 1;
    expect(isWin(board, rowClues, colClues, N)).toBe(false);
  });

  it("returns false when row counts are violated", () => {
    const puzzle = buildPuzzle(makeRng("iswin-rowvio"), 8);
    const wrongRow = [...puzzle.rowClues];
    wrongRow[0] += 1;
    expect(isWin(puzzle.solutionGrid, wrongRow, puzzle.colClues, 8)).toBe(false);
  });

  it("returns false when col counts are violated", () => {
    const puzzle = buildPuzzle(makeRng("iswin-colvio"), 8);
    const wrongCol = [...puzzle.colClues];
    wrongCol[0] += 1;
    expect(isWin(puzzle.solutionGrid, puzzle.rowClues, wrongCol, 8)).toBe(false);
  });

  it("returns false when a tent has no adjacent tree", () => {
    const N = 6;
    const board = new Array<number>(N * N).fill(CELL_EMPTY);
    board[cellIdx(3, 3, N)] = CELL_TENT;
    board[cellIdx(0, 0, N)] = CELL_TREE;
    const rowClues = new Array<number>(N).fill(0);
    rowClues[3] = 1;
    const colClues = new Array<number>(N).fill(0);
    colClues[3] = 1;
    expect(isWin(board, rowClues, colClues, N)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// bipartiteMatch
// ---------------------------------------------------------------------------
describe("bipartiteMatch", () => {
  it("returns true for a trivial 1-to-1 adjacent pair", () => {
    // Tent at cell 0, tree at cell 1 in a 4×4 grid (adjacent)
    expect(bipartiteMatch([0], [1], 4)).toBe(true);
  });

  it("returns false when tent count != tree count", () => {
    expect(bipartiteMatch([0, 1], [4], 4)).toBe(false);
  });

  it("returns true for empty inputs", () => {
    expect(bipartiteMatch([], [], 4)).toBe(true);
  });

  it("returns false when tent has no adjacent tree", () => {
    // Tent at 0, tree at 15 (far corner, no adjacency)
    expect(bipartiteMatch([0], [15], 4)).toBe(false);
  });

  it("handles a 2-tent case requiring augmentation", () => {
    // 4×4 grid: tent@(0,0)=cell0, tent@(0,2)=cell2
    // tree@(0,1)=cell1 is adjacent to both
    // tree@(1,2)=cell6 is adjacent only to tent@(0,2)
    // Matching requires augmenting: tent0→tree1, tent2→tree6
    expect(bipartiteMatch([0, 2], [1, 6], 4)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Determinism — same seed yields identical puzzle
// ---------------------------------------------------------------------------
describe("determinism", () => {
  it("same seed produces identical puzzles", () => {
    const p1 = buildPuzzle(makeRng("determinism-42"), 8);
    const p2 = buildPuzzle(makeRng("determinism-42"), 8);
    expect(p1.playerGrid).toEqual(p2.playerGrid);
    expect(p1.solutionGrid).toEqual(p2.solutionGrid);
    expect(p1.rowClues).toEqual(p2.rowClues);
    expect(p1.colClues).toEqual(p2.colClues);
  });

  it("different seeds produce different puzzles (with overwhelming probability)", () => {
    const p1 = buildPuzzle(makeRng("seed-x"), 8);
    const p2 = buildPuzzle(makeRng("seed-y"), 8);
    // At least clues or grids should differ
    const same =
      p1.solutionGrid.every((v, i) => v === p2.solutionGrid[i]) &&
      p1.rowClues.every((v, i) => v === p2.rowClues[i]) &&
      p1.colClues.every((v, i) => v === p2.colClues[i]);
    expect(same).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildPuzzle edge cases: greedy-round dead ends, unreachable targets, bad sizes
// ---------------------------------------------------------------------------
describe("buildPuzzle edge cases", () => {
  it("covers the 'emptyOrth.length === 0 → continue' branch via a stub rng that steers to a surrounded cell", () => {
    // We need a tent candidate whose ALL orthogonal neighbours are non-empty.
    //
    // Strategy for N=3 (cells 0-8, row-major):
    //   (0,0)=0  (0,1)=1  (0,2)=2
    //   (1,0)=3  (1,1)=4  (1,2)=5
    //   (2,0)=6  (2,1)=7  (2,2)=8
    //
    // Desired pick sequence:
    //   call 1: from emptyTent=[0..8] → idx 2 → cell 2 = (0,2) as tent
    //   call 2: from emptyOrth of (0,2) = [[1,2],[0,1]] (ORTH order) → idx 1 → [0,1] → tree at (0,1)
    //           grid[2]=tent, grid[1]=tree; placed=1
    //   call 3: from emptyTent=[0,3,4,5,6,7,8] → idx 4 → cell 6 = (2,0) as tent
    //   call 4: from emptyOrth of (2,0) = [[1,0],[2,1]] → idx 0 → [1,0] → tree at (1,0)
    //           grid[6]=tent, grid[3]=tree; placed=2
    //   call 5: from emptyTent=[0,4,5,7,8] → idx 0 → cell 0 = (0,0) as tent candidate
    //           emptyOrth of (0,0): (1,0)=tree, (0,1)=tree → emptyOrth=[] → the continue branch fires
    const pickSequence = [2, 1, 4, 0, 0]; // per-call desired index into arr
    let callIdx = 0;
    const stubRng: import("~/utils/rng").Rng = {
      next: () => 0.5,
      int: (min, max) => min + Math.floor(0.5 * (max - min + 1)),
      float: (min, max) => min + 0.5 * (max - min),
      bool: () => false,
      pick: <T>(arr: T[]): T => {
        const seqIdx = callIdx < pickSequence.length ? pickSequence[callIdx] : 0;
        callIdx++;
        return arr[Math.min(seqIdx, arr.length - 1)];
      },
      shuffle: <T>(arr: T[]): T[] => arr,
    };

    // buildPuzzle should run without error; the important thing is that the
    // "emptyOrth.length === 0 → continue" branch is hit internally.
    const puzzle = buildPuzzle(stubRng, 3);
    expect(puzzle.N).toBe(3);
    expect(puzzle.playerGrid).toHaveLength(9);
    // At least 2 placements should have been made (from our designed sequence)
    const tents = puzzle.solutionGrid.filter(v => v === CELL_TENT).length;
    expect(tents).toBeGreaterThanOrEqual(2);
  });

  it("never exhausts the grid: a pair uses 2 cells and 2·target < N·N for N ≥ 3", () => {
    // Invariant behind placeTents picking from the empty-cell list without an
    // emptiness guard (the former dead `emptyTent.length === 0` guard was
    // removed): target = max(3, round(N*N*0.20)), so at most 6 cells (N ≤ 3)
    // or 40% of cells are ever consumed. Exercised on the smallest sizes where
    // the fixed minimum of 3 pairs is proportionally the largest.
    for (const N of [3, 4, 5]) {
      expect(2 * tentTarget(N)).toBeLessThan(N * N);
      const puzzle = buildPuzzle(makeRng(`no-exhaust-${N}`), N);
      const tents = puzzle.solutionGrid.filter(v => v === CELL_TENT).length;
      const trees = puzzle.solutionGrid.filter(v => v === CELL_TREE).length;
      const empty = puzzle.solutionGrid.filter(v => v === CELL_EMPTY).length;
      expect(empty).toBeGreaterThan(0);
      expect(tents + trees).toBeLessThan(N * N);
    }
  });

  it("2×2: the target is unreachable, so every round is tried and the densest board (1 pair) is kept", () => {
    // After the first pair the two remaining cells both touch the tent, so no
    // round can place more than one pair; rounds 2..MAX_PLACEMENT_ROUNDS are
    // never better than round 1 and the loop runs to its bound.
    const puzzle = buildPuzzle(makeRng("tiny"), 2);
    expect(tentTarget(2)).toBe(3);
    expect(puzzle.solutionGrid.filter(v => v === CELL_TENT).length).toBe(1);
    expect(puzzle.solutionGrid.filter(v => v === CELL_TREE).length).toBe(1);
    expect(isWin(puzzle.solutionGrid, puzzle.rowClues, puzzle.colClues, 2)).toBe(true);
    expect(MAX_PLACEMENT_ROUNDS).toBeGreaterThan(4); // measured worst case is 4 rounds
  });

  it("refuses grids smaller than 2×2 instead of returning an empty puzzle", () => {
    expect(() => buildPuzzle(makeRng("x"), 1)).toThrow(RangeError);
    expect(() => buildPuzzle(makeRng("x"), 0)).toThrow(RangeError);
  });

  it("retries a greedy round that dead-ends short of the target (seed 161, 6×6 used to yield 4 of 7 tents)", () => {
    // Before the bounded retry loop this seed produced a thin 4-tent board
    // because the greedy walk painted itself into a corner.
    const puzzle = buildPuzzle(makeRng(161), 6);
    expect(puzzle.solutionGrid.filter(v => v === CELL_TENT).length).toBe(tentTarget(6));
    expect(isWin(puzzle.solutionGrid, puzzle.rowClues, puzzle.colClues, 6)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tentTarget
// ---------------------------------------------------------------------------
describe("tentTarget", () => {
  it("is ~20% of the cells with a floor of 3", () => {
    expect(tentTarget(2)).toBe(3);
    expect(tentTarget(3)).toBe(3);
    expect(tentTarget(6)).toBe(7);
    expect(tentTarget(8)).toBe(13);
    expect(tentTarget(10)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Mass check with the independent solver: every seed × every size the UI
// offers (簡單 6, 普通 8, 困難 10) plus daily "YYYY-MM-DD" seeds (daily mode
// always uses 8×8).
// ---------------------------------------------------------------------------
describe("every generated puzzle is solvable and the win check validates the rules", () => {
  const UI_SIZES = [6, 8, 10];
  const SEEDS: (string | number)[] = [];
  for (let i = 0; i < 300; i++) SEEDS.push(i);
  for (let i = 0; i < 60; i++) SEEDS.push(`tents-${i}`);
  const DAILY: string[] = [];
  for (let d = 0; d < 730; d++) {
    DAILY.push(new Date(Date.UTC(2026, 0, 1) + d * 86400000).toISOString().slice(0, 10));
  }
  const CASES: [string | number, number][] = [];
  for (const N of UI_SIZES) for (const seed of SEEDS) CASES.push([seed, N]);
  for (const seed of DAILY) CASES.push([seed, 8]);

  /** Cells that are empty in the player grid and not orthogonally next to any tree. */
  function cellsFarFromTrees(playerGrid: number[], N: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < N * N; i++) {
      if (playerGrid[i] !== CELL_EMPTY) continue;
      const r = Math.floor(i / N), c = i % N;
      const nearTree = O4.some(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        return nr >= 0 && nr < N && nc >= 0 && nc < N && playerGrid[nr * N + nc] === CELL_TREE;
      });
      if (!nearTree) out.push(i);
    }
    return out;
  }

  it(`(${CASES.length} puzzles) has a solution, reaches the tent target, and clues match the stored solution`, () => {
    let multiSolution = 0;
    let alternativeAccepted = 0;
    for (const [seed, N] of CASES) {
      const p = buildPuzzle(makeRng(seed), N);
      const label = `seed=${seed} N=${N}`;

      // (d) never degenerate: exactly the target number of pairs, trees fixed in the player grid
      const trees = p.solutionGrid.filter(v => v === CELL_TREE).length;
      const tents = p.solutionGrid.filter(v => v === CELL_TENT).length;
      expect(p.N, label).toBe(N);
      expect(p.playerGrid.length, label).toBe(N * N);
      expect(tents, label).toBe(tentTarget(N));
      expect(trees, label).toBe(tents);
      expect(p.playerGrid.some(v => v === CELL_TENT), label).toBe(false);
      p.solutionGrid.forEach((v, i) => {
        expect(p.playerGrid[i], label).toBe(v === CELL_TENT ? CELL_EMPTY : v);
      });

      // (c) clues are consistent with the stored solution
      for (let r = 0; r < N; r++) {
        let count = 0;
        for (let c = 0; c < N; c++) if (p.solutionGrid[r * N + c] === CELL_TENT) count++;
        expect(p.rowClues[r], label).toBe(count);
      }
      for (let c = 0; c < N; c++) {
        let count = 0;
        for (let r = 0; r < N; r++) if (p.solutionGrid[r * N + c] === CELL_TENT) count++;
        expect(p.colClues[c], label).toBe(count);
      }
      expect(p.rowClues.reduce((a, b) => a + b, 0), label).toBe(trees);
      expect(p.colClues.reduce((a, b) => a + b, 0), label).toBe(trees);

      // (a) the independent solver finds a valid solution
      const solutions = solveTents(p.playerGrid, p.rowClues, p.colClues, N, 2);
      expect(solutions.length, label).toBeGreaterThan(0);
      if (solutions.length > 1) multiSolution++;

      // (b) the win check accepts the stored solution AND every independently found one
      expect(isWin(p.solutionGrid, p.rowClues, p.colClues, N), label).toBe(true);
      const stored = tentLayout(p.solutionGrid).join(",");
      for (const layout of solutions) {
        expect(isWin(withTents(p.playerGrid, layout), p.rowClues, p.colClues, N), label).toBe(true);
        if (layout.join(",") !== stored) alternativeAccepted++;
      }

      // (b) ...and rejects wrong / incomplete states
      expect(isWin(p.playerGrid, p.rowClues, p.colClues, N), label).toBe(false);
      const firstTent = p.solutionGrid.indexOf(CELL_TENT);
      const missingOne = p.solutionGrid.slice();
      missingOne[firstTent] = CELL_EMPTY;
      expect(isWin(missingOne, p.rowClues, p.colClues, N), label).toBe(false);
      const far = cellsFarFromTrees(p.playerGrid, N);
      expect(far.length, label).toBeGreaterThan(0);
      const movedAway = missingOne.slice();
      movedAway[far[0]] = CELL_TENT; // right count, but a tent with no tree beside it
      expect(isWin(movedAway, p.rowClues, p.colClues, N), label).toBe(false);
      const extra = p.solutionGrid.slice();
      extra[far[0]] = CELL_TENT;
      expect(isWin(extra, p.rowClues, p.colClues, N), label).toBe(false);
      const grassOnly = p.playerGrid.map(v => (v === CELL_EMPTY ? CELL_GRASS : v));
      expect(isWin(grassOnly, p.rowClues, p.colClues, N), label).toBe(false);
    }
    // Tents puzzles routinely admit several tent layouts (about a fifth of the
    // sample); the win check must judge the rules, not identity with the
    // stored solution — the sample must contain such cases for (b) to bite.
    expect(multiSolution).toBeGreaterThan(0);
    expect(alternativeAccepted).toBeGreaterThan(0);
  });

  it("the reference solver itself enforces each rule on hand-built 4×4 boards", () => {
    const N = 4;
    const board = (...trees: [number, number][]) => {
      const g = new Array<number>(N * N).fill(CELL_EMPTY);
      for (const [r, c] of trees) g[cellIdx(r, c, N)] = CELL_TREE;
      return g;
    };
    // Tents below each tree: (1,0) and (1,2) do not touch → exactly one layout.
    expect(solveTents(board([0, 0], [0, 2]), [0, 2, 0, 0], [1, 0, 1, 0], N))
      .toEqual([[cellIdx(1, 0, N), cellIdx(1, 2, N)]]);
    // Clues force (1,0) and (1,1), which touch orthogonally → no layout.
    expect(solveTents(board([0, 0], [2, 1]), [0, 2, 0, 0], [1, 1, 0, 0], N)).toEqual([]);
    // Clues force (1,0) and (2,1), which touch diagonally → no layout.
    expect(solveTents(board([0, 0], [2, 2]), [0, 1, 1, 0], [1, 1, 0, 0], N)).toEqual([]);
    // Clues ask for tents in columns with no tree beside them → no layout.
    expect(solveTents(board([0, 0], [0, 2]), [0, 2, 0, 0], [0, 0, 1, 1], N)).toEqual([]);
    // Stacked trees with a tent on either side admit two mirror layouts:
    // {(1,0),(2,2)} and {(1,2),(2,0)}; the same-side pairs would touch.
    expect(solveTents(board([1, 1], [2, 1]), [0, 1, 1, 0], [1, 0, 1, 0], N)).toEqual([
      [cellIdx(1, 0, N), cellIdx(2, 2, N)],
      [cellIdx(1, 2, N), cellIdx(2, 0, N)],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Grass cells don't interfere with win detection
// ---------------------------------------------------------------------------
describe("grass cells", () => {
  it("grass marks are ignored (treated as empty) by win detection", () => {
    const puzzle = buildPuzzle(makeRng("grass-seed"), 8);
    // Add some grass marks to the solution board; should still be a win
    const boardWithGrass = puzzle.solutionGrid.map(v =>
      v === CELL_EMPTY ? CELL_GRASS : v,
    );
    // isWin only checks CELL_TENT (2) and CELL_TREE (1), not CELL_GRASS (3)
    // So we expect the result to still be true
    expect(isWin(boardWithGrass, puzzle.rowClues, puzzle.colClues, 8)).toBe(true);
  });
});
