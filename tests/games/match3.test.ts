import { describe, it, expect } from "vitest";
import {
  findMatches,
  hasMatch,
  hasValidMove,
  isLegalSwap,
  swapCreatesMatch,
  applyGravity,
  clearAndRefill,
  generateBoard,
  SIZE,
  GEM_TYPES,
} from "~/games/match3";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Helpers to build explicit small/full boards for tests
// ---------------------------------------------------------------------------

/** Build a SIZE×SIZE board filled with gem 0, then apply overrides. */
function makeBoard(overrides: Array<[number, number, number | null]> = []) {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0) as (number | null)[]);
  for (const [r, c, v] of overrides) grid[r][c] = v;
  return grid;
}

/** Build a board from a 2-D array of values (must be SIZE×SIZE). */
function fromRows(rows: (number | null)[][]): (number | null)[][] {
  return rows.map((row) => [...row]);
}

// ---------------------------------------------------------------------------
// findMatches — horizontal and vertical runs of 3+
// ---------------------------------------------------------------------------

describe("findMatches", () => {
  it("returns empty set on a board with no runs", () => {
    // checkerboard-like: alternating 0/1 across rows — no 3 in a row
    const grid = Array.from({ length: SIZE }, (_, r) =>
      Array.from({ length: SIZE }, (_, c) => (r + c) % 2)
    );
    expect(findMatches(grid).size).toBe(0);
  });

  it("detects a horizontal run of 3 in the middle of a row", () => {
    // Row 2, cols 3-5 are gem 1; everything else is gem 0 (but that makes
    // full rows of 0 which are also matches — so use a board where only the
    // explicit run matches).
    // Strategy: build a board where row 2 cols 3,4,5 are gem 2
    // and the rest of row 2 is gems that don't form a run with each other.
    const grid = fromRows(
      Array.from({ length: SIZE }, (_, r) =>
        Array.from({ length: SIZE }, (_, c) => {
          if (r === 2 && c >= 3 && c <= 5) return 2;
          // alternate 0/1 to prevent any other runs
          return (r * SIZE + c) % 2;
        })
      )
    );
    const matched = findMatches(grid);
    expect(matched.has("2,3")).toBe(true);
    expect(matched.has("2,4")).toBe(true);
    expect(matched.has("2,5")).toBe(true);
  });

  it("detects a vertical run of 3 in a column", () => {
    // Use a board where rows 4,5,6 col 7 are all gem 3; rest alternating
    const grid = fromRows(
      Array.from({ length: SIZE }, (_, r) =>
        Array.from({ length: SIZE }, (_, c) => {
          if (r >= 4 && r <= 6 && c === 7) return 3;
          return (r + c) % 2;
        })
      )
    );
    const matched = findMatches(grid);
    expect(matched.has("4,7")).toBe(true);
    expect(matched.has("5,7")).toBe(true);
    expect(matched.has("6,7")).toBe(true);
  });

  it("detects both horizontal and vertical matches on the same board", () => {
    // Row 0 cols 0-2: gem 1 (horizontal)
    // Rows 0-2 col 5: gem 2 (vertical)
    // Everything else: alternating to avoid accidental runs
    const grid = fromRows(
      Array.from({ length: SIZE }, (_, r) =>
        Array.from({ length: SIZE }, (_, c) => {
          if (r === 0 && c <= 2) return 1;
          if (c === 5 && r <= 2) return 2;
          // row 0 col 5 is set to 2 (vertical wins over whatever)
          return (r * 3 + c * 7) % 6 === 1 ? 0 : (r * 3 + c * 7) % 6 === 2 ? 3 : (r * 3 + c * 7) % 6;
        })
      )
    );
    const matched = findMatches(grid);
    // horizontal: row 0 cols 0-2
    expect(matched.has("0,0")).toBe(true);
    expect(matched.has("0,1")).toBe(true);
    expect(matched.has("0,2")).toBe(true);
    // vertical: rows 0-2 col 5
    expect(matched.has("0,5")).toBe(true);
    expect(matched.has("1,5")).toBe(true);
    expect(matched.has("2,5")).toBe(true);
  });

  it("a run of exactly 4 includes all 4 cells", () => {
    const grid = fromRows(
      Array.from({ length: SIZE }, (_, r) =>
        Array.from({ length: SIZE }, (_, c) => {
          if (r === 1 && c >= 0 && c <= 3) return 4;
          return (r + c + 1) % 2;
        })
      )
    );
    const matched = findMatches(grid);
    expect(matched.has("1,0")).toBe(true);
    expect(matched.has("1,1")).toBe(true);
    expect(matched.has("1,2")).toBe(true);
    expect(matched.has("1,3")).toBe(true);
  });

  it("a run of exactly 2 is NOT a match", () => {
    // Row 3: only 2 adjacent identical gems, rest alternating
    const grid = fromRows(
      Array.from({ length: SIZE }, (_, r) =>
        Array.from({ length: SIZE }, (_, c) => {
          if (r === 3 && (c === 2 || c === 3)) return 5;
          return (r + c) % 2;
        })
      )
    );
    const matched = findMatches(grid);
    expect(matched.has("3,2")).toBe(false);
    expect(matched.has("3,3")).toBe(false);
  });

  it("ignores null cells — nulls break runs", () => {
    // Row 0: gem0, null, gem0, gem0, gem0 — the null breaks a potential run at col 0
    const grid = fromRows(
      Array.from({ length: SIZE }, (_, r) =>
        Array.from({ length: SIZE }, (_, c) => {
          if (r === 0 && c === 1) return null;
          if (r === 0 && c >= 2 && c <= 4) return 0;
          return (r + c + 1) % 2;
        })
      )
    );
    const matched = findMatches(grid);
    // col 0 row 0 (gem0) should NOT be in a run because col 1 is null
    // cols 2-4 row 0 ARE a run
    expect(matched.has("0,2")).toBe(true);
    expect(matched.has("0,3")).toBe(true);
    expect(matched.has("0,4")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isLegalSwap — adjacent + creates a match
// ---------------------------------------------------------------------------

describe("isLegalSwap", () => {
  it("a swap between adjacent cells that creates a horizontal match is legal", () => {
    // Row 0: [1, 1, 0, ...]  — swapping (0,2) with (0,3) which has a 1 gives [1,1,1,...]
    // Build: row 0 = [1, 1, 0, 1, ...]  swapping col2(0) and col3(1) → [1,1,1,0,...]
    const grid = fromRows(
      Array.from({ length: SIZE }, (_, r) =>
        Array.from({ length: SIZE }, (_, c) => (r + c) % 2)
      )
    );
    // row 0: alternating starting at 0 — 0,1,0,1,...
    // We want [1,1,0,1,...] in row 0 so swap (0,2) with (0,1)'s neighbor.
    // Simpler: build explicitly.
    // Row 0: gems 2,2,3,2 — swap (0,2)↔(0,3) → 2,2,2,3 = horizontal match
    grid[0][0] = 2;
    grid[0][1] = 2;
    grid[0][2] = 3;
    grid[0][3] = 2;
    // Ensure no accidental vertical runs by making rest of col 0,1,2,3 different
    for (let r = 1; r < SIZE; r++) {
      grid[r][0] = 1; grid[r][1] = 0; grid[r][2] = 1; grid[r][3] = 0;
    }
    expect(isLegalSwap(grid, 0, 2, 0, 3)).toBe(true);
  });

  it("a swap between adjacent cells that creates NO match is illegal", () => {
    // A board where swapping (0,0)↔(0,1) yields no run
    const grid = fromRows(
      Array.from({ length: SIZE }, (_, r) =>
        // each cell has a unique gem type cycling 0-5 to prevent any runs
        Array.from({ length: SIZE }, (_, c) => (r * SIZE + c) % GEM_TYPES)
      )
    );
    expect(isLegalSwap(grid, 0, 0, 0, 1)).toBe(false);
  });

  it("a swap between non-adjacent cells (distance > 1) is illegal even if it would match", () => {
    // Row 0: [2, 2, 0, 2, ...] — swapping (0,0) and (0,2) (distance 2) would create [0,2,2,2,...]
    // which is a match in columns 1-3, but the cells aren't adjacent
    const grid = fromRows(
      Array.from({ length: SIZE }, (_, r) =>
        Array.from({ length: SIZE }, (_, c) => (r + c) % 2)
      )
    );
    grid[0][0] = 2; grid[0][1] = 2; grid[0][2] = 0; grid[0][3] = 2;
    for (let r = 1; r < SIZE; r++) {
      grid[r][0] = 1; grid[r][1] = 0; grid[r][2] = 1; grid[r][3] = 0;
    }
    // (0,0) and (0,2) have distance 2 — illegal regardless
    expect(isLegalSwap(grid, 0, 0, 0, 2)).toBe(false);
  });

  it("a diagonal swap (distance > 1) is always illegal", () => {
    const grid = makeBoard();
    expect(isLegalSwap(grid, 0, 0, 1, 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyGravity — cells drop to fill nulls below them
// ---------------------------------------------------------------------------

describe("applyGravity", () => {
  it("drops gems down to fill nulls below in a column", () => {
    // col 0: [null, null, 3, null, 1, null, null, 2]
    // after gravity: [null, null, null, null, null, 3, 1, 2]
    const grid = makeBoard();
    // Set col 0 with specific values; rest of board stays at 0
    for (let r = 0; r < SIZE; r++) grid[r][0] = null;
    grid[2][0] = 3;
    grid[4][0] = 1;
    grid[7][0] = 2;

    const result = applyGravity(grid);

    // Bottom 3 rows of col 0 should have the gems in top-to-bottom order of their arrival
    expect(result[7][0]).toBe(2);
    expect(result[6][0]).toBe(1);
    expect(result[5][0]).toBe(3);
    // Top 5 rows of col 0 should be null
    for (let r = 0; r < 5; r++) expect(result[r][0]).toBeNull();
  });

  it("does not mutate the input board", () => {
    const grid = makeBoard([[0, 0, null]]);
    const snapshot = grid[0][0];
    applyGravity(grid);
    expect(grid[0][0]).toBe(snapshot); // input unchanged
  });

  it("a fully non-null column is unchanged", () => {
    const grid = makeBoard();
    // col 1: gems 0..7 top to bottom
    for (let r = 0; r < SIZE; r++) grid[r][1] = r;
    const result = applyGravity(grid);
    for (let r = 0; r < SIZE; r++) expect(result[r][1]).toBe(r);
  });
});

// ---------------------------------------------------------------------------
// clearAndRefill — clear + gravity + fill
// ---------------------------------------------------------------------------

describe("clearAndRefill", () => {
  it("clears matched keys, applies gravity, and fills nulls with valid gem types", () => {
    const rng = makeRng("test-refill");
    // Build a column (col 3) where only rows 0-4 have gems and rows 5-7 are
    // the matched (cleared) cells.  We set each of the 5 surviving gems to a
    // unique value so we can verify the exact gravity order.
    // Start from a board where col 3 is all null, then set the survivors.
    const grid = makeBoard();
    for (let r = 0; r < SIZE; r++) grid[r][3] = null; // blank the column first
    grid[0][3] = 4; grid[1][3] = 3; grid[2][3] = 2; grid[3][3] = 1; grid[4][3] = 5;
    // rows 5,6,7 col 3 stay null — simulate "already cleared" by marking matched
    const matched = new Set(["5,3", "6,3", "7,3"]);

    const result = clearAndRefill(grid, matched, rng);

    // clearAndRefill clears rows 5,6,7 (already null, so no change there), then
    // gravity drops the 5 non-null gems to the bottom of the column.
    // Col 3 after gravity: [null,null,null, 4,3,2,1,5]
    expect(result[7][3]).toBe(5);
    expect(result[6][3]).toBe(1);
    expect(result[5][3]).toBe(2);
    expect(result[4][3]).toBe(3);
    expect(result[3][3]).toBe(4);
    // Top 3 rows of col 3 should be refilled with valid gem types
    for (let r = 0; r < 3; r++) {
      const v = result[r][3];
      expect(v).not.toBeNull();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(GEM_TYPES);
    }
  });

  it("does not mutate the input board", () => {
    const rng = makeRng("immutability-test");
    const grid = makeBoard();
    const originalVal = grid[0][0];
    const matched = new Set<string>(["0,0"]);
    clearAndRefill(grid, matched, rng);
    expect(grid[0][0]).toBe(originalVal);
  });
});

// ---------------------------------------------------------------------------
// generateBoard — initial board has no pre-existing matches
// ---------------------------------------------------------------------------

describe("generateBoard", () => {
  it("produces a SIZE×SIZE board of valid gem types", () => {
    const grid = generateBoard("seed-smoke");
    expect(grid).toHaveLength(SIZE);
    for (const row of grid) {
      expect(row).toHaveLength(SIZE);
      for (const cell of row) {
        expect(cell).not.toBeNull();
        expect(cell).toBeGreaterThanOrEqual(0);
        expect((cell as number)).toBeLessThan(GEM_TYPES);
      }
    }
  });

  it("has no pre-existing matches on initial generation", () => {
    // Test several seeds to give confidence
    for (const seed of ["daily-2026-01-01", "smoke", 42, null, "edge"]) {
      const grid = generateBoard(seed);
      expect(hasMatch(grid), `seed ${seed} has a pre-existing match`).toBe(false);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = generateBoard("deterministic-seed");
    const b = generateBoard("deterministic-seed");
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        expect(a[r][c]).toBe(b[r][c]);
      }
    }
  });

  it("produces different boards for different seeds", () => {
    const a = generateBoard("seed-alpha");
    const b = generateBoard("seed-beta");
    let different = false;
    for (let r = 0; r < SIZE && !different; r++) {
      for (let c = 0; c < SIZE && !different; c++) {
        if (a[r][c] !== b[r][c]) different = true;
      }
    }
    expect(different).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// findMatches — horizontal run ending at the last column (line 39 branch)
// ---------------------------------------------------------------------------

describe("findMatches — horizontal run reaching the end of the row", () => {
  it("detects a run of 3 that ends exactly at column SIZE-1", () => {
    // Place gem 3 at row 0, columns 5,6,7 (the last 3 columns).
    // The rest of row 0 alternates 0/1 to avoid accidental runs.
    // This exercises the post-loop `if (run >= 3)` block (line 38-40) that
    // fires when a run reaches the very end of the row without hitting `else`.
    const grid = fromRows(
      Array.from({ length: SIZE }, (_, r) =>
        Array.from({ length: SIZE }, (_, c) => {
          if (r === 0 && c >= 5 && c <= 7) return 3;
          return (r + c + 1) % 2; // alternating 0/1 — no accidental runs
        })
      )
    );
    const matched = findMatches(grid);
    // The three cells at the end of the row must all be marked.
    expect(matched.has("0,5")).toBe(true);
    expect(matched.has("0,6")).toBe(true);
    expect(matched.has("0,7")).toBe(true);
    // Cells before the run should not be in the set (alternating, no run).
    expect(matched.has("0,4")).toBe(false);
  });

  it("detects a full-row run of SIZE identical gems", () => {
    // An entire row is gem 4; this guarantees the post-loop branch fires.
    const grid = fromRows(
      Array.from({ length: SIZE }, (_, r) =>
        Array.from({ length: SIZE }, (_, c) => {
          if (r === 3) return 4; // full row of gem 4
          return (r + c) % 2;
        })
      )
    );
    const matched = findMatches(grid);
    for (let c = 0; c < SIZE; c++) {
      expect(matched.has(`3,${c}`)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// hasValidMove — returns false when no swap creates a match (line 152)
// ---------------------------------------------------------------------------

describe("hasValidMove — no-valid-move board", () => {
  it("returns false on a board where every swap leaves no 3-in-a-row", () => {
    // Build a board using pattern (r*2 + c) % 6.
    // Row 0: 0,1,2,3,4,5,0,1
    // Row 1: 2,3,4,5,0,1,2,3
    // Row 2: 4,5,0,1,2,3,4,5
    // Row 3: 0,1,2,3,4,5,0,1  (repeats with period 3 in rows)
    // ...
    // No 3 consecutive identical values exist in any row or column, and
    // swapping any adjacent pair shifts the pattern without creating 3 alike.
    const grid = fromRows(
      Array.from({ length: SIZE }, (_, r) =>
        Array.from({ length: SIZE }, (_, c) => (r * 2 + c) % GEM_TYPES)
      )
    );
    // Sanity checks: no pre-existing matches, then hasValidMove returns false.
    expect(hasMatch(grid)).toBe(false);
    expect(hasValidMove(grid)).toBe(false);
  });
});
