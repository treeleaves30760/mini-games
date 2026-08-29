import { describe, it, expect } from "vitest";
import {
  generateMaze,
  canMove,
  isAtExit,
  isSolvable,
  reachableCount,
  shortestPath,
  deltaToDir,
  DIR_N,
  DIR_E,
  DIR_S,
  DIR_W,
  OPPOSITE,
  DR,
  DC,
  type MazeWalls,
} from "~/games/maze2d";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a maze with a string seed (convenience wrapper). */
function make(size: number, seed: string | number): MazeWalls {
  return generateMaze(size, makeRng(seed));
}

// ---------------------------------------------------------------------------
// Constants & model
// ---------------------------------------------------------------------------

describe("direction constants", () => {
  it("DIR_N/E/S/W are distinct powers-of-two", () => {
    const dirs = [DIR_N, DIR_E, DIR_S, DIR_W];
    expect(new Set(dirs).size).toBe(4);
    for (const d of dirs) expect(d & (d - 1)).toBe(0); // power of two
  });

  it("OPPOSITE is consistent: OPPOSITE[OPPOSITE[d]] === d", () => {
    for (const d of [DIR_N, DIR_E, DIR_S, DIR_W]) {
      expect(OPPOSITE[OPPOSITE[d]]).toBe(d);
    }
  });

  it("DR/DC deltas are unit vectors and consistent with direction", () => {
    expect(DR[DIR_N]).toBe(-1);
    expect(DR[DIR_S]).toBe(1);
    expect(DC[DIR_E]).toBe(1);
    expect(DC[DIR_W]).toBe(-1);
    expect(DR[DIR_E]).toBe(0);
    expect(DR[DIR_W]).toBe(0);
    expect(DC[DIR_N]).toBe(0);
    expect(DC[DIR_S]).toBe(0);
  });
});

describe("deltaToDir", () => {
  it("maps (dr,dc) to the correct direction bit", () => {
    expect(deltaToDir(-1, 0)).toBe(DIR_N);
    expect(deltaToDir(1, 0)).toBe(DIR_S);
    expect(deltaToDir(0, 1)).toBe(DIR_E);
    expect(deltaToDir(0, -1)).toBe(DIR_W);
  });

  it("returns 0 for invalid / diagonal deltas", () => {
    expect(deltaToDir(0, 0)).toBe(0);
    expect(deltaToDir(1, 1)).toBe(0);
    expect(deltaToDir(-1, -1)).toBe(0);
    expect(deltaToDir(2, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateMaze — structure
// ---------------------------------------------------------------------------

describe("generateMaze — wall model structure", () => {
  it("returns the right number of rows × cols", () => {
    const walls = make(7, "abc");
    expect(walls.length).toBe(7);
    for (const row of walls) expect(row.length).toBe(7);
  });

  it("walls are Uint8Array rows (within 0..15)", () => {
    const walls = make(5, "test");
    for (const row of walls) {
      expect(row).toBeInstanceOf(Uint8Array);
      for (const cell of row) {
        expect(cell).toBeGreaterThanOrEqual(0);
        expect(cell).toBeLessThanOrEqual(15); // only 4 direction bits
      }
    }
  });

  it("passages are symmetric: if A→B is open then B→A is open", () => {
    const size = 9;
    const walls = make(size, "symmetry");
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        for (const d of [DIR_N, DIR_E, DIR_S, DIR_W]) {
          if (!(walls[r][c] & d)) continue; // not open in this dir
          const nr = r + DR[d];
          const nc = c + DC[d];
          if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
          const back = OPPOSITE[d];
          expect(walls[nr][nc] & back).toBeTruthy();
        }
      }
    }
  });

  it("outer boundary cells have no passage leading out of bounds", () => {
    const size = 11;
    const walls = make(size, "boundary");
    // top row: no N passage
    for (let c = 0; c < size; c++) expect(walls[0][c] & DIR_N).toBe(0);
    // bottom row: no S passage
    for (let c = 0; c < size; c++) expect(walls[size - 1][c] & DIR_S).toBe(0);
    // left col: no W passage
    for (let r = 0; r < size; r++) expect(walls[r][0] & DIR_W).toBe(0);
    // right col: no E passage
    for (let r = 0; r < size; r++) expect(walls[r][size - 1] & DIR_E).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Solvability (BFS) — the critical invariant
// ---------------------------------------------------------------------------

describe("generateMaze — solvability", () => {
  const SEEDS = ["seed-1", "seed-2", "seed-42", "daily-2026-06-03", 0, 1, 12345, 99999];
  const SIZES = [5, 7, 11, 15, 21];

  for (const size of SIZES) {
    for (const seed of SEEDS) {
      it(`size=${size} seed="${seed}" is solvable`, () => {
        const walls = make(size, seed);
        expect(isSolvable(walls, size, size)).toBe(true);
      });
    }
  }

  it("path from (0,0) to (size-1,size-1) exists (shortestPath is non-null)", () => {
    for (const seed of SEEDS) {
      const walls = make(11, seed);
      const path = shortestPath(walls, 11, 11);
      expect(path).not.toBeNull();
      expect(path![0]).toEqual([0, 0]);
      expect(path![path!.length - 1]).toEqual([10, 10]);
    }
  });
});

// ---------------------------------------------------------------------------
// Perfect maze: full reachability (all cells accessible from start)
// ---------------------------------------------------------------------------

describe("generateMaze — perfect maze (full reachability)", () => {
  it("every cell is reachable from (0,0) for small mazes", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const size = 7;
      const walls = make(size, seed);
      expect(reachableCount(walls, size, size)).toBe(size * size);
    }
  });

  it("every cell is reachable from (0,0) for size 11", () => {
    const size = 11;
    const walls = make(size, "perfect-maze-test");
    expect(reachableCount(walls, size, size)).toBe(size * size);
  });

  it("every cell is reachable from (0,0) for size 15", () => {
    const size = 15;
    const walls = make(size, "daily-2026-06-03");
    expect(reachableCount(walls, size, size)).toBe(size * size);
  });

  it("every cell is reachable from (0,0) for size 21", () => {
    const size = 21;
    const walls = make(size, "large-maze");
    expect(reachableCount(walls, size, size)).toBe(size * size);
  });
});

// ---------------------------------------------------------------------------
// Determinism: same seed → same maze; different seed → different maze
// ---------------------------------------------------------------------------

describe("generateMaze — determinism", () => {
  it("same seed produces identical walls", () => {
    const a = make(11, "deterministic");
    const b = make(11, "deterministic");
    expect(a.length).toBe(b.length);
    for (let r = 0; r < a.length; r++) {
      expect(Array.from(a[r])).toEqual(Array.from(b[r]));
    }
  });

  it("different seeds produce different mazes", () => {
    const a = make(11, "seed-A");
    const b = make(11, "seed-B");
    let differs = false;
    for (let r = 0; r < a.length && !differs; r++) {
      for (let c = 0; c < a[r].length && !differs; c++) {
        if (a[r][c] !== b[r][c]) differs = true;
      }
    }
    expect(differs).toBe(true);
  });

  it("numeric and string seeds are repeatable", () => {
    const a1 = make(9, 42);
    const a2 = make(9, 42);
    for (let r = 0; r < 9; r++) {
      expect(Array.from(a1[r])).toEqual(Array.from(a2[r]));
    }
  });
});

// ---------------------------------------------------------------------------
// canMove — wall legality
// ---------------------------------------------------------------------------

describe("canMove", () => {
  it("allows a move through an open passage", () => {
    const size = 5;
    const walls = make(size, "canmove");
    // find a cell with at least one passage and verify canMove returns true
    let found = false;
    outer: for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        for (const [dr, dc] of [[-1,0],[1,0],[0,1],[0,-1]] as [number,number][]) {
          const d = deltaToDir(dr, dc);
          if (walls[r][c] & d) {
            expect(canMove(walls, size, size, r, c, dr, dc)).toBe(true);
            found = true;
            break outer;
          }
        }
      }
    }
    expect(found).toBe(true);
  });

  it("blocks a move across a closed wall (bit not set)", () => {
    // Construct a minimal walls array where [0][0] has no passages at all.
    const walls: MazeWalls = [new Uint8Array(3), new Uint8Array(3), new Uint8Array(3)];
    // All bits zero → all directions are walls.
    expect(canMove(walls, 3, 3, 0, 0, 1, 0)).toBe(false); // S blocked
    expect(canMove(walls, 3, 3, 0, 0, 0, 1)).toBe(false); // E blocked
    expect(canMove(walls, 3, 3, 0, 0, -1, 0)).toBe(false); // N blocked (also OOB)
  });

  it("blocks a move out of bounds even if the boundary wall bit were set", () => {
    // Manually set N bit on [0][0] (which would be out of bounds northward).
    const walls: MazeWalls = [new Uint8Array(3), new Uint8Array(3), new Uint8Array(3)];
    walls[0][0] = DIR_N; // open N on top-left (invalid — would go to row -1)
    expect(canMove(walls, 3, 3, 0, 0, -1, 0)).toBe(false);
  });

  it("blocks diagonal and zero deltas", () => {
    const walls: MazeWalls = [new Uint8Array(3), new Uint8Array(3), new Uint8Array(3)];
    walls[1][1] = 0xFF; // all bits set
    expect(canMove(walls, 3, 3, 1, 1, 1, 1)).toBe(false);   // diagonal
    expect(canMove(walls, 3, 3, 1, 1, 0, 0)).toBe(false);   // zero
    expect(canMove(walls, 3, 3, 1, 1, 2, 0)).toBe(false);   // invalid stride
  });

  it("canMove is consistent with actual maze passages", () => {
    const size = 9;
    const walls = make(size, "consistent");
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        for (const [dr, dc] of [[-1,0],[1,0],[0,1],[0,-1]] as [number,number][]) {
          const d = deltaToDir(dr, dc);
          const open = !!(walls[r][c] & d);
          const inBounds =
            r + dr >= 0 && c + dc >= 0 && r + dr < size && c + dc < size;
          expect(canMove(walls, size, size, r, c, dr, dc)).toBe(open && inBounds);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// isAtExit — win detection
// ---------------------------------------------------------------------------

describe("isAtExit", () => {
  it("true only at the bottom-right cell", () => {
    expect(isAtExit(4, 4, 5, 5)).toBe(true);
    expect(isAtExit(0, 0, 5, 5)).toBe(false);
    expect(isAtExit(4, 3, 5, 5)).toBe(false);
    expect(isAtExit(3, 4, 5, 5)).toBe(false);
  });

  it("works for non-square grids if rows ≠ cols", () => {
    expect(isAtExit(2, 4, 3, 5)).toBe(true);
    expect(isAtExit(2, 3, 3, 5)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSolvable & shortestPath — BFS helpers
// ---------------------------------------------------------------------------

describe("isSolvable", () => {
  it("returns false for a fully-walled grid (no passages)", () => {
    // 3×3, all cells isolated
    const walls: MazeWalls = Array.from({ length: 3 }, () => new Uint8Array(3));
    expect(isSolvable(walls, 3, 3)).toBe(false);
  });

  it("returns true for a trivially connected 1×1 grid", () => {
    const walls: MazeWalls = [new Uint8Array(1)];
    expect(isSolvable(walls, 1, 1)).toBe(true);
  });

  it("returns true for a manually constructed 2×2 maze with a valid path", () => {
    // 0,0 → E → 0,1 → S → 1,1
    const walls: MazeWalls = [new Uint8Array(2), new Uint8Array(2)];
    walls[0][0] = DIR_E;
    walls[0][1] = DIR_W | DIR_S;
    walls[1][1] = DIR_N;
    expect(isSolvable(walls, 2, 2)).toBe(true);
  });
});

describe("shortestPath", () => {
  it("returns null for an unsolvable maze", () => {
    const walls: MazeWalls = Array.from({ length: 3 }, () => new Uint8Array(3));
    expect(shortestPath(walls, 3, 3)).toBeNull();
  });

  it("returns [0,0] for a 1×1 maze", () => {
    const walls: MazeWalls = [new Uint8Array(1)];
    const path = shortestPath(walls, 1, 1);
    expect(path).toEqual([[0, 0]]);
  });

  it("path is a valid walk through the maze (each step through an open passage)", () => {
    const size = 11;
    const walls = make(size, "path-validity");
    const path = shortestPath(walls, size, size)!;
    expect(path).not.toBeNull();
    for (let i = 0; i < path.length - 1; i++) {
      const [r, c] = path[i];
      const [nr, nc] = path[i + 1];
      const dr = nr - r;
      const dc = nc - c;
      const d = deltaToDir(dr, dc);
      expect(d).not.toBe(0);
      expect(walls[r][c] & d).toBeTruthy();
    }
  });

  it("finds the shortest possible path in a hand-crafted straight corridor", () => {
    // Build a 1×4 corridor: (0,0)→E→(0,1)→E→(0,2)→E→(0,3)
    const walls: MazeWalls = [new Uint8Array(4)];
    walls[0][0] = DIR_E;
    walls[0][1] = DIR_W | DIR_E;
    walls[0][2] = DIR_W | DIR_E;
    walls[0][3] = DIR_W;
    const path = shortestPath(walls, 1, 4)!;
    expect(path).toHaveLength(4); // 4 cells: 0,1,2,3
    expect(path[0]).toEqual([0, 0]);
    expect(path[3]).toEqual([0, 3]);
  });
});

// ---------------------------------------------------------------------------
// BFS bounds-check defensive branches (lines 153, 177, 219)
// ---------------------------------------------------------------------------
// These branches fire when a wall-bit IS set but the neighbour it points to
// is outside the grid.  Real generated mazes never produce such walls, but
// hand-crafted walls can, so these are defensive guards.

describe("isSolvable — out-of-bounds passage bit guard (line 153)", () => {
  it("handles a wall with an out-of-bounds passage bit set (N on top row)", () => {
    // 3×3 grid: cell [0][0] has DIR_N set, which would go to row -1 (OOB).
    // isSolvable must skip that direction via the bounds check at line 153
    // rather than crashing.  We also open a valid path so the result is true.
    const walls: MazeWalls = [new Uint8Array(3), new Uint8Array(3), new Uint8Array(3)];
    // Open a path: (0,0)→E→(0,1)→S→(1,1)→S→(2,1)→E→(2,2)
    walls[0][0] = DIR_E | DIR_N; // DIR_N is the out-of-bounds bit (goes to row -1)
    walls[0][1] = DIR_W | DIR_S;
    walls[1][1] = DIR_N | DIR_S;
    walls[2][1] = DIR_N | DIR_E;
    walls[2][2] = DIR_W;
    expect(isSolvable(walls, 3, 3)).toBe(true);
  });

  it("handles a wall with an out-of-bounds W passage on left column (line 153)", () => {
    // cell [0][0] has DIR_W set (goes to col -1 — OOB).
    const walls: MazeWalls = [new Uint8Array(3), new Uint8Array(3), new Uint8Array(3)];
    walls[0][0] = DIR_W | DIR_S; // W is OOB; S opens a passage
    walls[1][0] = DIR_N | DIR_E;
    walls[1][1] = DIR_W | DIR_S;
    walls[2][1] = DIR_N | DIR_E;
    walls[2][2] = DIR_W;
    expect(isSolvable(walls, 3, 3)).toBe(true);
  });
});

describe("reachableCount — out-of-bounds passage bit guard (line 177)", () => {
  it("handles a wall with an out-of-bounds passage bit set (S on bottom row)", () => {
    // 2×2: cell [1][0] has DIR_S set (goes to row 2 — OOB).
    const walls: MazeWalls = [new Uint8Array(2), new Uint8Array(2)];
    // Open a path to cover all 4 cells
    walls[0][0] = DIR_E | DIR_S;
    walls[0][1] = DIR_W | DIR_S;
    walls[1][0] = DIR_N | DIR_E | DIR_S; // DIR_S goes to row 2 (OOB)
    walls[1][1] = DIR_W | DIR_N;
    // All 4 cells reachable; the OOB S-bit on [1][0] is skipped safely
    expect(reachableCount(walls, 2, 2)).toBe(4);
  });
});

describe("shortestPath — out-of-bounds passage bit guard (line 219)", () => {
  it("handles a wall with an out-of-bounds passage bit (E on right column)", () => {
    // 2×2: cell [0][1] has DIR_E set (goes to col 2 — OOB).
    const walls: MazeWalls = [new Uint8Array(2), new Uint8Array(2)];
    walls[0][0] = DIR_S | DIR_E;
    walls[0][1] = DIR_W | DIR_E; // DIR_E goes to col 2 (OOB)
    walls[1][0] = DIR_N | DIR_E;
    walls[1][1] = DIR_W | DIR_N;
    // Path exists; OOB E-bit on [0][1] must be ignored safely
    const path = shortestPath(walls, 2, 2);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual([0, 0]);
    expect(path![path!.length - 1]).toEqual([1, 1]);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: simulate walking the shortest path through the maze
// ---------------------------------------------------------------------------

describe("end-to-end: walk BFS path using canMove and isAtExit", () => {
  it("canMove allows every step on the BFS shortest path", () => {
    for (const seed of ["walk-1", "walk-2", 77]) {
      const size = 9;
      const walls = make(size, seed);
      const path = shortestPath(walls, size, size)!;
      expect(path).not.toBeNull();

      for (let i = 0; i < path.length - 1; i++) {
        const [r, c] = path[i];
        const [nr, nc] = path[i + 1];
        expect(
          canMove(walls, size, size, r, c, nr - r, nc - c),
          `step ${i}: (${r},${c})→(${nr},${nc}) should be allowed`,
        ).toBe(true);
      }

      const [exitR, exitC] = path[path.length - 1];
      expect(isAtExit(exitR, exitC, size, size)).toBe(true);
    }
  });

  it("walking a non-corridor step that is not in the path is blocked by a wall", () => {
    // For each cell on the path, any step NOT taken by the BFS path and not
    // leading to an open passage must be blocked.
    const size = 7;
    const walls = make(size, "blocked-steps");
    const path = shortestPath(walls, size, size)!;

    const pathSet = new Set(path.map(([r, c]) => `${r},${c}`));
    let blockedCount = 0;

    for (const [dr, dc] of [[-1,0],[1,0],[0,1],[0,-1]] as [number,number][]) {
      for (const [r, c] of path) {
        const d = deltaToDir(dr, dc);
        const inBounds = r + dr >= 0 && c + dc >= 0 && r + dr < size && c + dc < size;
        if (!inBounds) continue;
        if (!(walls[r][c] & d)) {
          // wall: canMove must return false
          expect(canMove(walls, size, size, r, c, dr, dc)).toBe(false);
          blockedCount++;
        }
      }
    }
    // Sanity: we should have found at least some blocked walls (a real maze)
    expect(blockedCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Solvability audit — independent BFS replayed through the game's move logic
// ---------------------------------------------------------------------------
// Maze2dGame.vue offers sizes 11 / 15 / 21 in free play and a fixed 15 for the
// Daily Challenge, which seeds makeRng with a "YYYY-MM-DD" string. The checks
// below rebuild the maze graph straight from the raw bitmasks with their own
// BFS (deliberately NOT isSolvable / shortestPath / reachableCount) and then
// replay the path through canMove + isAtExit exactly the way the component's
// move() does, over hundreds of seeds per size. There is no move limit, par or
// timer target in the UI (steps and time only count up), so nothing else has
// to be achievable beyond reaching the exit.

const UI_SIZES = [11, 15, 21];
const DAILY_SIZE = 15;

/** Raw bit values from the documented wall model — intentionally literal so the
 *  audit does not depend on the module's own DIR_* / DR / DC / OPPOSITE tables. */
const RAW_DIRS: { bit: number; dr: number; dc: number; back: number }[] = [
  { bit: 1, dr: -1, dc: 0, back: 4 }, // N, mirrored by S on the neighbour
  { bit: 2, dr: 0, dc: 1, back: 8 }, // E, mirrored by W
  { bit: 4, dr: 1, dc: 0, back: 1 }, // S, mirrored by N
  { bit: 8, dr: 0, dc: -1, back: 2 }, // W, mirrored by E
];

interface MazeAudit {
  /** BFS shortest path start → exit (inclusive), or null when unreachable. */
  path: [number, number][] | null;
  /** Cells reachable from the start. */
  reached: number;
  /** Open passage bits counted from both sides (2 per carved wall). */
  passages: number;
  /** Passage bits that lead off the board or are not mirrored on the neighbour. */
  wallFaults: string[];
  /** Cases where canMove disagrees with the raw bitmask + bounds. */
  moveFaults: string[];
}

function auditMaze(walls: MazeWalls, size: number): MazeAudit {
  const wallFaults: string[] = [];
  const moveFaults: string[] = [];
  let passages = 0;

  // 1. Wall model: every set bit must point inside the grid and be mirrored on
  //    the neighbour; canMove must agree with the raw bits + bounds everywhere.
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const { bit, dr, dc, back } of RAW_DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        const inBounds = nr >= 0 && nc >= 0 && nr < size && nc < size;
        const open = (walls[r][c] & bit) !== 0;
        if (open) {
          passages++;
          if (!inBounds) wallFaults.push(`(${r},${c}) bit ${bit} leads off the board`);
          else if (!(walls[nr][nc] & back)) wallFaults.push(`(${r},${c})->(${nr},${nc}) not mirrored`);
        }
        const allowed = canMove(walls, size, size, r, c, dr, dc);
        if (allowed !== (open && inBounds)) {
          moveFaults.push(`canMove(${r},${c},${dr},${dc}) = ${allowed}, walls say ${open && inBounds}`);
        }
      }
    }
  }

  // 2. Independent BFS over the raw bitmasks (cells indexed r * size + c).
  const prev = new Int32Array(size * size).fill(-2); // -2 = unseen, -1 = root
  prev[0] = -1;
  const queue = [0];
  let reached = 1;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const r = Math.floor(cur / size);
    const c = cur % size;
    for (const { bit, dr, dc } of RAW_DIRS) {
      if (!(walls[r][c] & bit)) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
      const id = nr * size + nc;
      if (prev[id] !== -2) continue;
      prev[id] = cur;
      reached++;
      queue.push(id);
    }
  }
  const exitId = (size - 1) * size + (size - 1);
  let path: [number, number][] | null = null;
  if (prev[exitId] !== -2) {
    path = [];
    for (let id = exitId; id !== -1; id = prev[id]) path.push([Math.floor(id / size), id % size]);
    path.reverse();
  }
  return { path, reached, passages, wallFaults, moveFaults };
}

/** Mirror of Maze2dGame.vue move(): a step is applied only when canMove allows
 *  it, input is ignored once won, and the win fires when isAtExit is true. */
function replayThroughGame(walls: MazeWalls, size: number, path: [number, number][]) {
  let py = 0;
  let px = 0;
  let steps = 0;
  let won = false;
  let blocked: string | null = null;
  for (let i = 1; i < path.length; i++) {
    if (won) break;
    const [nr, nc] = path[i];
    const dr = nr - py;
    const dc = nc - px;
    if (!canMove(walls, size, size, py, px, dr, dc)) {
      blocked = `(${py},${px})->(${nr},${nc})`;
      break;
    }
    py += dr;
    px += dc;
    steps++;
    if (isAtExit(py, px, size, size)) won = true;
  }
  return { steps, won, blocked, at: [py, px] as [number, number] };
}

/** Run the full audit for one size over many seeds; returns human-readable failures. */
function auditSeeds(size: number, seeds: (string | number)[]): string[] {
  const failures: string[] = [];
  const cells = size * size;
  for (const seed of seeds) {
    const tag = `size=${size} seed=${JSON.stringify(seed)}`;
    const walls = make(size, seed);
    const a = auditMaze(walls, size);
    if (a.wallFaults.length) failures.push(`${tag}: ${a.wallFaults.slice(0, 3).join("; ")}`);
    if (a.moveFaults.length) failures.push(`${tag}: ${a.moveFaults.slice(0, 3).join("; ")}`);
    if (a.reached !== cells) failures.push(`${tag}: only ${a.reached}/${cells} cells reachable`);
    // Connected + exactly cells-1 carved walls = spanning tree, i.e. a perfect
    // maze with a unique route, which is what the UI hint promises.
    if (a.passages !== 2 * (cells - 1)) {
      failures.push(`${tag}: ${a.passages / 2} carved walls, a perfect maze has ${cells - 1}`);
    }
    if (!a.path) {
      failures.push(`${tag}: no path from start to exit`);
      continue;
    }
    const replay = replayThroughGame(walls, size, a.path);
    if (replay.blocked) failures.push(`${tag}: canMove blocked BFS step ${replay.blocked}`);
    if (!replay.won || replay.steps !== a.path.length - 1) {
      failures.push(`${tag}: replay ended at (${replay.at}) after ${replay.steps} steps, won=${replay.won}`);
    }
  }
  return failures;
}

function datesOfYear(year: number): string[] {
  const out: string[] = [];
  for (let d = new Date(year, 0, 1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${year}-${m}-${day}`);
  }
  return out;
}

const NUMERIC_SEEDS = Array.from({ length: 300 }, (_, i) => i); // 0..299 (0 hits makeRng's `|| 1` path)
const STRING_SEEDS = Array.from({ length: 100 }, (_, i) => `maze-${i}`);
const DAILY_SEEDS = [...datesOfYear(2026), ...datesOfYear(2027)];

describe("solvability audit — every UI size × hundreds of seeds", () => {
  for (const size of UI_SIZES) {
    it(`start and exit are distinct cells at size ${size}`, () => {
      expect(isAtExit(0, 0, size, size)).toBe(false);
      expect(isAtExit(size - 1, size - 1, size, size)).toBe(true);
    });

    it(`size ${size}: perfect, fully connected, BFS path replays to a win (${NUMERIC_SEEDS.length + STRING_SEEDS.length} seeds)`, () => {
      expect(auditSeeds(size, [...NUMERIC_SEEDS, ...STRING_SEEDS])).toEqual([]);
    });
  }

  it(`daily challenge: size ${DAILY_SIZE} for every date of 2026 and 2027 (${DAILY_SEEDS.length} seeds)`, () => {
    expect(DAILY_SEEDS).toHaveLength(365 * 2);
    expect(auditSeeds(DAILY_SIZE, DAILY_SEEDS)).toEqual([]);
  });

  it("daily seed is deterministic and differs from the neighbouring day", () => {
    const a = make(DAILY_SIZE, "2026-08-29");
    const b = make(DAILY_SIZE, "2026-08-29");
    const c = make(DAILY_SIZE, "2026-08-30");
    const flat = (w: MazeWalls) => w.map((row) => Array.from(row).join(",")).join("|");
    expect(flat(a)).toBe(flat(b));
    expect(flat(a)).not.toBe(flat(c));
  });
});

describe("random legal walks driven by canMove stay on the board and off the walls", () => {
  for (const size of UI_SIZES) {
    it(`size ${size}: 20000 attempted moves`, () => {
      const walls = make(size, `walk-${size}`);
      const rng = makeRng(`walk-dirs-${size}`);
      let r = 0;
      let c = 0;
      let applied = 0;
      const faults: string[] = [];
      for (let i = 0; i < 20000; i++) {
        const { bit, dr, dc, back } = rng.pick(RAW_DIRS);
        if (!canMove(walls, size, size, r, c, dr, dc)) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= size || nc >= size) faults.push(`step ${i} left the board`);
        else if (!(walls[r][c] & bit) || !(walls[nr][nc] & back)) faults.push(`step ${i} crossed a wall`);
        r = nr;
        c = nc;
        applied++;
      }
      expect(faults).toEqual([]);
      expect(applied).toBeGreaterThan(0);
    });
  }
});

describe("audit self-check — a deliberately broken maze is flagged", () => {
  it("cutting the unique route to the exit is reported as unreachable", () => {
    const size = 11;
    const walls = make(size, "self-check");
    const { path } = auditMaze(walls, size);
    expect(path).not.toBeNull();
    // Close the last passage of the route on both sides. In a perfect maze that
    // single cut disconnects the exit, so the audit must report both the missing
    // path and the reduced reachable count.
    const [r, c] = path![path!.length - 2];
    const [nr, nc] = path![path!.length - 1];
    const cut = RAW_DIRS.find((d) => d.dr === nr - r && d.dc === nc - c)!;
    walls[r][c] &= ~cut.bit;
    walls[nr][nc] &= ~cut.back;
    const broken = auditMaze(walls, size);
    expect(broken.path).toBeNull();
    expect(broken.reached).toBeLessThan(size * size);
    expect(broken.wallFaults).toEqual([]);
  });

  it("a one-sided passage bit is reported as not mirrored", () => {
    const size = 11;
    const walls = make(size, "self-check");
    // Open E on (0,0) without opening W on (0,1); if that passage already
    // exists, close only the (0,1) side instead. Either way one side disagrees.
    if (!(walls[0][0] & 2)) {
      walls[0][0] |= 2;
    } else {
      walls[0][1] &= ~8;
    }
    const broken = auditMaze(walls, size);
    expect(broken.wallFaults.some((f) => f.includes("not mirrored"))).toBe(true);
  });
});
