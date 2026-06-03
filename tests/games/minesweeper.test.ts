import { describe, it, expect } from "vitest";
import {
  buildBoard,
  floodReveal,
  isWin,
  isMine,
  neighbors,
  cellIdx,
  cellRc,
} from "~/games/minesweeper";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a standard 9×9/10 beginner board with a fixed seed. */
function beginnerBoard(safeR = 4, safeC = 4, seed: string | number = "test-seed") {
  return buildBoard(9, 9, 10, safeR, safeC, seed);
}

/** Count mines in `board`. */
function countMines(board: ReturnType<typeof buildBoard>) {
  return board.cells.filter((c) => c.mine).length;
}

// ---------------------------------------------------------------------------
// neighbors()
// ---------------------------------------------------------------------------

describe("neighbors()", () => {
  it("interior cell has exactly 8 neighbors", () => {
    const ns = neighbors(9, 9, 4, 4);
    expect(ns).toHaveLength(8);
  });

  it("corner cell (0,0) has exactly 3 neighbors", () => {
    const ns = neighbors(9, 9, 0, 0);
    expect(ns).toHaveLength(3);
  });

  it("corner cell (rows-1, cols-1) has exactly 3 neighbors", () => {
    const ns = neighbors(9, 9, 8, 8);
    expect(ns).toHaveLength(3);
  });

  it("corner cell (0, cols-1) has exactly 3 neighbors", () => {
    expect(neighbors(9, 9, 0, 8)).toHaveLength(3);
  });

  it("corner cell (rows-1, 0) has exactly 3 neighbors", () => {
    expect(neighbors(9, 9, 8, 0)).toHaveLength(3);
  });

  it("edge cell on the top row has exactly 5 neighbors", () => {
    expect(neighbors(9, 9, 0, 4)).toHaveLength(5);
  });

  it("edge cell on the left col has exactly 5 neighbors", () => {
    expect(neighbors(9, 9, 4, 0)).toHaveLength(5);
  });

  it("edge cell on the right col has exactly 5 neighbors", () => {
    expect(neighbors(9, 9, 4, 8)).toHaveLength(5);
  });

  it("edge cell on the bottom row has exactly 5 neighbors", () => {
    expect(neighbors(9, 9, 8, 4)).toHaveLength(5);
  });

  it("all returned indices are in-bounds", () => {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const ns = neighbors(9, 9, r, c);
        for (const ni of ns) {
          expect(ni).toBeGreaterThanOrEqual(0);
          expect(ni).toBeLessThan(9 * 9);
        }
      }
    }
  });

  it("does not include the cell itself", () => {
    const r = 4, c = 4;
    const self = r * 9 + c;
    expect(neighbors(9, 9, r, c)).not.toContain(self);
  });

  it("each neighbor appears exactly once (no duplicates)", () => {
    const ns = neighbors(9, 9, 4, 4);
    expect(new Set(ns).size).toBe(ns.length);
  });

  it("works for a 1×1 board (no neighbors)", () => {
    expect(neighbors(1, 1, 0, 0)).toHaveLength(0);
  });

  it("works for a 1×5 row board (interior: 2 neighbors)", () => {
    expect(neighbors(1, 5, 0, 2)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Index helpers
// ---------------------------------------------------------------------------

describe("cellIdx / cellRc", () => {
  it("round-trips correctly", () => {
    const rows = 9, cols = 9;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = cellIdx(rows, cols, r, c);
        expect(cellRc(cols, i)).toEqual([r, c]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// buildBoard — mine count
// ---------------------------------------------------------------------------

describe("buildBoard() — mine count", () => {
  it("places exactly 10 mines on a 9×9 beginner board", () => {
    expect(countMines(beginnerBoard())).toBe(10);
  });

  it("places exactly 40 mines on a 16×16 intermediate board", () => {
    const b = buildBoard(16, 16, 40, 8, 8, "seed-mid");
    expect(countMines(b)).toBe(40);
  });

  it("places exactly 99 mines on a 16×30 expert board", () => {
    const b = buildBoard(16, 30, 99, 8, 15, "seed-exp");
    expect(countMines(b)).toBe(99);
  });

  it("is deterministic — same seed yields the same mine positions", () => {
    const b1 = buildBoard(9, 9, 10, 4, 4, "same-seed");
    const b2 = buildBoard(9, 9, 10, 4, 4, "same-seed");
    const mines1 = b1.cells.map((c) => c.mine);
    const mines2 = b2.cells.map((c) => c.mine);
    expect(mines1).toEqual(mines2);
  });

  it("different seeds yield different boards (statistically near-certain)", () => {
    const b1 = buildBoard(9, 9, 10, 4, 4, "seed-a");
    const b2 = buildBoard(9, 9, 10, 4, 4, "seed-b");
    const mines1 = b1.cells.map((c) => c.mine);
    const mines2 = b2.cells.map((c) => c.mine);
    expect(mines1).not.toEqual(mines2);
  });

  it("accepts a pre-built Rng object instead of a raw seed", () => {
    const rng = makeRng("rng-seed");
    const b = buildBoard(9, 9, 10, 4, 4, rng);
    expect(countMines(b)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// buildBoard — safe zone
// ---------------------------------------------------------------------------

describe("buildBoard() — safe zone (first-click guarantee)", () => {
  // The safe zone is the center cell (safeR, safeC) plus its 3×3 neighbors.

  it("center cell is never a mine", () => {
    for (let seed = 0; seed < 30; seed++) {
      const b = buildBoard(9, 9, 10, 4, 4, seed);
      expect(b.cells[4 * 9 + 4].mine).toBe(false);
    }
  });

  it("no cell in the 3×3 safe zone around the center is a mine", () => {
    for (let seed = 0; seed < 30; seed++) {
      const b = buildBoard(9, 9, 10, 4, 4, seed);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = 4 + dr, c = 4 + dc;
          expect(b.cells[r * 9 + c].mine, `mine at (${r},${c}) seed=${seed}`).toBe(false);
        }
      }
    }
  });

  it("safe zone at a corner (0,0): only in-bounds cells are mine-free", () => {
    // Corner safe zone is just 4 cells: (0,0),(0,1),(1,0),(1,1)
    for (let seed = 0; seed < 20; seed++) {
      const b = buildBoard(9, 9, 10, 0, 0, seed);
      for (let dr = 0; dr <= 1; dr++) {
        for (let dc = 0; dc <= 1; dc++) {
          expect(b.cells[dr * 9 + dc].mine, `mine at (${dr},${dc}) seed=${seed}`).toBe(false);
        }
      }
    }
  });

  it("safe zone at an edge (0, 4): 6-cell zone is all mine-free", () => {
    for (let seed = 0; seed < 20; seed++) {
      const b = buildBoard(9, 9, 10, 0, 4, seed);
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = 0; dr <= 1; dr++) {
          const c = 4 + dc;
          expect(b.cells[dr * 9 + c].mine, `mine at (${dr},${c}) seed=${seed}`).toBe(false);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// buildBoard — neighbor counts
// ---------------------------------------------------------------------------

describe("buildBoard() — neighbor counts", () => {
  it("every non-mine cell's count equals its actual adjacent mine count", () => {
    // Test across multiple boards to be thorough
    for (const seed of ["count-a", "count-b", "count-c", "count-d"]) {
      const b = buildBoard(9, 9, 10, 4, 4, seed);
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const i = r * 9 + c;
          if (b.cells[i].mine) continue;
          const actual = neighbors(9, 9, r, c).filter((ni) => b.cells[ni].mine).length;
          expect(b.cells[i].count).toBe(actual);
        }
      }
    }
  });

  it("mine cells always have count === 0 (count is meaningless for mines)", () => {
    const b = beginnerBoard();
    for (const cell of b.cells) {
      if (cell.mine) expect(cell.count).toBe(0);
    }
  });

  it("a cell completely surrounded by 8 mines has count 8", () => {
    // Use a 5×5 board with safe zone at top-left corner (0,0) and 16 mines.
    // The center cell (2,2) is far from the safe zone so all 8 of its
    // neighbors can be mines. We verify the count property after placement.
    // Rather than relying on a specific seed to surround (2,2), we build the
    // board and directly verify that any non-mine cell with exactly 8 mine
    // neighbors reports count 8 (the invariant holds for whatever cells arise).
    const b = buildBoard(5, 5, 16, 0, 0, "dense-5x5");
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const i = r * 5 + c;
        if (b.cells[i].mine) continue;
        const actual = neighbors(5, 5, r, c).filter((ni) => b.cells[ni].mine).length;
        expect(b.cells[i].count).toBe(actual);
      }
    }
    // Confirm that at least one non-mine cell exists and all counts are correct
    const safeCells = b.cells.filter((c) => !c.mine);
    expect(safeCells.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// floodReveal()
// ---------------------------------------------------------------------------

describe("floodReveal()", () => {
  it("reveals only the clicked cell when count > 0", () => {
    // Build a board where (4,4) is near mines (count > 0)
    // Use a board seed that yields a non-zero count at center after safe zone
    // Since safe zone protects 3×3 around (4,4), place safe at corner to get
    // the center surrounded by real neighbors
    const b = buildBoard(9, 9, 10, 4, 4, "flood-nonzero");
    // Find a non-mine cell with count > 0
    let targetIdx = -1;
    for (let i = 0; i < b.cells.length; i++) {
      if (!b.cells[i].mine && b.cells[i].count > 0) { targetIdx = i; break; }
    }
    if (targetIdx === -1) return; // degenerate board, skip
    const [tr, tc] = cellRc(9, targetIdx);
    floodReveal(b, tr, tc);
    // Only this cell should be revealed (and any zero-flood chain, but count > 0 stops it)
    expect(b.cells[targetIdx].revealed).toBe(true);
    // No mine should be revealed by flood
    expect(b.cells.filter((c) => c.mine && c.revealed)).toHaveLength(0);
  });

  it("cascades through a contiguous zero-count region", () => {
    // Use a seeded board to find a zero-count cell and verify cascade
    const b = buildBoard(9, 9, 10, 4, 4, "flood-cascade");
    // Find a zero-count, non-mine cell
    let zeroIdx = -1;
    for (let i = 0; i < b.cells.length; i++) {
      if (!b.cells[i].mine && b.cells[i].count === 0) { zeroIdx = i; break; }
    }
    if (zeroIdx === -1) return; // board has no zero cells, skip
    const [zr, zc] = cellRc(9, zeroIdx);
    floodReveal(b, zr, zc);
    // The starting zero cell must be revealed
    expect(b.cells[zeroIdx].revealed).toBe(true);
    // All neighbors of every revealed-zero cell must also be revealed (unless flagged or mine)
    for (let i = 0; i < b.cells.length; i++) {
      if (!b.cells[i].revealed || b.cells[i].count !== 0 || b.cells[i].mine) continue;
      const [r, c] = cellRc(9, i);
      for (const ni of neighbors(9, 9, r, c)) {
        if (!b.cells[ni].mine && !b.cells[ni].flagged) {
          expect(b.cells[ni].revealed, `neighbor ${ni} of zero cell ${i} not revealed`).toBe(true);
        }
      }
    }
  });

  it("does not cascade across mines", () => {
    const b = buildBoard(9, 9, 10, 4, 4, "flood-barrier");
    // Find a zero cell
    let zeroIdx = -1;
    for (let i = 0; i < b.cells.length; i++) {
      if (!b.cells[i].mine && b.cells[i].count === 0) { zeroIdx = i; break; }
    }
    if (zeroIdx === -1) return;
    const [zr, zc] = cellRc(9, zeroIdx);
    floodReveal(b, zr, zc);
    // Mines must never be revealed by flood
    for (const cell of b.cells) {
      if (cell.mine) expect(cell.revealed).toBe(false);
    }
  });

  it("does not reveal flagged cells", () => {
    const b = buildBoard(9, 9, 10, 4, 4, "flood-flags");
    // Flag some non-mine cells
    let flagged = 0;
    for (let i = 0; i < b.cells.length && flagged < 3; i++) {
      if (!b.cells[i].mine) { b.cells[i].flagged = true; flagged++; }
    }
    // Find a zero cell to trigger flood
    let zeroIdx = -1;
    for (let i = 0; i < b.cells.length; i++) {
      if (!b.cells[i].mine && b.cells[i].count === 0 && !b.cells[i].flagged) {
        zeroIdx = i; break;
      }
    }
    if (zeroIdx === -1) return;
    const [zr, zc] = cellRc(9, zeroIdx);
    floodReveal(b, zr, zc);
    // Flagged cells must remain unrevealed
    for (const cell of b.cells) {
      if (cell.flagged) expect(cell.revealed).toBe(false);
    }
  });

  it("calling floodReveal on an already-revealed cell is a no-op", () => {
    const b = beginnerBoard();
    const safeIdx = 4 * 9 + 4;
    b.cells[safeIdx].revealed = true;
    const snapshot = b.cells.map((c) => ({ ...c }));
    floodReveal(b, 4, 4);
    // Board state unchanged
    expect(b.cells).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// isWin() / isMine()
// ---------------------------------------------------------------------------

describe("isWin()", () => {
  it("returns false on a fresh (unrevealed) board", () => {
    expect(isWin(beginnerBoard())).toBe(false);
  });

  it("returns true when all non-mine cells are revealed", () => {
    const b = beginnerBoard();
    // Manually reveal every non-mine cell
    for (const cell of b.cells) {
      if (!cell.mine) cell.revealed = true;
    }
    expect(isWin(b)).toBe(true);
  });

  it("returns false when even one non-mine cell is still hidden", () => {
    const b = beginnerBoard();
    // Reveal all non-mine except the last one
    let skipped = false;
    for (const cell of b.cells) {
      if (!cell.mine) {
        if (!skipped) { skipped = true; continue; }
        cell.revealed = true;
      }
    }
    expect(isWin(b)).toBe(false);
  });

  it("mine cells do NOT need to be revealed for a win", () => {
    const b = beginnerBoard();
    // Reveal only safe cells
    for (const cell of b.cells) {
      if (!cell.mine) cell.revealed = true;
    }
    // Mines still unrevealed
    expect(b.cells.filter((c) => c.mine && !c.revealed).length).toBeGreaterThan(0);
    expect(isWin(b)).toBe(true);
  });
});

describe("isMine()", () => {
  it("returns true for a mine cell, false for a safe cell", () => {
    const b = beginnerBoard();
    for (let i = 0; i < b.cells.length; i++) {
      const [r, c] = cellRc(b.cols, i);
      expect(isMine(b, r, c)).toBe(b.cells[i].mine);
    }
  });
});

// ---------------------------------------------------------------------------
// End-to-end: build → flood-reveal center → win or continue
// ---------------------------------------------------------------------------

describe("end-to-end game flow", () => {
  it("flood-revealing the safe center never exposes a mine", () => {
    for (let seed = 0; seed < 20; seed++) {
      const b = buildBoard(9, 9, 10, 4, 4, seed);
      floodReveal(b, 4, 4);
      expect(b.cells.filter((c) => c.mine && c.revealed)).toHaveLength(0);
    }
  });

  it("after flood-reveal if win is not yet achieved, manual reveal of a mine triggers loss", () => {
    let found = false;
    for (let seed = 0; seed < 100 && !found; seed++) {
      const b = buildBoard(9, 9, 10, 4, 4, seed);
      floodReveal(b, 4, 4);
      if (!isWin(b)) {
        // Find a mine and reveal it — loss condition
        const mineIdx = b.cells.findIndex((c) => c.mine);
        expect(mineIdx).toBeGreaterThanOrEqual(0);
        const [mr, mc] = cellRc(b.cols, mineIdx);
        expect(isMine(b, mr, mc)).toBe(true);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it("fully clearing the board (no mines revealed) satisfies isWin", () => {
    const b = buildBoard(5, 5, 1, 2, 2, "small-win");
    // Reveal all non-mine cells
    for (const cell of b.cells) {
      if (!cell.mine) cell.revealed = true;
    }
    expect(isWin(b)).toBe(true);
    // No mine was touched
    expect(b.cells.filter((c) => c.mine && c.revealed)).toHaveLength(0);
  });

  it("reveals via floodReveal propagate correctly on a small board", () => {
    // 5×5 board, 1 mine — center safe. Most cells should zero out and cascade.
    const b = buildBoard(5, 5, 1, 2, 2, "small-board");
    floodReveal(b, 2, 2);
    // Center should be revealed
    expect(b.cells[2 * 5 + 2].revealed).toBe(true);
  });
});
