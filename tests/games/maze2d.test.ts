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
