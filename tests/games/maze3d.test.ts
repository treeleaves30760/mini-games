import { describe, it, expect } from "vitest";
import {
  genMaze,
  bfsGoal,
  canMove,
  worldOf,
  FWD,
  WALLKEY,
} from "~/games/maze3d";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** BFS reachability check over the wall model. Returns set of visited indices. */
function bfsReachable(cells: ReturnType<typeof genMaze>["cells"], W: number, H: number, startIdx = 0): Set<number> {
  const visited = new Set<number>();
  const q = [startIdx];
  visited.add(startIdx);
  const dirs: [keyof (typeof cells)[0], number, number][] = [
    ["N", 0, -1],
    ["E", 1, 0],
    ["S", 0, 1],
    ["W", -1, 0],
  ];
  while (q.length) {
    const idx = q.shift()!;
    const c = idx % W;
    const r = (idx / W) | 0;
    for (const [wall, dc, dr] of dirs) {
      if (cells[idx][wall]) continue; // wall present → blocked
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nc >= W || nr < 0 || nr >= H) continue;
      const nidx = nr * W + nc;
      if (!visited.has(nidx)) {
        visited.add(nidx);
        q.push(nidx);
      }
    }
  }
  return visited;
}

// ---------------------------------------------------------------------------
// genMaze — basic structure
// ---------------------------------------------------------------------------

describe("genMaze — structure", () => {
  it("returns the correct dimensions", () => {
    const { cells, W, H } = genMaze(5, 4, makeRng("test-dim"));
    expect(W).toBe(5);
    expect(H).toBe(4);
    expect(cells).toHaveLength(5 * 4);
  });

  it("every cell has correct grid coordinates", () => {
    const { cells, W, H } = genMaze(4, 3, makeRng("coords"));
    for (const cell of cells) {
      expect(cell.c).toBeGreaterThanOrEqual(0);
      expect(cell.c).toBeLessThan(W);
      expect(cell.r).toBeGreaterThanOrEqual(0);
      expect(cell.r).toBeLessThan(H);
    }
  });

  it("walls are symmetric: removing wall A→B also removes wall B→A", () => {
    const { cells, W, H } = genMaze(6, 6, makeRng("symmetry"));
    const opposite: Record<string, string> = { N: "S", S: "N", E: "W", W: "E" };
    const at = (c: number, r: number) =>
      c < 0 || c >= W || r < 0 || r >= H ? null : cells[r * W + c];

    for (const cell of cells) {
      const dirs: [string, number, number][] = [
        ["N", 0, -1],
        ["E", 1, 0],
        ["S", 0, 1],
        ["W", -1, 0],
      ];
      for (const [wall, dc, dr] of dirs) {
        const nb = at(cell.c + dc, cell.r + dr);
        if (!nb) continue;
        // If the passage is open in one direction, it must also be open from the other
        const cellWall = cell[wall as keyof typeof cell] as boolean;
        const nbWall = nb[opposite[wall] as keyof typeof nb] as boolean;
        if (!cellWall) {
          expect(nbWall, `wall symmetry broken at (${cell.c},${cell.r}) ${wall}`).toBe(false);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// genMaze — determinism
// ---------------------------------------------------------------------------

describe("genMaze — determinism", () => {
  it("same seed produces identical mazes", () => {
    const a = genMaze(8, 8, makeRng("det-seed-1"));
    const b = genMaze(8, 8, makeRng("det-seed-1"));
    for (let i = 0; i < a.cells.length; i++) {
      const ca = a.cells[i];
      const cb = b.cells[i];
      expect(ca.N).toBe(cb.N);
      expect(ca.E).toBe(cb.E);
      expect(ca.S).toBe(cb.S);
      expect(ca.W).toBe(cb.W);
    }
  });

  it("different seeds produce different mazes (at least 1 differing wall)", () => {
    const a = genMaze(8, 8, makeRng("seed-A"));
    const b = genMaze(8, 8, makeRng("seed-B"));
    const differs = a.cells.some((ca, i) => {
      const cb = b.cells[i];
      return ca.N !== cb.N || ca.E !== cb.E || ca.S !== cb.S || ca.W !== cb.W;
    });
    expect(differs).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// genMaze — solvability (perfect maze = all cells reachable from (0,0))
// ---------------------------------------------------------------------------

describe("genMaze — solvability", () => {
  const seeds = ["alpha", "beta", "gamma", "2026-01-01", 42, 99999];
  const sizes: [number, number][] = [
    [6, 6],
    [8, 8],
    [11, 11],
  ];

  for (const seed of seeds) {
    for (const [w, h] of sizes) {
      it(`${w}×${h} maze with seed "${seed}" reaches every cell`, () => {
        const { cells, W, H } = genMaze(w, h, makeRng(seed));
        const reachable = bfsReachable(cells, W, H, 0);
        expect(reachable.size).toBe(W * H);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// bfsGoal — exit placement
// ---------------------------------------------------------------------------

describe("bfsGoal", () => {
  it("goal is reachable from (0,0)", () => {
    const { cells, W, H } = genMaze(8, 8, makeRng("goal-reach"));
    const goal = bfsGoal(cells, W, H);
    const reachable = bfsReachable(cells, W, H, 0);
    const goalIdx = goal.r * W + goal.c;
    expect(reachable.has(goalIdx)).toBe(true);
  });

  it("goal is not at the start (0,0) for non-trivial mazes", () => {
    const { cells, W, H } = genMaze(8, 8, makeRng("goal-pos"));
    const goal = bfsGoal(cells, W, H);
    expect(goal.c !== 0 || goal.r !== 0).toBe(true);
  });

  it("goal coordinates are within bounds", () => {
    const { cells, W, H } = genMaze(11, 11, makeRng("goal-bounds"));
    const goal = bfsGoal(cells, W, H);
    expect(goal.c).toBeGreaterThanOrEqual(0);
    expect(goal.c).toBeLessThan(W);
    expect(goal.r).toBeGreaterThanOrEqual(0);
    expect(goal.r).toBeLessThan(H);
  });

  it("is deterministic: same maze → same goal", () => {
    const seed = "goal-det";
    const a = genMaze(8, 8, makeRng(seed));
    const b = genMaze(8, 8, makeRng(seed));
    expect(bfsGoal(a.cells, a.W, a.H)).toEqual(bfsGoal(b.cells, b.W, b.H));
  });

  it("handles a single-cell maze with open outer walls without crashing (triggers boundary guard line 120)", () => {
    // Hand-craft a 1×1 maze where the only cell has an open North wall.
    // During BFS: direction N (dy=-1) is not blocked by the wall, so it
    // tries nc=0, nr=-1 which is out-of-bounds → the boundary check on
    // line 120 fires and the iteration continues safely.
    const cells = [
      { c: 0, r: 0, N: false /* open! */, E: true, S: true, W: true, vis: true },
    ];
    const W = 1;
    const H = 1;
    const goal = bfsGoal(cells, W, H);
    // Only one cell in the maze — goal must remain at (0, 0)
    expect(goal.c).toBe(0);
    expect(goal.r).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// canMove — explicit tiny maze
// ---------------------------------------------------------------------------

describe("canMove — explicit 2×2 maze", () => {
  // Hand-craft a 2×2 maze with only one open passage: (0,0)→East→(1,0)
  //
  //  ┌──┬──┐
  //  │  ·  │   row 0: (0,0) open East, (1,0) open West; all other walls closed
  //  ├──┼──┤
  //  │  │  │   row 1: all walls closed
  //  └──┴──┘
  //
  // Cell layout (r*W + c):  [0,0]=0  [0,1]=1  [1,0]=2  [1,1]=3

  const cells = [
    // (c=0, r=0): East open
    { c: 0, r: 0, N: true, E: false, S: true, W: true, vis: true },
    // (c=1, r=0): West open
    { c: 1, r: 0, N: true, E: true, S: true, W: false, vis: true },
    // (c=0, r=1): all walls
    { c: 0, r: 1, N: true, E: true, S: true, W: true, vis: true },
    // (c=1, r=1): all walls
    { c: 1, r: 1, N: true, E: true, S: true, W: true, vis: true },
  ];
  const W = 2;

  it("can move East from (0,0)", () => {
    expect(canMove(cells, W, 0, 0, 1 /* E */)).toBe(true);
  });

  it("can move West from (1,0)", () => {
    expect(canMove(cells, W, 1, 0, 3 /* W */)).toBe(true);
  });

  it("cannot move North from (0,0) — wall present", () => {
    expect(canMove(cells, W, 0, 0, 0 /* N */)).toBe(false);
  });

  it("cannot move South from (0,0) — wall present", () => {
    expect(canMove(cells, W, 0, 0, 2 /* S */)).toBe(false);
  });

  it("cannot move West from (0,0) — wall present", () => {
    expect(canMove(cells, W, 0, 0, 3 /* W */)).toBe(false);
  });

  it("cannot move in any direction from a fully-walled cell (0,1)", () => {
    for (let f = 0; f < 4; f++) {
      expect(canMove(cells, W, 0, 1, f)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// worldOf — coordinate math
// ---------------------------------------------------------------------------

describe("worldOf", () => {
  const CS = 3;

  it("origin cell (0,0) in a 1×1 maze maps to (0, 0)", () => {
    const pos = worldOf(0, 0, 1, 1, CS);
    expect(pos.x).toBeCloseTo(0);
    expect(pos.z).toBeCloseTo(0);
  });

  it("centre cell of a 3×3 maze maps to (0, 0)", () => {
    const pos = worldOf(1, 1, 3, 3, CS);
    expect(pos.x).toBeCloseTo(0);
    expect(pos.z).toBeCloseTo(0);
  });

  it("adjacent cells differ by CS in the correct axis", () => {
    const a = worldOf(0, 0, 4, 4, CS);
    const b = worldOf(1, 0, 4, 4, CS); // one step East
    const c = worldOf(0, 1, 4, 4, CS); // one step South
    expect(b.x - a.x).toBeCloseTo(CS);
    expect(b.z - a.z).toBeCloseTo(0);
    expect(c.x - a.x).toBeCloseTo(0);
    expect(c.z - a.z).toBeCloseTo(CS);
  });
});

// ---------------------------------------------------------------------------
// FWD / WALLKEY — constants sanity
// ---------------------------------------------------------------------------

describe("constants", () => {
  it("FWD has 4 direction vectors matching WALLKEY order (N,E,S,W)", () => {
    expect(FWD).toHaveLength(4);
    expect(WALLKEY).toHaveLength(4);
    // N = north = row decreases
    expect(FWD[0]).toEqual([0, -1]);
    // E = east = col increases
    expect(FWD[1]).toEqual([1, 0]);
    // S = south = row increases
    expect(FWD[2]).toEqual([0, 1]);
    // W = west = col decreases
    expect(FWD[3]).toEqual([-1, 0]);
    expect(WALLKEY[0]).toBe("N");
    expect(WALLKEY[1]).toBe("E");
    expect(WALLKEY[2]).toBe("S");
    expect(WALLKEY[3]).toBe("W");
  });
});
