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

// ---------------------------------------------------------------------------
// Independent solvability audit
//
// Everything below re-derives connectivity straight from the N/E/S/W wall
// flags with its own BFS path-finder — it deliberately does NOT rely on
// bfsGoal()/canMove() to decide reachability — and then cross-checks the
// exported helpers and the component's rendering rule against that path.
//
// Maze representation reminder: every grid cell is walkable; walls live on
// the edges between cells (there are no "wall cells"), so "start/exit are
// open cells" reduces to "start/exit are inside the grid and not sealed in".
// The component wins on grid equality (playerCol/Row === goal), not on a
// world-space distance, so the geometric check below verifies that the
// segments it renders match the logical walls one-to-one.
// ---------------------------------------------------------------------------

type Grid = ReturnType<typeof genMaze>;
type Goal = ReturnType<typeof bfsGoal>;
type Pt = [number, number]; // [col, row]

/** Sizes offered by the UI (mirrors DIFFS in Maze3DGame.vue: 小/中/大). */
const UI_SIZES: [number, number][] = [
  [6, 6],
  [8, 8],
  [11, 11],
];

/** Odd/rectangular sizes the UI does not offer — the module must still cope. */
const EXTRA_SIZES: [number, number][] = [
  [1, 2],
  [2, 1],
  [2, 2],
  [3, 7],
  [7, 3],
  [12, 5],
];

/** Every calendar day of a year as "YYYY-MM-DD" seeds. */
function yearOfDates(year: number): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCFullYear() === year) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// The component seeds with makeRng(null) (fresh Math.random stream, no seed
// prop) so every playthrough is effectively a random seed. The sweep therefore
// mixes numeric, free-text and "YYYY-MM-DD" seeds — the latter so the game is
// already covered should it ever join the Daily Challenge rotation.
const AUDIT_SEEDS: (string | number)[] = [
  ...Array.from({ length: 300 }, (_, i) => i + 1),
  ...Array.from({ length: 100 }, (_, i) => `maze3d-${i}`),
  ...yearOfDates(2026),
];

/** Direction index (0=N,1=E,2=S,3=W) that moves from `a` to the adjacent `b`. */
function dirBetween(a: Pt, b: Pt): number {
  const f = FWD.findIndex(([dc, dr]) => a[0] + dc === b[0] && a[1] + dr === b[1]);
  if (f < 0) throw new Error(`cells (${a}) and (${b}) are not adjacent`);
  return f;
}

/** Unordered key for the edge between two adjacent grid positions. */
function edgeKey(c1: number, r1: number, c2: number, r2: number): string {
  const a = `${c1},${r1}`;
  const b = `${c2},${r2}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Independent BFS over the wall model from `from`.
 * Returns per-cell predecessor (-1 = source, -2 = unreachable) and distance.
 */
function bfsFrom(m: Grid, from: Pt): { prev: number[]; dist: number[] } {
  const { cells, W, H } = m;
  const prev = new Array<number>(W * H).fill(-2);
  const dist = new Array<number>(W * H).fill(-1);
  const src = from[1] * W + from[0];
  prev[src] = -1;
  dist[src] = 0;
  const q = [src];
  for (let head = 0; head < q.length; head++) {
    const cur = q[head];
    const c = cur % W;
    const r = Math.floor(cur / W);
    const cell = cells[cur];
    const open: [boolean, number, number][] = [
      [!cell.N, c, r - 1],
      [!cell.E, c + 1, r],
      [!cell.S, c, r + 1],
      [!cell.W, c - 1, r],
    ];
    for (const [ok, nc, nr] of open) {
      if (!ok || nc < 0 || nc >= W || nr < 0 || nr >= H) continue;
      const n = nr * W + nc;
      if (prev[n] !== -2) continue;
      prev[n] = cur;
      dist[n] = dist[cur] + 1;
      q.push(n);
    }
  }
  return { prev, dist };
}

/** Shortest path `from` → `to` as [col,row] cells (both endpoints included), or null. */
function findPath(m: Grid, from: Pt, to: Pt): Pt[] | null {
  const { prev } = bfsFrom(m, from);
  const target = to[1] * m.W + to[0];
  if (prev[target] === -2) return null;
  const path: Pt[] = [];
  for (let cur = target; cur !== -1; cur = prev[cur]) path.push([cur % m.W, Math.floor(cur / m.W)]);
  return path.reverse();
}

/**
 * Wall segments the component actually draws — the rule shared by
 * buildWorld() and drawMinimap() in Maze3DGame.vue: every cell draws its N
 * and W walls, the last column also draws E and the last row also draws S.
 * Keyed by the pair of grid positions the segment separates.
 */
function renderedWalls(m: Grid): Set<string> {
  const { cells, W, H } = m;
  const set = new Set<string>();
  for (const cell of cells) {
    const { c, r } = cell;
    if (cell.N) set.add(edgeKey(c, r, c, r - 1));
    if (cell.W) set.add(edgeKey(c, r, c - 1, r));
    if (c === W - 1 && cell.E) set.add(edgeKey(c, r, c + 1, r));
    if (r === H - 1 && cell.S) set.add(edgeKey(c, r, c, r + 1));
  }
  return set;
}

/**
 * Full audit of one maze against its exit. Returns human-readable
 * violations (empty = sound). Plain JS inside so the sweep over thousands of
 * mazes stays fast; the tests assert on the returned list.
 */
function auditGrid(m: Grid, goal: Goal): string[] {
  const problems: string[] = [];
  const { W: w, H: h } = m;
  const n = w * h;

  // (c) start and exit are cells of the grid and distinct (unless 1 cell only)
  if (goal.c < 0 || goal.c >= w || goal.r < 0 || goal.r >= h)
    problems.push(`exit (${goal.c},${goal.r}) is outside the ${w}x${h} grid`);
  if (n > 1 && goal.c === 0 && goal.r === 0) problems.push("exit coincides with the start");

  // (a) an independent BFS finds a path start → exit
  const path = findPath(m, [0, 0], [goal.c, goal.r]);
  if (!path) {
    problems.push(`no path from (0,0) to exit (${goal.c},${goal.r})`);
    return problems;
  }

  // (b) walking that path with the exported collision helper + FWD (exactly
  //     what forward() in the component does) lands on the exit
  let c = 0;
  let r = 0;
  for (let i = 1; i < path.length; i++) {
    const f = dirBetween([c, r], path[i]);
    if (!canMove(m.cells, m.W, c, r, f)) problems.push(`canMove blocks path step ${i} at (${c},${r}) f=${f}`);
    c += FWD[f][0];
    r += FWD[f][1];
  }
  if (c !== goal.c || r !== goal.r) problems.push(`path walk ended at (${c},${r}), not the exit`);

  // (b) collision helper vs. grid boundary and symmetry, (d) rendered geometry
  const walls = renderedWalls(m);
  let openPassages = 0;
  for (const cell of m.cells) {
    for (let f = 0; f < 4; f++) {
      const nc = cell.c + FWD[f][0];
      const nr = cell.r + FWD[f][1];
      const inside = nc >= 0 && nc < w && nr >= 0 && nr < h;
      const ok = canMove(m.cells, m.W, cell.c, cell.r, f);
      const drawn = walls.has(edgeKey(cell.c, cell.r, nc, nr));
      if (!inside) {
        if (ok) problems.push(`canMove lets (${cell.c},${cell.r}) walk off the grid (f=${f})`);
        if (!drawn) problems.push(`outer wall of (${cell.c},${cell.r}) f=${f} is not rendered`);
        continue;
      }
      if (ok) openPassages++;
      // stepping back (forward(true) in the component) must mirror stepping forward
      if (ok !== canMove(m.cells, m.W, nc, nr, (f + 2) % 4))
        problems.push(`asymmetric passage between (${cell.c},${cell.r}) and (${nc},${nr})`);
      // what the player sees must equal what the logic enforces
      if (drawn === ok)
        problems.push(
          `rendered geometry disagrees with logic between (${cell.c},${cell.r}) and (${nc},${nr}): drawn=${drawn} passable=${ok}`
        );
    }
  }
  // Every passage was counted from both ends. A perfect maze is a spanning
  // tree: exactly n-1 passages, so the solution is unique and no cell is sealed.
  if (openPassages !== 2 * (n - 1)) problems.push(`expected ${n - 1} passages, found ${openPassages / 2}`);

  // (d) exit cell reachable and not enclosed; it really is the farthest cell
  const { dist } = bfsFrom(m, [0, 0]);
  if (dist.some((d) => d < 0)) problems.push("some cell is unreachable from the start");
  const gi = goal.r * w + goal.c;
  const maxDist = Math.max(...dist);
  if (dist[gi] !== maxDist) problems.push(`exit distance ${dist[gi]} is not the maximum ${maxDist}`);
  // Tree distance can never beat Manhattan distance, so the exit is at least
  // as far as the opposite corner: an exit right next to the start is impossible.
  if (dist[gi] < w + h - 2) problems.push(`exit only ${dist[gi]} steps away (< ${w + h - 2})`);
  const g = m.cells[gi];
  if (n > 1 && g.N && g.E && g.S && g.W) problems.push("exit cell is sealed on all four sides");

  return problems;
}

/** Generate + place the exit exactly like the component, then audit. */
function auditMaze(w: number, h: number, seed: string | number): string[] {
  const m = genMaze(w, h, makeRng(seed));
  return auditGrid(m, bfsGoal(m.cells, m.W, m.H));
}

/** Close every passage into/out of cell (c, r) on both sides of each edge. */
function sealCell(m: Grid, c: number, r: number): void {
  const cell = m.cells[r * m.W + c];
  cell.N = cell.E = cell.S = cell.W = true;
  const opposite = ["S", "W", "N", "E"] as const;
  for (let f = 0; f < 4; f++) {
    const nc = c + FWD[f][0];
    const nr = r + FWD[f][1];
    if (nc < 0 || nc >= m.W || nr < 0 || nr >= m.H) continue;
    m.cells[nr * m.W + nc][opposite[f]] = true;
  }
}

describe("audit helpers are not vacuous", () => {
  // Same hand-crafted 2×2 maze as the canMove block: only (0,0)↔(1,0) is open.
  const tiny = (): Grid => ({
    W: 2,
    H: 2,
    cells: [
      { c: 0, r: 0, N: true, E: false, S: true, W: true, vis: true },
      { c: 1, r: 0, N: true, E: true, S: true, W: false, vis: true },
      { c: 0, r: 1, N: true, E: true, S: true, W: true, vis: true },
      { c: 1, r: 1, N: true, E: true, S: true, W: true, vis: true },
    ],
  });

  it("findPath follows open passages and refuses walls", () => {
    const m = tiny();
    expect(findPath(m, [0, 0], [1, 0])).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(findPath(m, [0, 0], [0, 0])).toEqual([[0, 0]]);
    expect(findPath(m, [0, 0], [0, 1])).toBeNull();
    expect(findPath(m, [0, 0], [1, 1])).toBeNull();
  });

  it("dirBetween maps adjacent cells to N/E/S/W and rejects others", () => {
    expect(dirBetween([3, 3], [3, 2])).toBe(0);
    expect(dirBetween([3, 3], [4, 3])).toBe(1);
    expect(dirBetween([3, 3], [3, 4])).toBe(2);
    expect(dirBetween([3, 3], [2, 3])).toBe(3);
    expect(() => dirBetween([0, 0], [1, 1])).toThrow();
  });

  it("renderedWalls draws each edge once and skips open passages", () => {
    const walls = renderedWalls(tiny());
    expect(walls.has(edgeKey(0, 0, 1, 0))).toBe(false); // the open passage
    expect(walls.has(edgeKey(0, 0, 0, 1))).toBe(true); // interior wall, drawn as N of (0,1)
    expect(walls.has(edgeKey(1, 0, 2, 0))).toBe(true); // outer E wall of the last column
    expect(walls.has(edgeKey(1, 1, 1, 2))).toBe(true); // outer S wall of the last row
    // A 2×2 grid has 4 interior + 8 outer edges; exactly one is open.
    expect(walls.size).toBe(11);
  });

  it("auditGrid reports the tiny maze's unreachable cells and a sealed exit", () => {
    // Two cells of the hand-crafted maze are unreachable → not a spanning tree.
    const report = auditGrid(tiny(), { c: 1, r: 0 });
    expect(report.some((p) => p.includes("unreachable"))).toBe(true);
    expect(report.some((p) => p.includes("passages"))).toBe(true);

    // Sabotage a real maze: wall the exit in on both sides of every edge.
    const m = genMaze(4, 4, makeRng("sabotage"));
    const goal = bfsGoal(m.cells, m.W, m.H);
    sealCell(m, goal.c, goal.r);
    expect(auditGrid(m, goal)).toContain(`no path from (0,0) to exit (${goal.c},${goal.r})`);

    // A one-sided wall (logic says open one way only) is caught as asymmetric
    // and as a rendering mismatch — the player would see a wall they can walk through.
    const lop = genMaze(4, 4, makeRng("lopsided"));
    const first = lop.cells.find((cell) => !cell.E)!;
    lop.cells[first.r * lop.W + first.c + 1].W = true;
    const lopReport = auditGrid(lop, bfsGoal(lop.cells, lop.W, lop.H));
    expect(lopReport.some((p) => p.startsWith("asymmetric passage"))).toBe(true);
    expect(lopReport.some((p) => p.startsWith("rendered geometry disagrees"))).toBe(true);
  });
});

describe("solvability sweep — every seed × every UI size", () => {
  for (const [w, h] of UI_SIZES) {
    it(`${w}×${h}: ${AUDIT_SEEDS.length} seeds are solvable, collision-consistent and rendered faithfully`, () => {
      for (const seed of AUDIT_SEEDS) {
        expect(auditMaze(w, h, seed), `seed=${JSON.stringify(seed)} size=${w}x${h}`).toEqual([]);
      }
    });
  }

  it("rectangular / degenerate sizes the UI does not offer are still sound", () => {
    for (const [w, h] of EXTRA_SIZES) {
      for (const seed of AUDIT_SEEDS.slice(0, 50)) {
        expect(auditMaze(w, h, seed), `seed=${JSON.stringify(seed)} size=${w}x${h}`).toEqual([]);
      }
    }
  });

  it("a 1×1 maze degenerates gracefully: exit equals start and nothing moves", () => {
    const m = genMaze(1, 1, makeRng("one"));
    const goal = bfsGoal(m.cells, 1, 1);
    expect(goal).toEqual({ c: 0, r: 0 });
    for (let f = 0; f < 4; f++) expect(canMove(m.cells, 1, 0, 0, f)).toBe(false);
    expect(auditGrid(m, goal)).toEqual([]);
  });
});
