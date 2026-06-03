import { describe, it, expect } from "vitest";
import {
  slideLine,
  moveGrid,
  hasWon,
  isGameOver,
  emptyGrid,
  SIZE,
} from "~/games/game2048";

// ---------------------------------------------------------------------------
// slideLine — single-line merge rule
// ---------------------------------------------------------------------------
describe("slideLine", () => {
  it("[2,2,0,0] → [4,0,0,0], gained 4", () => {
    const { line, gained } = slideLine([2, 2, 0, 0]);
    expect(line).toEqual([4, 0, 0, 0]);
    expect(gained).toBe(4);
  });

  it("[2,2,2,2] → [4,4,0,0], gained 8", () => {
    const { line, gained } = slideLine([2, 2, 2, 2]);
    expect(line).toEqual([4, 4, 0, 0]);
    expect(gained).toBe(8);
  });

  it("[2,0,2,2] → [4,2,0,0] (slide then merge; third tile does not double-merge)", () => {
    // compact → [2,2,2]; first pair merges → [4]; third 2 stays; pad → [4,2,0,0]
    const { line, gained } = slideLine([2, 0, 2, 2]);
    expect(line).toEqual([4, 2, 0, 0]);
    expect(gained).toBe(4);
  });

  it("[4,4,8,0] → [8,8,0,0] (two separate merges, no triple-merge)", () => {
    // The two 4s merge to 8; the original 8 slides into next position.
    // The new 8 has _merged semantics — two separate values happen to equal 8
    // but in slideLine they are processed left to right:
    // compact=[4,4,8]; i=0: 4==4 → merge 8; i=2: 8 alone → push 8; result=[8,8,0,0]
    const { line, gained } = slideLine([4, 4, 8, 0]);
    expect(line).toEqual([8, 8, 0, 0]);
    expect(gained).toBe(8);
  });

  it("no triple-merge: [2,2,4,0] → [4,4,0,0], not [8,0,0,0]", () => {
    // The merged 4 must NOT combine with the adjacent original 4
    const { line, gained } = slideLine([2, 2, 4, 0]);
    expect(line).toEqual([4, 4, 0, 0]);
    expect(gained).toBe(4);
  });

  it("no-op line returns the same values and zero gained", () => {
    // Already packed with no adjacent equal pairs → nothing changes
    const { line, gained } = slideLine([2, 4, 8, 16]);
    expect(line).toEqual([2, 4, 8, 16]);
    expect(gained).toBe(0);
  });

  it("all zeros → all zeros, gained 0", () => {
    const { line, gained } = slideLine([0, 0, 0, 0]);
    expect(line).toEqual([0, 0, 0, 0]);
    expect(gained).toBe(0);
  });

  it("single tile slides to front", () => {
    const { line, gained } = slideLine([0, 0, 0, 8]);
    expect(line).toEqual([8, 0, 0, 0]);
    expect(gained).toBe(0);
  });

  it("[1024,1024,0,0] → [2048,0,0,0], gained 2048", () => {
    const { line, gained } = slideLine([1024, 1024, 0, 0]);
    expect(line).toEqual([2048, 0, 0, 0]);
    expect(gained).toBe(2048);
  });
});

// ---------------------------------------------------------------------------
// moveGrid — full-grid directional moves
// ---------------------------------------------------------------------------
describe("moveGrid", () => {
  it("left move slides all rows left", () => {
    // Row 0: [0,0,2,2] → [4,0,0,0]
    // Row 1: [0,4,0,4] → [8,0,0,0]
    // Rows 2,3: all zeros → unchanged
    const grid = emptyGrid();
    grid[0 * SIZE + 2] = 2;
    grid[0 * SIZE + 3] = 2;
    grid[1 * SIZE + 1] = 4;
    grid[1 * SIZE + 3] = 4;
    const { grid: next, moved, gained } = moveGrid(grid, "left");
    expect(moved).toBe(true);
    expect(gained).toBe(4 + 8);
    expect(next[0 * SIZE + 0]).toBe(4);
    expect(next[0 * SIZE + 1]).toBe(0);
    expect(next[1 * SIZE + 0]).toBe(8);
    expect(next[1 * SIZE + 1]).toBe(0);
  });

  it("right move slides all rows right", () => {
    // Row 0: [2,2,0,0] → [0,0,0,4]
    const grid = emptyGrid();
    grid[0] = 2;
    grid[1] = 2;
    const { grid: next, moved, gained } = moveGrid(grid, "right");
    expect(moved).toBe(true);
    expect(gained).toBe(4);
    expect(next[3]).toBe(4); // last column of row 0
    expect(next[0]).toBe(0);
  });

  it("up move slides columns upward", () => {
    // Col 0: rows [0,2,2,0] → [4,0,0,0]
    const grid = emptyGrid();
    grid[1 * SIZE + 0] = 2;
    grid[2 * SIZE + 0] = 2;
    const { grid: next, moved, gained } = moveGrid(grid, "up");
    expect(moved).toBe(true);
    expect(gained).toBe(4);
    expect(next[0 * SIZE + 0]).toBe(4);
    expect(next[1 * SIZE + 0]).toBe(0);
  });

  it("down move slides columns downward", () => {
    // Col 0: rows [2,2,0,0] → [0,0,0,4]
    const grid = emptyGrid();
    grid[0 * SIZE + 0] = 2;
    grid[1 * SIZE + 0] = 2;
    const { grid: next, moved, gained } = moveGrid(grid, "down");
    expect(moved).toBe(true);
    expect(gained).toBe(4);
    expect(next[3 * SIZE + 0]).toBe(4);
    expect(next[0 * SIZE + 0]).toBe(0);
  });

  it("a move that changes nothing reports moved=false and gained=0", () => {
    // Already fully packed left with no adjacent equal pairs
    const grid = emptyGrid();
    grid[0] = 2;
    grid[1] = 4;
    grid[2] = 8;
    grid[3] = 16;
    const { moved, gained } = moveGrid(grid, "left");
    expect(moved).toBe(false);
    expect(gained).toBe(0);
  });

  it("gained equals the sum of all newly merged tile values", () => {
    // Two merges in different rows: row0=[2,2,0,0]→4; row1=[4,4,0,0]→8; total=12
    const grid = emptyGrid();
    grid[0 * SIZE + 0] = 2;
    grid[0 * SIZE + 1] = 2;
    grid[1 * SIZE + 0] = 4;
    grid[1 * SIZE + 1] = 4;
    const { gained } = moveGrid(grid, "left");
    expect(gained).toBe(12);
  });

  it("does not mutate the original grid", () => {
    const grid = emptyGrid();
    grid[0] = 2;
    grid[1] = 2;
    const original = grid.slice();
    moveGrid(grid, "left");
    expect(grid).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// hasWon — win detection
// ---------------------------------------------------------------------------
describe("hasWon", () => {
  it("returns true when a 2048 tile is present", () => {
    const grid = emptyGrid();
    grid[5] = 2048;
    expect(hasWon(grid)).toBe(true);
  });

  it("returns true for tiles greater than 2048 (post-win continued play)", () => {
    const grid = emptyGrid();
    grid[0] = 4096;
    expect(hasWon(grid)).toBe(true);
  });

  it("returns false when no 2048+ tile exists", () => {
    const grid = emptyGrid();
    grid[0] = 1024;
    grid[1] = 512;
    expect(hasWon(grid)).toBe(false);
  });

  it("returns false on an empty grid", () => {
    expect(hasWon(emptyGrid())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isGameOver — lock detection
// ---------------------------------------------------------------------------
describe("isGameOver", () => {
  it("returns false on an empty grid", () => {
    expect(isGameOver(emptyGrid())).toBe(false);
  });

  it("returns false when there are empty cells", () => {
    const grid = emptyGrid();
    // Fill all but one cell with distinct values
    for (let i = 0; i < SIZE * SIZE - 1; i++) grid[i] = 2 ** (i + 1);
    expect(isGameOver(grid)).toBe(false);
  });

  it("returns true on a full board with no adjacent equal pairs", () => {
    // 4x4 board filled with a checkerboard of 2/4 such that no two equal
    // values are horizontally or vertically adjacent.
    // Pattern: even index → 2, odd index → 4 (works for 4-wide board:
    // row 0: 2,4,2,4 | row 1: 4,2,4,2 | row 2: 2,4,2,4 | row 3: 4,2,4,2)
    const grid: number[] = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        grid.push((r + c) % 2 === 0 ? 2 : 4);
    expect(isGameOver(grid)).toBe(true);
  });

  it("returns false when a horizontal merge is still possible on a full board", () => {
    // Same checkerboard but put two equal values adjacent in row 0
    const grid: number[] = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        grid.push((r + c) % 2 === 0 ? 2 : 4);
    // Make col 0 and col 1 of row 0 both equal 2 → a merge is possible
    grid[0 * SIZE + 0] = 2;
    grid[0 * SIZE + 1] = 2;
    expect(isGameOver(grid)).toBe(false);
  });

  it("returns false when a vertical merge is still possible on a full board", () => {
    const grid: number[] = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        grid.push((r + c) % 2 === 0 ? 2 : 4);
    // Make row 0 col 0 and row 1 col 0 both equal 2 → vertical merge possible
    grid[0 * SIZE + 0] = 2;
    grid[1 * SIZE + 0] = 2;
    expect(isGameOver(grid)).toBe(false);
  });

  it("returns false via the vertical-adjacency branch (line 133) on a board with no horizontal merges but one vertical merge", () => {
    // Fill the grid so that NO two horizontally-adjacent cells are equal,
    // but one pair of vertically-adjacent cells IS equal.
    // Use: rows 0,2 → [2,4,2,4]; rows 1,3 → [4,2,4,2] (strict checkerboard).
    // Then override ONE vertical pair to be equal WITHOUT creating any horizontal equal pair.
    // Override row=2,col=1 and row=3,col=1 from their checkerboard values (4 and 2) to both 8.
    // After override: row2=[2,8,2,4], row3=[4,8,4,2].
    // Horizontal check on row2: 2≠8, 8≠2, 2≠4. Row3: 4≠8, 8≠4, 4≠2. No horizontal matches.
    // Vertical check: col 1, row 2→8 and row 3→8 → equal → return false hits line 133.
    const grid: number[] = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        grid.push((r + c) % 2 === 0 ? 2 : 4);
    // Override to create a vertical match without a horizontal match
    grid[2 * SIZE + 1] = 8;
    grid[3 * SIZE + 1] = 8;
    expect(isGameOver(grid)).toBe(false);
  });
});
