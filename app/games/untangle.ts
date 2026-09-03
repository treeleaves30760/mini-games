/* Untangle (Planarity) — framework-free game logic shared by the Vue
   component and the unit tests. Segment intersection, crossing counts, and
   puzzle generation live here; drag state and rendering stay in the
   component.

   Coordinates are unit-square points ({x, y} in [0, 1]); every function is
   scale-invariant, so the component may feed viewBox units instead. */

import type { Rng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Point = { x: number; y: number };

/** An undirected edge as a pair of node indices. */
export type Edge = [number, number];

export interface Puzzle {
  /** Scrambled start positions (on a circle) — guaranteed to have crossings. */
  points: Point[];
  edges: Edge[];
  /** One known crossing-free layout of the same graph. */
  planarPoints: Point[];
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const EPS = 1e-9;

/** Twice the signed area of triangle abc: >0 counter-clockwise, <0 clockwise. */
function orient(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * True when segments ab and cd properly cross. Touching does not count: a
 * shared endpoint, or an endpoint of one segment lying on the other (a
 * T-touch), returns false. Collinear segments count only when they overlap
 * for a positive length.
 */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  const straddle1 = (o1 > EPS && o2 < -EPS) || (o1 < -EPS && o2 > EPS);
  const straddle2 = (o3 > EPS && o4 < -EPS) || (o3 < -EPS && o4 > EPS);
  if (straddle1 && straddle2) return true;

  // Anything short of all four orientations vanishing is a touch or a miss.
  if (Math.abs(o1) > EPS || Math.abs(o2) > EPS || Math.abs(o3) > EPS || Math.abs(o4) > EPS) {
    return false;
  }

  // Collinear: compare the 1-D intervals along the segment's dominant axis.
  const useX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const [a1, b1, c1, d1] = useX ? [a.x, b.x, c.x, d.x] : [a.y, b.y, c.y, d.y];
  const lo = Math.max(Math.min(a1, b1), Math.min(c1, d1));
  const hi = Math.min(Math.max(a1, b1), Math.max(c1, d1));
  return hi - lo > EPS;
}

/** Every pair of edge indices [i, j] (i < j) whose segments cross. */
export function crossingPairs(points: Point[], edges: Edge[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i]!;
    for (let j = i + 1; j < edges.length; j++) {
      const [c, d] = edges[j]!;
      if (segmentsCross(points[a]!, points[b]!, points[c]!, points[d]!)) out.push([i, j]);
    }
  }
  return out;
}

export function countCrossings(points: Point[], edges: Edge[]): number {
  return crossingPairs(points, edges).length;
}

export function isSolved(points: Point[], edges: Edge[]): boolean {
  return countCrossings(points, edges) === 0;
}

// ---------------------------------------------------------------------------
// Generation
//
// The planar layout is built on a jittered grid: `nodeCount` cells of a g×g
// grid are chosen by random growth from one cell, so the chosen cells are
// 4-connected, and each node sits inside its cell with a margin kept clear on
// every side. The growth tree's edges join orthogonally adjacent cells; with
// that clearance no two such edges can cross, and no cell has more than four
// orthogonal neighbours, so the tree is a planar, connected, degree ≤ 4
// skeleton without any retry. Extra edges are then inserted greedily in
// order of length, each checked against everything already placed.
// ---------------------------------------------------------------------------

const MARGIN = 0.08; // distance kept between the planar layout and the border
const INSET = 0.25; // fraction of a cell kept clear on each side
const MAX_DEGREE = 4;
const EDGE_FACTOR = 1.6; // target edge count ≈ EDGE_FACTOR × nodeCount
const SCRAMBLE_RADIUS = 0.44;

export function generatePuzzle(rng: Rng, nodeCount: number): Puzzle {
  const g = Math.ceil(Math.sqrt(nodeCount));
  const total = g * g;

  const neighbours = (cell: number): number[] => {
    const r = Math.floor(cell / g);
    const c = cell % g;
    const out: number[] = [];
    if (r > 0) out.push(cell - g);
    if (r < g - 1) out.push(cell + g);
    if (c > 0) out.push(cell - 1);
    if (c < g - 1) out.push(cell + 1);
    return out;
  };

  // 1. Grow a 4-connected set of cells; record the growth tree as edges.
  const nodeAt: number[] = new Array(total).fill(-1); // cell → node index
  const inFrontier: boolean[] = new Array(total).fill(false);
  const frontier: number[] = [];
  const cells: number[] = []; // node → cell
  const edges: Edge[] = [];
  const deg: number[] = [];

  const addCell = (cell: number): number => {
    const id = cells.length;
    cells.push(cell);
    nodeAt[cell] = id;
    deg.push(0);
    for (const nb of neighbours(cell)) {
      if (nodeAt[nb]! < 0 && !inFrontier[nb]) {
        inFrontier[nb] = true;
        frontier.push(nb);
      }
    }
    return id;
  };

  addCell(rng.int(0, total - 1));
  while (cells.length < nodeCount) {
    const k = rng.int(0, frontier.length - 1);
    const cell = frontier[k]!;
    frontier[k] = frontier[frontier.length - 1]!;
    frontier.pop();
    const parents = neighbours(cell).filter((nb) => nodeAt[nb]! >= 0);
    const parent = nodeAt[rng.pick(parents)]!;
    const id = addCell(cell);
    edges.push([parent, id]);
    deg[parent]!++;
    deg[id]!++;
  }

  // 2. Jitter each node inside its cell.
  const cellSize = (1 - 2 * MARGIN) / g;
  const jitter = (): number => INSET + rng.next() * (1 - 2 * INSET);
  const planarPoints: Point[] = cells.map((cell) => ({
    x: MARGIN + ((cell % g) + jitter()) * cellSize,
    y: MARGIN + (Math.floor(cell / g) + jitter()) * cellSize,
  }));

  // 3. Greedy insertion of further edges, shortest first. Tree edges are
  //    stored [parent, child] with parent < child, so one key per pair suffices.
  const has = new Set(edges.map(([a, b]) => a * nodeCount + b));
  const candidates: Array<{ a: number; b: number; d: number }> = [];
  for (let a = 0; a < nodeCount; a++) {
    for (let b = a + 1; b < nodeCount; b++) {
      if (has.has(a * nodeCount + b)) continue;
      const pa = planarPoints[a]!;
      const pb = planarPoints[b]!;
      candidates.push({ a, b, d: (pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2 });
    }
  }
  candidates.sort((p, q) => p.d - q.d);

  const target = Math.floor(nodeCount * EDGE_FACTOR);
  for (const { a, b } of candidates) {
    if (edges.length >= target) break;
    if (deg[a]! >= MAX_DEGREE || deg[b]! >= MAX_DEGREE) continue;
    const pa = planarPoints[a]!;
    const pb = planarPoints[b]!;
    const blocked = edges.some(([c, d]) =>
      segmentsCross(pa, pb, planarPoints[c]!, planarPoints[d]!),
    );
    if (blocked) continue;
    edges.push([a, b]);
    deg[a]!++;
    deg[b]!++;
  }

  // 4. Scramble: shuffle the nodes around a circle until something crosses.
  const order = cells.map((_, i) => i);
  const points: Point[] = new Array(nodeCount);
  do {
    rng.shuffle(order);
    const phase = rng.next() * Math.PI * 2;
    order.forEach((id, k) => {
      const t = phase + (k / nodeCount) * Math.PI * 2;
      points[id] = {
        x: 0.5 + SCRAMBLE_RADIUS * Math.cos(t),
        y: 0.5 + SCRAMBLE_RADIUS * Math.sin(t),
      };
    });
  } while (countCrossings(points, edges) === 0);

  return { points, edges, planarPoints };
}
