import { describe, it, expect } from "vitest";
import {
  goalState,
  isSolved,
  blankPos,
  legalMoves,
  isMovable,
  applyMove,
  countInversions,
  isBoardSolvable,
  generateBoard,
} from "~/games/fifteen";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// goalState
// ---------------------------------------------------------------------------
describe("goalState", () => {
  it("produces 1..N*N-1 then 0 for a 4×4 board", () => {
    const g = goalState(4);
    expect(g).toHaveLength(16);
    for (let i = 0; i < 15; i++) expect(g[i]).toBe(i + 1);
    expect(g[15]).toBe(0);
  });

  it("works for 3×3 and 5×5", () => {
    const g3 = goalState(3);
    expect(g3).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 0]);
    const g5 = goalState(5);
    expect(g5).toHaveLength(25);
    expect(g5[24]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isSolved — win detection
// ---------------------------------------------------------------------------
describe("isSolved", () => {
  it("returns true on the goal arrangement (4×4)", () => {
    expect(isSolved(goalState(4))).toBe(true);
  });

  it("returns true on the goal arrangement (3×3)", () => {
    expect(isSolved(goalState(3))).toBe(true);
  });

  it("returns false when one tile is out of place", () => {
    const g = goalState(4);
    // Swap tiles at index 0 and 1: [2, 1, 3, …]
    [g[0], g[1]] = [g[1], g[0]];
    expect(isSolved(g)).toBe(false);
  });

  it("returns false when blank is not at the last position", () => {
    // Move blank to position 0: [0, 1, 2, ..., 15] — not the goal
    const board = [0, ...Array.from({ length: 15 }, (_, i) => i + 1)];
    expect(isSolved(board)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// blankPos
// ---------------------------------------------------------------------------
describe("blankPos", () => {
  it("locates the blank correctly in the goal state (bottom-right)", () => {
    const { r, c } = blankPos(goalState(4), 4);
    expect(r).toBe(3);
    expect(c).toBe(3);
  });

  it("locates blank at index 0 (top-left)", () => {
    const board = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const { r, c } = blankPos(board, 3);
    expect(r).toBe(0);
    expect(c).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// legalMoves
// ---------------------------------------------------------------------------
describe("legalMoves", () => {
  it("blank at top-left corner has only down and right", () => {
    // Board where blank (0) is at index 0
    const board = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const moves = legalMoves(board, 3);
    expect(moves.sort()).toEqual(["down", "right"]);
  });

  it("blank at bottom-right corner has only up and left", () => {
    expect(legalMoves(goalState(3), 3).sort()).toEqual(["left", "up"]);
  });

  it("blank at center of 3×3 has all four directions", () => {
    // Center index = 4
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    expect(legalMoves(board, 3).sort()).toEqual(["down", "left", "right", "up"]);
  });
});

// ---------------------------------------------------------------------------
// isMovable — only tiles adjacent to blank are movable
// ---------------------------------------------------------------------------
describe("isMovable", () => {
  it("a tile directly above the blank is movable", () => {
    // Blank at index 4 (center of 3×3); tile at 1 is directly above
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    expect(isMovable(board, 3, 1)).toBe(true);
  });

  it("a tile directly below the blank is movable", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    expect(isMovable(board, 3, 7)).toBe(true);
  });

  it("a tile directly left of the blank is movable", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    expect(isMovable(board, 3, 3)).toBe(true);
  });

  it("a tile directly right of the blank is movable", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    expect(isMovable(board, 3, 5)).toBe(true);
  });

  it("a tile two steps away is NOT movable", () => {
    // index 0 is two steps up from blank at index 6 in a 3×3
    const board = [1, 2, 3, 4, 5, 6, 0, 7, 8];
    expect(isMovable(board, 3, 0)).toBe(false);
  });

  it("a tile diagonally adjacent is NOT movable", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    // Diagonal neighbours of blank (index 4): 0, 2, 6, 8
    expect(isMovable(board, 3, 0)).toBe(false);
    expect(isMovable(board, 3, 2)).toBe(false);
    expect(isMovable(board, 3, 6)).toBe(false);
    expect(isMovable(board, 3, 8)).toBe(false);
  });

  it("the blank itself is not movable", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    expect(isMovable(board, 3, 4)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyMove — sliding a movable tile swaps it with blank
// ---------------------------------------------------------------------------
describe("applyMove", () => {
  it("sliding up moves the tile above into the blank", () => {
    // Blank at center (index 4), tile at index 1 (above) slides down into blank
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    const next = applyMove(board, "up", 3);
    expect(next[4]).toBe(2); // tile 2 moved into blank's old spot
    expect(next[1]).toBe(0); // blank moved up
  });

  it("sliding down moves the tile below into the blank", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    const next = applyMove(board, "down", 3);
    expect(next[4]).toBe(7);
    expect(next[7]).toBe(0);
  });

  it("sliding left moves the tile to the left of blank into it", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    const next = applyMove(board, "left", 3);
    expect(next[4]).toBe(4);
    expect(next[3]).toBe(0);
  });

  it("sliding right moves the tile to the right of blank into it", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    const next = applyMove(board, "right", 3);
    expect(next[4]).toBe(5);
    expect(next[5]).toBe(0);
  });

  it("does not mutate the original board", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    const copy = board.slice();
    applyMove(board, "up", 3);
    expect(board).toEqual(copy);
  });

  it("applying a move then its opposite returns the original board", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    const after = applyMove(applyMove(board, "up", 3), "down", 3);
    expect(after).toEqual(board);
  });
});

// ---------------------------------------------------------------------------
// countInversions
// ---------------------------------------------------------------------------
describe("countInversions", () => {
  it("solved board has 0 inversions", () => {
    expect(countInversions(goalState(4))).toBe(0);
  });

  it("counts correctly for a known board", () => {
    // Simple 1×2: [2, 1, 0] — one inversion (2 > 1)
    expect(countInversions([2, 1, 0])).toBe(1);
  });

  it("ignores the blank (0) in inversion count", () => {
    // [1, 0, 2] — no inversion between 1 and 2 (0 is skipped)
    expect(countInversions([1, 0, 2])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isBoardSolvable — known solvable and unsolvable boards
// ---------------------------------------------------------------------------
describe("isBoardSolvable", () => {
  it("solved state is solvable (4×4)", () => {
    expect(isBoardSolvable(goalState(4), 4)).toBe(true);
  });

  it("solved state is solvable (3×3)", () => {
    expect(isBoardSolvable(goalState(3), 3)).toBe(true);
  });

  it("swapping two adjacent tiles of a solved 4×4 board makes it unsolvable", () => {
    const g = goalState(4);
    // Swap tile at index 0 (value 1) and index 1 (value 2)
    [g[0], g[1]] = [g[1], g[0]];
    expect(isBoardSolvable(g, 4)).toBe(false);
  });

  it("swapping two adjacent tiles of a solved 3×3 board makes it unsolvable", () => {
    const g = goalState(3);
    // Swap value 1 (index 0) and value 2 (index 1)
    [g[0], g[1]] = [g[1], g[0]];
    expect(isBoardSolvable(g, 3)).toBe(false);
  });

  it("classic unsolvable 4×4 (last two non-blank tiles swapped): [1..13, 15, 14, 0]", () => {
    // This is the textbook unsolvable starting position
    const board = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 14, 0];
    expect(isBoardSolvable(board, 4)).toBe(false);
  });

  it("a one-move-from-solved board is solvable (4×4)", () => {
    // Slide blank left once from goal state → still solvable
    const board = applyMove(goalState(4), "left", 4);
    expect(isBoardSolvable(board, 4)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateBoard — seeded generation produces valid, solvable, non-trivial boards
// ---------------------------------------------------------------------------
describe("generateBoard", () => {
  it("returns an array of length N*N", () => {
    const board = generateBoard(4, makeRng("test-seed"));
    expect(board).toHaveLength(16);
  });

  it("is a valid permutation of 0..N*N-1 (all values present exactly once)", () => {
    for (let seed = 0; seed < 10; seed++) {
      const board = generateBoard(4, makeRng(`seed-${seed}`));
      const sorted = board.slice().sort((a, b) => a - b);
      expect(sorted).toEqual(Array.from({ length: 16 }, (_, i) => i));
    }
  });

  it("is always SOLVABLE for many different seeds (4×4)", () => {
    const seeds = ["alpha", "beta", "gamma", "delta", 1, 2, 3, 42, 100, "2026-06-03"];
    for (const seed of seeds) {
      const board = generateBoard(4, makeRng(seed));
      expect(isBoardSolvable(board, 4), `board for seed "${seed}" should be solvable`).toBe(true);
    }
  });

  it("is always SOLVABLE for 3×3 with various seeds", () => {
    for (let s = 0; s < 10; s++) {
      const board = generateBoard(3, makeRng(`s${s}`));
      expect(isBoardSolvable(board, 3), `seed s${s}`).toBe(true);
    }
  });

  it("is always SOLVABLE for 5×5 with various seeds", () => {
    for (let s = 0; s < 10; s++) {
      const board = generateBoard(5, makeRng(`s${s}`));
      expect(isBoardSolvable(board, 5), `seed s${s}`).toBe(true);
    }
  });

  it("is deterministic: same seed produces same board", () => {
    const b1 = generateBoard(4, makeRng("deterministic"));
    const b2 = generateBoard(4, makeRng("deterministic"));
    expect(b1).toEqual(b2);
  });

  it("different seeds generally produce different boards", () => {
    const b1 = generateBoard(4, makeRng("seed-A"));
    const b2 = generateBoard(4, makeRng("seed-B"));
    // It is astronomically unlikely they are the same
    expect(b1).not.toEqual(b2);
  });

  it("generated board is not already solved (with overwhelming probability)", () => {
    // With 120+ moves of shuffling, hitting the solved state is essentially impossible.
    let allSolved = true;
    for (let s = 0; s < 20; s++) {
      if (!isSolved(generateBoard(4, makeRng(`s${s}`)))) {
        allSolved = false;
        break;
      }
    }
    expect(allSolved).toBe(false);
  });
});
