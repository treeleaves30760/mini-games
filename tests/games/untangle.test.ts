import { describe, it, expect } from "vitest";
import {
  segmentsCross,
  crossingPairs,
  countCrossings,
  isSolved,
  generatePuzzle,
} from "~/games/untangle";
import type { Point, Edge } from "~/games/untangle";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Independent reference — parametric line intersection
//
// Written from the rules without the module's orientation helper: solve
// p + t·r = q + u·s for (t, u) and demand both strictly inside (0, 1). The
// parallel case projects both segments onto the first one's direction and
// checks for a positive-length overlap.
// ---------------------------------------------------------------------------

const REF_EPS = 1e-9;

function refCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const qpx = c.x - a.x;
  const qpy = c.y - a.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) > REF_EPS) {
    const t = (qpx * sy - qpy * sx) / denom;
    const u = (qpx * ry - qpy * rx) / denom;
    return t > REF_EPS && t < 1 - REF_EPS && u > REF_EPS && u < 1 - REF_EPS;
  }
  // Parallel. Not collinear → never meet.
  if (Math.abs(qpx * ry - qpy * rx) > REF_EPS) return false;
  const rr = rx * rx + ry * ry;
  const t0 = (qpx * rx + qpy * ry) / rr;
  const t1 = t0 + (sx * rx + sy * ry) / rr;
  const lo = Math.max(0, Math.min(t0, t1));
  const hi = Math.min(1, Math.max(t0, t1));
  return hi - lo > REF_EPS;
}

/** O(E²) crossing count from the reference predicate. */
function refCrossings(points: Point[], edges: Edge[]): number {
  let n = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b] = edges[i]!;
      const [c, d] = edges[j]!;
      if (refCross(points[a]!, points[b]!, points[c]!, points[d]!)) n++;
    }
  }
  return n;
}

/** BFS connectivity over an undirected edge list. */
function isConnected(n: number, edges: Edge[]): boolean {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    adj[a]!.push(b);
    adj[b]!.push(a);
  }
  const seen = new Array<boolean>(n).fill(false);
  const queue = [0];
  seen[0] = true;
  while (queue.length) {
    const v = queue.shift()!;
    for (const w of adj[v]!) {
      if (!seen[w]) {
        seen[w] = true;
        queue.push(w);
      }
    }
  }
  return seen.every(Boolean);
}

function degrees(n: number, edges: Edge[]): number[] {
  const deg = new Array<number>(n).fill(0);
  for (const [a, b] of edges) {
    deg[a]!++;
    deg[b]!++;
  }
  return deg;
}

const P = (x: number, y: number): Point => ({ x, y });

/** The sizes the component offers (簡單 8, 普通 12, 困難 18; the Daily uses 12). */
const UI_SIZES = [8, 12, 18];
const SEEDS: Array<string | number> = [];
for (let i = 1; i <= 100; i++) SEEDS.push(i);
SEEDS.push("2026-09-04", "2026-12-31", "untangle", "解結");

// ---------------------------------------------------------------------------
// segmentsCross
// ---------------------------------------------------------------------------

describe("segmentsCross", () => {
  it("detects a proper X crossing (both argument orders)", () => {
    expect(segmentsCross(P(0, 0), P(1, 1), P(0, 1), P(1, 0))).toBe(true);
    expect(segmentsCross(P(0, 1), P(1, 0), P(0, 0), P(1, 1))).toBe(true);
    expect(segmentsCross(P(1, 1), P(0, 0), P(1, 0), P(0, 1))).toBe(true);
  });

  it("returns false for parallel, disjoint segments", () => {
    expect(segmentsCross(P(0, 0), P(1, 0), P(0, 1), P(1, 1))).toBe(false);
    expect(segmentsCross(P(0, 0), P(0, 1), P(1, 0), P(1, 1))).toBe(false);
  });

  it("returns false for far-apart, non-parallel segments", () => {
    expect(segmentsCross(P(0, 0), P(1, 0), P(2, 1), P(3, -1))).toBe(false);
    expect(segmentsCross(P(0, 0), P(0.4, 0.4), P(0.6, 0.4), P(1, 0))).toBe(false);
  });

  it("does not count segments that share an endpoint", () => {
    expect(segmentsCross(P(0, 0), P(1, 1), P(0, 0), P(1, 0))).toBe(false);
    expect(segmentsCross(P(0, 0), P(1, 1), P(1, 1), P(2, 0))).toBe(false);
    expect(segmentsCross(P(0, 0), P(1, 1), P(1, 0), P(0, 0))).toBe(false);
  });

  it("does not count a T-touch (an endpoint resting on the other segment)", () => {
    // c lies on ab
    expect(segmentsCross(P(0, 0), P(2, 0), P(1, 0), P(1, 1))).toBe(false);
    // a lies on cd
    expect(segmentsCross(P(1, 0), P(1, 1), P(0, 0), P(2, 0))).toBe(false);
    // d lies on ab
    expect(segmentsCross(P(0, 0), P(2, 0), P(1, 1), P(1, 0))).toBe(false);
  });

  it("counts collinear segments that overlap for a positive length", () => {
    // horizontal (x-dominant)
    expect(segmentsCross(P(0, 0), P(2, 0), P(1, 0), P(3, 0))).toBe(true);
    // one inside the other
    expect(segmentsCross(P(0, 0), P(3, 0), P(1, 0), P(2, 0))).toBe(true);
    // vertical (y-dominant)
    expect(segmentsCross(P(0, 0), P(0, 2), P(0, 1), P(0, 3))).toBe(true);
    expect(segmentsCross(P(0, 3), P(0, 1), P(0, 0), P(0, 2))).toBe(true);
    // diagonal, sharing an endpoint but overlapping
    expect(segmentsCross(P(0, 0), P(2, 2), P(0, 0), P(1, 1))).toBe(true);
  });

  it("does not count collinear segments that only touch end to end, or are apart", () => {
    expect(segmentsCross(P(0, 0), P(1, 0), P(1, 0), P(2, 0))).toBe(false);
    expect(segmentsCross(P(0, 0), P(1, 0), P(2, 0), P(3, 0))).toBe(false);
    expect(segmentsCross(P(0, 0), P(0, 1), P(0, 1), P(0, 2))).toBe(false);
    expect(segmentsCross(P(0, 0), P(0, 1), P(0, 2), P(0, 3))).toBe(false);
  });

  it("treats a degenerate point-segment as not crossing", () => {
    expect(segmentsCross(P(0, 0), P(2, 0), P(1, 0), P(1, 0))).toBe(false);
    expect(segmentsCross(P(1, 0), P(1, 0), P(0, 0), P(2, 0))).toBe(false);
  });

  it("agrees with the parametric reference on 20 000 random segment pairs", () => {
    const rng = makeRng("segments");
    let crossed = 0;
    for (let i = 0; i < 20000; i++) {
      const pts = Array.from({ length: 4 }, () => P(rng.next(), rng.next()));
      const [a, b, c, d] = pts as [Point, Point, Point, Point];
      const expected = refCross(a, b, c, d);
      expect(segmentsCross(a, b, c, d)).toBe(expected);
      expect(segmentsCross(c, d, a, b)).toBe(expected);
      if (expected) crossed++;
    }
    // Random segment pairs in the unit square cross about a quarter of the time.
    expect(crossed).toBeGreaterThan(3000);
  });

  it("agrees with the reference on lattice segments, where touches and overlaps are common", () => {
    const rng = makeRng("lattice");
    let overlaps = 0;
    for (let i = 0; i < 20000; i++) {
      const pts = Array.from({ length: 4 }, () => P(rng.int(0, 3), rng.int(0, 3)));
      const [a, b, c, d] = pts as [Point, Point, Point, Point];
      const expected = refCross(a, b, c, d);
      expect(segmentsCross(a, b, c, d), JSON.stringify(pts)).toBe(expected);
      if (expected && orientZero(a, b, c) && orientZero(a, b, d)) overlaps++;
    }
    expect(overlaps).toBeGreaterThan(0);
  });
});

function orientZero(a: Point, b: Point, c: Point): boolean {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) === 0;
}

// ---------------------------------------------------------------------------
// crossingPairs / countCrossings / isSolved
// ---------------------------------------------------------------------------

describe("crossingPairs, countCrossings, isSolved", () => {
  const square: Point[] = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
  const ring: Edge[] = [[0, 1], [1, 2], [2, 3], [3, 0]];
  const withDiagonals: Edge[] = [...ring, [0, 2], [1, 3]];

  it("finds the two diagonals of a square and nothing else", () => {
    expect(crossingPairs(square, withDiagonals)).toEqual([[4, 5]]);
    expect(countCrossings(square, withDiagonals)).toBe(1);
    expect(isSolved(square, withDiagonals)).toBe(false);
  });

  it("reports the ring alone as solved", () => {
    expect(crossingPairs(square, ring)).toEqual([]);
    expect(countCrossings(square, ring)).toBe(0);
    expect(isSolved(square, ring)).toBe(true);
  });

  it("handles an empty edge list", () => {
    expect(countCrossings(square, [])).toBe(0);
    expect(isSolved(square, [])).toBe(true);
  });

  it("returns pairs as ascending edge indices with i < j", () => {
    // Pentagram: every pair of non-adjacent chords crosses → 5 crossings.
    const star: Point[] = Array.from({ length: 5 }, (_, k) =>
      P(Math.cos((k * 2 * Math.PI) / 5), Math.sin((k * 2 * Math.PI) / 5)),
    );
    const chords: Edge[] = [[0, 2], [2, 4], [4, 1], [1, 3], [3, 0]];
    const pairs = crossingPairs(star, chords);
    expect(pairs.length).toBe(5);
    for (const [i, j] of pairs) expect(i).toBeLessThan(j);
    expect(countCrossings(star, chords)).toBe(refCrossings(star, chords));
  });

  it("matches the reference count on random graphs", () => {
    const rng = makeRng("count");
    for (let round = 0; round < 50; round++) {
      const n = rng.int(4, 12);
      const pts = Array.from({ length: n }, () => P(rng.next(), rng.next()));
      const edges: Edge[] = [];
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) if (rng.bool(0.35)) edges.push([a, b]);
      }
      expect(countCrossings(pts, edges)).toBe(refCrossings(pts, edges));
      expect(isSolved(pts, edges)).toBe(refCrossings(pts, edges) === 0);
    }
  });
});

// ---------------------------------------------------------------------------
// generatePuzzle
// ---------------------------------------------------------------------------

describe("generatePuzzle — structure over many seeds", () => {
  it("every UI size × seed: planar layout is crossing-free, scramble is not, graph is connected with degree ≤ 4", () => {
    let audited = 0;
    let hitTarget = 0;
    for (const n of UI_SIZES) {
      for (const seed of SEEDS) {
        const label = `n=${n} seed=${JSON.stringify(seed)}`;
        const { points, edges, planarPoints } = generatePuzzle(makeRng(seed), n);

        expect(points.length, label).toBe(n);
        expect(planarPoints.length, label).toBe(n);

        // Independent crossing checker.
        expect(refCrossings(planarPoints, edges), `${label} planar layout crosses`).toBe(0);
        expect(refCrossings(points, edges), `${label} scramble already solved`).toBeGreaterThan(0);
        // ...and the module agrees with it.
        expect(isSolved(planarPoints, edges), label).toBe(true);
        expect(isSolved(points, edges), label).toBe(false);
        expect(countCrossings(points, edges), label).toBe(refCrossings(points, edges));

        // Graph shape.
        expect(isConnected(n, edges), `${label} disconnected`).toBe(true);
        for (const d of degrees(n, edges)) expect(d, `${label} degree`).toBeLessThanOrEqual(4);
        expect(edges.length, label).toBeGreaterThanOrEqual(n - 1);
        expect(edges.length, label).toBeLessThanOrEqual(Math.floor(n * 1.6));
        if (edges.length === Math.floor(n * 1.6)) hitTarget++;

        const keys = new Set<string>();
        for (const [a, b] of edges) {
          expect(a, label).not.toBe(b);
          expect(a >= 0 && a < n && b >= 0 && b < n, `${label} edge out of range`).toBe(true);
          const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
          expect(keys.has(key), `${label} duplicate edge ${key}`).toBe(false);
          keys.add(key);
        }

        // Coordinates stay inside the board with a margin, on both layouts.
        for (const p of [...points, ...planarPoints]) {
          expect(p.x, label).toBeGreaterThanOrEqual(0.05);
          expect(p.x, label).toBeLessThanOrEqual(0.95);
          expect(p.y, label).toBeGreaterThanOrEqual(0.05);
          expect(p.y, label).toBeLessThanOrEqual(0.95);
        }
        audited++;
      }
    }
    expect(audited).toBe(UI_SIZES.length * SEEDS.length);
    // Most puzzles fill up to the edge budget; some stop short when the
    // degree cap or the crossing check runs out of room.
    expect(hitTarget).toBeGreaterThan(0);
  });

  it("planar layout keeps nodes apart, so they can be told apart on screen", () => {
    for (const n of UI_SIZES) {
      for (const seed of SEEDS.slice(0, 30)) {
        const { planarPoints, points } = generatePuzzle(makeRng(seed), n);
        const g = Math.ceil(Math.sqrt(n));
        const cell = (1 - 0.16) / g;
        const minGap = 0.5 * cell; // twice the 25% inset
        for (let a = 0; a < n; a++) {
          for (let b = a + 1; b < n; b++) {
            const pa = planarPoints[a]!;
            const pb = planarPoints[b]!;
            const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
            expect(dist, `n=${n} seed=${seed} nodes ${a},${b}`).toBeGreaterThanOrEqual(minGap - 1e-12);
          }
        }
        // Scrambled nodes sit on one circle.
        for (const p of points) {
          expect(Math.hypot(p.x - 0.5, p.y - 0.5)).toBeCloseTo(0.44, 9);
        }
      }
    }
  });

  it("also works for other sizes, including full-grid squares and the smallest useful graph", () => {
    for (const n of [4, 5, 9, 16, 25]) {
      for (let seed = 1; seed <= 20; seed++) {
        const { points, edges, planarPoints } = generatePuzzle(makeRng(seed), n);
        expect(refCrossings(planarPoints, edges), `n=${n} seed=${seed}`).toBe(0);
        expect(refCrossings(points, edges), `n=${n} seed=${seed}`).toBeGreaterThan(0);
        expect(isConnected(n, edges)).toBe(true);
        for (const d of degrees(n, edges)) expect(d).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe("generatePuzzle — determinism", () => {
  it("same seed → identical puzzle", () => {
    for (const n of UI_SIZES) {
      const a = generatePuzzle(makeRng("same"), n);
      const b = generatePuzzle(makeRng("same"), n);
      expect(a).toEqual(b);
    }
  });

  it("daily date seeds are reproducible and consecutive days differ", () => {
    const a = generatePuzzle(makeRng("2026-09-04"), 12);
    const b = generatePuzzle(makeRng("2026-09-04"), 12);
    const c = generatePuzzle(makeRng("2026-09-05"), 12);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("different seeds give different puzzles", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      seen.add(JSON.stringify(generatePuzzle(makeRng(seed), 12)));
    }
    expect(seen.size).toBe(20);
  });

  it("unseeded generation still yields a valid puzzle", () => {
    for (let i = 0; i < 10; i++) {
      const { points, edges, planarPoints } = generatePuzzle(makeRng(null), 12);
      expect(refCrossings(planarPoints, edges)).toBe(0);
      expect(refCrossings(points, edges)).toBeGreaterThan(0);
      expect(isConnected(12, edges)).toBe(true);
    }
  });
});

describe("generatePuzzle — solving", () => {
  it("moving every node to its planar position solves the puzzle, one node at a time", () => {
    const n = 12;
    const { points, edges, planarPoints } = generatePuzzle(makeRng("solve"), n);
    const current = points.map((p) => ({ ...p }));
    expect(isSolved(current, edges)).toBe(false);
    for (let i = 0; i < n; i++) current[i] = { ...planarPoints[i]! };
    expect(isSolved(current, edges)).toBe(true);
    expect(crossingPairs(current, edges)).toEqual([]);
  });
});
