import { describe, it, expect } from "vitest";
import { makeRng, todaySeed } from "~/utils/rng";
import {
  SIZE,
  EXIT_ROW,
  BANDS,
  vehicleCells,
  buildOccupied,
  overlaps,
  slideRange,
  canSlide,
  slide,
  isSolved,
  solve,
  generatePuzzle,
  type Vehicle,
  type Difficulty,
} from "~/games/rush-hour";

// ---- fixtures ----

const RED: Vehicle = { id: 0, row: 2, col: 0, len: 2, horizontal: true };

/** Red car at col 1, a vertical truck in col 3 across the lane, a car below it. */
const SIMPLE: Vehicle[] = [
  { id: 0, row: 2, col: 1, len: 2, horizontal: true },
  { id: 1, row: 0, col: 3, len: 3, horizontal: false }, // rows 0-2, col 3
  { id: 2, row: 5, col: 2, len: 2, horizontal: true }, // (5,2),(5,3)
];

function get(vs: Vehicle[], id: number): Vehicle {
  const v = vs.find((x) => x.id === id);
  if (!v) throw new Error(`vehicle ${id} not found`);
  return v;
}

// =====================================================================
// Independent reference checker — written from the rules, sharing nothing
// with the module beyond the Vehicle shape. A 36-char grid string is the
// state key; a move slides one vehicle any distance through free cells;
// solved = the red car's right end in the last column. Depth-limited DFS
// with a "remaining budget" memo gives exact answers to "solvable in ≤ L
// moves?", which pins the module's optimum from both sides.
// =====================================================================

const N = 6;

function refCells(v: Vehicle): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = [];
  for (let k = 0; k < v.len; k++) out.push(v.horizontal ? { r: v.row, c: v.col + k } : { r: v.row + k, c: v.col });
  return out;
}

/** Cell → id (-1 empty). Throws when a vehicle leaves the board or two share a cell. */
function refGrid(vs: Vehicle[]): number[] {
  const g = new Array<number>(N * N).fill(-1);
  for (const v of vs) {
    for (const { r, c } of refCells(v)) {
      if (r < 0 || r >= N || c < 0 || c >= N) throw new Error(`vehicle ${v.id} leaves the board`);
      if (g[r * N + c] !== -1) throw new Error(`vehicle ${v.id} overlaps vehicle ${g[r * N + c]}`);
      g[r * N + c] = v.id;
    }
  }
  return g;
}

function refKey(vs: Vehicle[]): string {
  return refGrid(vs).map((id) => (id < 0 ? "." : String.fromCharCode(65 + id))).join("");
}

function refSolved(vs: Vehicle[]): boolean {
  const red = vs.find((v) => v.id === 0);
  return red !== undefined && red.horizontal && red.col === N - 2;
}

interface RefMove {
  id: number;
  delta: number;
  next: Vehicle[];
}

/** Every legal move from `vs`: one vehicle, any distance, only through free cells. */
function refMoves(vs: Vehicle[]): RefMove[] {
  const g = refGrid(vs);
  const out: RefMove[] = [];
  for (const v of vs) {
    for (const dir of [-1, 1]) {
      for (let d = 1; ; d++) {
        const moved = v.horizontal ? { ...v, col: v.col + dir * d } : { ...v, row: v.row + dir * d };
        const ok = refCells(moved).every(
          ({ r, c }) => r >= 0 && r < N && c >= 0 && c < N && (g[r * N + c] === -1 || g[r * N + c] === v.id),
        );
        if (!ok) break;
        out.push({ id: v.id, delta: dir * d, next: vs.map((x) => (x.id === v.id ? moved : x)) });
      }
    }
  }
  return out;
}

/** A solution of at most `limit` moves, or null when none exists. */
function refSearch(vs: Vehicle[], limit: number, memo = new Map<string, number>()): { id: number; delta: number }[] | null {
  if (refSolved(vs)) return [];
  if (limit === 0) return null;
  const key = refKey(vs);
  if ((memo.get(key) ?? -1) >= limit) return null;
  memo.set(key, limit);
  for (const m of refMoves(vs)) {
    const rest = refSearch(m.next, limit - 1, memo);
    if (rest) return [{ id: m.id, delta: m.delta }, ...rest];
  }
  return null;
}

/** Iterative deepening: the exact optimum up to `cap`, or null. */
function refOptimal(vs: Vehicle[], cap: number): number | null {
  for (let limit = 0; limit <= cap; limit++) if (refSearch(vs, limit)) return limit;
  return null;
}

/** Breadth-first over grid-string states: the exact optimum with a shortest path, or null. */
function refBfs(start: Vehicle[]): { optimal: number; path: { id: number; delta: number }[] } | null {
  interface Node {
    vs: Vehicle[];
    parent: Node | null;
    move: { id: number; delta: number } | null;
  }
  const seen = new Set<string>([refKey(start)]);
  let frontier: Node[] = [{ vs: start, parent: null, move: null }];
  for (let depth = 0; frontier.length; depth++) {
    const next: Node[] = [];
    for (const node of frontier) {
      if (refSolved(node.vs)) {
        const path: { id: number; delta: number }[] = [];
        for (let n: Node = node; n.parent; n = n.parent) path.unshift(n.move!);
        return { optimal: depth, path };
      }
      for (const m of refMoves(node.vs)) {
        const key = refKey(m.next);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ vs: m.next, parent: node, move: { id: m.id, delta: m.delta } });
      }
    }
    frontier = next;
  }
  return null;
}

/** Replay a move list through the module's own primitives; the win must fire only at the end. */
function replay(start: Vehicle[], moves: { id: number; delta: number }[]): void {
  let vs = start;
  for (const m of moves) {
    expect(isSolved(vs)).toBe(false);
    expect(canSlide(vs, m.id, m.delta)).toBe(true);
    vs = slide(vs, m.id, m.delta);
    expect(() => refGrid(vs)).not.toThrow();
  }
  expect(isSolved(vs)).toBe(true);
}

describe("reference checker self-check", () => {
  it("rejects overlapping or off-board vehicles", () => {
    expect(() => refGrid([RED, { id: 1, row: 2, col: 1, len: 2, horizontal: true }])).toThrow(/overlaps/);
    expect(() => refGrid([{ id: 0, row: 4, col: 0, len: 3, horizontal: false }])).toThrow(/leaves/);
  });

  it("solves the empty lot in one move and reports a walled-in car as unsolvable", () => {
    expect(refOptimal([RED], 5)).toBe(1);
    const walled: Vehicle[] = [RED, { id: 1, row: 2, col: 2, len: 3, horizontal: true }];
    expect(refOptimal(walled, 8)).toBeNull();
  });
});

// ---- constants ----

describe("constants", () => {
  it("6×6 lot, exit on row 2", () => {
    expect(SIZE).toBe(6);
    expect(EXIT_ROW).toBe(2);
  });

  it("bands are ordered and contiguous", () => {
    expect(BANDS.easy.min).toBeLessThan(BANDS.easy.max);
    expect(BANDS.normal.min).toBe(BANDS.easy.max + 1);
    expect(BANDS.hard.min).toBe(BANDS.normal.max + 1);
    expect(BANDS.hard.max).toBe(Infinity);
  });
});

// ---- geometry ----

describe("vehicleCells / buildOccupied", () => {
  it("lists cells along the axis for both orientations", () => {
    expect(vehicleCells({ id: 0, row: 2, col: 1, len: 2, horizontal: true })).toEqual([
      { row: 2, col: 1 },
      { row: 2, col: 2 },
    ]);
    expect(vehicleCells({ id: 1, row: 0, col: 3, len: 3, horizontal: false })).toEqual([
      { row: 0, col: 3 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
    ]);
  });

  it("builds a row-major occupancy grid with -1 for empty cells", () => {
    const occ = buildOccupied(SIMPLE);
    expect(occ).toHaveLength(36);
    expect(occ[2 * 6 + 1]).toBe(0);
    expect(occ[2 * 6 + 2]).toBe(0);
    expect(occ[0 * 6 + 3]).toBe(1);
    expect(occ[2 * 6 + 3]).toBe(1);
    expect(occ[5 * 6 + 2]).toBe(2);
    expect(occ[5 * 6 + 3]).toBe(2);
    expect(occ.filter((x) => x === -1)).toHaveLength(36 - 7);
    expect(occ).toEqual(refGrid(SIMPLE));
  });
});

describe("overlaps", () => {
  it("is false for a vehicle that fits on free cells", () => {
    expect(overlaps(SIMPLE, { id: 9, row: 0, col: 0, len: 2, horizontal: true })).toBe(false);
  });

  it("is true when any cell is already taken", () => {
    expect(overlaps(SIMPLE, { id: 9, row: 1, col: 3, len: 2, horizontal: true })).toBe(true); // (1,3) is the truck
    expect(overlaps(SIMPLE, { id: 9, row: 3, col: 3, len: 3, horizontal: false })).toBe(true); // (5,3) is the car
  });

  it("is true when the vehicle leaves the board on any side", () => {
    expect(overlaps([], { id: 9, row: 0, col: 5, len: 2, horizontal: true })).toBe(true); // col 6
    expect(overlaps([], { id: 9, row: 4, col: 0, len: 3, horizontal: false })).toBe(true); // row 6
    expect(overlaps([], { id: 9, row: 0, col: -1, len: 2, horizontal: true })).toBe(true);
    expect(overlaps([], { id: 9, row: -1, col: 0, len: 2, horizontal: false })).toBe(true);
  });
});

// ---- moves ----

describe("slideRange / canSlide", () => {
  it("red car in SIMPLE: left to col 0, right blocked by the truck at col 3", () => {
    expect(slideRange(SIMPLE, 0)).toEqual({ min: -1, max: 0 });
    expect(canSlide(SIMPLE, 0, -1)).toBe(true);
    expect(canSlide(SIMPLE, 0, 1)).toBe(false);
    expect(canSlide(SIMPLE, 0, -2)).toBe(false);
  });

  it("truck in SIMPLE: down two rows (row 3, 4) but not into the car at (5,3)", () => {
    expect(slideRange(SIMPLE, 1)).toEqual({ min: 0, max: 2 });
    expect(canSlide(SIMPLE, 1, 1)).toBe(true);
    expect(canSlide(SIMPLE, 1, 2)).toBe(true);
    expect(canSlide(SIMPLE, 1, 3)).toBe(false);
    expect(canSlide(SIMPLE, 1, -1)).toBe(false); // top edge
  });

  it("car in SIMPLE: left two, right two, all cells free", () => {
    expect(slideRange(SIMPLE, 2)).toEqual({ min: -2, max: 2 });
    expect(canSlide(SIMPLE, 2, 2)).toBe(true);
    expect(canSlide(SIMPLE, 2, 3)).toBe(false);
  });

  it("intermediate cells must be free, not just the destination", () => {
    // Red at col 0, a car at cols 2-3 in row 2 (behind it, past a gap), destination col 4 would be free.
    const vs: Vehicle[] = [RED, { id: 1, row: 2, col: 2, len: 2, horizontal: true }];
    expect(canSlide(vs, 0, 4)).toBe(false);
    expect(canSlide(vs, 0, 1)).toBe(false);
    expect(slideRange(vs, 0)).toEqual({ min: 0, max: 0 });
  });

  it("delta 0 and unknown ids are never legal", () => {
    expect(canSlide(SIMPLE, 0, 0)).toBe(false);
    expect(canSlide(SIMPLE, 42, 1)).toBe(false);
    expect(slideRange(SIMPLE, 42)).toEqual({ min: 0, max: 0 });
  });

  it("agrees with the reference move list on every reachable state of SIMPLE", () => {
    const seen = new Set<string>([refKey(SIMPLE)]);
    const queue = [SIMPLE];
    let checked = 0;
    for (let i = 0; i < queue.length; i++) {
      const vs = queue[i]!;
      const legal = new Set(refMoves(vs).map((m) => `${m.id}:${m.delta}`));
      for (const v of vs) {
        for (let delta = -5; delta <= 5; delta++) {
          expect(canSlide(vs, v.id, delta)).toBe(delta !== 0 && legal.has(`${v.id}:${delta}`));
          checked++;
        }
      }
      for (const m of refMoves(vs)) {
        const key = refKey(m.next);
        if (!seen.has(key)) {
          seen.add(key);
          queue.push(m.next);
        }
      }
    }
    expect(seen.size).toBeGreaterThan(10);
    expect(checked).toBe(seen.size * 3 * 11);
  });
});

describe("slide", () => {
  it("moves a horizontal vehicle by columns and a vertical one by rows", () => {
    const a = slide(SIMPLE, 0, -1);
    expect(get(a, 0)).toEqual({ ...get(SIMPLE, 0), col: 0 });
    const b = slide(SIMPLE, 1, 2);
    expect(get(b, 1)).toEqual({ ...get(SIMPLE, 1), row: 2 });
  });

  it("returns a new array of new objects and leaves the input untouched", () => {
    const before = JSON.stringify(SIMPLE);
    const after = slide(SIMPLE, 2, -2);
    expect(after).not.toBe(SIMPLE);
    expect(after[0]).not.toBe(SIMPLE[0]);
    expect(get(after, 2).col).toBe(0);
    expect(get(after, 0)).toEqual(get(SIMPLE, 0));
    expect(JSON.stringify(SIMPLE)).toBe(before);
  });
});

describe("isSolved", () => {
  it("is true only when the red car's right end is at the last column", () => {
    expect(isSolved(SIMPLE)).toBe(false);
    expect(isSolved([{ ...RED, col: 4 }])).toBe(true);
    expect(isSolved([{ ...RED, col: 3 }])).toBe(false);
  });

  it("is false without a red car", () => {
    expect(isSolved([{ id: 1, row: 2, col: 4, len: 2, horizontal: true }])).toBe(false);
    expect(isSolved([])).toBe(false);
  });
});

// ---- solver ----

describe("solve", () => {
  it("returns 0 for a solved board and 1 for a clear lane", () => {
    expect(solve([{ ...RED, col: 4 }])).toBe(0);
    expect(solve([RED])).toBe(1);
  });

  it("matches the reference optimum on SIMPLE (car aside, truck down, red car out)", () => {
    expect(solve(SIMPLE)).toBe(3);
    expect(refOptimal(SIMPLE, 6)).toBe(3);
  });

  it("returns null when a horizontal vehicle sits in front of the red car", () => {
    const vs: Vehicle[] = [RED, { id: 1, row: 2, col: 3, len: 2, horizontal: true }];
    expect(solve(vs)).toBeNull();
    expect(refOptimal(vs, 10)).toBeNull();
  });

  it("returns null when a vertical truck is pinned across the lane", () => {
    // Truck in col 4 rows 1-3, locked by horizontal cars above (row 0) and below (row 4) spanning col 4,
    // which themselves cannot leave because the board edge and each other hem them in.
    const vs: Vehicle[] = [
      RED,
      { id: 1, row: 1, col: 4, len: 3, horizontal: false },
      { id: 2, row: 0, col: 4, len: 2, horizontal: true },
      { id: 3, row: 4, col: 4, len: 2, horizontal: true },
      { id: 4, row: 0, col: 3, len: 2, horizontal: false }, // rows 0-1 col 3: keeps car 2 from sliding left
      { id: 5, row: 3, col: 3, len: 3, horizontal: false }, // rows 3-5 col 3: keeps car 3 from sliding left
    ];
    expect(solve(vs)).toBeNull();
    expect(refOptimal(vs, 12)).toBeNull();
  });

  it("returns null without a red car", () => {
    expect(solve([{ id: 1, row: 0, col: 0, len: 2, horizontal: true }])).toBeNull();
  });

  it("gives up with null once the state cap is exceeded", () => {
    expect(solve(SIMPLE, 2)).toBeNull();
    expect(solve(SIMPLE)).toBe(3);
  });

  it("agrees with the reference optimum on a handful of hand-made lots", () => {
    const lots: Vehicle[][] = [
      [
        { id: 0, row: 2, col: 0, len: 2, horizontal: true },
        { id: 1, row: 0, col: 2, len: 3, horizontal: false },
        { id: 2, row: 3, col: 2, len: 2, horizontal: true },
        { id: 3, row: 1, col: 4, len: 2, horizontal: false },
        { id: 4, row: 4, col: 4, len: 2, horizontal: true },
      ],
      [
        { id: 0, row: 2, col: 2, len: 2, horizontal: true },
        { id: 1, row: 1, col: 4, len: 2, horizontal: false },
        { id: 2, row: 0, col: 3, len: 2, horizontal: true },
        { id: 3, row: 4, col: 4, len: 2, horizontal: true },
        { id: 4, row: 3, col: 0, len: 3, horizontal: false },
      ],
    ];
    for (const lot of lots) {
      const optimal = solve(lot);
      expect(optimal).not.toBeNull();
      expect(refOptimal(lot, 12)).toBe(optimal);
    }
  });
});

// ---- generator ----

const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

/** Structural invariants every generated puzzle must satisfy. */
function checkShape(vs: Vehicle[]): void {
  expect(vs.length).toBeGreaterThanOrEqual(2);
  vs.forEach((v, i) => expect(v.id).toBe(i));
  const red = vs[0]!;
  expect(red).toMatchObject({ row: EXIT_ROW, len: 2, horizontal: true });
  expect(red.col).toBeGreaterThanOrEqual(0);
  expect(red.col).toBeLessThanOrEqual(3);
  for (const v of vs) {
    expect([2, 3]).toContain(v.len);
    if (v.id !== 0 && v.horizontal) expect(v.row).not.toBe(EXIT_ROW);
  }
  expect(() => refGrid(vs)).not.toThrow();
}

describe("generatePuzzle", () => {
  it("is deterministic for a given seed", () => {
    for (const d of DIFFICULTIES) {
      const a = generatePuzzle(makeRng(`seed-${d}`), d);
      const b = generatePuzzle(makeRng(`seed-${d}`), d);
      expect(b).toEqual(a);
    }
  });

  it("different seeds give different puzzles", () => {
    const keys = new Set<string>();
    for (let s = 1; s <= 20; s++) keys.add(refKey(generatePuzzle(makeRng(s), "normal").vehicles));
    expect(keys.size).toBeGreaterThan(15);
  });

  for (const d of DIFFICULTIES) {
    describe(d, () => {
      const SEEDS = 40;
      const puzzles = Array.from({ length: SEEDS }, (_, i) => generatePuzzle(makeRng(`${d}-${i + 1}`), d));

      it("every puzzle is well formed: red car on row 2, no horizontal vehicle in the lane, no overlap", () => {
        for (const p of puzzles) checkShape(p.vehicles);
      });

      it("optimal equals the module's own solve() and lies in the band (hard: at least 90%, rest close)", () => {
        const { min, max } = BANDS[d];
        let inBand = 0;
        for (const p of puzzles) {
          expect(solve(p.vehicles)).toBe(p.optimal);
          expect(p.optimal).toBeLessThanOrEqual(max);
          if (p.optimal >= min) inBand++;
          else expect(p.optimal).toBeGreaterThanOrEqual(min - 2);
        }
        expect(inBand).toBeGreaterThanOrEqual(d === "hard" ? Math.ceil(SEEDS * 0.9) : SEEDS);
      });

      it("the reference BFS confirms optimal exactly and its path replays through canSlide/slide/isSolved", () => {
        for (const p of puzzles) {
          const res = refBfs(p.vehicles);
          expect(res).not.toBeNull();
          expect(res!.optimal).toBe(p.optimal);
          expect(res!.path).toHaveLength(p.optimal);
          replay(p.vehicles, res!.path);
        }
      });

      if (d === "easy") {
        it("the reference DFS agrees: solvable in `optimal` moves, not in one fewer", () => {
          for (const p of puzzles) {
            expect(refSearch(p.vehicles, p.optimal - 1)).toBeNull();
            const path = refSearch(p.vehicles, p.optimal);
            expect(path).not.toBeNull();
            replay(p.vehicles, path!);
          }
        });
      }
    });
  }

  it("daily seeds for a year all yield well-formed normal puzzles", () => {
    for (let day = 0; day < 366; day += 7) {
      const p = generatePuzzle(makeRng(todaySeed(new Date(2026, 0, 1 + day))), "normal");
      checkShape(p.vehicles);
      expect(p.optimal).toBeGreaterThanOrEqual(BANDS.normal.min);
      expect(p.optimal).toBeLessThanOrEqual(BANDS.normal.max);
    }
  });

  it("with too few attempts to reach the band it still returns the deepest solvable lot seen", () => {
    let fallbacks = 0;
    for (let s = 1; s <= 30; s++) {
      const p = generatePuzzle(makeRng(`few-${s}`), "hard", 8);
      checkShape(p.vehicles);
      expect(solve(p.vehicles)).toBe(p.optimal);
      expect(p.optimal).toBeGreaterThanOrEqual(1);
      if (p.optimal < BANDS.hard.min) fallbacks++;
    }
    expect(fallbacks).toBeGreaterThan(0);
  });

  it("with a tiny state cap every lot is skipped and the empty lot is returned", () => {
    const p = generatePuzzle(makeRng(1), "easy", 5, 1);
    expect(p).toEqual({ vehicles: [{ id: 0, row: EXIT_ROW, col: 0, len: 2, horizontal: true }], optimal: 1 });
  });

  it("with zero attempts the empty lot is returned", () => {
    const p = generatePuzzle(makeRng(1), "hard", 0);
    expect(p.vehicles).toHaveLength(1);
    expect(p.optimal).toBe(1);
    expect(isSolved(slide(p.vehicles, 0, 4))).toBe(true);
  });
});
