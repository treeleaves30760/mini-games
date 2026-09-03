import { describe, it, expect } from "vitest";
import {
  SIZES,
  neighbors,
  isAdjacent,
  isPathValid,
  endpointColor,
  colorRange,
  tryPartition,
  generatePuzzle,
  emptyPaths,
  isConnected,
  beginDrag,
  extendPath,
  dragTo,
  connectedCount,
  coveredCount,
  isSolved,
} from "~/games/flow";
import type { Endpoint, Paths, Puzzle } from "~/games/flow";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Independent validator — written from the rules, not from the module.
//
// A puzzle is well formed when its solution partitions the N×N grid into
// simple paths: every colour's cells form one connected chain whose two ends
// are exactly that colour's endpoints, with at least 3 cells, and no two
// non-consecutive cells of the chain touch (so the chain's shape is fixed by
// its cells). Colour counts must stay within the brief's caps.
// ---------------------------------------------------------------------------

const COLOR_CAPS: Record<number, [number, number]> = { 5: [4, 6], 7: [6, 9], 9: [8, 12] };

function touch(a: number, b: number, N: number): boolean {
  const ar = Math.floor(a / N), ac = a % N;
  const br = Math.floor(b / N), bc = b % N;
  return (ar === br && Math.abs(ac - bc) === 1) || (ac === bc && Math.abs(ar - br) === 1);
}

/** Returns a description of the first rule violated, or null when valid. */
function validatePuzzle(p: Puzzle, caps = true): string | null {
  const N = p.size;
  if (!Number.isInteger(N) || N < 3) return `bad size ${N}`;
  if (p.solution.length !== N * N) return `solution length ${p.solution.length}`;
  const k = p.endpoints.length;
  const cap = COLOR_CAPS[N];
  if (caps && cap && (k < cap[0] || k > cap[1])) return `${k} colours on ${N}×${N}`;
  const seenColor = new Set<number>();
  for (let c = 0; c < k; c++) {
    const ep = p.endpoints[c]!;
    if (ep.color !== c) return `endpoint ${c} has colour ${ep.color}`;
    if (seenColor.has(ep.color)) return `duplicate colour ${ep.color}`;
    seenColor.add(ep.color);
    if (ep.a === ep.b) return `colour ${c} endpoints coincide`;
    for (const e of [ep.a, ep.b]) {
      if (!Number.isInteger(e) || e < 0 || e >= N * N) return `colour ${c} endpoint ${e} off grid`;
      if (p.solution[e] !== c) return `colour ${c} endpoint ${e} not covered by its colour`;
    }
  }
  for (let i = 0; i < N * N; i++) {
    const col = p.solution[i]!;
    if (!Number.isInteger(col) || col < 0 || col >= k) return `cell ${i} has colour ${col}`;
  }
  for (let c = 0; c < k; c++) {
    const cells: number[] = [];
    for (let i = 0; i < N * N; i++) if (p.solution[i] === c) cells.push(i);
    if (cells.length < 3) return `colour ${c} has only ${cells.length} cells`;
    const ep = p.endpoints[c]!;
    // Induced degrees: ends 1, interior 2 — this also forbids self-touching.
    for (const x of cells) {
      let deg = 0;
      for (const y of cells) if (touch(x, y, N)) deg++;
      const want = x === ep.a || x === ep.b ? 1 : 2;
      if (deg !== want) return `colour ${c} cell ${x} has degree ${deg}, want ${want}`;
    }
    // Connected: walking from a must visit every cell and end at b.
    const set = new Set(cells);
    let prev = -1;
    let cur = ep.a;
    let steps = 1;
    while (cur !== ep.b) {
      let next = -1;
      for (const y of set) if (y !== prev && touch(cur, y, N)) next = y;
      if (next < 0) return `colour ${c} chain breaks at ${cur}`;
      prev = cur;
      cur = next;
      steps++;
      if (steps > cells.length) return `colour ${c} chain loops`;
    }
    if (steps !== cells.length) return `colour ${c} chain visits ${steps} of ${cells.length}`;
  }
  return null;
}

/** Order one colour's cells from a to b by walking the chain. */
function orderedPath(p: Puzzle, color: number): number[] {
  const N = p.size;
  const set = new Set<number>();
  for (let i = 0; i < N * N; i++) if (p.solution[i] === color) set.add(i);
  const ep = p.endpoints[color]!;
  const out = [ep.a];
  let prev = -1;
  let cur = ep.a;
  while (cur !== ep.b) {
    let next = -1;
    for (const y of set) if (y !== prev && touch(cur, y, N)) next = y;
    prev = cur;
    cur = next;
    out.push(cur);
  }
  return out;
}

function solutionPaths(p: Puzzle): Paths {
  return p.endpoints.map((ep) => orderedPath(p, ep.color));
}

const NUMERIC_SEEDS: number[] = [];
for (let i = 1; i <= 200; i++) NUMERIC_SEEDS.push(i);
const DATE_SEEDS: string[] = [];
{
  const d = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < 365; i++) {
    DATE_SEEDS.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

// A hand-made 3×3 puzzle: three horizontal rows.
//   0 1 2
//   3 4 5
//   6 7 8
const ROWS3: Endpoint[] = [
  { color: 0, a: 0, b: 2 },
  { color: 1, a: 3, b: 5 },
  { color: 2, a: 6, b: 8 },
];
// And three vertical columns.
const COLS3: Endpoint[] = [
  { color: 0, a: 0, b: 6 },
  { color: 1, a: 1, b: 7 },
  { color: 2, a: 2, b: 8 },
];

// ---------------------------------------------------------------------------
// Validator self-check
// ---------------------------------------------------------------------------

describe("independent validator", () => {
  it("accepts a hand-made row partition", () => {
    const p: Puzzle = { size: 3, endpoints: ROWS3, solution: [0, 0, 0, 1, 1, 1, 2, 2, 2] };
    expect(validatePuzzle(p)).toBeNull();
    expect(orderedPath(p, 1)).toEqual([3, 4, 5]);
  });

  it("rejects a self-touching path, a short path, and a broken chain", () => {
    // U-shape 0-1-2-5-4-3: cells 0 and 3 touch without being consecutive.
    const u: Puzzle = {
      size: 3,
      endpoints: [{ color: 0, a: 0, b: 3 }, { color: 1, a: 6, b: 8 }],
      solution: [0, 0, 0, 0, 0, 0, 1, 1, 1],
    };
    expect(validatePuzzle(u)).toMatch(/degree/);
    const short: Puzzle = {
      size: 3,
      endpoints: [{ color: 0, a: 0, b: 1 }, { color: 1, a: 2, b: 6 }],
      solution: [0, 0, 1, 1, 1, 1, 1, 1, 1],
    };
    expect(validatePuzzle(short)).toMatch(/only 2 cells/);
    const split: Puzzle = {
      size: 3,
      endpoints: [{ color: 0, a: 0, b: 8 }, { color: 1, a: 3, b: 5 }],
      solution: [0, 0, 0, 1, 1, 1, 0, 0, 0],
    };
    expect(validatePuzzle(split)).not.toBeNull();
    expect(validatePuzzle({ size: 3, endpoints: [], solution: [] })).toMatch(/length/);
    expect(validatePuzzle({ size: 2, endpoints: [], solution: [0, 0, 0, 0] })).toMatch(/size/);
  });
});

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

describe("grid helpers", () => {
  it("neighbors lists orthogonal cells inside the grid", () => {
    expect(neighbors(0, 3).sort()).toEqual([1, 3]);
    expect(neighbors(4, 3).sort()).toEqual([1, 3, 5, 7]);
    expect(neighbors(8, 3).sort()).toEqual([5, 7]);
  });

  it("isAdjacent is orthogonal only and never wraps rows", () => {
    expect(isAdjacent(0, 1, 3)).toBe(true);
    expect(isAdjacent(0, 3, 3)).toBe(true);
    expect(isAdjacent(0, 4, 3)).toBe(false);
    expect(isAdjacent(2, 3, 3)).toBe(false);
    expect(isAdjacent(4, 4, 3)).toBe(false);
  });

  it("isPathValid checks emptiness, bounds, repeats and adjacency", () => {
    expect(isPathValid([], 3)).toBe(false);
    expect(isPathValid([0], 3)).toBe(true);
    expect(isPathValid([0, 1, 2, 5], 3)).toBe(true);
    expect(isPathValid([0, 9], 3)).toBe(false);
    expect(isPathValid([-1], 3)).toBe(false);
    expect(isPathValid([0.5], 3)).toBe(false);
    expect(isPathValid([0, 1, 0], 3)).toBe(false);
    expect(isPathValid([0, 4], 3)).toBe(false);
  });

  it("endpointColor finds the colour of an endpoint cell", () => {
    expect(endpointColor(ROWS3, 5)).toBe(1);
    expect(endpointColor(ROWS3, 6)).toBe(2);
    expect(endpointColor(ROWS3, 4)).toBe(-1);
  });

  it("colorRange follows the brief's caps and scales for other sizes", () => {
    expect(colorRange(5)).toEqual([4, 6]);
    expect(colorRange(7)).toEqual([6, 9]);
    expect(colorRange(9)).toEqual([8, 12]);
    expect(colorRange(4)).toEqual([3, 5]);
    expect(colorRange(1)).toEqual([1, 1]);
    expect(SIZES).toEqual([5, 7, 9]);
  });
});

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

describe("generatePuzzle — every seed × every size is a valid partition", () => {
  it("200 numeric seeds on 5×5, 7×7 and 9×9", () => {
    let audited = 0;
    for (const N of SIZES) {
      for (const seed of NUMERIC_SEEDS) {
        const p = generatePuzzle(makeRng(seed), N);
        expect(p.size).toBe(N);
        expect(validatePuzzle(p), `N=${N} seed=${seed}`).toBeNull();
        // The generator's own partition, replayed as player paths, wins.
        const paths = solutionPaths(p);
        expect(isSolved(paths, p.endpoints, N), `N=${N} seed=${seed}`).toBe(true);
        expect(connectedCount(paths, p.endpoints)).toBe(p.endpoints.length);
        expect(coveredCount(paths)).toBe(N * N);
        for (const path of paths) expect(isPathValid(path, N)).toBe(true);
        audited++;
      }
    }
    expect(audited).toBe(SIZES.length * NUMERIC_SEEDS.length);
  });

  it("365 daily-date seeds on the daily 7×7", () => {
    for (const seed of DATE_SEEDS) {
      const p = generatePuzzle(makeRng(seed), 7);
      expect(validatePuzzle(p), seed).toBeNull();
      expect(isSolved(solutionPaths(p), p.endpoints, 7)).toBe(true);
    }
  });

  it("is deterministic for a seed and varies across seeds", () => {
    for (const N of SIZES) {
      const a = generatePuzzle(makeRng("same"), N);
      const b = generatePuzzle(makeRng("same"), N);
      expect(a).toEqual(b);
    }
    const s1 = generatePuzzle(makeRng("2026-08-29"), 7);
    const s2 = generatePuzzle(makeRng("2026-08-30"), 7);
    expect(s1).not.toEqual(s2);
    expect(generatePuzzle(makeRng(1), 5)).not.toEqual(generatePuzzle(makeRng(2), 5));
  });

  it("does not use the row fallback in practice (puzzle shapes vary)", () => {
    for (const N of SIZES) {
      let rowLike = 0;
      for (const seed of NUMERIC_SEEDS) {
        const p = generatePuzzle(makeRng(seed), N);
        const isRows = p.endpoints.every((ep) => Math.floor(ep.a / N) === Math.floor(ep.b / N) && Math.abs(ep.a - ep.b) === N - 1);
        if (isRows) rowLike++;
      }
      expect(rowLike, `N=${N}`).toBe(0);
    }
  });

  it("other sizes (generic colour range) also generate valid puzzles", () => {
    for (const N of [3, 4, 6, 8]) {
      for (let seed = 1; seed <= 30; seed++) {
        const p = generatePuzzle(makeRng(seed), N);
        expect(validatePuzzle(p), `N=${N} seed=${seed}`).toBeNull();
        expect(isSolved(solutionPaths(p), p.endpoints, N)).toBe(true);
      }
    }
  });

  it("falls back to a row partition when no attempt is allowed", () => {
    for (const N of SIZES) {
      const p = generatePuzzle(makeRng("fallback"), N, 0);
      expect(validatePuzzle(p)).toBeNull();
      expect(p.endpoints.length).toBe(N);
      const rows = p.endpoints
        .map((ep) => [ep.a, ep.b])
        .sort((x, y) => x[0]! - y[0]!);
      for (let r = 0; r < N; r++) expect(rows[r]).toEqual([r * N, r * N + N - 1]);
      expect(isSolved(solutionPaths(p), p.endpoints, N)).toBe(true);
    }
  });
});

describe("tryPartition", () => {
  it("returns null when the colour bounds cannot be met", () => {
    let low = 0;
    let high = 0;
    for (let seed = 1; seed <= 50; seed++) {
      if (tryPartition(makeRng(seed), 5, 99, 100, 19) === null) low++;
      if (tryPartition(makeRng(seed), 5, 1, 1, 19) === null) high++;
    }
    expect(low).toBe(50);
    expect(high).toBe(50);
  });

  it("every partition it returns is a valid set of non-touching paths", () => {
    let returned = 0;
    for (const N of [5, 7, 9]) {
      for (let seed = 1; seed <= 300; seed++) {
        const parts = tryPartition(makeRng(seed), N, 1, 99, N * N);
        if (parts === null) continue;
        returned++;
        const endpoints = parts.map((path, c) => ({ color: c, a: path[0]!, b: path[path.length - 1]! }));
        const solution = new Array(N * N).fill(-1);
        parts.forEach((path, c) => path.forEach((cell) => (solution[cell] = c)));
        expect(validatePuzzle({ size: N, endpoints, solution }, false), `N=${N} seed=${seed}`).toBeNull();
        parts.forEach((path, c) => expect(path).toEqual(orderedPath({ size: N, endpoints, solution }, c)));
      }
    }
    expect(returned).toBeGreaterThan(300);
  });
});

// ---------------------------------------------------------------------------
// Drag model
// ---------------------------------------------------------------------------

describe("beginDrag", () => {
  it("starts a fresh path from an endpoint, discarding that colour's old path", () => {
    let paths = emptyPaths(ROWS3);
    expect(paths).toEqual([[], [], []]);
    paths[1] = [3, 4, 5];
    const res = beginDrag(paths, ROWS3, 5);
    expect(res).toEqual({ color: 1, paths: [[], [5], []] });
    expect(paths[1]).toEqual([3, 4, 5]);
  });

  it("cuts an existing path back to the pressed cell and continues it", () => {
    const paths: Paths = [[0, 1], [3, 4, 5], []];
    const res = beginDrag(paths, ROWS3, 4);
    expect(res).toEqual({ color: 1, paths: [[0, 1], [3, 4], []] });
  });

  it("returns null on an empty cell", () => {
    expect(beginDrag([[0, 1], [], []], ROWS3, 7)).toBeNull();
  });
});

describe("extendPath", () => {
  const N = 3;

  it("ignores colours with no path, the head itself, and non-adjacent cells", () => {
    const paths: Paths = [[0], [], []];
    expect(extendPath(paths, ROWS3, 1, 4, N)).toBe(paths);
    expect(extendPath(paths, ROWS3, 0, 0, N)).toBe(paths);
    expect(extendPath(paths, ROWS3, 0, 4, N)).toBe(paths);
    const shortList: Paths = [[0]];
    expect(extendPath(shortList, ROWS3, 2, 7, N)).toBe(shortList);
  });

  it("appends an adjacent empty cell and reaches the partner endpoint", () => {
    let paths: Paths = [[0], [], []];
    paths = extendPath(paths, ROWS3, 0, 1, N);
    expect(paths[0]).toEqual([0, 1]);
    expect(isConnected(paths[0]!, ROWS3[0]!)).toBe(false);
    paths = extendPath(paths, ROWS3, 0, 2, N);
    expect(paths[0]).toEqual([0, 1, 2]);
    expect(isConnected(paths[0]!, ROWS3[0]!)).toBe(true);
    // Finished paths do not grow any further.
    expect(extendPath(paths, ROWS3, 0, 5, N)).toBe(paths);
  });

  it("works from either endpoint", () => {
    let paths: Paths = [[], [], [8]];
    paths = extendPath(paths, ROWS3, 2, 7, N);
    paths = extendPath(paths, ROWS3, 2, 6, N);
    expect(paths[2]).toEqual([8, 7, 6]);
    expect(isConnected(paths[2]!, ROWS3[2]!)).toBe(true);
    expect(isConnected([8], ROWS3[2]!)).toBe(false);
  });

  it("stepping back onto its own body cuts the path there", () => {
    const paths: Paths = [[0, 3, 4, 1], [], []];
    expect(extendPath(paths, ROWS3, 0, 4, N)[0]).toEqual([0, 3, 4]);
    expect(extendPath(paths, ROWS3, 0, 0, N)[0]).toEqual([0]);
  });

  it("is blocked by another colour's endpoint", () => {
    const paths: Paths = [[0], [], []];
    expect(extendPath(paths, ROWS3, 0, 3, N)).toBe(paths);
  });

  it("cuts another colour's path at the cell it steps on", () => {
    let paths: Paths = [[0, 1], [3, 4, 5], [6, 7, 8]];
    paths = extendPath(paths, ROWS3, 0, 4, N);
    expect(paths).toEqual([[0, 1, 4], [3], [6, 7, 8]]);
    paths = extendPath(paths, ROWS3, 0, 7, N);
    expect(paths).toEqual([[0, 1, 4, 7], [3], [6]]);
  });

  it("never mutates the input", () => {
    const paths: Paths = [[0, 1], [3, 4, 5], []];
    const snapshot = JSON.stringify(paths);
    extendPath(paths, ROWS3, 0, 4, N);
    extendPath(paths, ROWS3, 0, 0, N);
    expect(JSON.stringify(paths)).toBe(snapshot);
  });
});

describe("dragTo", () => {
  const N = 3;

  it("walks straight across several cells in one move", () => {
    const paths = dragTo([[0], [], []], ROWS3, 0, 2, N);
    expect(paths[0]).toEqual([0, 1, 2]);
    const down = dragTo([[], [], [8]], ROWS3, 2, 6, N);
    expect(down[2]).toEqual([8, 7, 6]);
    const col = dragTo([[0], [], []], COLS3, 0, 6, N);
    expect(col[0]).toEqual([0, 3, 6]);
  });

  it("stops at the first refused step", () => {
    // Colour 0 heading down from 0 is blocked by colour 1's endpoint at 3.
    const paths: Paths = [[0], [], []];
    expect(dragTo(paths, ROWS3, 0, 6, N)).toBe(paths);
    // Reaching the partner finishes the path; the walk goes no further.
    const finished = dragTo([[0]], [{ color: 0, a: 0, b: 1 }], 0, 2, N);
    expect(finished[0]).toEqual([0, 1]);
  });

  it("ignores diagonal targets, the head itself, and missing paths", () => {
    const paths: Paths = [[0], [], []];
    expect(dragTo(paths, ROWS3, 0, 4, N)).toBe(paths);
    expect(dragTo(paths, ROWS3, 0, 0, N)).toBe(paths);
    expect(dragTo(paths, ROWS3, 1, 4, N)).toBe(paths);
    expect(dragTo([], ROWS3, 0, 1, N)).toEqual([]);
  });

  it("backtracks along its own path", () => {
    const paths: Paths = [[0, 1, 2, 5], [], []];
    expect(dragTo(paths, COLS3, 0, 0, N)[0]).toEqual([0, 1, 2, 5]); // diagonal from 5
    expect(dragTo(paths, COLS3, 0, 3, N)[0]).toEqual([0, 1, 2, 5, 4, 3]); // straight along the row
    const p2: Paths = [[0, 1, 2], [], []];
    expect(dragTo(p2, COLS3, 0, 0, N)[0]).toEqual([0]);
  });
});

// ---------------------------------------------------------------------------
// Progress and win detection
// ---------------------------------------------------------------------------

describe("progress", () => {
  it("counts connected pairs and covered cells", () => {
    const paths: Paths = [[0, 1, 2], [3, 4], []];
    expect(connectedCount(paths, ROWS3)).toBe(1);
    expect(coveredCount(paths)).toBe(5);
    expect(connectedCount([[0, 1, 2]], ROWS3)).toBe(1);
    expect(coveredCount([])).toBe(0);
  });
});

describe("isSolved", () => {
  const N = 3;

  it("is true when every pair is joined and every cell covered once", () => {
    expect(isSolved([[0, 1, 2], [3, 4, 5], [6, 7, 8]], ROWS3, N)).toBe(true);
    expect(isSolved([[2, 1, 0], [5, 4, 3], [8, 7, 6]], ROWS3, N)).toBe(true);
    expect(isSolved([[0, 3, 6], [1, 4, 7], [2, 5, 8]], COLS3, N)).toBe(true);
    // Order of the endpoint list does not matter.
    expect(isSolved([[0, 1, 2], [3, 4, 5], [6, 7, 8]], [...ROWS3].reverse(), N)).toBe(true);
  });

  it("is false for an empty board, a missing colour, or an unfinished path", () => {
    expect(isSolved(emptyPaths(ROWS3), ROWS3, N)).toBe(false);
    expect(isSolved([[0, 1, 2], [3, 4, 5]], ROWS3, N)).toBe(false);
    expect(isSolved([[0, 1, 2], [3, 4], [6, 7, 8]], ROWS3, N)).toBe(false);
    expect(isSolved([[0, 1, 2], [3, 4, 5], [6]], ROWS3, N)).toBe(false);
  });

  it("is false when a path is invalid or ends on the wrong cell", () => {
    expect(isSolved([[0, 1, 1, 2], [3, 4, 5], [6, 7, 8]], ROWS3, N)).toBe(false);
    expect(isSolved([[0, 2], [3, 4, 5], [6, 7, 8]], ROWS3, N)).toBe(false);
    expect(isSolved([[0, 1, 4], [3, 4, 5], [6, 7, 8]], ROWS3, N)).toBe(false);
    expect(isSolved([[0, 1, 2], [3, 4, 5], [6, 7, 8]], COLS3, N)).toBe(false);
  });

  it("is false when paths overlap or leave cells uncovered", () => {
    expect(isSolved([[0, 3, 6], [1, 0, 3, 4, 7], [2, 5, 8]], COLS3, N)).toBe(false);
    const two: Endpoint[] = [
      { color: 0, a: 0, b: 2 },
      { color: 1, a: 3, b: 4 },
    ];
    expect(isSolved([[0, 1, 2], [3, 4]], two, N)).toBe(false);
    expect(isSolved([[0, 1, 2], [3, 6, 7, 8, 5, 4]], two, N)).toBe(true);
  });

  it("agrees with a full drag sequence on a generated 5×5", () => {
    const p = generatePuzzle(makeRng("play"), 5);
    let paths = emptyPaths(p.endpoints);
    for (const ep of p.endpoints) {
      const target = orderedPath(p, ep.color);
      const start = beginDrag(paths, p.endpoints, target[0]!)!;
      paths = start.paths;
      for (const cell of target.slice(1)) paths = dragTo(paths, p.endpoints, start.color, cell, 5);
      expect(paths[ep.color]).toEqual(target);
    }
    expect(isSolved(paths, p.endpoints, 5)).toBe(true);
  });
});
