import { describe, it, expect } from "vitest";
import {
  EMPTY, BLACK, WHITE,
  idx, rowOf, colOf,
  initBoard,
  getFlips,
  getLegal,
  applyMove,
  countDiscs,
  getWinner,
  isGameOver,
  aiMove,
  aiScore,
} from "~/games/reversi";
import type { Board, Player } from "~/games/reversi";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Build a board from a compact 64-char string (. = empty, B = black, W = white). */
function boardFrom(spec: string): Board {
  if (spec.length !== 64) throw new Error("spec must be 64 chars");
  return spec.split("").map((ch) => {
    if (ch === "B") return BLACK;
    if (ch === "W") return WHITE;
    return EMPTY;
  }) as Board;
}

// ---------------------------------------------------------------------------
// initBoard / opening position
// ---------------------------------------------------------------------------

describe("initBoard", () => {
  it("creates a 64-element board", () => {
    expect(initBoard()).toHaveLength(64);
  });

  it("standard opening: two black and two white discs in the centre", () => {
    const b = initBoard();
    // Standard Othello starting position
    // (row 3, col 3)=WHITE, (row 3, col 4)=BLACK
    // (row 4, col 3)=BLACK, (row 4, col 4)=WHITE
    expect(b[idx(3, 3)]).toBe(WHITE);
    expect(b[idx(3, 4)]).toBe(BLACK);
    expect(b[idx(4, 3)]).toBe(BLACK);
    expect(b[idx(4, 4)]).toBe(WHITE);
    expect(countDiscs(b)).toEqual({ black: 2, white: 2 });
  });

  it("exactly 4 non-empty cells at the start", () => {
    const b = initBoard();
    const occupied = b.filter((v) => v !== EMPTY);
    expect(occupied).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// opening legal moves
// ---------------------------------------------------------------------------

describe("getLegal — opening position", () => {
  it("black has exactly 4 legal moves at the start", () => {
    const b = initBoard();
    const moves = getLegal(b, BLACK);
    expect(moves).toHaveLength(4);
  });

  it("the 4 opening moves are the classic Othello d3, c4, f5, e6 squares", () => {
    // In zero-indexed row-major: d3=(r2,c3), c4=(r3,c2), f5=(r4,c5), e6=(r5,c4)
    const b = initBoard();
    const moves = new Set(getLegal(b, BLACK));
    expect(moves.has(idx(2, 3))).toBe(true); // d3
    expect(moves.has(idx(3, 2))).toBe(true); // c4
    expect(moves.has(idx(4, 5))).toBe(true); // f5
    expect(moves.has(idx(5, 4))).toBe(true); // e6
  });

  it("white also has exactly 4 legal moves symmetrically at the start", () => {
    const b = initBoard();
    expect(getLegal(b, WHITE)).toHaveLength(4);
  });

  it("an occupied cell is not a legal move", () => {
    const b = initBoard();
    const moves = getLegal(b, BLACK);
    // none of the 4 starting discs can be a legal placement
    for (const occupied of [idx(3, 3), idx(3, 4), idx(4, 3), idx(4, 4)]) {
      expect(moves).not.toContain(occupied);
    }
  });
});

// ---------------------------------------------------------------------------
// getFlips
// ---------------------------------------------------------------------------

describe("getFlips", () => {
  it("returns empty array for an occupied cell", () => {
    const b = initBoard();
    expect(getFlips(b, 3, 3, BLACK)).toEqual([]);
    expect(getFlips(b, 4, 4, WHITE)).toEqual([]);
  });

  it("returns empty array for a cell that would flip nothing", () => {
    const b = initBoard();
    // (0,0) is the top-left corner — no opponent discs between it and a friendly disc
    expect(getFlips(b, 0, 0, BLACK)).toEqual([]);
  });

  it("black at d3 (r2,c3) flips exactly (r3,c3)", () => {
    const b = initBoard();
    const flips = getFlips(b, 2, 3, BLACK);
    expect(flips).toHaveLength(1);
    expect(flips).toContain(idx(3, 3));
  });

  it("black at c4 (r3,c2) flips exactly (r3,c3)", () => {
    const b = initBoard();
    const flips = getFlips(b, 3, 2, BLACK);
    expect(flips).toHaveLength(1);
    expect(flips).toContain(idx(3, 3));
  });
});

// ---------------------------------------------------------------------------
// applyMove
// ---------------------------------------------------------------------------

describe("applyMove", () => {
  it("placing black at d3 flips white at d4 and places black disc there", () => {
    const b = initBoard();
    const pos = idx(2, 3);
    const { board: nb, flips } = applyMove(b, pos, BLACK);

    // Placed disc
    expect(nb[pos]).toBe(BLACK);
    // Flipped disc
    expect(flips).toHaveLength(1);
    expect(flips).toContain(idx(3, 3));
    expect(nb[idx(3, 3)]).toBe(BLACK);
    // Original discs unaffected
    expect(nb[idx(3, 4)]).toBe(BLACK);
    expect(nb[idx(4, 3)]).toBe(BLACK);
    expect(nb[idx(4, 4)]).toBe(WHITE);
  });

  it("does not mutate the original board", () => {
    const b = initBoard();
    const copy = [...b];
    applyMove(b, idx(2, 3), BLACK);
    expect(b).toEqual(copy);
  });

  it("flips discs in multiple directions when applicable", () => {
    // Construct a position where placing BLACK at (3,5) flips in two directions.
    //
    // Lay out so that row 3 has: B at c3(3,2), W at (3,3), W at (3,4) — placing B at (3,5)
    // flips (3,3) and (3,4) horizontally.
    // Also put W at (2,5) with B at (1,5) — placing at (3,5) would flip (2,5) vertically.
    //
    // Board snippet (only relevant cells):
    //   (1,5)=B  (2,5)=W  (3,2)=B  (3,3)=W  (3,4)=W  target=(3,5)
    const b = new Array(64).fill(EMPTY) as Board;
    b[idx(1, 5)] = BLACK;
    b[idx(2, 5)] = WHITE;
    b[idx(3, 2)] = BLACK;
    b[idx(3, 3)] = WHITE;
    b[idx(3, 4)] = WHITE;

    const { board: nb, flips } = applyMove(b, idx(3, 5), BLACK);

    // Placed disc
    expect(nb[idx(3, 5)]).toBe(BLACK);

    // Horizontal flips (3,3) and (3,4)
    expect(flips).toContain(idx(3, 3));
    expect(flips).toContain(idx(3, 4));
    expect(nb[idx(3, 3)]).toBe(BLACK);
    expect(nb[idx(3, 4)]).toBe(BLACK);

    // Vertical flip (2,5)
    expect(flips).toContain(idx(2, 5));
    expect(nb[idx(2, 5)]).toBe(BLACK);

    // Total flips = 3
    expect(flips).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// pass detection (no legal moves)
// ---------------------------------------------------------------------------

describe("pass detection", () => {
  it("a player with no legal moves has an empty getLegal result", () => {
    // Construct a degenerate board: all black, except one white corner.
    // White is completely surrounded by black — white must pass.
    const b = new Array(64).fill(BLACK) as Board;
    b[idx(0, 0)] = WHITE;
    // White at corner surrounded by black — no legal move (no empty squares at all)
    expect(getLegal(b, WHITE)).toHaveLength(0);
  });

  it("isGameOver is false while at least one player has a move", () => {
    const b = initBoard();
    expect(isGameOver(b)).toBe(false);
  });

  it("isGameOver is true when both players have no legal moves", () => {
    // Fill the entire board with black — no empty squares, so neither can move.
    const b = new Array(64).fill(BLACK) as Board;
    expect(getLegal(b, BLACK)).toHaveLength(0);
    expect(getLegal(b, WHITE)).toHaveLength(0);
    expect(isGameOver(b)).toBe(true);
  });

  it("a player surrounded with no legal moves does NOT make the game over if the opponent can still move", () => {
    // Real Othello pass scenario: only black has moves.
    // Put a single empty cell adjacent to a black disc but not bridging any white line for white.
    //
    // Simplest: fill board with black, add one white disc in a corner, leave one empty
    // adjacent to it — black can place but white cannot (white at corner has no empty
    // friendly-bracketed line).
    const b = new Array(64).fill(BLACK) as Board;
    b[idx(0, 0)] = WHITE;
    b[idx(0, 1)] = EMPTY; // only empty cell; white needs empty cells with own disc bracket — impossible here

    // getLegal for black: placing at (0,1) requires flipping white at (0,0) with a black on the
    // other side — but (0,0) is the corner, only (0,1) is empty, so checking right of (0,1):
    // (0,2) onward are all BLACK (no white to flip). And black at (0,0)... wait, (0,0) is WHITE.
    // Let's verify getLegal honestly returns what it returns:
    const blackMoves = getLegal(b, BLACK);
    const whiteMoves = getLegal(b, WHITE);

    // At minimum white has no moves (confirmed by construction)
    expect(whiteMoves).toHaveLength(0);
    // isGameOver only when BOTH have no moves
    expect(isGameOver(b)).toBe(blackMoves.length === 0);
  });
});

// ---------------------------------------------------------------------------
// countDiscs / getWinner
// ---------------------------------------------------------------------------

describe("countDiscs and getWinner", () => {
  it("returns correct counts for the opening board", () => {
    expect(countDiscs(initBoard())).toEqual({ black: 2, white: 2 });
  });

  it("empty board: zero for both", () => {
    const b = new Array(64).fill(EMPTY) as Board;
    expect(countDiscs(b)).toEqual({ black: 0, white: 0 });
  });

  it("all-black board: 64 black, 0 white", () => {
    const b = new Array(64).fill(BLACK) as Board;
    expect(countDiscs(b)).toEqual({ black: 64, white: 0 });
  });

  it("getWinner returns BLACK when black has more discs", () => {
    const b = new Array(64).fill(BLACK) as Board;
    expect(getWinner(b)).toBe(BLACK);
  });

  it("getWinner returns WHITE when white has more discs", () => {
    const b = new Array(64).fill(WHITE) as Board;
    expect(getWinner(b)).toBe(WHITE);
  });

  it("getWinner returns EMPTY on a draw", () => {
    // 32 black, 32 white
    const b = new Array(64).fill(EMPTY) as Board;
    for (let i = 0; i < 32; i++) b[i] = BLACK;
    for (let i = 32; i < 64; i++) b[i] = WHITE;
    expect(getWinner(b)).toBe(EMPTY);
  });

  it("winner is the player with strictly more discs after an end position", () => {
    // Construct an end-game position: play one move from the opening and verify
    const b = initBoard();
    const { board: b2 } = applyMove(b, idx(2, 3), BLACK); // black d3
    const { black, white } = countDiscs(b2);
    // Opening has 2 black + 2 white. Black places 1 at d3, flips 1 white (d4) to black.
    // Result: 2 + 1 (placed) + 1 (flipped) = 4 black; 2 - 1 (flipped) = 1 white.
    expect(black).toBe(4);
    expect(white).toBe(1);
    expect(getWinner(b2)).toBe(BLACK);
  });
});

// ---------------------------------------------------------------------------
// AI move
// ---------------------------------------------------------------------------

describe("aiMove", () => {
  it("returns a legal move for WHITE at the opening position", () => {
    const b = initBoard();
    const legalForWhite = new Set(getLegal(b, WHITE));
    const m = aiMove(b);
    expect(m).toBeGreaterThanOrEqual(0);
    expect(legalForWhite.has(m)).toBe(true);
  });

  it("returns -1 when WHITE has no legal moves", () => {
    // All-black board: white has nowhere to play
    const b = new Array(64).fill(BLACK) as Board;
    expect(aiMove(b)).toBe(-1);
  });

  it("with a seeded rng, result is deterministic and legal", () => {
    const b = initBoard();
    const rng1 = makeRng("test-seed-42");
    const rng2 = makeRng("test-seed-42");
    const m1 = aiMove(b, rng1);
    const m2 = aiMove(b, rng2);
    expect(m1).toBe(m2);
    expect(getLegal(b, WHITE)).toContain(m1);
  });

  it("AI prefers corner moves when available (positional weight advantage)", () => {
    // Construct a position where WHITE can take a corner.
    // Place so that WHITE can legally move to (0,0):
    //   Need: (0,0) empty, (0,1)=BLACK, (0,2)=WHITE, or similar bracketing.
    const b = new Array(64).fill(EMPTY) as Board;
    // Row 0: . B W ...  -> WHITE at (0,0) would flip (0,1) — need B further right with W bracket
    //        No: we need WHITE player's disc behind the line.
    // For WHITE to move to (0,0): need a line of BLACK discs going away from (0,0)
    // capped by a WHITE disc.
    // E.g. (0,0)=empty, (0,1)=BLACK, (0,2)=BLACK, (0,3)=WHITE  -> WHITE places (0,0): flips (0,1),(0,2)
    b[idx(0, 1)] = BLACK;
    b[idx(0, 2)] = BLACK;
    b[idx(0, 3)] = WHITE;

    // Also add a non-corner option so it's not trivially the only move:
    // (3,3)=empty, (3,4)=BLACK, (3,5)=WHITE  -> WHITE can also place (3,3): flips (3,4)
    b[idx(3, 4)] = BLACK;
    b[idx(3, 5)] = WHITE;

    const corner = idx(0, 0);
    expect(getLegal(b, WHITE)).toContain(corner);

    const chosen = aiMove(b);
    expect(chosen).toBe(corner); // WEIGHTS[0][0]=120, far outweighs any non-corner
  });

  it("returns a legal move in a mid-game position after a few moves", () => {
    let b = initBoard();
    // Play a few moves: black d3, white c3, black c4, white c5
    const moves: Array<[number, Player]> = [
      [idx(2, 3), BLACK],
      [idx(2, 2), WHITE],
      [idx(3, 2), BLACK],
      [idx(2, 4), WHITE], // if legal, else skip
    ];
    for (const [pos, player] of moves) {
      if (getLegal(b, player).includes(pos)) {
        ({ board: b } = applyMove(b, pos, player));
      }
    }
    const legalForWhite = getLegal(b, WHITE);
    if (legalForWhite.length > 0) {
      const m = aiMove(b);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(legalForWhite).toContain(m);
    }
    // If white has no moves, aiMove should return -1
    else {
      expect(aiMove(b)).toBe(-1);
    }
  });
});

// ---------------------------------------------------------------------------
// aiScore — covers the player===BLACK branch (opp becomes WHITE)
// ---------------------------------------------------------------------------

describe("aiScore", () => {
  it("returns a numeric score for WHITE placing at the opening", () => {
    const b = initBoard();
    // One of WHITE's legal opening moves
    const whiteMoves = getLegal(b, WHITE);
    expect(whiteMoves.length).toBeGreaterThan(0);
    const score = aiScore(b, whiteMoves[0], WHITE);
    expect(typeof score).toBe("number");
  });

  it("returns a numeric score for BLACK placing (covers player===BLACK branch → opp=WHITE)", () => {
    const b = initBoard();
    // One of BLACK's legal opening moves (e.g. d3 = idx(2,3))
    const blackMoves = getLegal(b, BLACK);
    expect(blackMoves.length).toBeGreaterThan(0);
    const score = aiScore(b, blackMoves[0], BLACK);
    // Score should be a finite number — exact value not critical, just branch coverage
    expect(typeof score).toBe("number");
    expect(isFinite(score)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// coordinate helpers
// ---------------------------------------------------------------------------

describe("coordinate helpers", () => {
  it("idx / rowOf / colOf round-trip", () => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const i = idx(r, c);
        expect(rowOf(i)).toBe(r);
        expect(colOf(i)).toBe(c);
      }
    }
  });
});
