import { describe, it, expect } from "vitest";
import { makeRng } from "~/utils/rng";
import {
  PALETTE,
  SIZES,
  LIMITS,
  generateBoard,
  getRegion,
  applyPick,
  isWon,
} from "~/games/flood";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Build a flat board from a 2-D array of colour indices. */
function gridOf(rows: number[][]): number[] {
  return rows.flat();
}

/** Count cells that are in the controlled region (value 1 in the Uint8Array). */
function regionSize(region: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < region.length; i++) if (region[i] === 1) n++;
  return n;
}

// ---------------------------------------------------------------------------
// PALETTE & constants
// ---------------------------------------------------------------------------

describe("module constants", () => {
  it("exports exactly 6 palette colours", () => {
    expect(PALETTE).toHaveLength(6);
  });

  it("every palette entry is a hex colour string", () => {
    for (const c of PALETTE) {
      expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("exports SIZES array [10, 14, 18]", () => {
    expect(SIZES).toEqual([10, 14, 18]);
  });

  it("exports LIMITS with correct step caps", () => {
    expect(LIMITS[10]).toBe(20);
    expect(LIMITS[14]).toBe(25);
    expect(LIMITS[18]).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// generateBoard
// ---------------------------------------------------------------------------

describe("generateBoard", () => {
  it("produces a flat array of size × size cells", () => {
    for (const s of [10, 14, 18] as const) {
      expect(generateBoard(s, "seed")).toHaveLength(s * s);
    }
  });

  it("every cell is a valid palette index (0–5)", () => {
    const board = generateBoard(14, "test");
    for (const c of board) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(PALETTE.length - 1);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = generateBoard(10, "hello");
    const b = generateBoard(10, "hello");
    expect(a).toEqual(b);
  });

  it("differs for different seeds", () => {
    const a = generateBoard(10, "seed-A");
    const b = generateBoard(10, "seed-B");
    // Astronomically unlikely to be equal for distinct seeds.
    expect(a).not.toEqual(b);
  });

  it("accepts an Rng object instead of a seed string", () => {
    const rng = makeRng("rng-test");
    const board = generateBoard(10, rng);
    expect(board).toHaveLength(100);
  });

  it("null seed produces a valid (non-deterministic) board", () => {
    const board = generateBoard(10, null);
    expect(board).toHaveLength(100);
    for (const c of board) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(5);
    }
  });
});

// ---------------------------------------------------------------------------
// getRegion  — hand-built 3×3 grids
// ---------------------------------------------------------------------------
//
// Grid notation: cells are labelled by (row, col), 0-indexed.
// The controlled region always starts at cell (0,0) = index 0.

describe("getRegion", () => {
  it("entire board is one colour → all cells are in the region", () => {
    // 3×3, all colour 2
    const board = gridOf([
      [2, 2, 2],
      [2, 2, 2],
      [2, 2, 2],
    ]);
    const region = getRegion(board, 3);
    expect(regionSize(region)).toBe(9);
    for (let i = 0; i < 9; i++) expect(region[i]).toBe(1);
  });

  it("only (0,0) connected → region size 1 when all neighbours differ", () => {
    // (0,0) = colour 0; all neighbours are colour 1
    const board = gridOf([
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ]);
    const region = getRegion(board, 3);
    expect(regionSize(region)).toBe(1);
    expect(region[0]).toBe(1); // only top-left
  });

  it("L-shaped region connected to (0,0)", () => {
    // Colour 0 occupies the entire top row + left column:
    // 0 0 0
    // 0 1 1
    // 0 1 1
    const board = gridOf([
      [0, 0, 0],
      [0, 1, 1],
      [0, 1, 1],
    ]);
    const region = getRegion(board, 3);
    // Top row: indices 0,1,2 → in region
    // Left col: indices 0,3,6 → in region  (0 already counted)
    expect(regionSize(region)).toBe(5); // 3 + 2 unique extras
    expect(region[0]).toBe(1);
    expect(region[1]).toBe(1);
    expect(region[2]).toBe(1);
    expect(region[3]).toBe(1);
    expect(region[6]).toBe(1);
    // Interior cells not in region
    expect(region[4]).toBe(0);
    expect(region[5]).toBe(0);
    expect(region[7]).toBe(0);
    expect(region[8]).toBe(0);
  });

  it("does NOT cross a diagonal — only orthogonal connectivity counts", () => {
    // (0,0)=0 (0,1)=1 — different colour breaks orthogonal path
    // (1,0)=1 (1,1)=0 — same colour as origin but not reachable from (0,0)
    const board = gridOf([
      [0, 1],
      [1, 0],
    ]);
    const region = getRegion(board, 2);
    expect(regionSize(region)).toBe(1);
    expect(region[0]).toBe(1);
    expect(region[3]).toBe(0); // diagonal cell not included
  });
});

// ---------------------------------------------------------------------------
// applyPick — hand-built grids, exact region growth
// ---------------------------------------------------------------------------

describe("applyPick", () => {
  it("returns the SAME board reference when picking the current colour (no-op)", () => {
    const board = gridOf([
      [0, 1],
      [1, 1],
    ]);
    const result = applyPick(board, 2, 0); // 0 is already the origin colour
    expect(result).toBe(board); // same reference — no copy made
  });

  it("does NOT mutate the original board", () => {
    const board = gridOf([
      [0, 1],
      [1, 1],
    ]);
    const original = board.slice();
    applyPick(board, 2, 1);
    expect(board).toEqual(original);
  });

  it("recolours origin-connected region to new colour", () => {
    // 3×3: top row = colour 0, everything else = colour 1
    // Picking colour 1 should absorb the top row into the rest.
    // Before:
    //  0 0 0
    //  1 1 1
    //  1 1 1
    // After picking colour 1, (0,0) region (entire top row) becomes 1.
    // The BFS then also finds the already-1 cells adjacent — they are folded in.
    // Whole board → colour 1.
    const board = gridOf([
      [0, 0, 0],
      [1, 1, 1],
      [1, 1, 1],
    ]);
    const next = applyPick(board, 3, 1);
    expect(next.every((c) => c === 1)).toBe(true);
  });

  it("region grows exactly to absorb matching neighbours", () => {
    // 3×3, two distinct colours
    // Before:
    //  0  1  2
    //  1  2  2
    //  2  2  2
    //
    // Origin region = {(0,0)} = colour 0.
    // Pick colour 1:
    //   Region becomes colour 1. BFS then finds (0,1)=1 and (1,0)=1.
    //   Both absorbed → they become 1 too.
    //   From (0,1) neighbours: (0,2)=2 (no), (1,1)=2 (no).
    //   From (1,0) neighbours: (2,0)=2 (no), (1,1)=2 (no).
    //   Nothing further matches old colour (0) or new colour (1) — stop.
    // After:
    //  1  1  2
    //  1  2  2
    //  2  2  2
    const board = gridOf([
      [0, 1, 2],
      [1, 2, 2],
      [2, 2, 2],
    ]);
    const next = applyPick(board, 3, 1);
    expect(next[0]).toBe(1); // (0,0) was origin, now 1
    expect(next[1]).toBe(1); // (0,1) was already 1 (adjacent) — absorbed
    expect(next[3]).toBe(1); // (1,0) was already 1 (adjacent) — absorbed
    // Cells not adjacent to origin region stay unchanged
    expect(next[2]).toBe(2); // (0,2)
    expect(next[4]).toBe(2); // (1,1)
    expect(next[5]).toBe(2); // (1,2)
    expect(next[6]).toBe(2); // (2,0)
    expect(next[7]).toBe(2); // (2,1)
    expect(next[8]).toBe(2); // (2,2)
  });

  it("multi-step growth: region expands across successive picks", () => {
    // 2×2 board:  0 1
    //             1 0
    //
    // Pick colour 1:
    //   currentColor=0, origin b[0] set to 1.
    //   BFS from (0,0): visits (0,1)=1 (matches colorIdx) and (1,0)=1 (matches).
    //   From (0,1): visits (1,1)=0 (matches currentColor=0) → absorbed, set to 1.
    //   Board becomes all 1 in one step → isWon immediately.
    const board0 = gridOf([
      [0, 1],
      [1, 0],
    ]);
    const board1 = applyPick(board0, 2, 1);
    expect(board1).toEqual([1, 1, 1, 1]);
    expect(isWon(board1)).toBe(true);
  });

  it("a colour NOT reachable from the origin via old-or-new-colour path is NOT affected", () => {
    // The BFS in applyPick propagates through cells matching currentColor OR colorIdx.
    // A cell of a THIRD colour (neither old nor new) acts as a wall and blocks
    // propagation — cells behind it are unaffected.
    //
    // Board (3×3):
    //  0  0  2      ← colour 2 is neither the origin colour (0) nor the target (1)
    //  0  2  2      ← it acts as a wall
    //  2  2  2
    //
    // Picking colour 1: origin region {(0,0),(0,1),(1,0)} turns to 1.
    // (0,2)=2 and all other 2-cells block further spread.
    // None of the 2-cells should be changed.
    const board = gridOf([
      [0, 0, 2],
      [0, 2, 2],
      [2, 2, 2],
    ]);
    const next = applyPick(board, 3, 1);
    // Origin-connected 0-region → 1
    expect(next[0]).toBe(1); // (0,0)
    expect(next[1]).toBe(1); // (0,1)
    expect(next[3]).toBe(1); // (1,0)
    // Wall cells (colour 2) must not be changed
    expect(next[2]).toBe(2);  // (0,2)
    expect(next[4]).toBe(2);  // (1,1)
    expect(next[5]).toBe(2);  // (1,2)
    expect(next[6]).toBe(2);  // (2,0)
    expect(next[7]).toBe(2);  // (2,1)
    expect(next[8]).toBe(2);  // (2,2)
  });
});

// ---------------------------------------------------------------------------
// isWon
// ---------------------------------------------------------------------------

describe("isWon", () => {
  it("returns true when all cells share a colour", () => {
    expect(isWon([3, 3, 3, 3])).toBe(true);
    expect(isWon([0, 0, 0])).toBe(true);
  });

  it("returns false when any cell differs", () => {
    expect(isWon([0, 0, 1])).toBe(false);
    expect(isWon([1, 2, 1, 1])).toBe(false);
  });

  it("returns false for an empty board", () => {
    expect(isWon([])).toBe(false);
  });

  it("returns true for a single-cell board", () => {
    expect(isWon([4])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: seeded board generation → play to completion
// ---------------------------------------------------------------------------

describe("seeded board + full game simulation", () => {
  it("a board filled with all one colour starts already won", () => {
    // Trivially: manually set every cell to colour 2
    const size = 3;
    const board: number[] = Array(size * size).fill(2);
    expect(isWon(board)).toBe(true);
  });

  it("playing through a 2×2 board to a single colour triggers isWon", () => {
    // Force a known board:  0 1
    //                       1 1
    // Pick 1: origin (0,0)=0 becomes 1, absorbs (0,1)=1 and (1,0)=1.
    // Board: 1 1 / 1 1 → win.
    const board = gridOf([
      [0, 1],
      [1, 1],
    ]);
    const next = applyPick(board, 2, 1);
    expect(isWon(next)).toBe(true);
  });

  it("the seeded board changes deterministically when seed changes", () => {
    const b1 = generateBoard(10, "date:2026-01-01");
    const b2 = generateBoard(10, "date:2026-01-02");
    expect(b1).not.toEqual(b2);
  });

  it("a seeded 4×4 play-through: flood entire board to colour 0", () => {
    // Build a board that is all colour 0 except cell (0,0)=1.
    // Pick colour 0 once → entire board becomes 0 → win.
    const board = Array(16).fill(0);
    board[0] = 1; // top-left is different
    const next = applyPick(board, 4, 0);
    expect(isWon(next)).toBe(true);
  });

  it("deterministic seeded board uses only valid palette indices", () => {
    const board = generateBoard(14, "2026-06-03");
    for (const c of board) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(PALETTE.length);
    }
  });

  it("repeated picks on seeded board eventually result in a winnable state", () => {
    // Drive a 3×3 seeded board to all one colour by always picking
    // the colour that appears most often on the board.  This is not
    // optimal but guarantees termination on a tiny grid.
    const size = 3;
    let board = generateBoard(size, "vitest-flood");
    let steps = 0;
    const maxSteps = 50; // well above the worst-case for 3×3

    while (!isWon(board) && steps < maxSteps) {
      // Count colour frequencies (excluding the current origin colour).
      const freq = new Array(PALETTE.length).fill(0);
      for (const c of board) freq[c]++;
      const originColor = board[0];
      // Pick the most frequent colour that isn't the current origin colour.
      let best = -1;
      let bestCount = -1;
      for (let c = 0; c < PALETTE.length; c++) {
        if (c !== originColor && freq[c] > bestCount) {
          bestCount = freq[c];
          best = c;
        }
      }
      if (best === -1) break; // already all one colour (shouldn't happen)
      board = applyPick(board, size, best);
      steps++;
    }

    expect(isWon(board)).toBe(true);
    expect(steps).toBeLessThan(maxSteps);
  });
});
