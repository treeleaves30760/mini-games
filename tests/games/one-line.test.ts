import { describe, it, expect } from "vitest";
import {
  LEVELS,
  edgeKey,
  buildEdgeSet,
  computeOddNodes,
  enterNode,
  undoStep,
  isWon,
  isStartNode,
  hasEulerianPath,
  type Edge,
  type Level,
  type NodeCoord,
} from "~/games/one-line";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// edgeKey — canonical order-independent edge identifier
// ---------------------------------------------------------------------------
describe("edgeKey", () => {
  it("returns the same key regardless of argument order", () => {
    expect(edgeKey(0, 3)).toBe(edgeKey(3, 0));
    expect(edgeKey(2, 7)).toBe(edgeKey(7, 2));
  });

  it("produces different keys for different edges", () => {
    expect(edgeKey(0, 1)).not.toBe(edgeKey(0, 2));
    expect(edgeKey(1, 2)).not.toBe(edgeKey(2, 3));
  });

  it("smaller index always goes first in the string", () => {
    expect(edgeKey(5, 1)).toBe("1-5");
    expect(edgeKey(0, 4)).toBe("0-4");
  });
});

// ---------------------------------------------------------------------------
// buildEdgeSet
// ---------------------------------------------------------------------------
describe("buildEdgeSet", () => {
  it("contains the canonical key for each edge", () => {
    const edges: Edge[] = [[0, 1], [1, 2], [2, 0]];
    const set = buildEdgeSet(edges);
    expect(set.has(edgeKey(0, 1))).toBe(true);
    expect(set.has(edgeKey(1, 2))).toBe(true);
    expect(set.has(edgeKey(0, 2))).toBe(true);
    expect(set.size).toBe(3);
  });

  it("is order-independent (reversed edge args map to the same key)", () => {
    const fwd = buildEdgeSet([[0, 3]]);
    const rev = buildEdgeSet([[3, 0]]);
    expect([...fwd][0]).toBe([...rev][0]);
  });
});

// ---------------------------------------------------------------------------
// computeOddNodes
// ---------------------------------------------------------------------------
describe("computeOddNodes", () => {
  it("triangle has 0 odd-degree vertices (all degree 2)", () => {
    // 0-1, 1-2, 2-0: every node has degree 2 (even)
    const edges: Edge[] = [[0, 1], [1, 2], [2, 0]];
    expect(computeOddNodes(3, edges)).toEqual([]);
  });

  it("a simple path has exactly 2 odd-degree vertices (the endpoints)", () => {
    // 0-1, 1-2: node 0 deg 1, node 1 deg 2, node 2 deg 1 → 0 and 2 are odd
    const edges: Edge[] = [[0, 1], [1, 2]];
    const odd = computeOddNodes(3, edges);
    expect(odd).toHaveLength(2);
    expect(odd).toContain(0);
    expect(odd).toContain(2);
  });

  it("a single edge has 2 odd vertices", () => {
    const odd = computeOddNodes(2, [[0, 1]]);
    expect(odd).toHaveLength(2);
    expect(odd).toContain(0);
    expect(odd).toContain(1);
  });

  it("a 4-cycle has 0 odd vertices", () => {
    // 0-1, 1-2, 2-3, 3-0: all degree 2
    const odd = computeOddNodes(4, [[0, 1], [1, 2], [2, 3], [3, 0]]);
    expect(odd).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// hasEulerianPath — the graph invariant every level must satisfy
// ---------------------------------------------------------------------------
describe("hasEulerianPath", () => {
  it("returns true for an empty edge list (vacuously Eulerian)", () => {
    // edges.length === 0 triggers the early-return at line 184.
    // A graph with no edges trivially has an Eulerian path (nothing to draw).
    expect(hasEulerianPath(3, [])).toBe(true);
    expect(hasEulerianPath(0, [])).toBe(true);
  });

  it("a triangle (all even) is Eulerian", () => {
    expect(hasEulerianPath(3, [[0, 1], [1, 2], [2, 0]])).toBe(true);
  });

  it("a simple path (2 odd) is Eulerian", () => {
    expect(hasEulerianPath(3, [[0, 1], [1, 2]])).toBe(true);
  });

  it("a 5-cycle is Eulerian (all even)", () => {
    expect(
      hasEulerianPath(5, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]])
    ).toBe(true);
  });

  it("a graph with 4 odd-degree vertices is NOT Eulerian", () => {
    // Star graph on 4 leaves: centre node (deg 4, even); each leaf (deg 1, odd) → 4 odd nodes
    expect(
      hasEulerianPath(5, [[0, 1], [0, 2], [0, 3], [0, 4]])
    ).toBe(false);
  });

  it("a disconnected graph is NOT Eulerian even with 0 odd nodes", () => {
    // Two disjoint triangles: 0-1-2-0 and 3-4-5-3
    const edges: Edge[] = [
      [0, 1], [1, 2], [2, 0],
      [3, 4], [4, 5], [5, 3],
    ];
    expect(hasEulerianPath(6, edges)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ALL LEVELS satisfy the Eulerian-path invariant
// ---------------------------------------------------------------------------
describe("LEVELS — Eulerian invariant across all puzzle levels", () => {
  it("every level has an Eulerian path (0 or 2 odd-degree vertices, connected)", () => {
    for (const lvl of LEVELS) {
      const result = hasEulerianPath(lvl.nodes.length, lvl.edges);
      expect(result, `Level "${lvl.name}" must have an Eulerian path`).toBe(true);
    }
  });

  it("every level has at least one edge", () => {
    for (const lvl of LEVELS) {
      expect(lvl.edges.length, `Level "${lvl.name}" has no edges`).toBeGreaterThan(0);
    }
  });

  it("levels with 2 odd-degree vertices require starting at one of them", () => {
    for (const lvl of LEVELS) {
      const odd = computeOddNodes(lvl.nodes.length, lvl.edges);
      expect(
        odd.length === 0 || odd.length === 2,
        `Level "${lvl.name}" has ${odd.length} odd nodes — must be 0 or 2`
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// enterNode — traversal / move legality
// ---------------------------------------------------------------------------
describe("enterNode — first move", () => {
  it("accepts any start when there are 0 odd nodes (all-even graph)", () => {
    // Triangle: all even, any start allowed
    const edges: Edge[] = [[0, 1], [1, 2], [2, 0]];
    const edgeSet = buildEdgeSet(edges);
    const oddNodes = computeOddNodes(3, edges); // []
    for (let start = 0; start < 3; start++) {
      const path: number[] = [];
      const used = new Set<string>();
      expect(enterNode(start, path, used, edgeSet, oddNodes)).toBe(true);
      expect(path).toEqual([start]);
    }
  });

  it("restricts first move to odd nodes when there are exactly 2", () => {
    // Simple path 0-1-2: odd nodes are 0 and 2
    const edges: Edge[] = [[0, 1], [1, 2]];
    const edgeSet = buildEdgeSet(edges);
    const oddNodes = computeOddNodes(3, edges); // [0, 2]

    // Illegal start: node 1 (even degree)
    const path1: number[] = [];
    const used1 = new Set<string>();
    expect(enterNode(1, path1, used1, edgeSet, oddNodes)).toBe(false);
    expect(path1).toHaveLength(0);

    // Legal start: node 0
    const path0: number[] = [];
    const used0 = new Set<string>();
    expect(enterNode(0, path0, used0, edgeSet, oddNodes)).toBe(true);
    expect(path0).toEqual([0]);
  });
});

describe("enterNode — advancing along edges", () => {
  it("advances to an adjacent undrawn edge", () => {
    // Triangle: 0-1, 1-2, 2-0
    const edges: Edge[] = [[0, 1], [1, 2], [2, 0]];
    const edgeSet = buildEdgeSet(edges);
    const oddNodes = computeOddNodes(3, edges);
    const path = [0];
    const used = new Set<string>();

    // Move 0 → 1
    expect(enterNode(1, path, used, edgeSet, oddNodes)).toBe(true);
    expect(path).toEqual([0, 1]);
    expect(used.has(edgeKey(0, 1))).toBe(true);
  });

  it("rejects a move to the same node as current head", () => {
    const edges: Edge[] = [[0, 1], [1, 2], [2, 0]];
    const edgeSet = buildEdgeSet(edges);
    const oddNodes = computeOddNodes(3, edges);
    const path = [0];
    const used = new Set<string>();

    expect(enterNode(0, path, used, edgeSet, oddNodes)).toBe(false);
    expect(path).toHaveLength(1);
  });

  it("rejects a move to a non-adjacent node", () => {
    // Square: 0-1, 1-2, 2-3, 3-0 (with diagonal 0-2 absent)
    const edges: Edge[] = [[0, 1], [1, 2], [2, 3], [3, 0]];
    const edgeSet = buildEdgeSet(edges);
    const oddNodes = computeOddNodes(4, edges);
    const path = [0];
    const used = new Set<string>();

    // Node 2 is not adjacent to 0 in this graph
    expect(enterNode(2, path, used, edgeSet, oddNodes)).toBe(false);
  });

  it("rejects traversing an already-used edge", () => {
    const edges: Edge[] = [[0, 1], [1, 2], [2, 0]];
    const edgeSet = buildEdgeSet(edges);
    const oddNodes = computeOddNodes(3, edges);
    const path = [0, 1];
    const used = new Set([edgeKey(0, 1)]);

    // Try going back 1→0 via the already-used 0-1 edge (not undo — would be undo if path[-2]===0)
    // Actually path[-2] is 0, so this IS the undo case; test that instead by testing a different already-used edge.
    // Advance 1→2 (fine), then try 2→0 (fine), then try 0→1 again (already used)
    enterNode(2, path, used, edgeSet, oddNodes); // 1→2
    enterNode(0, path, used, edgeSet, oddNodes); // 2→0
    // path is [0,1,2,0]; used has {0-1, 1-2, 0-2}; try 0→1 again
    const accepted = enterNode(1, path, used, edgeSet, oddNodes);
    expect(accepted).toBe(false);
    expect(path).toHaveLength(4); // unchanged
  });
});

describe("enterNode — undo (backing up)", () => {
  it("popping back to the previous node removes the edge from used", () => {
    const edges: Edge[] = [[0, 1], [1, 2], [2, 0]];
    const edgeSet = buildEdgeSet(edges);
    const oddNodes = computeOddNodes(3, edges);
    const path = [0, 1];
    const used = new Set([edgeKey(0, 1)]);

    // Back to previous: enter node 0 (= path[length-2])
    const result = enterNode(0, path, used, edgeSet, oddNodes);
    expect(result).toBe(true);
    expect(path).toEqual([0]);
    expect(used.has(edgeKey(0, 1))).toBe(false);
  });

  it("backing up when path length is 1 does NOT trigger undo (no previous)", () => {
    // path.length is 1 → path.length >= 2 condition fails → falls through to edge check
    const edges: Edge[] = [[0, 1]];
    const edgeSet = buildEdgeSet(edges);
    const oddNodes = computeOddNodes(2, edges); // [0, 1]
    const path = [0];
    const used = new Set<string>();

    // There is no previous node; entering 0 = head is rejected (n === h)
    expect(enterNode(0, path, used, edgeSet, oddNodes)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isWon
// ---------------------------------------------------------------------------
describe("isWon", () => {
  it("true when every edge is in the used set", () => {
    const edges: Edge[] = [[0, 1], [1, 2], [2, 0]];
    const used = new Set([edgeKey(0, 1), edgeKey(1, 2), edgeKey(0, 2)]);
    expect(isWon(used, edges)).toBe(true);
  });

  it("false when some edges are not yet drawn", () => {
    const edges: Edge[] = [[0, 1], [1, 2], [2, 0]];
    const used = new Set([edgeKey(0, 1)]);
    expect(isWon(used, edges)).toBe(false);
  });

  it("false when used is empty", () => {
    const edges: Edge[] = [[0, 1]];
    expect(isWon(new Set(), edges)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isStartNode
// ---------------------------------------------------------------------------
describe("isStartNode", () => {
  it("true for an odd node before any move when 2 odd nodes exist", () => {
    const oddNodes = [0, 2];
    expect(isStartNode(0, [], oddNodes)).toBe(true);
    expect(isStartNode(2, [], oddNodes)).toBe(true);
  });

  it("false for an even node even before any move", () => {
    const oddNodes = [0, 2];
    expect(isStartNode(1, [], oddNodes)).toBe(false);
  });

  it("false once a move has been made", () => {
    const oddNodes = [0, 2];
    expect(isStartNode(0, [0], oddNodes)).toBe(false);
  });

  it("false when there are 0 odd nodes (all-even graph — any start valid)", () => {
    expect(isStartNode(0, [], [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Full walk simulation — draw the entire graph and confirm win
// ---------------------------------------------------------------------------
describe("full Eulerian walk simulation", () => {
  it("triangle: walk 0→1→2→0 and win", () => {
    const edges: Edge[] = [[0, 1], [1, 2], [2, 0]];
    const edgeSet = buildEdgeSet(edges);
    const oddNodes = computeOddNodes(3, edges); // []

    const path: number[] = [];
    const used = new Set<string>();

    expect(enterNode(0, path, used, edgeSet, oddNodes)).toBe(true);
    expect(enterNode(1, path, used, edgeSet, oddNodes)).toBe(true);
    expect(enterNode(2, path, used, edgeSet, oddNodes)).toBe(true);
    expect(enterNode(0, path, used, edgeSet, oddNodes)).toBe(true);
    expect(isWon(used, edges)).toBe(true);
  });

  it("simple path 0→1→2: must start at 0 or 2, wins after both edges drawn", () => {
    const edges: Edge[] = [[0, 1], [1, 2]];
    const edgeSet = buildEdgeSet(edges);
    const oddNodes = computeOddNodes(3, edges); // [0, 2]

    const path: number[] = [];
    const used = new Set<string>();

    expect(enterNode(0, path, used, edgeSet, oddNodes)).toBe(true); // start at odd node
    expect(enterNode(1, path, used, edgeSet, oddNodes)).toBe(true);
    expect(enterNode(2, path, used, edgeSet, oddNodes)).toBe(true);
    expect(isWon(used, edges)).toBe(true);
  });

  it("house level (LEVELS[4]) can be completed via a valid Eulerian walk", () => {
    // "房子": 5 nodes, 6 edges, 2 odd vertices (must start at one)
    const lvl = LEVELS[4];
    const edgeSet = buildEdgeSet(lvl.edges);
    const oddNodes = computeOddNodes(lvl.nodes.length, lvl.edges);

    // Odd nodes for 房子: edges [[0,1],[1,2],[2,3],[3,0],[3,4],[2,4]]
    // degrees: 0→2, 1→2, 2→3, 3→3, 4→2 → odd nodes are [2,3]
    expect(oddNodes).toContain(2);
    expect(oddNodes).toContain(3);
    expect(oddNodes).toHaveLength(2);

    // Walk: start at node 2 (odd), then find a valid Eulerian path
    // 2→3→0→1→2→4→3 — all 6 edges
    const walk = [2, 3, 0, 1, 2, 4, 3];
    const path: number[] = [];
    const used = new Set<string>();

    for (let i = 0; i < walk.length; i++) {
      const accepted = enterNode(walk[i], path, used, edgeSet, oddNodes);
      expect(accepted, `step ${i}: enter node ${walk[i]}`).toBe(true);
    }
    expect(isWon(used, lvl.edges)).toBe(true);
  });

  it("star-of-David (pentagon) level (LEVELS[1]) can be completed", () => {
    // 五角星: 5 nodes, 5 edges, all even → start anywhere
    const lvl = LEVELS[1]; // 五角星
    const edgeSet = buildEdgeSet(lvl.edges);
    const oddNodes = computeOddNodes(lvl.nodes.length, lvl.edges);
    expect(oddNodes).toHaveLength(0); // all even

    // edges: [0,2],[2,4],[4,1],[1,3],[3,0] → degrees: 0→2,1→2,2→2,3→2,4→2
    // Walk following edge order: 0→2→4→1→3→0
    const walk = [0, 2, 4, 1, 3, 0];
    const path: number[] = [];
    const used = new Set<string>();

    for (let i = 0; i < walk.length; i++) {
      const accepted = enterNode(walk[i], path, used, edgeSet, oddNodes);
      expect(accepted, `step ${i}: enter node ${walk[i]}`).toBe(true);
    }
    expect(isWon(used, lvl.edges)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Undo integration test
// ---------------------------------------------------------------------------
describe("undo mid-walk via enterNode (back-step rule)", () => {
  it("undoing restores the edge to available and updates the path", () => {
    const edges: Edge[] = [[0, 1], [1, 2], [2, 0]];
    const edgeSet = buildEdgeSet(edges);
    const oddNodes = computeOddNodes(3, edges);

    const path: number[] = [];
    const used = new Set<string>();

    // Walk forward: 0→1→2
    enterNode(0, path, used, edgeSet, oddNodes);
    enterNode(1, path, used, edgeSet, oddNodes);
    enterNode(2, path, used, edgeSet, oddNodes);
    expect(path).toEqual([0, 1, 2]);
    expect(used.has(edgeKey(1, 2))).toBe(true);

    // Undo: back-step to 1 (= path[length-2])
    const result = enterNode(1, path, used, edgeSet, oddNodes);
    expect(result).toBe(true);
    expect(path).toEqual([0, 1]);
    expect(used.has(edgeKey(1, 2))).toBe(false); // edge restored

    // Can re-draw the 1→2 edge
    expect(enterNode(2, path, used, edgeSet, oddNodes)).toBe(true);
    expect(used.has(edgeKey(1, 2))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// undoStep — shared undo used by enterNode's back-step and the 復原 button
// ---------------------------------------------------------------------------
describe("undoStep", () => {
  it("returns false and changes nothing on an empty path", () => {
    const path: number[] = [];
    const used = new Set<string>();
    expect(undoStep(path, used)).toBe(false);
    expect(path).toEqual([]);
    expect(used.size).toBe(0);
  });

  it("removes a lone start node without touching used", () => {
    const path = [2];
    const used = new Set<string>();
    expect(undoStep(path, used)).toBe(true);
    expect(path).toEqual([]);
    expect(used.size).toBe(0);
  });

  it("pops the head and un-marks the edge to the new head", () => {
    const path = [0, 1, 2];
    const used = new Set([edgeKey(0, 1), edgeKey(1, 2)]);
    expect(undoStep(path, used)).toBe(true);
    expect(path).toEqual([0, 1]);
    expect(used).toEqual(new Set([edgeKey(0, 1)]));
  });

  it("is exactly what backing up through enterNode does", () => {
    const edges: Edge[] = [[0, 1], [1, 2], [2, 0]];
    const edgeSet = buildEdgeSet(edges);
    const oddNodes = computeOddNodes(3, edges);
    const viaEnter = { path: [0, 1, 2], used: new Set([edgeKey(0, 1), edgeKey(1, 2)]) };
    const viaUndo = { path: [0, 1, 2], used: new Set([edgeKey(0, 1), edgeKey(1, 2)]) };
    expect(enterNode(1, viaEnter.path, viaEnter.used, edgeSet, oddNodes)).toBe(true);
    expect(undoStep(viaUndo.path, viaUndo.used)).toBe(true);
    expect(viaEnter).toEqual(viaUndo);
  });
});

// ---------------------------------------------------------------------------
// Independent solvability verifier
// ---------------------------------------------------------------------------
// The game ships a fixed level list (no RNG, no Daily seed — the component takes
// no props), so "every seed" means "every bundled level". Everything in this
// section re-derives the Euler-path invariants WITHOUT the module's own
// hasEulerianPath / computeOddNodes, produces real strokes with Hierholzer's
// algorithm and an exhaustive backtracking search, and replays those strokes
// through the game's own move + win functions.

/** Hit-test radius used by OneLineGame.vue's nodeAt() (viewBox units). */
const HIT_RADIUS = 9;
/** Node circle radius drawn by the component (viewBox units). */
const NODE_R = 4.6;

/** Canonical edge key, independent of the module's edgeKey. */
function key(a: number, b: number): string {
  return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

function degrees(nodeCount: number, edges: Edge[]): number[] {
  const deg = new Array<number>(nodeCount).fill(0);
  for (const [a, b] of edges) {
    deg[a] += 1;
    deg[b] += 1;
  }
  return deg;
}

function oddVertices(nodeCount: number, edges: Edge[]): number[] {
  return degrees(nodeCount, edges)
    .map((d, i) => (d % 2 ? i : -1))
    .filter((i) => i >= 0);
}

/** Union-find connectivity over every vertex that touches an edge. */
function isConnected(nodeCount: number, edges: Edge[]): boolean {
  const parent = Array.from({ length: nodeCount }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const [a, b] of edges) parent[find(a)] = find(b);
  const roots = new Set<number>();
  for (const [a, b] of edges) {
    roots.add(find(a));
    roots.add(find(b));
  }
  return roots.size === 1;
}

/** Euler-path existence by the classical theorem (independent implementation). */
function eulerPathExists(nodeCount: number, edges: Edge[]): boolean {
  const odd = oddVertices(nodeCount, edges).length;
  return edges.length > 0 && (odd === 0 || odd === 2) && isConnected(nodeCount, edges);
}

/** True iff `trail` is a walk that uses every edge exactly once. */
function isEulerTrail(edges: Edge[], trail: number[]): boolean {
  if (trail.length !== edges.length + 1) return false;
  const remaining = new Map<string, number>();
  for (const [a, b] of edges) remaining.set(key(a, b), (remaining.get(key(a, b)) ?? 0) + 1);
  for (let i = 1; i < trail.length; i++) {
    const k = key(trail[i - 1], trail[i]);
    const left = remaining.get(k) ?? 0;
    if (left === 0) return false;
    remaining.set(k, left - 1);
  }
  return true;
}

/** Edge indices incident to each vertex. */
function incidence(nodeCount: number, edges: Edge[]): number[][] {
  const adj: number[][] = Array.from({ length: nodeCount }, () => []);
  edges.forEach(([a, b], i) => {
    adj[a].push(i);
    adj[b].push(i);
  });
  return adj;
}

/** Hierholzer's algorithm (iterative): an Euler trail starting at `start`. */
function hierholzer(nodeCount: number, edges: Edge[], start: number): number[] {
  const adj = incidence(nodeCount, edges);
  const usedEdge = new Array<boolean>(edges.length).fill(false);
  const stack = [start];
  const trail: number[] = [];
  while (stack.length) {
    const v = stack[stack.length - 1];
    let next = -1;
    while (adj[v].length && next < 0) {
      const ei = adj[v].pop()!;
      if (usedEdge[ei]) continue;
      usedEdge[ei] = true;
      const [a, b] = edges[ei];
      next = a === v ? b : a;
    }
    if (next >= 0) stack.push(next);
    else trail.push(stack.pop()!);
  }
  return trail.reverse();
}

/** Exhaustive backtracking: up to `limit` distinct Euler trails from `start`. */
function enumerateTrails(nodeCount: number, edges: Edge[], start: number, limit: number): number[][] {
  const adj = incidence(nodeCount, edges);
  const usedEdge = new Array<boolean>(edges.length).fill(false);
  const walk = [start];
  const out: number[][] = [];
  const dfs = (v: number, left: number) => {
    if (out.length >= limit) return;
    if (left === 0) {
      out.push([...walk]);
      return;
    }
    for (const ei of adj[v]) {
      if (usedEdge[ei]) continue;
      usedEdge[ei] = true;
      const [a, b] = edges[ei];
      const w = a === v ? b : a;
      walk.push(w);
      dfs(w, left - 1);
      walk.pop();
      usedEdge[ei] = false;
    }
  };
  dfs(start, edges.length);
  return out;
}

/** Vertices from which the exhaustive search finds at least one Euler trail. */
function validStarts(lvl: Level): number[] {
  return lvl.nodes
    .map((_, i) => i)
    .filter((i) => enumerateTrails(lvl.nodes.length, lvl.edges, i, 1).length > 0);
}

/** Replay a vertex sequence through the game's own move/win functions. */
function replay(lvl: Level, stroke: number[]) {
  const edgeSet = buildEdgeSet(lvl.edges);
  const oddNodes = computeOddNodes(lvl.nodes.length, lvl.edges);
  const path: number[] = [];
  const used = new Set<string>();
  const accepted: boolean[] = [];
  const wonAfter: boolean[] = [];
  for (const v of stroke) {
    accepted.push(enterNode(v, path, used, edgeSet, oddNodes));
    wonAfter.push(isWon(used, lvl.edges));
  }
  return { accepted, wonAfter, path, used, edgeSet, oddNodes };
}

// --- geometry (screen ambiguity) ---
function dist(a: NodeCoord, b: NodeCoord): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pointSegmentDistance(p: NodeCoord, a: NodeCoord, b: NodeCoord): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(a[0] + t * vx - p[0], a[1] + t * vy - p[1]);
}

/** True iff segments ab and cd are collinear and share more than a single point. */
function collinearOverlap(a: NodeCoord, b: NodeCoord, c: NodeCoord, d: NodeCoord): boolean {
  const len = dist(a, b);
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  const offLine = (p: NodeCoord) => Math.abs((p[0] - a[0]) * uy - (p[1] - a[1]) * ux);
  if (offLine(c) > 1e-6 || offLine(d) > 1e-6) return false;
  const along = (p: NodeCoord) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;
  const lo = Math.min(along(c), along(d));
  const hi = Math.max(along(c), along(d));
  return Math.min(len, hi) - Math.max(0, lo) > 1e-6;
}

describe("independent verifier — sanity of the verifier itself", () => {
  it("rejects graphs without an Euler path", () => {
    expect(eulerPathExists(5, [[0, 1], [0, 2], [0, 3], [0, 4]])).toBe(false); // four odd vertices
    expect(eulerPathExists(6, [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3]])).toBe(false); // disconnected
    expect(eulerPathExists(3, [])).toBe(false); // nothing to draw
    expect(enumerateTrails(5, [[0, 1], [0, 2], [0, 3], [0, 4]], 1, 5)).toEqual([]);
  });

  it("accepts textbook Euler graphs and validates trails edge-by-edge", () => {
    expect(eulerPathExists(3, [[0, 1], [1, 2], [2, 0]])).toBe(true);
    expect(isEulerTrail([[0, 1], [1, 2]], [0, 1, 2])).toBe(true);
    expect(isEulerTrail([[0, 1], [1, 2]], [0, 1])).toBe(false); // incomplete
    expect(isEulerTrail([[0, 1], [1, 2]], [0, 1, 0])).toBe(false); // repeats an edge
    expect(isEulerTrail([[0, 1], [1, 2]], [0, 2, 1])).toBe(false); // uses a non-edge
    expect(isEulerTrail([[0, 1], [1, 2], [2, 0]], hierholzer(3, [[0, 1], [1, 2], [2, 0]], 1))).toBe(true);
    // Only the two odd vertices of a path graph can start a trail.
    const pathGraph: Level = { name: "p", nodes: [[10, 10], [50, 10], [90, 10]], edges: [[0, 1], [1, 2]] };
    expect(validStarts(pathGraph)).toEqual([0, 2]);
  });

  it("collinear-overlap detector distinguishes overlap from touching", () => {
    expect(collinearOverlap([0, 0], [10, 0], [5, 0], [20, 0])).toBe(true);
    expect(collinearOverlap([0, 0], [10, 0], [10, 0], [20, 0])).toBe(false); // meet at a point
    expect(collinearOverlap([0, 0], [10, 0], [0, 5], [10, 5])).toBe(false); // parallel, not collinear
    expect(pointSegmentDistance([5, 3], [0, 0], [10, 0])).toBeCloseTo(3);
    expect(pointSegmentDistance([-4, 0], [0, 0], [10, 0])).toBeCloseTo(4); // clamps to the endpoint
  });
});

describe("independent verifier — every bundled level", () => {
  it("(a) every level has an Euler path and Hierholzer produces a real one-stroke trail", () => {
    for (const lvl of LEVELS) {
      expect(eulerPathExists(lvl.nodes.length, lvl.edges), lvl.name).toBe(true);
      for (const s of validStarts(lvl)) {
        const trail = hierholzer(lvl.nodes.length, lvl.edges, s);
        expect(trail[0], `${lvl.name} from ${s}`).toBe(s);
        expect(isEulerTrail(lvl.edges, trail), `${lvl.name} from ${s}: ${trail}`).toBe(true);
      }
    }
  });

  it("(b) the game accepts exactly the vertices from which a one-stroke trail exists", () => {
    for (const lvl of LEVELS) {
      const starts = validStarts(lvl);
      expect(starts.length, lvl.name).toBeGreaterThan(0);
      const odd = oddVertices(lvl.nodes.length, lvl.edges);
      // Theorem: two odd vertices → exactly those; none → every vertex.
      expect(starts, lvl.name).toEqual(odd.length === 2 ? odd : lvl.nodes.map((_, i) => i));

      const edgeSet = buildEdgeSet(lvl.edges);
      const oddNodes = computeOddNodes(lvl.nodes.length, lvl.edges);
      const accepted = lvl.nodes
        .map((_, i) => (enterNode(i, [], new Set(), edgeSet, oddNodes) ? i : -1))
        .filter((i) => i >= 0);
      expect(accepted, lvl.name).toEqual(starts);
      // The pulsing "start here" hint marks exactly the odd pair (nothing when any start works).
      const highlighted = lvl.nodes
        .map((_, i) => (isStartNode(i, [], oddNodes) ? i : -1))
        .filter((i) => i >= 0);
      expect(highlighted, lvl.name).toEqual(odd.length === 2 ? odd : []);
    }
  });

  it("(c) replayed strokes win — forward, reversed and alternatives — and no prefix wins early", () => {
    let strokes = 0;
    for (const lvl of LEVELS) {
      const n = lvl.nodes.length;
      const fullKeys = new Set(lvl.edges.map(([a, b]) => edgeKey(a, b)));
      const candidates: number[][] = [];
      for (const s of validStarts(lvl)) {
        const h = hierholzer(n, lvl.edges, s);
        candidates.push(h, [...h].reverse(), ...enumerateTrails(n, lvl.edges, s, 25));
      }
      for (const stroke of candidates) {
        expect(isEulerTrail(lvl.edges, stroke), `${lvl.name}: ${stroke}`).toBe(true);
        const r = replay(lvl, stroke);
        expect(r.accepted.every(Boolean), `${lvl.name}: ${stroke}`).toBe(true);
        // Not won after any proper prefix, won exactly after the last node.
        expect(r.wonAfter.slice(0, -1).some(Boolean), `${lvl.name}: early win in ${stroke}`).toBe(false);
        expect(r.wonAfter[r.wonAfter.length - 1], `${lvl.name}: ${stroke}`).toBe(true);
        expect(r.used, lvl.name).toEqual(fullKeys);
        expect(r.path, lvl.name).toEqual(stroke);
        // After the win no forward move is possible (every edge is drawn) …
        const prev = stroke[stroke.length - 2];
        for (let v = 0; v < n; v++) {
          if (v === prev) continue;
          expect(enterNode(v, r.path, r.used, r.edgeSet, r.oddNodes), `${lvl.name}: move after win`).toBe(false);
        }
        // … but backing up still works and clears the win.
        expect(enterNode(prev, r.path, r.used, r.edgeSet, r.oddNodes)).toBe(true);
        expect(isWon(r.used, lvl.edges)).toBe(false);
        strokes++;
      }
    }
    // Every level contributes at least a forward + reversed + one alternative stroke.
    expect(strokes).toBeGreaterThanOrEqual(LEVELS.length * 3);
  });

  it("(d) geometry: no self-loops, duplicate edges, stacked nodes, or edges passing through/near other nodes", () => {
    expect(new Set(LEVELS.map((l) => l.name)).size).toBe(LEVELS.length);
    for (const lvl of LEVELS) {
      const { nodes, edges, name } = lvl;
      for (const [x, y] of nodes) {
        expect(x, name).toBeGreaterThanOrEqual(NODE_R);
        expect(x, name).toBeLessThanOrEqual(100 - NODE_R);
        expect(y, name).toBeGreaterThanOrEqual(NODE_R);
        expect(y, name).toBeLessThanOrEqual(100 - NODE_R);
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          // Two nodes closer than twice the hit radius would share a tap/drag target.
          expect(dist(nodes[i], nodes[j]), `${name}: nodes ${i},${j}`).toBeGreaterThanOrEqual(2 * HIT_RADIUS);
        }
      }
      for (const [a, b] of edges) {
        expect(Number.isInteger(a) && a >= 0 && a < nodes.length, `${name}: edge index ${a}`).toBe(true);
        expect(Number.isInteger(b) && b >= 0 && b < nodes.length, `${name}: edge index ${b}`).toBe(true);
        expect(a, `${name}: self-loop`).not.toBe(b);
      }
      expect(new Set(edges.map(([a, b]) => key(a, b))).size, `${name}: duplicate edge`).toBe(edges.length);
      // The module's own edge set must agree, otherwise isWon could never fire.
      expect(buildEdgeSet(edges).size, name).toBe(edges.length);
      edges.forEach(([a, b], ei) => {
        nodes.forEach((p, v) => {
          if (v === a || v === b) return;
          // A drag along a–b must never wander into a third node's hit disc.
          expect(
            pointSegmentDistance(p, nodes[a], nodes[b]),
            `${name}: edge ${a}-${b} passes node ${v}`
          ).toBeGreaterThanOrEqual(HIT_RADIUS);
        });
        for (let ej = ei + 1; ej < edges.length; ej++) {
          const [c, d] = edges[ej];
          expect(
            collinearOverlap(nodes[a], nodes[b], nodes[c], nodes[d]),
            `${name}: edges ${a}-${b} and ${c}-${d} overlap`
          ).toBe(false);
        }
      });
    }
  });

  it("(e) no degenerate level: at least a triangle's worth of nodes and edges, no isolated node", () => {
    for (const lvl of LEVELS) {
      expect(lvl.nodes.length, lvl.name).toBeGreaterThanOrEqual(3);
      expect(lvl.edges.length, lvl.name).toBeGreaterThanOrEqual(3);
      degrees(lvl.nodes.length, lvl.edges).forEach((d, i) => {
        expect(d, `${lvl.name}: node ${i} has no edge`).toBeGreaterThan(0);
      });
    }
  });

  it("random taps (300 seeds × every level) keep the state a consistent trail; win fires iff every edge is drawn", () => {
    const failures: string[] = [];
    const check = (ok: boolean, msg: string) => {
      if (!ok && failures.length < 20) failures.push(msg);
    };
    let wins = 0;
    for (let seed = 0; seed < 300; seed++) {
      const rng = makeRng(`one-line-fuzz-${seed}`);
      for (const lvl of LEVELS) {
        const n = lvl.nodes.length;
        const edgeSet = buildEdgeSet(lvl.edges);
        const oddNodes = computeOddNodes(n, lvl.edges);
        const odd = oddVertices(n, lvl.edges);
        const path: number[] = [];
        const used = new Set<string>();
        for (let step = 0; step < 40; step++) {
          const target = rng.int(0, n - 1);
          const tag = `${lvl.name} seed ${seed} step ${step} tap ${target}`;
          // Reference ruling from the snapshot BEFORE the move.
          const head = path.length ? path[path.length - 1] : -1;
          const prev = path.length >= 2 ? path[path.length - 2] : -1;
          let expected: boolean;
          if (path.length === 0) expected = odd.length !== 2 || odd.includes(target);
          else if (target === head) expected = false;
          else if (target === prev) expected = true;
          else expected = edgeSet.has(edgeKey(head, target)) && !used.has(edgeKey(head, target));
          const before = path.join(",");
          const got = enterNode(target, path, used, edgeSet, oddNodes);
          check(got === expected, `${tag}: expected ${expected} got ${got}`);
          if (!got) check(path.join(",") === before, `${tag}: rejected move changed the path`);
          // Invariants: the path is a trail over real edges and `used` mirrors it exactly.
          const walked = new Set<string>();
          for (let i = 1; i < path.length; i++) {
            const k = edgeKey(path[i - 1], path[i]);
            check(edgeSet.has(k), `${tag}: non-edge ${k} in path`);
            check(!walked.has(k), `${tag}: edge ${k} repeated in path`);
            walked.add(k);
          }
          check(used.size === walked.size && [...walked].every((k) => used.has(k)), `${tag}: used ≠ path edges`);
          if (path.length && odd.length === 2) check(odd.includes(path[0]), `${tag}: illegal start ${path[0]}`);
          const won = isWon(used, lvl.edges);
          check(won === (path.length === lvl.edges.length + 1), `${tag}: win flag out of sync`);
          if (won) wins++;
        }
      }
    }
    expect(failures).toEqual([]);
    expect(wins).toBeGreaterThan(0);
  });
});
