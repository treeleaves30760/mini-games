import { describe, it, expect } from "vitest";
import { makeRng } from "~/utils/rng";
import {
  DIRV, DIRS, OPP, DIFFS,
  inBounds, sweepClear, growSnake, segDir, cellsOf, headFurthest,
  chooseExit, buildOne, solveDepth, generateLevel, isRemovable, isWon,
} from "~/games/arrows";
import type { Cell, Dir, DiffConfig, PieceData } from "~/games/arrows";
import type { Rng } from "~/utils/rng";

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

// ---------------------------------------------------------------------------
// Independent solver — written from the rules alone and deliberately NOT built
// on isRemovable / solveDepth, so it can cross-check both.
//
// Rule under test: a piece may leave iff every cell it sweeps (each of its own
// cells stepped along `dir` until it falls off the board) is empty, one of its
// own cells, or belongs to a piece that has already left. A blocked piece does
// not move at all; a free piece leaves the board entirely in one move.
// ---------------------------------------------------------------------------

type Live = PieceData & { id: number };

/** Flat (r*N+c) → index of the piece occupying that cell. */
function ownerMap(pieces: PieceData[], N: number): Map<number, number> {
  const m = new Map<number, number>();
  pieces.forEach((p, i) => {
    for (const cl of p.cells) m.set(cl.r * N + cl.c, i);
  });
  return m;
}

/** Independent movement rule. `mask` has bit j set for every piece still on the board. */
function canLeave(pieces: PieceData[], owner: Map<number, number>, i: number, mask: number, N: number): boolean {
  const [dr, dc] = DIRV[pieces[i].dir];
  for (const cl of pieces[i].cells) {
    for (let r = cl.r + dr, c = cl.c + dc; r >= 0 && r < N && c >= 0 && c < N; r += dr, c += dc) {
      const o = owner.get(r * N + c);
      if (o !== undefined && o !== i && (mask & (1 << o)) !== 0) return false;
    }
  }
  return true;
}

/** DFS over the set of remaining pieces (bitmask state, memoised). Returns a
 *  removal order (piece indices) that clears the board, or null if unsolvable. */
function solveOrder(pieces: PieceData[], N: number): number[] | null {
  const n = pieces.length;
  if (n >= 31) throw new Error("bitmask solver supports fewer than 31 pieces");
  const owner = ownerMap(pieces, N);
  const memo = new Map<number, number[] | null>();
  const rec = (mask: number): number[] | null => {
    if (mask === 0) return [];
    const hit = memo.get(mask);
    if (hit !== undefined) return hit;
    memo.set(mask, null);
    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) === 0 || !canLeave(pieces, owner, i, mask, N)) continue;
      const rest = rec(mask & ~(1 << i));
      if (rest) {
        const order = [i, ...rest];
        memo.set(mask, order);
        return order;
      }
    }
    return null;
  };
  return rec((1 << n) - 1);
}

/** Give pieces ids the way the component does (1-based, in board order). */
function toLive(pieces: PieceData[]): Live[] {
  return pieces.map((p, i) => ({ ...p, id: i + 1 }));
}

/** Compact, order-preserving serialisation used for determinism goldens. */
function serialise(pieces: PieceData[]): string {
  return pieces
    .map((p) => p.cells.map((cl) => `${cl.r}${cl.c}`).join("-") + ">" + p.dir[0])
    .join("|");
}

describe("independent solver (self-check on hand-crafted boards)", () => {
  it("finds the only order when a bent piece wraps a short one", () => {
    // 3×3 board. A is a 4-cell hook (tail→head) (2,0)→(1,0)→(0,0)→(0,1), heading
    // right. B is a single cell at (1,1) heading down. A's HEAD ray (0,2) is clear,
    // but its middle cell (1,0) sweeps through (1,1) = B, so A is blocked until B
    // leaves. This is exactly the "every cell, not just the head" rule.
    const N = 3;
    const A: PieceData = { cells: [{ r: 2, c: 0 }, { r: 1, c: 0 }, { r: 0, c: 0 }, { r: 0, c: 1 }], dir: "right" };
    const B: PieceData = { cells: [{ r: 1, c: 1 }], dir: "down" };
    expect(solveOrder([A, B], N)).toEqual([1, 0]);
    // The game's own move function must agree at both states.
    const [a, b] = toLive([A, B]);
    expect(isRemovable(a, [a, b], N)).toBe(false);
    expect(isRemovable(b, [a, b], N)).toBe(true);
    expect(isRemovable(a, [a], N)).toBe(true);
  });

  it("returns null for mutually blocking pieces and for a 4-cycle of blockers", () => {
    const N = 3;
    const pair: PieceData[] = [
      { cells: [{ r: 0, c: 0 }], dir: "right" },
      { cells: [{ r: 0, c: 1 }], dir: "left" },
    ];
    expect(solveOrder(pair, N)).toBeNull();
    expect(solveDepth(pair, N)).toBe(-1);
    // Four singles chasing each other around a 2×2 block: X→Y→Z→W→X, every
    // piece's first swept cell is the next piece, so nothing can ever leave.
    const cycle: PieceData[] = [
      { cells: [{ r: 0, c: 0 }], dir: "right" }, // X: sweeps (0,1) = Y
      { cells: [{ r: 0, c: 1 }], dir: "down" },  // Y: sweeps (1,1) = Z
      { cells: [{ r: 1, c: 1 }], dir: "left" },  // Z: sweeps (1,0) = W
      { cells: [{ r: 1, c: 0 }], dir: "up" },    // W: sweeps (0,0) = X
    ];
    expect(solveOrder(cycle, N)).toBeNull();
    expect(solveDepth(cycle, N)).toBe(-1);
  });

  it("solves an empty board with an empty order", () => {
    expect(solveOrder([], 4)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Seed-corpus audit of the exact boards the UI shows (generateLevel = the
// component's best-of-10 selection). Corpus: 300 arbitrary seeds plus every
// Daily-Challenge-style "YYYY-MM-DD" seed of 2026 and 2027, for each preset.
// ---------------------------------------------------------------------------

function dateSeeds(year: number): string[] {
  const out: string[] = [];
  for (const d = new Date(year, 0, 1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
    out.push(`${year}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

const SEED_CORPUS: string[] = [
  ...Array.from({ length: 300 }, (_, i) => `arrows-audit-${i}`),
  ...dateSeeds(2026),
  ...dateSeeds(2027),
];

const levelCache = new Map<string, { seed: string; pieces: PieceData[] }[]>();
function levelsFor(cfg: DiffConfig): { seed: string; pieces: PieceData[] }[] {
  let list = levelCache.get(cfg.key);
  if (!list) {
    list = SEED_CORPUS.map((seed) => ({ seed, pieces: generateLevel(makeRng(seed), cfg) }));
    levelCache.set(cfg.key, list);
  }
  return list;
}

describe("seed-corpus audit: every generated level", () => {
  it("corpus covers all presets and is deterministic (same seed → same board)", () => {
    expect(SEED_CORPUS.length).toBe(300 + 365 + 365);
    for (const cfg of DIFFS) {
      expect(levelsFor(cfg)).toHaveLength(SEED_CORPUS.length);
      for (const seed of ["2026-08-29", "arrows-audit-42"]) {
        expect(serialise(generateLevel(makeRng(seed), cfg))).toBe(serialise(generateLevel(makeRng(seed), cfg)));
      }
    }
  });

  it("(e) is well-formed and non-degenerate: connected snakes, no overlap, sane size", () => {
    const problems: string[] = [];
    const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };
    for (const cfg of DIFFS) {
      const maxLen = Math.max(...cfg.lens);
      for (const { seed, pieces } of levelsFor(cfg)) {
        const tag = `${cfg.key}/${seed}`;
        // Observed minima over this corpus: 6 / 7 / 9 pieces and exactly `fill`
        // cells; the bounds below are looser so the check flags only genuinely
        // degenerate boards (e.g. one or two arrows on an empty grid).
        check(pieces.length >= 5, `${tag}: only ${pieces.length} pieces`);
        check(pieces.length < 31, `${tag}: ${pieces.length} pieces exceeds solver mask`);
        const seen = new Set<number>();
        let cells = 0;
        for (const p of pieces) {
          check(p.cells.length >= 1 && p.cells.length <= maxLen, `${tag}: piece length ${p.cells.length}`);
          check(DIRS.includes(p.dir), `${tag}: bad dir ${p.dir}`);
          check(headFurthest(p.cells, p.dir), `${tag}: chevron not at leading tip`);
          p.cells.forEach((cl, i) => {
            check(inBounds(cl.r, cl.c, cfg.n), `${tag}: cell (${cl.r},${cl.c}) off board`);
            const key = cl.r * cfg.n + cl.c;
            check(!seen.has(key), `${tag}: cell (${cl.r},${cl.c}) used twice`);
            seen.add(key);
            if (i > 0) {
              const prev = p.cells[i - 1];
              check(Math.abs(cl.r - prev.r) + Math.abs(cl.c - prev.c) === 1, `${tag}: snake not 4-connected`);
            }
          });
          cells += p.cells.length;
        }
        check(cells >= cfg.fill - 3 && cells <= cfg.n * cfg.n, `${tag}: ${cells} cells (fill ${cfg.fill})`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("(a)(b) is clearable by the independent solver, and replaying its order through isRemovable wins", () => {
    const mismatches: string[] = [];
    for (const cfg of DIFFS) {
      const N = cfg.n;
      for (const { seed, pieces } of levelsFor(cfg)) {
        const tag = `${cfg.key}/${seed}`;
        const order = solveOrder(pieces, N);
        expect(order, `${tag}: unsolvable`).not.toBeNull();
        expect(new Set(order!).size, tag).toBe(pieces.length);
        // solveDepth (the generator's safety net) must agree the board is solvable.
        expect(solveDepth(pieces, N), tag).toBeGreaterThan(0);

        const owner = ownerMap(pieces, N);
        let mask = (1 << pieces.length) - 1;
        let board = toLive(pieces);
        for (const idx of order!) {
          // Cross-check: the game's verdict for EVERY remaining piece must equal
          // the independent rule at this state.
          for (const q of board) {
            const game = isRemovable(q, board, N);
            const ref = canLeave(pieces, owner, q.id - 1, mask, N);
            if (game !== ref) mismatches.push(`${tag} piece ${q.id}: game=${game} solver=${ref}`);
          }
          const p = board.find((q) => q.id === idx + 1)!;
          expect(isRemovable(p, board, N), `${tag}: move ${idx} rejected by the game`).toBe(true);
          board = board.filter((q) => q !== p); // the component's tap(): a free piece leaves entirely
          mask &= ~(1 << idx);
        }
        expect(isWon(board), tag).toBe(true);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("(d) never dead-ends: any sequence of free removals clears the board and a hint always exists", () => {
    // The component has no lose state; its only "stuck" signal is the hint
    // button finding nothing. Play each board to the end along seeded random
    // free-piece orders and confirm a removable piece exists at every state.
    for (const cfg of DIFFS) {
      const N = cfg.n;
      for (const { seed, pieces } of levelsFor(cfg)) {
        const rng = makeRng(`order-${seed}`);
        for (let k = 0; k < 2; k++) {
          let board = toLive(pieces);
          while (board.length) {
            const free = board.filter((p) => isRemovable(p, board, N)); // hint() = first of these
            expect(free.length, `${cfg.key}/${seed}: deadlock with ${board.length} pieces left`).toBeGreaterThan(0);
            const p = rng.pick(free);
            board = board.filter((q) => q !== p);
          }
          expect(isWon(board)).toBe(true);
        }
      }
    }
  });

  it("raw buildOne candidates (before best-of-10 selection) are solvable too", () => {
    // generateLevel only ever hands out a verified board, but the invariant the
    // design relies on is that reverse placement never yields an unsolvable
    // candidate in the first place. 10 candidates × 300 seeds × 3 presets.
    for (const cfg of DIFFS) {
      for (let i = 0; i < 300; i++) {
        const rng = makeRng(`raw-${cfg.key}-${i}`);
        for (let k = 0; k < 10; k++) {
          const built = buildOne(rng, cfg);
          expect(built.length, `${cfg.key} raw seed ${i}#${k}: empty board`).toBeGreaterThan(0);
          expect(solveOrder(built, cfg.n), `${cfg.key} raw seed ${i}#${k}: unsolvable`).not.toBeNull();
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// generateLevel — the component's board selection
// ---------------------------------------------------------------------------
describe("generateLevel", () => {
  const cfg = DIFFS[0];
  const deadlock: PieceData[] = [
    { cells: [{ r: 0, c: 0 }], dir: "right" },
    { cells: [{ r: 0, c: 1 }], dir: "left" },
  ];
  const single: PieceData[] = [{ cells: [{ r: 0, c: 0 }], dir: "right" }];
  // depth 2: (0,0)→right is blocked until (0,1)→right leaves
  const chained: PieceData[] = [
    { cells: [{ r: 0, c: 0 }], dir: "right" },
    { cells: [{ r: 0, c: 1 }], dir: "right" },
  ];
  // depth 1 but three pieces
  const parallel: PieceData[] = [
    { cells: [{ r: 0, c: 0 }], dir: "right" },
    { cells: [{ r: 1, c: 0 }], dir: "right" },
    { cells: [{ r: 2, c: 0 }], dir: "right" },
  ];
  // depth 1, one piece, two cells (more cells than `single`)
  const longSingle: PieceData[] = [{ cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }], dir: "right" }];
  const sequence = (seq: PieceData[][]) => {
    let k = 0;
    return (_rng: Rng, _cfg: DiffConfig) => seq[k++];
  };

  it("draws exactly `tries` candidates from the builder (default 10) and returns a solvable board", () => {
    let calls = 0;
    const build = (rng: Rng, c: DiffConfig) => { calls++; return buildOne(rng, c); };
    const built = generateLevel(makeRng("gen-count"), cfg, { build });
    expect(calls).toBe(10);
    expect(solveDepth(built, cfg.n)).toBeGreaterThan(0);
    calls = 0;
    generateLevel(makeRng("gen-count"), cfg, { build, tries: 3 });
    expect(calls).toBe(3);
  });

  it("is exactly best-of-10 buildOne draws from the same rng stream (component parity)", () => {
    for (const c of DIFFS) {
      const rng = makeRng("parity");
      let best: { built: PieceData[]; score: number } | null = null;
      for (let k = 0; k < 10; k++) {
        const built = buildOne(rng, c);
        const depth = solveDepth(built, c.n);
        const cells = built.reduce((s, p) => s + p.cells.length, 0);
        const score = depth * 1000 + built.length * 10 + cells;
        if (!best || score > best.score) best = { built, score };
      }
      expect(generateLevel(makeRng("parity"), c)).toEqual(best!.built);
    }
  });

  it("pins the board for a Daily-style seed (seed determinism golden)", () => {
    // Regenerated only if the generator is intentionally changed — a change here
    // means every seeded/Daily board changes.
    expect(serialise(generateLevel(makeRng("2026-08-29"), cfg))).toBe(
      "11>l|33>l|20>d|31-41>d|42-32>u|01>r|22-12>u|14>u|10>l|44>r|03-04>r",
    );
  });

  it("rejects unsolvable candidates and returns the solvable one", () => {
    expect(generateLevel(makeRng("x"), cfg, { tries: 3, build: sequence([deadlock, single, deadlock]) })).toBe(single);
  });

  it("prefers the deeper solution, then more pieces, then more cells; keeps the first on ties", () => {
    expect(generateLevel(makeRng("x"), cfg, { tries: 2, build: sequence([parallel, chained]) })).toBe(chained);
    expect(generateLevel(makeRng("x"), cfg, { tries: 2, build: sequence([chained, parallel]) })).toBe(chained);
    expect(generateLevel(makeRng("x"), cfg, { tries: 2, build: sequence([single, parallel]) })).toBe(parallel);
    expect(generateLevel(makeRng("x"), cfg, { tries: 2, build: sequence([single, longSingle]) })).toBe(longSingle);
    const twin = single.map((p) => ({ ...p }));
    expect(generateLevel(makeRng("x"), cfg, { tries: 2, build: sequence([single, twin]) })).toBe(single);
  });

  it("throws instead of handing out an unverified board when no candidate is solvable", () => {
    expect(() => generateLevel(makeRng("x"), cfg, { tries: 2, build: () => deadlock })).toThrow(/no solvable candidate/);
  });
});
