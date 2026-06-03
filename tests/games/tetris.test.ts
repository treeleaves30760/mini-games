import { describe, it, expect } from "vitest";
import {
  COLS,
  ROWS,
  PIECES,
  PIECE_KEYS,
  COLORS,
  emptyBoard,
  spawnPiece,
  getCells,
  collides,
  tryRotate,
  lockPiece,
  clearLines,
  buildBag,
  nextFromBag,
  basePointsForLines,
  type Piece,
} from "~/games/tetris";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fill a single row fully with an arbitrary color. */
function fillRow(board: ReturnType<typeof emptyBoard>, row: number): void {
  for (let c = 0; c < COLS; c++) board[row][c] = "#ffffff";
}

/** Count how many cells in `row` are non-null. */
function occupiedCount(board: ReturnType<typeof emptyBoard>, row: number): number {
  return board[row].filter((c) => c !== null).length;
}

// ---------------------------------------------------------------------------
// 1. Rotation invariant — 4 CW rotations → same cells as original
// ---------------------------------------------------------------------------

describe("rotation — 4 CW steps returns to original", () => {
  for (const type of PIECE_KEYS) {
    it(`piece ${type}`, () => {
      const piece = spawnPiece(type);
      const board = emptyBoard();

      // Rotate CW four times — must return to rot 0
      let p = piece;
      for (let i = 0; i < 4; i++) {
        p = tryRotate(board, p, true);
      }
      // Normalise cells to sorted string for comparison
      const cellStr = (cells: { x: number; y: number }[]) =>
        [...cells]
          .map(({ x, y }) => `${x},${y}`)
          .sort()
          .join("|");

      expect(cellStr(getCells(p))).toBe(cellStr(getCells(piece)));
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Rotation — 4 CCW steps also returns to original
// ---------------------------------------------------------------------------

describe("rotation — 4 CCW steps returns to original", () => {
  for (const type of PIECE_KEYS) {
    it(`piece ${type}`, () => {
      const piece = spawnPiece(type);
      const board = emptyBoard();

      let p = piece;
      for (let i = 0; i < 4; i++) {
        p = tryRotate(board, p, false);
      }
      const cellStr = (cells: { x: number; y: number }[]) =>
        [...cells]
          .map(({ x, y }) => `${x},${y}`)
          .sort()
          .join("|");

      expect(cellStr(getCells(p))).toBe(cellStr(getCells(piece)));
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Collision detection — boundary checks
// ---------------------------------------------------------------------------

describe("collides — boundary checks", () => {
  it("rejects a piece that would go off the left edge", () => {
    const board = emptyBoard();
    const piece = { ...spawnPiece("I"), x: -1, y: 1 };
    // leftmost cell of I-rot0 is dc=0, so absolute x = -1 → out of bounds
    expect(collides(board, piece)).toBe(true);
  });

  it("rejects a piece that would go off the right edge", () => {
    const board = emptyBoard();
    // I-rot0 occupies col offsets 0–3; placing at x=8 → rightmost at 11 ≥ COLS(10)
    const piece = { ...spawnPiece("I"), x: 8, y: 1 };
    expect(collides(board, piece)).toBe(true);
  });

  it("rejects a piece at or below the bottom", () => {
    const board = emptyBoard();
    // I-rot0 row-offset=1; placing y=ROWS-1 → absolute row ROWS → out of bounds
    const piece = { ...spawnPiece("I"), x: 0, y: ROWS - 1 };
    expect(collides(board, piece)).toBe(true);
  });

  it("accepts a piece fully inside the playfield", () => {
    const board = emptyBoard();
    // I-rot0 occupies rows y+1; x=3 → cols 3–6, row y+1 with y=0 → row 1
    const piece = { ...spawnPiece("I"), x: 3, y: 0 };
    expect(collides(board, piece)).toBe(false);
  });

  it("accepts cells above the visible area (spawn zone, y < 0)", () => {
    const board = emptyBoard();
    // I-rot3 offsets: [1,0],[1,1],[1,2],[1,3]; y=-2 → rows -2..1 — rows <0 are allowed
    const piece = { ...spawnPiece("I"), rot: 3, x: 3, y: -2 };
    expect(collides(board, piece)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Collision detection — overlap with filled cells
// ---------------------------------------------------------------------------

describe("collides — overlap with filled cells", () => {
  it("rejects when a cell overlaps a filled board cell", () => {
    const board = emptyBoard();
    // Fill a single cell
    board[5][3] = "#ff0000";
    // Place I-rot0 at x=3,y=4 → occupies row y+1=5, cols 3-6
    const piece = { ...spawnPiece("I"), x: 3, y: 4 };
    expect(collides(board, piece)).toBe(true);
  });

  it("accepts when piece is adjacent to but not overlapping a filled cell", () => {
    const board = emptyBoard();
    board[5][3] = "#ff0000";
    // Place I-rot0 at x=3, y=3 → occupies row y+1=4, cols 3-6 (row 4, not 5)
    const piece = { ...spawnPiece("I"), x: 3, y: 3 };
    expect(collides(board, piece)).toBe(false);
  });

  it("accepts a full empty board for any standard spawn position", () => {
    const board = emptyBoard();
    for (const type of PIECE_KEYS) {
      const piece = { ...spawnPiece(type), x: 3, y: 0 };
      expect(collides(board, piece), `${type} should not collide on empty board`).toBe(false);
    }
  });

  it("collides with dx/dy offsets", () => {
    const board = emptyBoard();
    board[6][4] = "#aabbcc";
    // I-rot0 at x=4,y=4 → occupies row 5, cols 4-7 (no collision)
    // but dy=1 → checks row 6 → col 4 is filled
    const piece = { ...spawnPiece("I"), x: 4, y: 4 };
    expect(collides(board, piece, 0, 0)).toBe(false);
    expect(collides(board, piece, 0, 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Line-clear — removes full rows and shifts rows above down
// ---------------------------------------------------------------------------

describe("clearLines — basic behaviour", () => {
  it("returns same board reference when no rows are full", () => {
    const board = emptyBoard();
    board[ROWS - 1][0] = "#ff0000"; // one cell, not a full row
    const result = clearLines(board);
    expect(result.linesCleared).toBe(0);
    expect(result.basePoints).toBe(0);
    expect(result.board).toBe(board); // same reference
  });

  it("removes one full bottom row and prepends an empty row", () => {
    const board = emptyBoard();
    fillRow(board, ROWS - 1);

    // Put a sentinel in the row just above the full row
    board[ROWS - 2][0] = "#sentinel";

    const result = clearLines(board);
    expect(result.linesCleared).toBe(1);
    expect(result.board).toHaveLength(ROWS);

    // Sentinel row (formerly ROWS-2) should now be at ROWS-1
    expect(result.board[ROWS - 1][0]).toBe("#sentinel");

    // The new top row should be empty
    expect(result.board[0].every((c) => c === null)).toBe(true);
  });

  it("removes four full rows (Tetris) and prepends four empty rows", () => {
    const board = emptyBoard();
    fillRow(board, ROWS - 1);
    fillRow(board, ROWS - 2);
    fillRow(board, ROWS - 3);
    fillRow(board, ROWS - 4);

    // Sentinel above the cleared zone
    board[ROWS - 5][7] = "#top";

    const result = clearLines(board);
    expect(result.linesCleared).toBe(4);
    expect(result.board).toHaveLength(ROWS);

    // Sentinel should now be at ROWS-1
    expect(result.board[ROWS - 1][7]).toBe("#top");

    // Top 4 rows should be empty
    for (let r = 0; r < 4; r++) {
      expect(result.board[r].every((c) => c === null), `row ${r} should be empty`).toBe(true);
    }
  });

  it("leaves partial rows intact", () => {
    const board = emptyBoard();
    fillRow(board, ROWS - 1);                 // full → cleared
    board[ROWS - 2][0] = "#partial";          // partial row → kept

    const result = clearLines(board);
    expect(result.linesCleared).toBe(1);

    // The partial row content must survive somewhere
    const hasPartial = result.board.some((row) => row[0] === "#partial");
    expect(hasPartial).toBe(true);
  });

  it("does not mutate the original board", () => {
    const board = emptyBoard();
    fillRow(board, ROWS - 1);
    const snapshot = board[ROWS - 1].slice();

    const result = clearLines(board);
    // The original row was full; clearLines creates a new board, not modifying old
    expect(board[ROWS - 1]).toEqual(snapshot);
    expect(result.board).not.toBe(board);
  });

  it("handles non-contiguous full rows correctly", () => {
    const board = emptyBoard();
    fillRow(board, ROWS - 1);   // full
    board[ROWS - 2][3] = "#x";  // partial
    fillRow(board, ROWS - 3);   // full

    const result = clearLines(board);
    expect(result.linesCleared).toBe(2);
    expect(result.board).toHaveLength(ROWS);

    // The partial row (#x in col 3) should still be present
    const hasX = result.board.some((row) => row[3] === "#x");
    expect(hasX).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Score / level for 1–4 line clears
// ---------------------------------------------------------------------------

describe("basePointsForLines — scoring table", () => {
  it("1 line → 100 base points", () => {
    expect(basePointsForLines(1)).toBe(100);
  });
  it("2 lines → 300 base points", () => {
    expect(basePointsForLines(2)).toBe(300);
  });
  it("3 lines → 500 base points", () => {
    expect(basePointsForLines(3)).toBe(500);
  });
  it("4 lines (Tetris) → 800 base points", () => {
    expect(basePointsForLines(4)).toBe(800);
  });
  it("0 lines → 0 base points", () => {
    expect(basePointsForLines(0)).toBe(0);
  });
  it("negative n → 800 (fallback via ?? — SCORE_TABLE index out of range)", () => {
    // Math.min(-1, 4) = -1; SCORE_TABLE[-1] = undefined; ?? 800 fires
    expect(basePointsForLines(-1)).toBe(800);
  });
  it("clearLines basePoints matches table for 1-4 clears", () => {
    for (const n of [1, 2, 3, 4] as const) {
      const board = emptyBoard();
      for (let i = 0; i < n; i++) fillRow(board, ROWS - 1 - i);
      const result = clearLines(board);
      expect(result.basePoints).toBe(basePointsForLines(n));
    }
  });
});

// ---------------------------------------------------------------------------
// 7. 7-bag randomizer
// ---------------------------------------------------------------------------

describe("buildBag + nextFromBag", () => {
  it("bag contains exactly one of each piece type", () => {
    const rng = makeRng("test-seed");
    const bag = buildBag(rng);
    expect(bag).toHaveLength(7);
    for (const type of PIECE_KEYS) {
      expect(bag.filter((t) => t === type)).toHaveLength(1);
    }
  });

  it("draws all 7 pieces before refilling", () => {
    const rng = makeRng("bag-test");
    const bag = buildBag(rng);
    const drawn: string[] = [];
    for (let i = 0; i < 7; i++) drawn.push(nextFromBag(bag, rng));
    expect(drawn.sort()).toEqual([...PIECE_KEYS].sort());
  });

  it("refills when bag is empty", () => {
    const rng = makeRng("refill");
    const bag = buildBag(rng);
    // Drain bag
    for (let i = 0; i < 7; i++) nextFromBag(bag, rng);
    expect(bag).toHaveLength(0);
    // nextFromBag should refill transparently
    const t = nextFromBag(bag, rng);
    expect(PIECE_KEYS).toContain(t);
  });

  it("is deterministic for the same seed", () => {
    const seq1: string[] = [];
    const seq2: string[] = [];
    const rng1 = makeRng("det-seed");
    const bag1 = buildBag(rng1);
    for (let i = 0; i < 14; i++) seq1.push(nextFromBag(bag1, rng1));

    const rng2 = makeRng("det-seed");
    const bag2 = buildBag(rng2);
    for (let i = 0; i < 14; i++) seq2.push(nextFromBag(bag2, rng2));

    expect(seq1).toEqual(seq2);
  });
});

// ---------------------------------------------------------------------------
// 8. lockPiece — writes piece color to board
// ---------------------------------------------------------------------------

describe("lockPiece", () => {
  it("writes the correct color for each cell", () => {
    const board = emptyBoard();
    // Use O piece at x=1,y=0 — occupies (2,0),(3,0),(2,1),(3,1)
    const piece = { ...spawnPiece("O"), x: 1, y: 0 };
    lockPiece(board, piece);
    for (const { x, y } of getCells(piece)) {
      expect(board[y][x]).toBe(COLORS["O"]);
    }
  });

  it("does not write cells above the visible area (y < 0)", () => {
    const board = emptyBoard();
    // Force piece partially above screen — I-rot3, y=-1 → rows -1,0,1,2 at x+1
    const piece = { type: "I" as const, rot: 3, x: 3, y: -1 };
    lockPiece(board, piece);
    // row 0 of board should be untouched since only the y<0 cell is skipped
    // actually rows 0,1,2 do get written; row -1 is skipped
    expect(board[0][4]).toBe(COLORS["I"]);  // y=0 → written
    // No out-of-bounds access occurred (would throw)
  });
});

// ---------------------------------------------------------------------------
// 9. tryRotate — all wall-kicks fail returns original piece unchanged
// ---------------------------------------------------------------------------

describe("tryRotate — all kicks blocked returns original piece", () => {
  it("returns the original piece when all 5 kick positions are blocked (line 194)", () => {
    // I-piece rot=0 at x=0, y=0: cells at (piece.x+0, y+1), (piece.x+1, y+1),
    // (piece.x+2, y+1), (piece.x+3, y+1) — i.e. row 1, cols 0-3.
    // Rotating CW to rot=1 gives offset [2,0],[2,1],[2,2],[2,3] relative to piece.
    // Absolute columns with kick dx: piece.x + 2 + dx = 0+2+dx.
    // For dx in [0,-1,1,-2,2]: columns {2,1,3,0,4} — all rows 0-3.
    // Fill rows 0-3 at columns 0-4 to block every kick.
    const board = emptyBoard();
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col <= 4; col++) {
        board[row][col] = "#blocked";
      }
    }
    const piece: Piece = { type: "I", rot: 0, x: 0, y: 0 };
    const result = tryRotate(board, piece, true);
    // No kick succeeded — must get back the exact same object reference
    expect(result).toBe(piece);
    // Rotation did not change
    expect(result.rot).toBe(0);
    expect(result.x).toBe(0);
  });
});
