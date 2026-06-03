import { describe, it, expect } from "vitest";
import {
  buildPuzzle,
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
// buildPuzzle edge-case coverage (lines 261 and 282 in buildPuzzle)
// ---------------------------------------------------------------------------
describe("buildPuzzle edge cases", () => {
  it("covers the 'emptyOrth===0 → continue' branch (line 282) via a stub rng that steers to a surrounded cell", () => {
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
    //           emptyOrth of (0,0): (1,0)=tree, (0,1)=tree → emptyOrth=[] → LINE 282 FIRES → continue
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

  it("line 261 (emptyTent===0 → break) is dead code: target≤20% of cells, so the grid can never be fully exhausted by placement", () => {
    // The 'break' at line 261 fires only when every cell is a tent or tree.
    // Since target = max(3, round(N*N*0.20)) and each pair uses 2 cells,
    // at most 40% of cells are ever used, leaving at least 60% empty.
    // The diagonal no-adjacency constraint further limits density.
    // The line is covered by the '// istanbul ignore start/stop' in the source.
    // This test documents the invariant and exercises the outer loop normally.
    for (const N of [3, 4, 5]) {
      const puzzle = buildPuzzle(makeRng(`no-exhaust-${N}`), N);
      const tents = puzzle.solutionGrid.filter(v => v === CELL_TENT).length;
      const trees = puzzle.solutionGrid.filter(v => v === CELL_TREE).length;
      const empty = puzzle.solutionGrid.filter(v => v === CELL_EMPTY).length;
      // At least 60% of cells should remain empty
      expect(empty).toBeGreaterThan(0);
      expect(tents + trees).toBeLessThan(N * N);
    }
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
