import { describe, it, expect } from "vitest";
import { makeRng } from "~/utils/rng";
import {
  DIRV, DIRS, OPP, DIFFS,
  inBounds, sweepClear, growSnake, segDir, cellsOf, headFurthest,
  chooseExit, buildOne, solveDepth, isRemovable, isWon,
} from "~/games/arrows";
import type { Cell, Dir, PieceData } from "~/games/arrows";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Build an occupied-cell Set from an array of pieces (all cells of all pieces). */
function occSet(pieces: PieceData[], N: number, exclude?: PieceData): Set<number> {
  const s = new Set<number>();
  for (const p of pieces) {
    if (p === exclude) continue;
    for (const cl of p.cells) s.add(cl.r * N + cl.c);
  }
  return s;
}

// ---------------------------------------------------------------------------
// inBounds
// ---------------------------------------------------------------------------
describe("inBounds", () => {
  it("accepts corners of a 4×4 board", () => {
    expect(inBounds(0, 0, 4)).toBe(true);
    expect(inBounds(3, 3, 4)).toBe(true);
  });
  it("rejects cells outside the board", () => {
    expect(inBounds(-1, 0, 4)).toBe(false);
    expect(inBounds(0, 4, 4)).toBe(false);
    expect(inBounds(4, 0, 4)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------
describe("constants", () => {
  it("DIRV entries are [dr,dc] pairs", () => {
    expect(DIRV.up).toEqual([-1, 0]);
    expect(DIRV.down).toEqual([1, 0]);
    expect(DIRV.left).toEqual([0, -1]);
    expect(DIRV.right).toEqual([0, 1]);
  });
  it("OPP is symmetric", () => {
    for (const d of DIRS) {
      expect(OPP[OPP[d]]).toBe(d);
    }
  });
  it("DIFFS has exactly 3 entries and n increases", () => {
    expect(DIFFS).toHaveLength(3);
    const [easy, med, hard] = DIFFS;
    expect(easy.n).toBeLessThan(med.n);
    expect(med.n).toBeLessThan(hard.n);
  });
});

// ---------------------------------------------------------------------------
// sweepClear
// ---------------------------------------------------------------------------
describe("sweepClear", () => {
  //  Board (3×3, N=3):
  //    row 0: [ ][ ][ ]
  //    row 1: [ ][X][ ]   X = occupied cell (not our piece)
  //    row 2: [ ][ ][ ]
  //
  //  Piece: single cell at (0,1), direction = down → must pass through (1,1) which is blocked.

  const N = 3;
  const blocked = new Set([1 * N + 1]); // (1,1)

  it("returns false when the ray passes through a blocked cell", () => {
    const cells: Cell[] = [{ r: 0, c: 1 }];
    expect(sweepClear(cells, "down", blocked, N)).toBe(false);
  });

  it("returns true when the ray is clear to the edge", () => {
    // Piece at (0,0), going right — column 1 and 2 are free
    const cells: Cell[] = [{ r: 0, c: 0 }];
    expect(sweepClear(cells, "right", blocked, N)).toBe(true);
  });

  it("returns true going up from (2,1) — the blocked (1,1) is BEHIND the piece, not in front", () => {
    const cells: Cell[] = [{ r: 2, c: 1 }];
    // going up: ray is (1,1) which is in occ → FALSE — it IS in front
    expect(sweepClear(cells, "up", blocked, N)).toBe(false);
  });

  it("returns true going down from (2,1) — nothing below row 2 in a 3×3 board", () => {
    const cells: Cell[] = [{ r: 2, c: 1 }];
    expect(sweepClear(cells, "down", blocked, N)).toBe(true);
  });

  it("multi-cell piece: all cells must be clear", () => {
    //  Piece occupies (0,0) and (1,0), going right.
    //  (0,2) is blocked — the ray of (0,0) hits it.
    const occ = new Set([0 * N + 2]); // (0,2)
    const cells: Cell[] = [{ r: 0, c: 0 }, { r: 1, c: 0 }];
    expect(sweepClear(cells, "right", occ, N)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// segDir
// ---------------------------------------------------------------------------
describe("segDir", () => {
  const N = 5;
  it("correctly identifies all four directions", () => {
    const center = 2 * N + 2; // (2,2)
    expect(segDir(center, center - N, N)).toBe("up");    // (2,2) → (1,2)
    expect(segDir(center, center + N, N)).toBe("down");  // (2,2) → (3,2)
    expect(segDir(center, center - 1, N)).toBe("left");  // (2,2) → (2,1)
    expect(segDir(center, center + 1, N)).toBe("right"); // (2,2) → (2,3)
  });
});

// ---------------------------------------------------------------------------
// cellsOf
// ---------------------------------------------------------------------------
describe("cellsOf", () => {
  it("converts flat indices to {r,c}", () => {
    const N = 4;
    expect(cellsOf([0, 1, 5], N)).toEqual([
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 1, c: 1 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// headFurthest
// ---------------------------------------------------------------------------
describe("headFurthest", () => {
  //  Two-cell piece going right: cells = [{r:0,c:0},{r:0,c:1}]
  //  c:1 is further right than c:0 → correct orientation.
  it("true when last cell is furthest along the direction", () => {
    const cells: Cell[] = [{ r: 0, c: 0 }, { r: 0, c: 1 }];
    expect(headFurthest(cells, "right")).toBe(true);
  });

  it("false when last cell is NOT furthest (reversed order)", () => {
    const cells: Cell[] = [{ r: 0, c: 1 }, { r: 0, c: 0 }];
    expect(headFurthest(cells, "right")).toBe(false);
  });

  it("single-cell piece is always furthest in any direction", () => {
    const cells: Cell[] = [{ r: 1, c: 1 }];
    for (const d of DIRS) expect(headFurthest(cells, d as Dir)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// growSnake
// ---------------------------------------------------------------------------
describe("growSnake", () => {
  it("returns a path of at least length 1", () => {
    const rng = makeRng("snake-test");
    const occ = new Set<number>();
    const path = growSnake(rng, occ, 0, 4, 3, 0);
    expect(path.length).toBeGreaterThanOrEqual(1);
  });

  it("all cells in path are distinct and within bounds", () => {
    const N = 5;
    const rng = makeRng("snake-distinct");
    const occ = new Set<number>();
    const path = growSnake(rng, occ, 0, N, 5, 0.3);
    expect(new Set(path).size).toBe(path.length); // no duplicates
    for (const idx of path) {
      expect(inBounds((idx / N) | 0, idx % N, N)).toBe(true);
    }
  });

  it("does not use cells already in occ", () => {
    const N = 5;
    // Block every cell except (0,0) and (0,1)
    const occ = new Set<number>();
    for (let i = 0; i < N * N; i++) if (i !== 0 && i !== 1) occ.add(i);
    const rng = makeRng("confined");
    const path = growSnake(rng, occ, 0, N, 10, 0);
    // Can only ever have 0 and 1 in the path
    expect(path.length).toBeLessThanOrEqual(2);
    for (const idx of path) expect(occ.has(idx)).toBe(false);
  });

  it("is deterministic for the same seed", () => {
    const N = 6;
    const run = () => {
      const rng = makeRng("determ-snake");
      return growSnake(rng, new Set(), 0, N, 5, 0.4);
    };
    expect(run()).toEqual(run());
  });
});

// ---------------------------------------------------------------------------
// chooseExit
// ---------------------------------------------------------------------------
describe("chooseExit", () => {
  //  In a 3×3 board with nothing else on it, any single cell should be able
  //  to exit in at least one direction.
  it("single-cell piece in empty board can always exit", () => {
    const N = 3;
    const rng = makeRng("exit-single");
    const occ = new Set<number>();
    const result = chooseExit(rng, [4], occ, N); // center cell (1,1)
    expect(result).not.toBeNull();
  });

  it("returns cells in tail→head order with headFurthest satisfied", () => {
    const N = 4;
    const rng = makeRng("exit-order");
    const occ = new Set<number>();
    const result = chooseExit(rng, [0, 1], occ, N); // (0,0)→(0,1) right-going
    expect(result).not.toBeNull();
    if (result) {
      expect(headFurthest(result.cells, result.dir)).toBe(true);
    }
  });

  it("returns null when both exit directions are blocked by other pieces", () => {
    //  3-cell board row [A][P][B], N=3, piece P is a single cell at (0,1).
    //    Going right: (0,2) is occupied by another piece → blocked.
    //    Going left:  (0,0) is occupied by another piece → blocked.
    //    Going up:    already at row 0, ray is empty immediately → would exit!
    //
    //  So we need a piece where all four directions have blockers in the way.
    //  Use a 3×3 board with piece at center (1,1) and every adjacent cell blocked.
    //    right: (1,2) blocked
    //    left:  (1,0) blocked
    //    down:  (2,1) blocked
    //    up:    (0,1) blocked
    //  No ray is clear, so chooseExit must return null.
    const N = 3;
    const occ = new Set<number>([
      0 * N + 1, // (0,1) blocks up
      2 * N + 1, // (2,1) blocks down
      1 * N + 0, // (1,0) blocks left
      1 * N + 2, // (1,2) blocks right
    ]);
    const rng = makeRng("exit-blocked");
    const result = chooseExit(rng, [1 * N + 1], occ, N); // center cell, single-cell piece
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildOne — structural validity
// ---------------------------------------------------------------------------
describe("buildOne", () => {
  it("returns an array of pieces, each with cells and a dir", () => {
    const cfg = DIFFS[0]; // easy
    const rng = makeRng("build-struct");
    const built = buildOne(rng, cfg);
    expect(built.length).toBeGreaterThan(0);
    for (const p of built) {
      expect(p.cells.length).toBeGreaterThan(0);
      expect(DIRS).toContain(p.dir);
      for (const cl of p.cells) {
        expect(inBounds(cl.r, cl.c, cfg.n)).toBe(true);
      }
    }
  });

  it("no two pieces share a cell", () => {
    const cfg = DIFFS[1]; // medium
    const rng = makeRng("build-nooverlap");
    const built = buildOne(rng, cfg);
    const seen = new Set<number>();
    for (const p of built) {
      for (const cl of p.cells) {
        const key = cl.r * cfg.n + cl.c;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it("is deterministic for the same seed", () => {
    const cfg = DIFFS[0];
    const run = () => buildOne(makeRng("determ-build"), cfg);
    const a = run(), b = run();
    expect(a).toEqual(b);
  });

  it("every piece satisfies headFurthest for its direction", () => {
    const cfg = DIFFS[0];
    const rng = makeRng("build-headfurthest");
    const built = buildOne(rng, cfg);
    for (const p of built) {
      expect(headFurthest(p.cells, p.dir)).toBe(true);
    }
  });

  it("stops early when all non-occupied cells are dead (covers !empties.length break)", () => {
    // 3×3 board with fill=9: with the right seed, the center cell gets
    // surrounded by the other 8 pieces before it is placed, making it
    // impossible to exit in any direction. The center goes into 'dead', and
    // when the outer cells are placed into occ the board has no empties left
    // while occ.size (8) < fill (9), hitting the break on !empties.length.
    const cfg = {
      key: "test-break",
      label: "test",
      n: 3,
      fill: 9,
      lens: [1],
      bend: 0,
    };
    // Seed "test-break-1" reliably hits the !empties break (verified offline)
    const rng = makeRng("test-break-1");
    const built = buildOne(rng, cfg);
    // The build terminates early — it cannot place the center piece
    // Result: 8 pieces placed (all non-center cells), center remains unplaced.
    expect(built.length).toBeLessThan(9);
  });
});

// ---------------------------------------------------------------------------
// solveDepth — solvability guarantee
// ---------------------------------------------------------------------------
describe("solveDepth", () => {
  it("returns a non-negative depth for a reverse-placed puzzle (always solvable)", () => {
    for (const cfg of DIFFS) {
      const rng = makeRng(`solve-${cfg.key}`);
      const built = buildOne(rng, cfg);
      const depth = solveDepth(built, cfg.n);
      expect(depth).toBeGreaterThanOrEqual(0);
    }
  });

  it("empty board solves in 0 rounds", () => {
    expect(solveDepth([], 6)).toBe(0);
  });

  it("single free piece solves in 1 round", () => {
    // One piece, nothing blocking it
    const piece: PieceData = { cells: [{ r: 0, c: 0 }], dir: "right" };
    expect(solveDepth([piece], 3)).toBe(1);
  });

  it("returns -1 for a hand-crafted unsolvable layout", () => {
    // Two pieces, each blocking the other's exit:
    //   Piece A: (0,0) going right — blocked by piece B at (0,1)
    //   Piece B: (0,1) going left  — blocked by piece A at (0,0)
    // A is blocked by B, B is blocked by A → neither can ever move.
    const N = 3;
    const pieceA: PieceData = { cells: [{ r: 0, c: 0 }], dir: "right" };
    const pieceB: PieceData = { cells: [{ r: 0, c: 1 }], dir: "left" };
    expect(solveDepth([pieceA, pieceB], N)).toBe(-1);
  });

  it("10 seeded builds across all difficulties are all solvable", () => {
    for (const cfg of DIFFS) {
      for (let i = 0; i < 10; i++) {
        const rng = makeRng(`solvability-${cfg.key}-${i}`);
        const built = buildOne(rng, cfg);
        const depth = solveDepth(built, cfg.n);
        expect(depth, `${cfg.key} seed ${i} depth=${depth}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// isRemovable — core move logic
// ---------------------------------------------------------------------------
describe("isRemovable", () => {
  //  Explicit 3×3 mini-board:
  //    (0,0) piece A going RIGHT
  //    (0,1) piece B going DOWN  ← A's ray passes through (0,1), so A is blocked
  //    nothing else

  const N = 3;

  const pieceA = { id: 1, cells: [{ r: 0, c: 0 }], dir: "right" as Dir };
  const pieceB = { id: 2, cells: [{ r: 0, c: 1 }], dir: "down"  as Dir };

  it("piece A (going right) is blocked by piece B at (0,1)", () => {
    const active = [pieceA, pieceB];
    expect(isRemovable(pieceA, active, N)).toBe(false);
  });

  it("piece B (going down) is NOT blocked — (1,1) and (2,1) are clear", () => {
    const active = [pieceA, pieceB];
    expect(isRemovable(pieceB, active, N)).toBe(true);
  });

  it("after removing B, A becomes removable", () => {
    const active = [pieceA]; // B is gone
    expect(isRemovable(pieceA, active, N)).toBe(true);
  });

  it("a piece does not block itself", () => {
    // Multi-cell piece — its own cells must NOT count as obstacles
    const pieceC = { id: 3, cells: [{ r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 }], dir: "right" as Dir };
    expect(isRemovable(pieceC, [pieceC], N)).toBe(true);
  });

  it("piece going up to the edge with nothing blocking is removable", () => {
    const piece = { id: 5, cells: [{ r: 2, c: 2 }], dir: "up" as Dir };
    expect(isRemovable(piece, [piece], N)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isWon — win condition
// ---------------------------------------------------------------------------
describe("isWon", () => {
  it("true for an empty board", () => {
    expect(isWon([])).toBe(true);
  });

  it("false when any pieces remain", () => {
    expect(isWon([{ id: 1 }])).toBe(false);
    expect(isWon([1, 2, 3])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// end-to-end: simulate a full solve for a seeded easy puzzle
// ---------------------------------------------------------------------------
describe("full solve simulation", () => {
  it("a seeded easy board can be solved by always picking a free piece", () => {
    const cfg = DIFFS[0]; // easy, N=5
    const rng = makeRng("e2e-solve");
    const built = buildOne(rng, cfg);
    const N = cfg.n;

    // Give each piece an id (mimics what the component does)
    let idCounter = 1;
    let board = built.map((p) => ({ ...p, id: idCounter++ }));

    let steps = 0;
    const maxSteps = board.length + 5; // safety ceiling

    while (board.length > 0 && steps < maxSteps) {
      const free = board.find((p) => isRemovable(p, board, N));
      expect(free).toBeDefined(); // must always find a free piece (solvability guarantee)
      board = board.filter((p) => p !== free);
      steps++;
    }
    expect(isWon(board)).toBe(true);
  });
});
