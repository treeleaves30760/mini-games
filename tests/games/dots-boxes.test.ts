import { describe, it, expect } from "vitest";
import { makeRng } from "~/utils/rng";
import {
  hIdx,
  vIdx,
  hEdgeCount,
  totalEdges,
  totalBoxes,
  edgesOfBox,
  countDrawn,
  adjacentBoxes,
  applyMove,
  isGameOver,
  scoreOf,
  winner,
  aiMove,
} from "~/games/dots-boxes";

// ── Small 2×2 grid (2 box-rows, 2 box-cols) ──────────────────────────────────
//
//  Grid layout (dots labelled by row,col):
//
//    (0,0)--h(0,0)--(0,1)--h(0,1)--(0,2)
//      |                              |
//    v(0,0)  box0    v(0,1)  box1   v(0,2)
//      |                              |
//    (1,0)--h(1,0)--(1,1)--h(1,1)--(1,2)
//      |                              |
//    v(1,0)  box2    v(1,1)  box3   v(1,2)
//      |                              |
//    (2,0)--h(2,0)--(2,1)--h(2,1)--(2,2)
//
//  H-edges (rows=2, cols=2): hTotal = (2+1)*2 = 6
//    h(0,0)=0  h(0,1)=1
//    h(1,0)=2  h(1,1)=3
//    h(2,0)=4  h(2,1)=5
//
//  V-edges: offset 6, stride = cols+1 = 3
//    v(0,0)=6  v(0,1)=7  v(0,2)=8
//    v(1,0)=9  v(1,1)=10 v(1,2)=11
//
//  Box indices (row-major): box0=0, box1=1, box2=2, box3=3
//    box0 edges: top=h(0,0)=0, bottom=h(1,0)=2, left=v(0,0)=6, right=v(0,1)=7
//    box1 edges: top=h(0,1)=1, bottom=h(1,1)=3, left=v(0,1)=7, right=v(0,2)=8
//    box2 edges: top=h(1,0)=2, bottom=h(2,0)=4, left=v(1,0)=9, right=v(1,1)=10
//    box3 edges: top=h(1,1)=3, bottom=h(2,1)=5, left=v(1,1)=10, right=v(1,2)=11

const R = 2;  // rows
const C = 2;  // cols

// Convenience wrappers for the 2×2 grid
const h = (r: number, c: number) => hIdx(r, c, C);
const v = (r: number, c: number) => vIdx(r, c, R, C);

// box0 = top-left, box1 = top-right, box2 = bottom-left, box3 = bottom-right
const BOX0_EDGES = [h(0,0), h(1,0), v(0,0), v(0,1)] as const;
const BOX1_EDGES = [h(0,1), h(1,1), v(0,1), v(0,2)] as const;
const BOX2_EDGES = [h(1,0), h(2,0), v(1,0), v(1,1)] as const;
const BOX3_EDGES = [h(1,1), h(2,1), v(1,1), v(1,2)] as const;

// ── Index helpers ─────────────────────────────────────────────────────────────

describe("hIdx / vIdx", () => {
  it("hIdx encodes horizontal edges correctly", () => {
    expect(h(0, 0)).toBe(0);
    expect(h(0, 1)).toBe(1);
    expect(h(1, 0)).toBe(2);
    expect(h(1, 1)).toBe(3);
    expect(h(2, 0)).toBe(4);
    expect(h(2, 1)).toBe(5);
  });

  it("vIdx starts after hTotal and encodes correctly", () => {
    const offset = hEdgeCount(R, C); // 6
    expect(v(0, 0)).toBe(offset + 0);
    expect(v(0, 1)).toBe(offset + 1);
    expect(v(0, 2)).toBe(offset + 2);
    expect(v(1, 0)).toBe(offset + 3);
    expect(v(1, 1)).toBe(offset + 4);
    expect(v(1, 2)).toBe(offset + 5);
  });

  it("2×2 grid has 12 total edges (6H + 6V)", () => {
    expect(totalEdges(R, C)).toBe(12);
  });
});

// ── edgesOfBox ────────────────────────────────────────────────────────────────

describe("edgesOfBox", () => {
  it("returns the 4 correct edge indices for each box in a 2×2 grid", () => {
    expect(edgesOfBox(0, R, C)).toEqual([h(0,0), h(1,0), v(0,0), v(0,1)]);
    expect(edgesOfBox(1, R, C)).toEqual([h(0,1), h(1,1), v(0,1), v(0,2)]);
    expect(edgesOfBox(2, R, C)).toEqual([h(1,0), h(2,0), v(1,0), v(1,1)]);
    expect(edgesOfBox(3, R, C)).toEqual([h(1,1), h(2,1), v(1,1), v(1,2)]);
  });
});

// ── adjacentBoxes ─────────────────────────────────────────────────────────────

describe("adjacentBoxes", () => {
  it("top edge of box0 (outer boundary) borders only box0", () => {
    expect(adjacentBoxes(h(0, 0), R, C)).toEqual([0]);
  });

  it("shared horizontal edge h(1,0) borders box0 above and box2 below", () => {
    const adj = adjacentBoxes(h(1, 0), R, C);
    expect(adj).toContain(0);
    expect(adj).toContain(2);
    expect(adj).toHaveLength(2);
  });

  it("shared vertical edge v(0,1) borders box0 left and box1 right", () => {
    const adj = adjacentBoxes(v(0, 1), R, C);
    expect(adj).toContain(0);
    expect(adj).toContain(1);
    expect(adj).toHaveLength(2);
  });

  it("outer vertical edge v(0,0) borders only box0", () => {
    expect(adjacentBoxes(v(0, 0), R, C)).toEqual([0]);
  });
});

// ── countDrawn ────────────────────────────────────────────────────────────────

describe("countDrawn", () => {
  it("counts 0 on an empty board", () => {
    expect(countDrawn(0, new Set(), R, C)).toBe(0);
  });

  it("correctly counts partial edges for box0", () => {
    const s = new Set([BOX0_EDGES[0], BOX0_EDGES[1]]); // top + bottom
    expect(countDrawn(0, s, R, C)).toBe(2);
  });

  it("counts 4 when all 4 edges of a box are drawn", () => {
    const s = new Set([...BOX0_EDGES]);
    expect(countDrawn(0, s, R, C)).toBe(4);
  });
});

// ── applyMove: core turn rules ────────────────────────────────────────────────

describe("applyMove — basic rules", () => {
  it("drawing the 4th edge of box0 claims it and grants the same player another turn", () => {
    // Draw the first 3 edges of box0
    const three = new Set<number>([BOX0_EDGES[0], BOX0_EDGES[1], BOX0_EDGES[2]]);
    const owners = new Array(totalBoxes(R, C)).fill(0);

    const result = applyMove(BOX0_EDGES[3], 1, three, owners, R, C);

    expect(result.claimed).toBe(1);
    expect(result.keepTurn).toBe(true);   // same player gets another turn
    expect(result.owners[0]).toBe(1);     // box0 now owned by player 1
    expect(result.gameOver).toBe(false);  // 3 boxes remain unclaimed
  });

  it("drawing an edge that completes no box passes the turn (keepTurn = false)", () => {
    // Draw just the top edge of box0 — no box can be completed
    const one = new Set<number>();
    const owners = new Array(totalBoxes(R, C)).fill(0);

    const result = applyMove(BOX0_EDGES[0], 1, one, owners, R, C);

    expect(result.claimed).toBe(0);
    expect(result.keepTurn).toBe(false);
    expect(result.owners[0]).toBe(0);     // box0 still unclaimed
  });

  it("drawing an already-drawn edge has no side-effects (edge idempotent in set)", () => {
    const s = new Set<number>([BOX0_EDGES[0]]);
    const owners = new Array(totalBoxes(R, C)).fill(0);
    const result = applyMove(BOX0_EDGES[0], 1, s, owners, R, C);
    expect(result.claimed).toBe(0);
    expect(result.edges.size).toBe(1);
  });

  it("applyMove does not mutate the input edge set or owners array", () => {
    const s = new Set<number>([BOX0_EDGES[0], BOX0_EDGES[1], BOX0_EDGES[2]]);
    const owners = new Array(totalBoxes(R, C)).fill(0);
    const originalSize = s.size;
    const originalOwners = [...owners];

    applyMove(BOX0_EDGES[3], 1, s, owners, R, C);

    expect(s.size).toBe(originalSize);
    expect(owners).toEqual(originalOwners);
  });
});

// ── applyMove: single move completing TWO adjacent boxes ──────────────────────

describe("applyMove — one edge completes two adjacent boxes", () => {
  it("drawing h(1,0) when box0 and box2 each already have 3 edges claims both", () => {
    // box0 needs: top=h(0,0), left=v(0,0), right=v(0,1)  [bottom = h(1,0) = shared]
    // box2 needs: bottom=h(2,0), left=v(1,0), right=v(1,1) [top = h(1,0) = shared]
    const threeBox0 = [BOX0_EDGES[0], BOX0_EDGES[2], BOX0_EDGES[3]]; // top, left, right
    const threeBox2 = [BOX2_EDGES[1], BOX2_EDGES[2], BOX2_EDGES[3]]; // bottom, left, right
    const s = new Set<number>([...threeBox0, ...threeBox2]);
    const owners = new Array(totalBoxes(R, C)).fill(0);

    // h(1,0) is the shared edge (BOX0_EDGES[1] = bottom of box0 = top of box2)
    const sharedEdge = h(1, 0);
    expect(BOX0_EDGES[1]).toBe(sharedEdge);
    expect(BOX2_EDGES[0]).toBe(sharedEdge);

    const result = applyMove(sharedEdge, 1, s, owners, R, C);

    expect(result.claimed).toBe(2);        // both boxes completed
    expect(result.keepTurn).toBe(true);    // player keeps turn (claimed > 0)
    expect(result.owners[0]).toBe(1);      // box0 → player 1
    expect(result.owners[2]).toBe(1);      // box2 → player 1
    expect(result.owners[1]).toBe(0);      // box1 still unclaimed
    expect(result.owners[3]).toBe(0);      // box3 still unclaimed
  });
});

// ── Game-over detection ───────────────────────────────────────────────────────

describe("game-over detection", () => {
  it("isGameOver is false when any box is unclaimed", () => {
    const owners = [1, 2, 1, 0];   // box3 still unclaimed
    expect(isGameOver(owners, R, C)).toBe(false);
  });

  it("isGameOver is true only when all boxes are claimed", () => {
    const owners = [1, 2, 1, 2];
    expect(isGameOver(owners, R, C)).toBe(true);
  });

  it("applyMove sets gameOver only when the last edge is drawn and all boxes are claimed", () => {
    // Build a state where 11 of 12 edges are drawn and 3 of 4 boxes are claimed.
    // The 4th box (box3) needs all its edges drawn; only one is missing.
    const allEdges = new Set<number>();
    for (let i = 0; i < totalEdges(R, C); i++) allEdges.add(i);

    // Remove the last edge of box3 to leave one edge undrawn
    const lastEdge = BOX3_EDGES[3]; // right edge of box3 = v(1,2)
    allEdges.delete(lastEdge);

    const owners = [1, 2, 1, 0];   // box3 unclaimed

    const result = applyMove(lastEdge, 2, allEdges, owners, R, C);

    expect(result.claimed).toBe(1);
    expect(result.gameOver).toBe(true);
    expect(result.owners[3]).toBe(2);
  });

  it("game is not over after the first edge is drawn", () => {
    const s = new Set<number>();
    const owners = new Array(totalBoxes(R, C)).fill(0);
    const result = applyMove(0, 1, s, owners, R, C);
    expect(result.gameOver).toBe(false);
  });
});

// ── Score and winner ──────────────────────────────────────────────────────────

describe("scoreOf and winner", () => {
  it("scoreOf counts owned boxes correctly", () => {
    const owners = [1, 2, 1, 2];
    expect(scoreOf(owners, 1)).toBe(2);
    expect(scoreOf(owners, 2)).toBe(2);
  });

  it("winner returns the player with the higher score", () => {
    expect(winner([1, 1, 1, 2])).toBe(1);  // player 1 wins 3-1
    expect(winner([2, 2, 2, 1])).toBe(2);  // player 2 wins 3-1
  });

  it("winner returns 0 on a draw", () => {
    expect(winner([1, 2, 1, 2])).toBe(0);
  });
});

// ── AI move selection ─────────────────────────────────────────────────────────

describe("aiMove", () => {
  it("returns a legal (undrawn) edge index in a fresh game", () => {
    const s = new Set<number>();
    const owners = new Array(totalBoxes(R, C)).fill(0);
    const m = aiMove(s, owners, R, C);
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThan(totalEdges(R, C));
    expect(s.has(m)).toBe(false);
  });

  it("returns -1 when no edges remain", () => {
    const all = new Set<number>();
    for (let i = 0; i < totalEdges(R, C); i++) all.add(i);
    const owners = [1, 2, 1, 2];
    expect(aiMove(all, owners, R, C)).toBe(-1);
  });

  it("AI immediately completes a box if one has 3 edges drawn", () => {
    // Draw 3 edges of box1 — AI should pick the 4th
    const s = new Set<number>([BOX1_EDGES[0], BOX1_EDGES[1], BOX1_EDGES[2]]);
    const owners = new Array(totalBoxes(R, C)).fill(0);
    const m = aiMove(s, owners, R, C);
    expect(m).toBe(BOX1_EDGES[3]);  // the remaining edge of box1
  });

  it("AI picks a safe edge when no box can be completed", () => {
    // Draw 2 edges of box0 so that any edge touching box0's last side
    // would give the opponent a 3-sided box.
    // Ensure at least one safe edge remains on a totally untouched box.
    const s = new Set<number>([BOX0_EDGES[0], BOX0_EDGES[1]]); // top + bottom of box0
    const owners = new Array(totalBoxes(R, C)).fill(0);
    const m = aiMove(s, owners, R, C);
    expect(m).toBeGreaterThanOrEqual(0);
    expect(s.has(m)).toBe(false);
    // The chosen move should be a valid undrawn edge
    expect(m).toBeLessThan(totalEdges(R, C));
  });

  it("AI move is deterministic with a seeded RNG", () => {
    const s = new Set<number>();
    const owners = new Array(totalBoxes(R, C)).fill(0);
    const m1 = aiMove(s, owners, R, C, makeRng("test-seed"));
    const m2 = aiMove(s, owners, R, C, makeRng("test-seed"));
    expect(m1).toBe(m2);
  });

  it("AI never picks an already-drawn edge (full game simulation)", () => {
    // Simulate a complete game where both sides are played by the AI
    let s = new Set<number>();
    let owners = new Array<number>(totalBoxes(R, C)).fill(0);
    let currentPlayer = 1;
    const rng = makeRng("sim-seed");
    let moves = 0;

    while (s.size < totalEdges(R, C)) {
      const m = aiMove(s, owners, R, C, rng);
      if (m === -1) break;
      expect(s.has(m)).toBe(false);  // must be undrawn
      const result = applyMove(m, currentPlayer, s, owners, R, C);
      s = result.edges;
      owners = result.owners;
      if (!result.keepTurn) {
        currentPlayer = currentPlayer === 1 ? 2 : 1;
      }
      moves++;
      if (moves > 100) break; // safety
    }

    expect(s.size).toBe(totalEdges(R, C));
    expect(isGameOver(owners, R, C)).toBe(true);
  });
});

// ── Default 4×4 grid smoke test ───────────────────────────────────────────────

describe("default 4×4 grid", () => {
  it("has 40 total edges and 16 boxes", () => {
    expect(totalEdges()).toBe(40);
    expect(totalBoxes()).toBe(16);
  });

  it("aiMove returns a valid undrawn edge on a fresh board", () => {
    const s = new Set<number>();
    const owners = new Array(16).fill(0);
    const m = aiMove(s, owners);
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThan(40);
  });
});
