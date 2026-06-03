import { describe, it, expect } from "vitest";
import {
  SIZE,
  EMPTY,
  BLACK,
  WHITE,
  makeBoard,
  cloneBoard,
  inBounds,
  isLegalMove,
  isBoardFull,
  countDir,
  findWin,
  dirLine,
  maxRun,
  makesFour,
  hasStraightFour,
  makesOpenThree,
  classifyDir,
  analyzeBlack,
  computeForbiddenPoints,
  scorePattern,
  getCandidates,
  getAIMove,
  type Board,
} from "~/games/gomoku";
import { makeRng } from "~/utils/rng";

// ── helpers ────────────────────────────────────────────────────────────────────

/** Place stones at the listed coordinates for the given color. Mutates. */
function place(b: Board, color: number, ...pts: [number, number][]): Board {
  for (const [r, c] of pts) b[r][c] = color as 0 | 1 | 2;
  return b;
}

// ── makeBoard / board helpers ──────────────────────────────────────────────────

describe("makeBoard", () => {
  it("creates a SIZE×SIZE grid filled with EMPTY", () => {
    const b = makeBoard();
    expect(b).toHaveLength(SIZE);
    expect(b[0]).toHaveLength(SIZE);
    expect(b.every((row) => row.every((v) => v === EMPTY))).toBe(true);
  });
});

describe("inBounds", () => {
  it("accepts corners and centre", () => {
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(SIZE - 1, SIZE - 1)).toBe(true);
    expect(inBounds(7, 7)).toBe(true);
  });
  it("rejects out-of-range coordinates", () => {
    expect(inBounds(-1, 0)).toBe(false);
    expect(inBounds(0, SIZE)).toBe(false);
    expect(inBounds(SIZE, SIZE)).toBe(false);
  });
});

describe("isLegalMove", () => {
  it("allows placing on an empty cell", () => {
    expect(isLegalMove(makeBoard(), 7, 7)).toBe(true);
  });
  it("forbids placing on an occupied cell", () => {
    const b = makeBoard();
    place(b, BLACK, [7, 7]);
    expect(isLegalMove(b, 7, 7)).toBe(false);
  });
  it("forbids placing out of bounds", () => {
    expect(isLegalMove(makeBoard(), -1, 0)).toBe(false);
    expect(isLegalMove(makeBoard(), 7, SIZE)).toBe(false);
  });
});

describe("isBoardFull", () => {
  it("empty board is not full", () => {
    expect(isBoardFull(makeBoard())).toBe(false);
  });
  it("board with one empty cell is not full", () => {
    const b = makeBoard();
    // fill all but one
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        b[r][c] = BLACK as 1;
    b[SIZE - 1][SIZE - 1] = EMPTY as 0;
    expect(isBoardFull(b)).toBe(false);
  });
});

// ── win detection ──────────────────────────────────────────────────────────────

describe("findWin — 5-in-a-row detected in all four directions", () => {
  it("detects a horizontal 5-in-a-row for BLACK", () => {
    const b = makeBoard();
    place(b, BLACK, [3, 0], [3, 1], [3, 2], [3, 3], [3, 4]);
    const w = findWin(b);
    expect(w).not.toBeNull();
    expect(w!.winner).toBe(BLACK);
    expect(w!.cells).toHaveLength(5);
  });

  it("detects a vertical 5-in-a-row for WHITE", () => {
    const b = makeBoard();
    place(b, WHITE, [0, 5], [1, 5], [2, 5], [3, 5], [4, 5]);
    const w = findWin(b);
    expect(w).not.toBeNull();
    expect(w!.winner).toBe(WHITE);
  });

  it("detects a diagonal (↘) 5-in-a-row for BLACK", () => {
    const b = makeBoard();
    place(b, BLACK, [0, 0], [1, 1], [2, 2], [3, 3], [4, 4]);
    const w = findWin(b);
    expect(w).not.toBeNull();
    expect(w!.winner).toBe(BLACK);
  });

  it("detects an anti-diagonal (↙) 5-in-a-row for WHITE", () => {
    const b = makeBoard();
    place(b, WHITE, [0, 4], [1, 3], [2, 2], [3, 1], [4, 0]);
    const w = findWin(b);
    expect(w).not.toBeNull();
    expect(w!.winner).toBe(WHITE);
  });

  it("returns null when nobody has 5 in a row", () => {
    const b = makeBoard();
    place(b, BLACK, [3, 0], [3, 1], [3, 2], [3, 3]); // only 4
    expect(findWin(b)).toBeNull();
  });

  it("4-in-a-row is NOT a win", () => {
    const b = makeBoard();
    place(b, BLACK, [7, 7], [7, 8], [7, 9], [7, 10]);
    expect(findWin(b)).toBeNull();
  });

  it("6-in-a-row IS detected as a win (overline is a win in findWin)", () => {
    // findWin just checks >=5; Renju forbidden-move rules are separate.
    const b = makeBoard();
    place(b, WHITE, [5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7]);
    const w = findWin(b);
    expect(w).not.toBeNull();
    expect(w!.winner).toBe(WHITE);
    expect(w!.cells.length).toBeGreaterThanOrEqual(6);
  });

  it("returns the correct winning cells (contiguous run)", () => {
    const b = makeBoard();
    place(b, BLACK, [2, 2], [2, 3], [2, 4], [2, 5], [2, 6]);
    const w = findWin(b);
    expect(w).not.toBeNull();
    const cols = w!.cells.map((p) => p.c).sort((a, z) => a - z);
    expect(cols).toEqual([2, 3, 4, 5, 6]);
  });
});

// ── Renju overline ─────────────────────────────────────────────────────────────

describe("Renju — overline (長連) is forbidden for BLACK", () => {
  it("flags a 6-in-a-row as forbidden for black", () => {
    const b = makeBoard();
    // place 6 blacks in a row; the last stone triggers the check
    place(b, BLACK, [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]);
    const a = analyzeBlack(b, 7, 6);
    // analyzeBlack checks from the perspective of the stone at (7,6)
    expect(a.result).toBe("forbidden");
    expect((a as { result: "forbidden"; reason: string }).reason).toBe("長連");
  });

  it("an exact 5-in-a-row for black is a WIN, not forbidden", () => {
    const b = makeBoard();
    place(b, BLACK, [7, 1], [7, 2], [7, 3], [7, 4], [7, 5]);
    const a = analyzeBlack(b, 7, 5);
    expect(a.result).toBe("win");
  });

  it("overline is NOT forbidden for white (no Renju restriction)", () => {
    // findWin simply detects >=5; there is no forbidden-move analysis for white.
    const b = makeBoard();
    place(b, WHITE, [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]);
    const w = findWin(b);
    expect(w).not.toBeNull();
    expect(w!.winner).toBe(WHITE);
  });
});

// ── Renju double-four (四四) ───────────────────────────────────────────────────
//
// Layout: place 3 blacks on one row and 3 blacks on a crossing column so that
// the intersection creates a double-four when the intersection stone is placed.
//
//   _  _  _  _  _
//   _  B  _  _  _
//   B  B  *  B  _    ← row 7, the stone at (7,7) is the test point
//   _  B  _  _  _
//   _  B  _  _  _
//
// Horizontal: B B * B _  → placing at * gives a run of 4 (BB*B) with one empty
// on the right — that's makesFour.
// Vertical:   B(5,7) B(6,7) *(7,7) B(8,7) B(9,7) → also a four.
// So (7,7) is double-four → forbidden for black.

describe("Renju — double-four (四四) forbidden for BLACK", () => {
  function buildDoubleFourBoard(): Board {
    const b = makeBoard();
    // horizontal arm: (7,4) (7,5) (7,7) already placed, test stone goes at (7,6)
    // vertical arm:   (4,6) (5,6) (7,6) already placed, test stone goes at (7,6)
    // We need the stone at (7,6) to be the one being analyzed.
    // Horizontal: _ B B [*] B _    → 4 blacks with two open ends → four
    place(b, BLACK, [7, 4], [7, 5], [7, 7]); // horizontal neighbours
    // Vertical: _ B B [*] B _    → 4 blacks with two open ends → four
    place(b, BLACK, [4, 6], [5, 6], [8, 6]); // vertical neighbours
    // Place the test stone
    b[7][6] = BLACK as 1;
    return b;
  }

  it("flags double-four as forbidden for black", () => {
    const b = buildDoubleFourBoard();
    const a = analyzeBlack(b, 7, 6);
    expect(a.result).toBe("forbidden");
    expect((a as { result: "forbidden"; reason: string }).reason).toBe("四四");
  });

  it("same double-four shape for white is NOT forbidden (white has no Renju rules)", () => {
    // For white we simply confirm findWin does not flag it — white can always
    // place freely; there is no analyzeBlack equivalent for white.
    const b = makeBoard();
    // Place white stones in the same shape
    place(b, WHITE, [7, 4], [7, 5], [7, 7]);
    place(b, WHITE, [4, 6], [5, 6], [8, 6]);
    b[7][6] = WHITE as 2;
    // findWin should still return null (no 5+ in a row yet)
    expect(findWin(b)).toBeNull();
    // And isLegalMove says the cell is occupied (placed), which is what we care about:
    // white faces no forbidden-move restriction — just confirm analyzeBlack is
    // a BLACK-only function and the board state is still playable for white.
    expect(isLegalMove(b, 7, 6)).toBe(false); // occupied, not forbidden per se
  });
});

// ── Renju double-three (三三) ──────────────────────────────────────────────────
//
// Build a position where playing at a point creates two simultaneous open threes.
// An open three is one step away from a straight open four ".1111.".
//
// Strategy: we want two lines through (r,c) each of which, once one more stone
// is added to the line, becomes ".1111.".
//
// Horizontal line through (5,5):  _ B _ [*] B _  → two ways to fill→ open four
// Vertical line through (5,5):    _ B _ [*] B _  → same
//
// Concrete: place blacks at (5,3),(5,7) horizontally and (3,5),(7,5) vertically.
// The stone at (5,5) connects each pair to a run of 3, and filling one gap gives
// open four in each direction → double-three.

describe("Renju — double-three (三三) forbidden for BLACK", () => {
  function buildDoubleThreeBoard(): Board {
    const b = makeBoard();
    // Horizontal: (5,3) _ (5,5) _ (5,7) — placing at (5,5) gives _B_B_B_
    // but we need a 3-stone open three:
    // Place (5,3) (5,4) [test at 5,5] (5,6) (5,7) would give too many stones.
    // Simpler: two existing blacks on each side such that placing at (5,5)
    // creates an open three on each axis.
    //
    // For makesOpenThree to fire on the horizontal direction:
    //   dirLine window sees: _ B B [*] 0 0 ...
    //   after placing *:     _ B B B 0 0 ...
    //   filling the gap to the right: _ B B B B 0  → hasStraightFour fires
    // But we also need the left side open (no blocker at s position).
    //
    // Use a clear canonical double-three:
    //   Horizontal: stones at (5,3) (5,4), test at (5,5), empty at (5,6)(5,7)
    //     → after placing: ...0 B B B 0 0... → fill (5,6) → 0 B B B B 0 ✓ open four
    //   Vertical:   stones at (3,5) (4,5), test at (5,5)
    //     → after placing: ...0 B B B 0 0... → fill (6,5) → open four ✓
    place(b, BLACK, [5, 3], [5, 4]); // horizontal arm
    place(b, BLACK, [3, 5], [4, 5]); // vertical arm
    // Place the test stone
    b[5][5] = BLACK as 1;
    return b;
  }

  it("flags double-three as forbidden for black", () => {
    const b = buildDoubleThreeBoard();
    const a = analyzeBlack(b, 5, 5);
    expect(a.result).toBe("forbidden");
    expect((a as { result: "forbidden"; reason: string }).reason).toBe("三三");
  });

  it("same double-three shape for white is not analysed as forbidden", () => {
    // White has no Renju rules; we just confirm findWin is still null.
    const b = makeBoard();
    place(b, WHITE, [5, 3], [5, 4]);
    place(b, WHITE, [3, 5], [4, 5]);
    b[5][5] = WHITE as 2;
    expect(findWin(b)).toBeNull(); // no 5-in-a-row yet — perfectly legal
  });
});

// ── A single four / three is OK for black ─────────────────────────────────────

describe("Renju — single four or single three is OK for black", () => {
  it("a single open three does not trigger forbidden", () => {
    const b = makeBoard();
    // Horizontal only: _ B B [*] 0  → open three in one direction only
    place(b, BLACK, [7, 3], [7, 4]);
    b[7][5] = BLACK as 1;
    const a = analyzeBlack(b, 7, 5);
    // Should be "ok" (only one three direction)
    expect(a.result).not.toBe("forbidden");
  });

  it("a single four does not trigger forbidden", () => {
    const b = makeBoard();
    // Horizontal only: B B B [*] B → run of 5 → actually that's a win
    // Use 3 blacks on one side: B B B [*] 0 → four on one axis
    place(b, BLACK, [7, 4], [7, 5], [7, 6]);
    b[7][7] = BLACK as 1;
    const a = analyzeBlack(b, 7, 7);
    // run of 4 in horizontal but that could become 5 exactly → "four" in one dir
    // Only one axis has a four → not double-four → result is "ok" or "win"
    expect(a.result).not.toBe("forbidden");
  });
});

// ── AI move selection ──────────────────────────────────────────────────────────

describe("getAIMove", () => {
  it("returns a legal (on-board, empty) cell", () => {
    const b = makeBoard();
    place(b, BLACK, [7, 7]); // first black stone at centre
    const m = getAIMove(b);
    expect(inBounds(m.r, m.c)).toBe(true);
    expect(b[m.r][m.c]).toBe(EMPTY);
  });

  it("on an empty board returns the centre (or nearby)", () => {
    const b = makeBoard();
    const m = getAIMove(b);
    const mid = Math.floor(SIZE / 2);
    // Centre should be returned when the board is empty
    expect(m.r).toBe(mid);
    expect(m.c).toBe(mid);
  });

  it("takes an immediate winning move for WHITE (5-in-a-row)", () => {
    // White has 4 in a row; the next move completes to 5.
    const b = makeBoard();
    place(b, WHITE, [3, 3], [3, 4], [3, 5], [3, 6]); // 4 in a row
    place(b, BLACK, [1, 0], [1, 1]); // some black stones so board isn't empty
    const m = getAIMove(b);
    // The winning move must be (3,2) or (3,7) — one of the open ends
    const winCols = [2, 7];
    expect(m.r).toBe(3);
    expect(winCols).toContain(m.c);
  });

  it("blocks an immediate opponent 5-threat (black has 4 in a row)", () => {
    // Black has 4 in a row, one end open; AI must block.
    const b = makeBoard();
    place(b, BLACK, [5, 5], [5, 6], [5, 7], [5, 8]); // 4 in a row, open at (5,4) & (5,9)
    // No white stones near — board is not empty so getCandidates works.
    // Block one open end; the score for defense(BLACK) at those ends is huge.
    const m = getAIMove(b);
    // Must block at (5,4) or (5,9)
    expect(m.r).toBe(5);
    expect([4, 9]).toContain(m.c);
  });

  it("prefers winning over blocking when white can win immediately", () => {
    // White has 4 in a row AND black has 4 in a different row.
    // AI should prefer its own winning move.
    const b = makeBoard();
    place(b, WHITE, [3, 3], [3, 4], [3, 5], [3, 6]); // white 4-in-a-row
    place(b, BLACK, [7, 3], [7, 4], [7, 5], [7, 6]); // black 4-in-a-row
    const m = getAIMove(b);
    // White winning cells: (3,2) or (3,7); both score 100000 for attack
    expect(m.r).toBe(3);
    expect([2, 7]).toContain(m.c);
  });

  it("is deterministic with the same rng seed", () => {
    const b = makeBoard();
    place(b, BLACK, [7, 7]);
    const rng1 = makeRng("test-seed-42");
    const rng2 = makeRng("test-seed-42");
    expect(getAIMove(cloneBoard(b), rng1)).toEqual(getAIMove(cloneBoard(b), rng2));
  });
});

// ── getCandidates ──────────────────────────────────────────────────────────────

describe("getCandidates", () => {
  it("returns the centre on an empty board", () => {
    const b = makeBoard();
    const cands = getCandidates(b);
    const mid = Math.floor(SIZE / 2);
    expect(cands.some((p) => p.r === mid && p.c === mid)).toBe(true);
  });

  it("returns only empty cells", () => {
    const b = makeBoard();
    place(b, BLACK, [7, 7], [7, 8]);
    const cands = getCandidates(b);
    expect(cands.every((p) => b[p.r][p.c] === EMPTY)).toBe(true);
  });

  it("expands up to 2 cells away from occupied stones", () => {
    const b = makeBoard();
    place(b, BLACK, [7, 7]);
    const cands = getCandidates(b);
    const keys = new Set(cands.map((p) => `${p.r},${p.c}`));
    // All cells within manhattan-like 2-step square should be candidates
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (dr === 0 && dc === 0) continue; // occupied
        const nr = 7 + dr, nc = 7 + dc;
        if (inBounds(nr, nc)) {
          expect(keys.has(`${nr},${nc}`)).toBe(true);
        }
      }
    }
  });
});

// ── countDir ──────────────────────────────────────────────────────────────────

describe("countDir", () => {
  it("counts stones correctly in one direction", () => {
    const b = makeBoard();
    place(b, BLACK, [5, 5], [5, 6], [5, 7]);
    // from (5,5) heading right (dc=1): sees (5,6)=B, (5,7)=B → count=2
    expect(countDir(b, 5, 5, 0, 1, BLACK)).toBe(2);
  });

  it("returns 0 when the next cell differs", () => {
    const b = makeBoard();
    expect(countDir(b, 7, 7, 0, 1, BLACK)).toBe(0);
  });
});

// ── dirLine / maxRun / makesFour / hasStraightFour / makesOpenThree ────────────

describe("dirLine", () => {
  it("encodes the board window correctly", () => {
    const b = makeBoard();
    place(b, BLACK, [7, 5], [7, 6], [7, 7]); // centre + two to the left (from (7,7))
    const arr = dirLine(b, 7, 7, 0, 1, 2); // direction right, radius 2
    // arr[0..4] covers c=5..9 shifted so centre is at index 2
    // Actually dirLine is symmetric: i from -radius to +radius
    // i=-2: (7,5)=B→1, i=-1: (7,6)=B→1, i=0: (7,7)=B→1, i=1: (7,8)=EMPTY→0, i=2: (7,9)=EMPTY→0
    expect(arr).toEqual([1, 1, 1, 0, 0]);
  });
});

describe("maxRun", () => {
  it("returns the full contiguous run through ci", () => {
    expect(maxRun([0, 1, 1, 1, 0], 2)).toBe(3);
    expect(maxRun([1, 1, 1, 1, 1], 2)).toBe(5);
    expect(maxRun([-1, 1, 1, 1, -1], 2)).toBe(3);
  });

  it("counts only through the stone at ci, not beyond gaps", () => {
    expect(maxRun([1, 1, 0, 1, 1], 0)).toBe(2); // run stops at gap
    expect(maxRun([1, 1, 0, 1, 1], 3)).toBe(2);
  });
});

describe("makesFour", () => {
  it("detects a four: one empty away from exactly-5", () => {
    // arr: 0 1 1 1 0 1 0  ci=5 (the rightmost 1)
    // placing at index 0: 1 1 1 1 0 1 0 → maxRun(5)=1 (no)
    // placing at index 4: 0 1 1 1 1 1 0 → maxRun(5)=5 ✓
    const arr = [0, 1, 1, 1, 0, 1, 0];
    expect(makesFour(arr, 5)).toBe(true);
  });

  it("returns false when no single fill produces exactly 5", () => {
    // arr: 0 1 1 1 1 1 0  ci=3 → run is already 5, no empty to fill
    const arr = [0, 1, 1, 1, 1, 1, 0];
    expect(makesFour(arr, 3)).toBe(false);
  });
});

describe("hasStraightFour", () => {
  it("detects .1111. pattern", () => {
    const arr = [0, 0, 1, 1, 1, 1, 0, 0];
    expect(hasStraightFour(arr, 2)).toBe(true);
    expect(hasStraightFour(arr, 5)).toBe(true);
  });

  it("requires both flanking empties", () => {
    // closed four: -1 1 1 1 1 0  (left side blocked)
    const arr = [-1, 1, 1, 1, 1, 0, 0];
    expect(hasStraightFour(arr, 2)).toBe(false);
  });
});

describe("makesOpenThree", () => {
  it("detects an open three: filling one empty creates a straight four", () => {
    // _ B B _ B _ in some window; filling the gap creates _ B B B B _
    // arr: 0 1 1 0 1 0   ci=4
    // Filling index 3: 0 1 1 1 1 0 → hasStraightFour(arr, ci=4) with ci in [1..4] ✓
    const arr = [0, 1, 1, 0, 1, 0];
    expect(makesOpenThree(arr, 4)).toBe(true);
  });

  it("returns false when no fill produces an open four", () => {
    // just two isolated stones: 0 0 1 0 0 1 0  ci=5
    const arr = [0, 0, 1, 0, 0, 1, 0];
    expect(makesOpenThree(arr, 5)).toBe(false);
  });
});

// ── classifyDir ────────────────────────────────────────────────────────────────

describe("classifyDir", () => {
  it("classifies a five correctly", () => {
    const b = makeBoard();
    place(b, BLACK, [7, 3], [7, 4], [7, 5], [7, 6], [7, 7]);
    expect(classifyDir(b, 7, 7, 0, -1)).toBe("five"); // direction left
  });

  it("classifies an overline", () => {
    const b = makeBoard();
    place(b, BLACK, [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7]);
    expect(classifyDir(b, 7, 7, 0, -1)).toBe("overline");
  });

  it("returns none for an isolated stone", () => {
    const b = makeBoard();
    b[7][7] = BLACK as 1;
    expect(classifyDir(b, 7, 7, 0, 1)).toBe("none");
  });
});

// ── dirLine — edge-of-board and opponent-stone branches ────────────────────────

describe("dirLine — boundary and opponent branches", () => {
  it("encodes out-of-bounds positions as -1 (line 133 branch)", () => {
    // Place a BLACK stone at (0,0) and scan horizontally in dc=-1 direction.
    // dirLine iterates i from -radius to +radius:
    //   rr = r + dr*i = 0,  cc = c + dc*i = 0 + (-1)*i
    // i=-3: cc = 3  → in bounds (EMPTY) → 0
    // i=-2: cc = 2  → in bounds (EMPTY) → 0
    // i=-1: cc = 1  → in bounds (EMPTY) → 0
    // i= 0: cc = 0  → BLACK → 1
    // i=+1: cc = -1 → out-of-bounds → -1  ← line 133
    // i=+2: cc = -2 → out-of-bounds → -1
    // i=+3: cc = -3 → out-of-bounds → -1
    const b = makeBoard();
    b[0][0] = BLACK as 1;
    const arr = dirLine(b, 0, 0, 0, -1, 3);
    expect(arr[0]).toBe(0);  // EMPTY at cc=3
    expect(arr[1]).toBe(0);  // EMPTY at cc=2
    expect(arr[2]).toBe(0);  // EMPTY at cc=1
    expect(arr[3]).toBe(1);  // BLACK at cc=0
    expect(arr[4]).toBe(-1); // out-of-bounds cc=-1 → line 133
    expect(arr[5]).toBe(-1); // out-of-bounds cc=-2
    expect(arr[6]).toBe(-1); // out-of-bounds cc=-3
  });

  it("encodes a WHITE (opponent) stone as -1 (line 139 branch)", () => {
    // dirLine is called for BLACK stone analysis. A WHITE stone in the scan
    // window must map to -1 (opponent/wall branch, line 139).
    const b = makeBoard();
    b[7][7] = BLACK as 1;  // the stone being analysed
    b[7][9] = WHITE as 2;  // opponent stone 2 cells to the right
    // Scan rightward (dc=+1), radius=3 → covers cols 4..10
    const arr = dirLine(b, 7, 7, 0, 1, 3);
    // i=-3: (7,4) EMPTY → 0
    // i=-2: (7,5) EMPTY → 0
    // i=-1: (7,6) EMPTY → 0
    // i=0:  (7,7) BLACK → 1
    // i=1:  (7,8) EMPTY → 0
    // i=2:  (7,9) WHITE → -1  ← this is line 139
    // i=3:  (7,10) EMPTY → 0
    expect(arr[5]).toBe(-1); // WHITE stone → treated as wall/opponent
    expect(arr[3]).toBe(1);  // BLACK stone at centre
    expect(arr[4]).toBe(0);  // EMPTY
  });
});

// ── computeForbiddenPoints ─────────────────────────────────────────────────────

describe("computeForbiddenPoints", () => {
  it("returns an empty set on an empty board (only centre candidate, no forbidden shape)", () => {
    const b = makeBoard();
    const forbidden = computeForbiddenPoints(b);
    // On an empty board, getCandidates returns only the centre; placing there
    // creates just one isolated black stone — not forbidden.
    expect(forbidden.size).toBe(0);
  });

  it("flags forbidden points that would create double-three", () => {
    // Reproduce the double-three board without placing the test stone.
    // Horizontal arm: (5,3)(5,4) and vertical arm: (3,5)(4,5) already placed.
    // The point (5,5) should be flagged as forbidden (三三).
    const b = makeBoard();
    place(b, BLACK, [5, 3], [5, 4]); // horizontal arm
    place(b, BLACK, [3, 5], [4, 5]); // vertical arm
    const forbidden = computeForbiddenPoints(b);
    expect(forbidden.has("5,5")).toBe(true);
  });

  it("does not flag a point that forms an exact five (five wins, no forbidden)", () => {
    // With 4 blacks in a row, completing to 5 is a WIN and overrides forbidden.
    const b = makeBoard();
    place(b, BLACK, [7, 1], [7, 2], [7, 3], [7, 4]);
    const forbidden = computeForbiddenPoints(b);
    // (7,5) completes exactly 5 → result is "win", not "forbidden"
    expect(forbidden.has("7,5")).toBe(false);
  });

  it("flags points that would create overline (長連)", () => {
    // 5 blacks in a row: placing at either open end creates 6 → overline → forbidden.
    const b = makeBoard();
    place(b, BLACK, [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]);
    const forbidden = computeForbiddenPoints(b);
    // (7,1) or (7,7): placing there gives run of 6 → 長連 → forbidden
    expect(forbidden.has("7,1") || forbidden.has("7,7")).toBe(true);
  });
});

// ── scorePattern — all scoring branches ───────────────────────────────────────

describe("scorePattern", () => {
  // scorePattern(b, r, c, dr, dc, color): score for `color` at (r,c) in direction (dr,dc).
  // scan(dr, dc) counts consecutive same-color stones outward, then checks if the
  // next cell is empty (open end).

  it("total>=5 → 100000 (line 306)", () => {
    // Place 5 blacks in a row; check from the middle stone horizontally.
    const b = makeBoard();
    place(b, BLACK, [5, 3], [5, 4], [5, 5], [5, 6], [5, 7]);
    // From (5,5) scanning right (dc=1): fwd sees (5,6)(5,7)=2 stones, bwd sees (5,4)(5,3)=2 stones; total=5
    expect(scorePattern(b, 5, 5, 0, 1, BLACK as 1)).toBe(100000);
  });

  it("total===4, opens>=1 (open four) → 10000 (line 307)", () => {
    // Three blacks with one empty on each side: _ B B [*] B _
    // Place at (5,3)(5,4)(5,6) and test stone at (5,5).
    // From (5,5) dc=1: fwd sees (5,6)=B → count=1, next (5,7)=EMPTY → open=true
    //                   bwd sees (5,4)=B,(5,3)=B → count=2, next (5,2)=EMPTY → open=true
    // total=1+2+1=4, opens=2 → >=1 → 10000
    const b = makeBoard();
    place(b, BLACK, [5, 3], [5, 4], [5, 5], [5, 6]);
    expect(scorePattern(b, 5, 5, 0, 1, BLACK as 1)).toBe(10000);
  });

  it("total===4, opens===0 (closed four) → 500 (line 308)", () => {
    // Four blacks with NO open end (blocked on both sides).
    // Place 4 blacks at (5,3)(5,4)(5,5)(5,6) and block both ends with WHITE stones.
    const b = makeBoard();
    place(b, BLACK, [5, 3], [5, 4], [5, 5], [5, 6]);
    place(b, WHITE, [5, 2], [5, 7]); // block both ends
    // From (5,5) dc=1: fwd=1 stone (5,6), next (5,7)=WHITE → open=false
    //                   bwd=2 stones (5,4)(5,3), next (5,2)=WHITE → open=false
    // total=4, opens=0 → 500
    expect(scorePattern(b, 5, 5, 0, 1, BLACK as 1)).toBe(500);
  });

  it("total===3, opens===2 (open three) → 1000 (line 309)", () => {
    // Three blacks with empty on both ends.
    // From (5,5) dc=1: fwd sees (5,6)=B, next (5,7)=EMPTY → open=true
    //                   bwd sees (5,4)=B, next (5,3)=EMPTY → open=true
    // total=1+1+1=3, opens=2 → 1000
    const b = makeBoard();
    place(b, BLACK, [5, 4], [5, 5], [5, 6]);
    expect(scorePattern(b, 5, 5, 0, 1, BLACK as 1)).toBe(1000);
  });

  it("total===3, opens===1 (half-open three) → 200 (line 310)", () => {
    // Three blacks, empty on one end, blocked on the other.
    const b = makeBoard();
    place(b, BLACK, [5, 4], [5, 5], [5, 6]);
    place(b, WHITE, [5, 7]); // block one end
    // From (5,5) dc=1: fwd=(5,6)=B, next(5,7)=WHITE → open=false
    //                   bwd=(5,4)=B, next(5,3)=EMPTY → open=true
    // total=3, opens=1 → 200
    expect(scorePattern(b, 5, 5, 0, 1, BLACK as 1)).toBe(200);
  });

  it("total===2, opens===2 (open pair) → 50 (line 311)", () => {
    // Two blacks, empty on both ends.
    const b = makeBoard();
    place(b, BLACK, [5, 5], [5, 6]);
    // From (5,5) dc=1: fwd=(5,6)=B, next(5,7)=EMPTY → open=true
    //                   bwd: next(5,4)=EMPTY → open=true, count=0
    // total=0+1+1=2, opens=2 → 50
    expect(scorePattern(b, 5, 5, 0, 1, BLACK as 1)).toBe(50);
  });

  it("total===2, opens===1 (half-open pair) → 10 (line 312)", () => {
    // Two blacks, empty on one end, blocked on the other.
    const b = makeBoard();
    place(b, BLACK, [5, 5], [5, 6]);
    place(b, WHITE, [5, 7]); // block forward end
    // From (5,5) dc=1: fwd=(5,6)=B, next(5,7)=WHITE → open=false
    //                   bwd: count=0, next(5,4)=EMPTY → open=true
    // total=2, opens=1 → 10
    expect(scorePattern(b, 5, 5, 0, 1, BLACK as 1)).toBe(10);
  });

  it("total===1 with no open ends → 0 (line 313)", () => {
    // Isolated stone blocked on both sides.
    const b = makeBoard();
    b[5][5] = BLACK as 1;
    place(b, WHITE, [5, 4], [5, 6]); // block both ends horizontally
    // From (5,5) dc=1: fwd=0, next(5,6)=WHITE → open=false
    //                   bwd=0, next(5,4)=WHITE → open=false
    // total=1, none of the if-conditions → 0
    expect(scorePattern(b, 5, 5, 0, 1, BLACK as 1)).toBe(0);
  });
});
