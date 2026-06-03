/* 一筆畫 One Line — framework-free game logic.
   Eulerian-path puzzle: trace every edge exactly once.
   Exported functions are pure and deterministic; no Vue/DOM/localStorage here. */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** [x, y] coordinate in SVG viewBox space (0–100). */
export type NodeCoord = [number, number];

/** Edge as a pair of node indices [a, b]. */
export type Edge = [number, number];

/** One puzzle level. */
export interface Level {
  name: string;
  nodes: NodeCoord[];
  edges: Edge[];
}

// ---------------------------------------------------------------------------
// Static level data
// ---------------------------------------------------------------------------

export const LEVELS: Level[] = [
  { name: "三角形", nodes: [[50, 15], [85, 80], [15, 80]], edges: [[0, 1], [1, 2], [2, 0]] },
  {
    name: "五角星",
    nodes: [[50, 14], [86.1, 40.3], [72.3, 82.7], [27.7, 82.7], [13.9, 40.3]],
    edges: [[0, 2], [2, 4], [4, 1], [1, 3], [3, 0]],
  },
  {
    name: "對角方塊",
    nodes: [[22, 22], [78, 22], [78, 78], [22, 78]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]],
  },
  {
    name: "蝴蝶結",
    nodes: [[15, 25], [15, 75], [50, 50], [85, 25], [85, 75]],
    edges: [[0, 2], [1, 2], [0, 1], [3, 2], [4, 2], [3, 4]],
  },
  {
    name: "房子",
    nodes: [[20, 82], [80, 82], [80, 45], [20, 45], [50, 16]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [2, 4]],
  },
  {
    name: "六邊形＋對角",
    nodes: [[50, 14], [81.2, 32], [81.2, 68], [50, 86], [18.8, 68], [18.8, 32]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 3]],
  },
  {
    name: "雙斜屋",
    nodes: [[20, 82], [80, 82], [80, 45], [20, 45], [50, 16]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [2, 4], [3, 1]],
  },
  {
    name: "信封",
    nodes: [[20, 40], [80, 40], [80, 82], [20, 82], [50, 15]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [3, 1]],
  },
];

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Canonical edge key — order-independent so key(a,b) === key(b,a).
 * Used as the identifier in the `used` set.
 */
export function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Build the set of all valid edge keys for a level's edge list.
 * A key is present iff the edge exists in the graph.
 */
export function buildEdgeSet(edges: Edge[]): Set<string> {
  return new Set(edges.map(([a, b]) => edgeKey(a, b)));
}

/**
 * Compute the list of odd-degree vertex indices for a graph.
 * A vertex is "odd" iff its degree (number of incident edges) is odd.
 * An Eulerian path exists iff there are 0 or exactly 2 odd vertices.
 */
export function computeOddNodes(nodeCount: number, edges: Edge[]): number[] {
  const deg = new Array(nodeCount).fill(0);
  for (const [a, b] of edges) {
    deg[a]++;
    deg[b]++;
  }
  return deg.map((d, i) => (d % 2 ? i : -1)).filter((i) => i >= 0);
}

// ---------------------------------------------------------------------------
// Traversal logic
// ---------------------------------------------------------------------------

/**
 * Attempt to "enter" node `n` given the current traversal state.
 *
 * Rules (matching the component's `enter` function exactly):
 *  - First step: push `n` onto `path`.
 *    - If there are exactly 2 odd vertices the first vertex MUST be one of them.
 *  - Same node as current head: no-op (return false).
 *  - Backing up to the previous node: pop head, unmark that edge (undo step).
 *  - Advance along an undrawn adjacent edge: mark edge used, push `n`.
 *
 * The function mutates `path` and `used` in-place (matching the reactive
 * objects in the component) and returns whether the move was accepted.
 */
export function enterNode(
  n: number,
  path: number[],
  used: Set<string>,
  edgeSet: Set<string>,
  oddNodes: number[],
): boolean {
  // First node placement
  if (path.length === 0) {
    if (oddNodes.length === 2 && !oddNodes.includes(n)) return false;
    path.push(n);
    return true;
  }

  const h = path[path.length - 1];

  // Same node as head — nothing to do
  if (n === h) return false;

  // Undo: step back to the previous node.
  // We pop the current head FIRST, then the new head (= n) is at path[length-1].
  // The edge to un-mark is between `removed` (old head) and `n` (new head after pop).
  if (path.length >= 2 && n === path[path.length - 2]) {
    const removed = path.pop()!;
    used.delete(edgeKey(removed, n));
    return true;
  }

  // Advance along an undrawn edge
  const ek = edgeKey(h, n);
  if (edgeSet.has(ek) && !used.has(ek)) {
    used.add(ek);
    path.push(n);
    return true;
  }

  return false;
}

/**
 * Win condition: every edge has been drawn (used.size equals edges.length).
 */
export function isWon(used: Set<string>, edges: Edge[]): boolean {
  return used.size === edges.length;
}

/**
 * Whether node `i` should be highlighted as a legal start point.
 * True when no move has been made yet AND exactly two odd-degree vertices exist
 * AND `i` is one of them.
 */
export function isStartNode(i: number, path: number[], oddNodes: number[]): boolean {
  return path.length === 0 && oddNodes.length === 2 && oddNodes.includes(i);
}

// ---------------------------------------------------------------------------
// Graph-theory invariant (used by tests; also useful for level validation)
// ---------------------------------------------------------------------------

/**
 * Returns true iff the graph described by `nodes`/`edges` has an Eulerian path:
 *  1. Every vertex with at least one edge is reachable from every other such
 *     vertex (the graph is connected over the "active" vertex set).
 *  2. The number of odd-degree vertices is exactly 0 or exactly 2.
 *
 * This is the classical Eulerian-path theorem (Euler 1736).
 */
export function hasEulerianPath(nodeCount: number, edges: Edge[]): boolean {
  if (edges.length === 0) return true; // vacuously true — nothing to draw

  const oddNodes = computeOddNodes(nodeCount, edges);
  if (oddNodes.length !== 0 && oddNodes.length !== 2) return false;

  // Build adjacency list over vertices that appear in at least one edge.
  const adj: number[][] = Array.from({ length: nodeCount }, () => []);
  const active = new Set<number>();
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
    active.add(a);
    active.add(b);
  }

  // BFS/DFS connectivity check over active vertices.
  const start = active.values().next().value as number;
  const visited = new Set<number>();
  const queue = [start];
  visited.add(start);
  while (queue.length) {
    const v = queue.pop()!;
    for (const w of adj[v]) {
      if (!visited.has(w)) {
        visited.add(w);
        queue.push(w);
      }
    }
  }

  for (const v of active) {
    if (!visited.has(v)) return false;
  }
  return true;
}
