import { describe, it, expect } from "vitest";
import {
  LEVELS,
  edgeKey,
  buildEdgeSet,
  computeOddNodes,
  enterNode,
  isWon,
  isStartNode,
  hasEulerianPath,
  type Edge,
} from "~/games/one-line";

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
