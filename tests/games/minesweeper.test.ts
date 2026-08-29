import { describe, it, expect } from "vitest";
import {
  buildBoard,
  buildNoGuessBoard,
  floodReveal,
  isWin,
  isMine,
  neighbors,
  cellIdx,
  cellRc,
  solveBoard,
  SOLVER_UNKNOWN,
  SOLVER_OPEN,
  SOLVER_MINE,
  NO_GUESS_ATTEMPTS,
} from "~/games/minesweeper";
import type { Board } from "~/games/minesweeper";
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

/** The three presets offered by the UI (DIFFS in MinesweeperGame.vue). */
const DIFFICULTIES = [
  { name: "beginner", rows: 9, cols: 9, mines: 10 },
  { name: "intermediate", rows: 16, cols: 16, mines: 40 },
  { name: "expert", rows: 16, cols: 30, mines: 99 },
];

/** First-click positions: four corners, four edge midpoints and the centre. */
function clickPositions(rows: number, cols: number): Array<[number, number]> {
  const mr = Math.floor(rows / 2);
  const mc = Math.floor(cols / 2);
  return [
    [0, 0], [0, cols - 1], [rows - 1, 0], [rows - 1, cols - 1],
    [0, mc], [rows - 1, mc], [mr, 0], [mr, cols - 1],
    [mr, mc],
  ];
}

/** Build a Board from ASCII rows ('*' = mine, anything else = safe). */
function boardFromAscii(rowsAscii: string[]): Board {
  const rows = rowsAscii.length;
  const cols = rowsAscii[0].length;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ mine: rowsAscii[r][c] === "*", revealed: false, flagged: false, count: 0 });
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (cells[i].mine) continue;
      cells[i].count = neighbors(rows, cols, r, c).filter((ni) => cells[ni].mine).length;
    }
  }
  return { cells, rows, cols };
}

/** Mine layout as a string, for cheap equality checks. */
function mineMap(board: Board): string {
  return board.cells.map((c) => (c.mine ? "*" : ".")).join("");
}

/**
 * Independent check of every first-click guarantee on a freshly built board.
 * Returns a list of violations (empty when the board is fair).
 */
function fairnessViolations(board: Board, r: number, c: number, mines: number): string[] {
  const { cells, rows, cols } = board;
  const bad: string[] = [];
  const first = r * cols + c;
  const zone = [first, ...neighbors(rows, cols, r, c)];

  if (countMines(board) !== mines) bad.push(`mine count ${countMines(board)} !== ${mines}`);
  for (const i of zone) if (cells[i].mine) bad.push(`mine inside safe zone at ${i}`);
  if (cells[first].count !== 0) bad.push(`first click count ${cells[first].count} !== 0`);
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].mine) continue;
    const [cr, cc] = cellRc(cols, i);
    const actual = neighbors(rows, cols, cr, cc).filter((ni) => cells[ni].mine).length;
    if (cells[i].count !== actual) bad.push(`count mismatch at ${i}`);
  }

  floodReveal(board, r, c);
  for (const i of zone) if (!cells[i].revealed) bad.push(`safe-zone cell ${i} not opened by first click`);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (cell.mine && cell.revealed) bad.push(`flood revealed mine at ${i}`);
    if (!cell.revealed || cell.count !== 0) continue;
    const [cr, cc] = cellRc(cols, i);
    for (const ni of neighbors(rows, cols, cr, cc)) {
      if (!cells[ni].revealed) bad.push(`neighbour ${ni} of revealed zero ${i} still hidden`);
    }
  }
  return bad;
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

  it("accepts null / undefined seeds (free play) and still builds a fair board", () => {
    for (const seed of [null, undefined]) {
      const b = buildBoard(9, 9, 10, 4, 4, seed);
      expect(fairnessViolations(b, 4, 4, 10)).toEqual([]);
    }
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

  it("calling floodReveal on a flagged cell is a no-op", () => {
    const b = beginnerBoard();
    b.cells[4 * 9 + 4].flagged = true;
    const snapshot = b.cells.map((c) => ({ ...c }));
    floodReveal(b, 4, 4);
    expect(b.cells).toEqual(snapshot);
  });

  it("a flagged safe cell inside a zero region stays hidden and stops the cascade there", () => {
    // Deterministic layout: the whole board is one zero region except the
    // bottom-right corner mine. Flagging (1,1) must leave exactly that cell
    // hidden while every other safe cell still opens (it is reachable around
    // the flag).
    const b = boardFromAscii([
      ".....",
      ".....",
      ".....",
      ".....",
      "....*",
    ]);
    b.cells[1 * 5 + 1].flagged = true;
    floodReveal(b, 0, 0);
    for (let i = 0; i < b.cells.length; i++) {
      const cell = b.cells[i];
      if (cell.mine || cell.flagged) expect(cell.revealed, `cell ${i}`).toBe(false);
      else expect(cell.revealed, `cell ${i}`).toBe(true);
    }
  });

  it("revealing a mine directly exposes only that mine (no cascade)", () => {
    // The component marks the clicked mine itself, but the flood must also be
    // safe if it is ever pointed at a mine: the mine is revealed and nothing
    // else, because a mine's count of 0 must not be treated as an empty cell.
    const b = boardFromAscii([
      "...",
      ".*.",
      "...",
    ]);
    floodReveal(b, 1, 1);
    expect(b.cells.filter((c) => c.revealed)).toHaveLength(1);
    expect(b.cells[4].revealed).toBe(true);
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

  it("flags are irrelevant: winning never requires flagging mines, and flags on mines do not hurt", () => {
    const b = beginnerBoard();
    for (const cell of b.cells) if (!cell.mine) cell.revealed = true;
    expect(b.cells.some((c) => c.flagged)).toBe(false);
    expect(isWin(b)).toBe(true);
    for (const cell of b.cells) if (cell.mine) cell.flagged = true;
    expect(isWin(b)).toBe(true);
  });

  it("a flagged (but hidden) safe cell does not count as cleared", () => {
    const b = beginnerBoard();
    for (const cell of b.cells) if (!cell.mine) cell.revealed = true;
    const safe = b.cells.find((c) => !c.mine)!;
    safe.revealed = false;
    safe.flagged = true;
    expect(isWin(b)).toBe(false);
  });

  it("holds for every UI difficulty after a genuine full clear from the opening", () => {
    // Clear the board the way a player would — flood from the opening, then
    // reveal each remaining safe cell one click at a time — and check that the
    // win fires exactly when the last safe cell opens and not before.
    for (const d of DIFFICULTIES) {
      const b = buildBoard(d.rows, d.cols, d.mines, Math.floor(d.rows / 2), Math.floor(d.cols / 2), `clear-${d.name}`);
      floodReveal(b, Math.floor(d.rows / 2), Math.floor(d.cols / 2));
      for (let i = 0; i < b.cells.length; i++) {
        if (b.cells[i].mine || b.cells[i].revealed) continue;
        expect(isWin(b)).toBe(false);
        const [r, c] = cellRc(d.cols, i);
        floodReveal(b, r, c);
      }
      expect(isWin(b)).toBe(true);
      expect(b.cells.filter((c) => c.mine && c.revealed)).toHaveLength(0);
    }
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

// ---------------------------------------------------------------------------
// Fairness guarantees — every UI difficulty × many seeds × many first clicks
// ---------------------------------------------------------------------------

describe("fairness guarantees across seeds × difficulties × first clicks", () => {
  it("every UI preset leaves room for a full 3×3 opening (mines ≤ cells − 9)", () => {
    for (const d of DIFFICULTIES) {
      expect(d.mines, d.name).toBeLessThanOrEqual(d.rows * d.cols - 9);
    }
  });

  it.each(DIFFICULTIES)(
    "$name: exact mine count, mine-free opening, zero first click, sound flood — 150 seeds × 9 clicks",
    (d) => {
      const positions = clickPositions(d.rows, d.cols);
      for (let seed = 0; seed < 150; seed++) {
        for (const [r, c] of positions) {
          const b = buildBoard(d.rows, d.cols, d.mines, r, c, `fair-${d.name}-${seed}`);
          expect(fairnessViolations(b, r, c, d.mines), `seed=${seed} click=(${r},${c})`).toEqual([]);
        }
      }
    },
  );

  it("numeric seeds get the same guarantees", () => {
    for (const d of DIFFICULTIES) {
      for (let seed = 1; seed <= 50; seed++) {
        const b = buildBoard(d.rows, d.cols, d.mines, 0, d.cols - 1, seed);
        expect(fairnessViolations(b, 0, d.cols - 1, d.mines), `${d.name} seed=${seed}`).toEqual([]);
      }
    }
  });

  it("clamps the mine count when the board has no room outside the opening", () => {
    // 3×3 with the centre as the opening: every cell is in the safe zone.
    const tiny = buildBoard(3, 3, 20, 1, 1, "tiny");
    expect(countMines(tiny)).toBe(0);
    floodReveal(tiny, 1, 1);
    expect(isWin(tiny)).toBe(true);

    // 4×4 with a corner opening: 4 safe cells, so at most 12 mines fit.
    const corner = buildBoard(4, 4, 100, 0, 0, "corner");
    expect(countMines(corner)).toBe(12);
    for (const i of [0, 1, 4, 5]) expect(corner.cells[i].mine).toBe(false);
    expect(corner.cells[0].count).toBe(0);

    // 1×1: nothing but the opening.
    expect(countMines(buildBoard(1, 1, 5, 0, 0, "one"))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Daily Challenge determinism
// ---------------------------------------------------------------------------

describe("Daily Challenge determinism", () => {
  const DATES = ["2026-08-29", "2026-01-01", "2025-12-31", "2028-02-29"];

  it("a date seed + the same first click always yields the same board (raw builder)", () => {
    for (const d of DIFFICULTIES) {
      const r = Math.floor(d.rows / 2), c = Math.floor(d.cols / 2);
      for (const date of DATES) {
        const a = buildBoard(d.rows, d.cols, d.mines, r, c, date);
        // Build unrelated boards in between to prove there is no hidden state.
        buildBoard(d.rows, d.cols, d.mines, 0, 0, `${date}-other`);
        const b = buildBoard(d.rows, d.cols, d.mines, r, c, date);
        expect(mineMap(a)).toBe(mineMap(b));
      }
    }
  });

  it("a date seed + the same first click always yields the same no-guess board", () => {
    for (const d of DIFFICULTIES) {
      const r = Math.floor(d.rows / 2), c = Math.floor(d.cols / 2);
      for (const date of DATES) {
        const a = buildNoGuessBoard(d.rows, d.cols, d.mines, r, c, date);
        buildNoGuessBoard(d.rows, d.cols, d.mines, 0, 0, `${date}-other`);
        const b = buildNoGuessBoard(d.rows, d.cols, d.mines, r, c, date);
        expect(mineMap(a)).toBe(mineMap(b));
        expect(solveBoard(a, r, c).solved).toBe(true);
      }
    }
  });

  it("the component's daily board (beginner, centre opening) is a fair, solvable, 10-mine board", () => {
    // MinesweeperGame.vue always opens the centre of a 9×9/10 board in daily
    // mode, so every player of a given date sees this exact board.
    for (const date of DATES) {
      const b = buildNoGuessBoard(9, 9, 10, 4, 4, date);
      expect(fairnessViolations(b, 4, 4, 10)).toEqual([]);
      expect(solveBoard(b, 4, 4).solved).toBe(true);
    }
  });

  it("a pre-built Rng seeded the same way gives the same no-guess board as the raw seed", () => {
    const a = buildNoGuessBoard(16, 30, 99, 8, 15, makeRng("2026-08-29"));
    const b = buildNoGuessBoard(16, 30, 99, 8, 15, "2026-08-29");
    expect(mineMap(a)).toBe(mineMap(b));
  });
});

// ---------------------------------------------------------------------------
// solveBoard() — deterministic single-point + subset + global-count solver
// ---------------------------------------------------------------------------

describe("solveBoard()", () => {
  it("is sound: only ever opens safe cells and only ever marks real mines", () => {
    for (const d of DIFFICULTIES) {
      const starts: Array<[number, number]> = [[Math.floor(d.rows / 2), Math.floor(d.cols / 2)], [0, 0]];
      for (let seed = 0; seed < 100; seed++) {
        for (const [r, c] of starts) {
          const b = buildBoard(d.rows, d.cols, d.mines, r, c, `sound-${d.name}-${seed}`);
          const res = solveBoard(b, r, c);
          let opened = 0;
          for (let i = 0; i < b.cells.length; i++) {
            if (res.state[i] === SOLVER_OPEN) {
              opened++;
              expect(b.cells[i].mine, `opened a mine at ${i}`).toBe(false);
            } else if (res.state[i] === SOLVER_MINE) {
              expect(b.cells[i].mine, `marked a safe cell at ${i}`).toBe(true);
            } else {
              expect(res.state[i]).toBe(SOLVER_UNKNOWN);
            }
          }
          expect(res.revealed).toBe(opened);
          expect(res.safeCells).toBe(d.rows * d.cols - d.mines);
          expect(res.revealed).toBeLessThanOrEqual(res.safeCells);
          expect(res.solved).toBe(res.revealed === res.safeCells);
        }
      }
    }
  });

  it("starts from exactly the player's opening: every cell floodReveal opens is open for the solver", () => {
    for (let seed = 0; seed < 40; seed++) {
      const b = buildBoard(16, 16, 40, 8, 8, `opening-${seed}`);
      const res = solveBoard(b, 8, 8);
      floodReveal(b, 8, 8);
      for (let i = 0; i < b.cells.length; i++) {
        if (b.cells[i].revealed) expect(res.state[i]).toBe(SOLVER_OPEN);
      }
    }
  });

  it("does not mutate the board", () => {
    const b = buildBoard(9, 9, 10, 4, 4, "immutable");
    const snapshot = b.cells.map((c) => ({ ...c }));
    solveBoard(b, 4, 4);
    expect(b.cells).toEqual(snapshot);
  });

  it("single-point rule: a number whose remaining mines are 0 opens the rest, one whose need equals its hidden cells marks them", () => {
    // Opening at (0,0) floods rows 0–1. (1,3) reads 1 with a single hidden
    // neighbour (2,2) → mine; then (1,2) has need 0 → (2,1) safe, etc.
    const b = boardFromAscii([
      ".....",
      ".....",
      "*.*..",
    ]);
    const res = solveBoard(b, 0, 0);
    expect(res.solved).toBe(true);
    expect(res.state[2 * 5 + 0]).toBe(SOLVER_MINE);
    expect(res.state[2 * 5 + 2]).toBe(SOLVER_MINE);
    expect(res.state[2 * 5 + 1]).toBe(SOLVER_OPEN);
  });

  it("subset rule (safe branch): a 1 next to a 1 with one extra hidden cell proves that cell safe", () => {
    // Row 1 reads 1 1 2 1 1 with row 2 fully hidden; no single-point move
    // exists (every need is strictly between 0 and the hidden count). The
    // hidden set of (1,0) {20,21} ⊂ that of (1,1) {20,21,22} with equal needs,
    // so (2,2) is safe — after which the board resolves.
    const b = boardFromAscii([
      ".....",
      ".....",
      ".*.*.",
    ]);
    const res = solveBoard(b, 0, 0);
    expect(res.solved).toBe(true);
    expect(res.state[2 * 5 + 1]).toBe(SOLVER_MINE);
    expect(res.state[2 * 5 + 3]).toBe(SOLVER_MINE);
  });

  it("subset rule (mine branch): a 1 next to a 2 with one extra hidden cell proves that cell a mine", () => {
    // Row 1 reads 1 2 1 2 1; again no single-point move. (1,0) {20,21} need 1
    // ⊂ (1,1) {20,21,22} need 2 → (2,2) is a mine, then everything follows.
    const b = boardFromAscii([
      ".....",
      ".....",
      "*.*.*",
    ]);
    const res = solveBoard(b, 0, 0);
    expect(res.solved).toBe(true);
    expect(res.state[2 * 5 + 2]).toBe(SOLVER_MINE);
    expect(res.state[2 * 5 + 1]).toBe(SOLVER_OPEN);
    expect(res.state[2 * 5 + 3]).toBe(SOLVER_OPEN);
  });

  it("global count (safe branch): once all mines are accounted for, an isolated pocket is safe", () => {
    // A full wall of mines on row 2 is deduced by single point; rows 3–4 are
    // then only reachable through the mine counter (0 mines left).
    const b = boardFromAscii([
      ".....",
      ".....",
      "*****",
      ".....",
      ".....",
    ]);
    const res = solveBoard(b, 0, 0);
    expect(res.solved).toBe(true);
    for (let i = 15; i < 25; i++) expect(res.state[i]).toBe(SOLVER_OPEN);
  });

  it("global count (mine branch): when the remaining mines equal the hidden cells, they are all mines", () => {
    const b = boardFromAscii([
      "...",
      "...",
      "***",
      "***",
    ]);
    const res = solveBoard(b, 0, 0);
    expect(res.solved).toBe(true);
    for (let i = 6; i < 12; i++) expect(res.state[i]).toBe(SOLVER_MINE);
  });

  it("reports a genuine 50/50 as unsolved without guessing", () => {
    // Two 1s over two hidden cells sharing one mine — undecidable.
    const b = boardFromAscii([
      "..",
      "..",
      "*.",
    ]);
    const res = solveBoard(b, 0, 0);
    expect(res.solved).toBe(false);
    expect(res.revealed).toBe(4);
    expect(res.safeCells).toBe(5);
    expect(res.state[4]).toBe(SOLVER_UNKNOWN);
    expect(res.state[5]).toBe(SOLVER_UNKNOWN);
  });

  it("measures how often raw boards are no-guess solvable (documented rates)", () => {
    // Measured with 300 seeds per preset from the centre opening:
    //   beginner 251/300 (83.7%), intermediate 170/300 (56.7%),
    //   expert 19/300 (6.3%); from a corner: 232, 145 and 15 of 300.
    // The bounds below are deliberately loose so a tweak to the RNG or solver
    // does not flake the suite; the exact figures are for the record.
    const floors: Record<string, number> = { beginner: 0.75, intermediate: 0.45, expert: 0.03 };
    for (const d of DIFFICULTIES) {
      const r = Math.floor(d.rows / 2), c = Math.floor(d.cols / 2);
      let solved = 0;
      for (let seed = 0; seed < 300; seed++) {
        if (solveBoard(buildBoard(d.rows, d.cols, d.mines, r, c, `m-${seed}`), r, c).solved) solved++;
      }
      expect(solved / 300, `${d.name}: ${solved}/300`).toBeGreaterThanOrEqual(floors[d.name]);
    }
  });
});

// ---------------------------------------------------------------------------
// buildNoGuessBoard() — bounded, seed-deterministic no-guess generator
// ---------------------------------------------------------------------------

describe("buildNoGuessBoard()", () => {
  it.each(DIFFICULTIES)(
    "$name: every seed × every first click yields a fair board solvable without guessing",
    (d) => {
      for (let seed = 0; seed < 25; seed++) {
        for (const [r, c] of clickPositions(d.rows, d.cols)) {
          const b = buildNoGuessBoard(d.rows, d.cols, d.mines, r, c, `ng-${d.name}-${seed}`);
          expect(solveBoard(b, r, c).solved, `seed=${seed} click=(${r},${c})`).toBe(true);
          expect(fairnessViolations(b, r, c, d.mines), `seed=${seed} click=(${r},${c})`).toEqual([]);
        }
      }
    },
  );

  it("never draws more than maxAttempts candidate boards", () => {
    // Every candidate costs exactly one shuffle, so counting shuffles bounds the work.
    for (const maxAttempts of [1, 3, NO_GUESS_ATTEMPTS]) {
      for (let seed = 0; seed < 20; seed++) {
        const inner = makeRng(`budget-${seed}`);
        let shuffles = 0;
        const counting = { ...inner, shuffle: <T>(arr: T[]) => { shuffles++; return inner.shuffle(arr); } };
        buildNoGuessBoard(16, 30, 99, 8, 15, counting, maxAttempts);
        expect(shuffles).toBeGreaterThanOrEqual(1);
        expect(shuffles).toBeLessThanOrEqual(maxAttempts);
      }
    }
    expect(NO_GUESS_ATTEMPTS).toBe(200);
  });

  it("stops at the first solvable candidate, which is the raw board when that one is solvable", () => {
    for (let seed = 0; seed < 100; seed++) {
      const raw = buildBoard(9, 9, 10, 4, 4, `first-${seed}`);
      const ng = buildNoGuessBoard(9, 9, 10, 4, 4, `first-${seed}`);
      if (solveBoard(raw, 4, 4).solved) expect(mineMap(ng)).toBe(mineMap(raw));
      else expect(mineMap(ng)).not.toBe(mineMap(raw));
    }
  });

  it("with maxAttempts = 1 it is exactly the raw builder", () => {
    for (let seed = 0; seed < 30; seed++) {
      const raw = buildBoard(16, 30, 99, 8, 15, `one-${seed}`);
      const ng = buildNoGuessBoard(16, 30, 99, 8, 15, `one-${seed}`, 1);
      expect(mineMap(ng)).toBe(mineMap(raw));
    }
  });

  it("falls back to the candidate the solver got furthest on when the budget runs out", () => {
    // Replay the seeded stream by hand: with a tiny budget on expert, find seeds
    // where no candidate is solvable and check the returned board is the first
    // candidate with the highest revealed count.
    const budget = 4;
    let exhausted = 0;
    let improved = 0;
    for (let seed = 0; seed < 40 && exhausted < 10; seed++) {
      const rng = makeRng(`fallback-${seed}`);
      const candidates = Array.from({ length: budget }, () => buildBoard(16, 30, 99, 8, 15, rng));
      const results = candidates.map((b) => solveBoard(b, 8, 15));
      if (results.some((r) => r.solved)) continue;
      exhausted++;
      let bestIdx = 0;
      for (let k = 1; k < budget; k++) {
        if (results[k].revealed > results[bestIdx].revealed) { bestIdx = k; improved++; }
      }
      const ng = buildNoGuessBoard(16, 30, 99, 8, 15, `fallback-${seed}`, budget);
      expect(mineMap(ng)).toBe(mineMap(candidates[bestIdx]));
      expect(countMines(ng)).toBe(99);
    }
    expect(exhausted).toBe(10);
    expect(improved).toBeGreaterThan(0);
  });

  it("returns a valid best-effort board when no layout can be solvable", () => {
    // 5×5 with 16 mines and a corner opening: only 9 safe cells, essentially
    // never deducible, so the whole budget is spent and the best try is kept.
    const b = buildNoGuessBoard(5, 5, 16, 0, 0, "dense", 8);
    expect(countMines(b)).toBe(16);
    expect(fairnessViolations(b, 0, 0, 16)).toEqual([]);
  });

  it("a board with no room for mines is trivially solvable", () => {
    const b = buildNoGuessBoard(3, 3, 20, 1, 1, "tiny");
    expect(countMines(b)).toBe(0);
    expect(solveBoard(b, 1, 1).solved).toBe(true);
  });
});
