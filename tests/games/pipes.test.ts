import { describe, it, expect } from "vitest";
import {
  N, E, S, W,
  ALL_DIRS,
  DR, DC, OPP,
  rotateCW,
  rotateCWK,
  generateGrid,
  computePowered,
  isSolved,
} from "~/games/pipes";
import { makeRng, todaySeed } from "~/utils/rng";

// ---- rotateCW ----
describe("rotateCW", () => {
  it("N→E→S→W→N in four steps (single bit)", () => {
    expect(rotateCW(N)).toBe(E);
    expect(rotateCW(E)).toBe(S);
    expect(rotateCW(S)).toBe(W);
    expect(rotateCW(W)).toBe(N);
  });

  it("four CW rotations return to the original mask (all single-bit dirs)", () => {
    for (const d of ALL_DIRS) {
      let m = d;
      for (let i = 0; i < 4; i++) m = rotateCW(m);
      expect(m).toBe(d);
    }
  });

  it("four CW rotations return to original for multi-bit masks", () => {
    const masks = [N | E, N | S, E | W, N | E | S, N | E | S | W, N | W | S];
    for (const mask of masks) {
      let m = mask;
      for (let i = 0; i < 4; i++) m = rotateCW(m);
      expect(m).toBe(mask);
    }
  });

  it("correctly rotates N|S (straight pipe) 90° to E|W", () => {
    expect(rotateCW(N | S)).toBe(E | W);
  });

  it("correctly rotates N|E (elbow) 90° to E|S", () => {
    expect(rotateCW(N | E)).toBe(E | S);
  });

  it("correctly rotates T-piece N|E|W 90° to N|E|S", () => {
    // N→E, E→S, W→N → result has E|S|N = N|E|S
    expect(rotateCW(N | E | W)).toBe(N | E | S);
  });

  it("all-four-bit mask is unchanged by rotation (cross)", () => {
    expect(rotateCW(N | E | S | W)).toBe(N | E | S | W);
  });

  it("zero mask stays zero", () => {
    expect(rotateCW(0)).toBe(0);
  });
});

// ---- rotateCWK ----
describe("rotateCWK", () => {
  it("k=0 returns unchanged", () => {
    expect(rotateCWK(N | E, 0)).toBe(N | E);
  });

  it("k=1 equals one rotateCW", () => {
    expect(rotateCWK(N | S, 1)).toBe(rotateCW(N | S));
  });

  it("k=4 is identity (same as k=0)", () => {
    for (const mask of [N, E | W, N | E | S]) {
      expect(rotateCWK(mask, 4)).toBe(mask);
    }
  });

  it("k=2 is a 180° rotation: N↔S, E↔W", () => {
    expect(rotateCWK(N, 2)).toBe(S);
    expect(rotateCWK(E, 2)).toBe(W);
    expect(rotateCWK(N | E, 2)).toBe(S | W);
  });
});

// ---- Direction primitives ----
describe("direction constants", () => {
  it("N,E,S,W are distinct powers of two (non-overlapping bitmask bits)", () => {
    const dirs = [N, E, S, W];
    expect(new Set(dirs).size).toBe(4);
    for (const d of dirs) {
      // Each is a single bit (power of 2)
      expect(d & (d - 1)).toBe(0);
      expect(d).toBeGreaterThan(0);
    }
  });

  it("OPP is an involution: OPP[OPP[d]] === d", () => {
    for (const d of ALL_DIRS) {
      expect(OPP[OPP[d]]).toBe(d);
    }
  });

  it("OPP pairs are N↔S and E↔W", () => {
    expect(OPP[N]).toBe(S);
    expect(OPP[S]).toBe(N);
    expect(OPP[E]).toBe(W);
    expect(OPP[W]).toBe(E);
  });

  it("DR/DC deltas are orthogonal (no diagonal moves)", () => {
    for (const d of ALL_DIRS) {
      // Exactly one of DR[d]/DC[d] is non-zero
      expect(Math.abs(DR[d]) + Math.abs(DC[d])).toBe(1);
    }
  });

  it("moving in direction d then OPP[d] returns to origin", () => {
    for (const d of ALL_DIRS) {
      expect(DR[d] + DR[OPP[d]]).toBe(0);
      expect(DC[d] + DC[OPP[d]]).toBe(0);
    }
  });
});

// ---- generateGrid ----
describe("generateGrid", () => {
  const SIZES = [5, 7, 9];
  const SEEDS = ["test-seed-1", "test-seed-2", "pipes-42", "2026-06-03"];

  it("is deterministic: same seed → same grids", () => {
    for (const seed of SEEDS) {
      const a = generateGrid(7, makeRng(seed));
      const b = generateGrid(7, makeRng(seed));
      expect(a.solved).toEqual(b.solved);
      expect(a.initial).toEqual(b.initial);
    }
  });

  it("different seeds produce different grids (statistical sanity)", () => {
    const g1 = generateGrid(7, makeRng("seed-a"));
    const g2 = generateGrid(7, makeRng("seed-b"));
    // Very unlikely to be equal for a 7×7 grid
    expect(g1.solved).not.toEqual(g2.solved);
  });

  it("source is at the centre of the grid", () => {
    for (const G of SIZES) {
      const { srcR, srcC, size } = generateGrid(G, makeRng("centre-test"));
      expect(size).toBe(G);
      expect(srcR).toBe(Math.floor(G / 2));
      expect(srcC).toBe(Math.floor(G / 2));
    }
  });

  it("grid dimensions are G×G", () => {
    for (const G of SIZES) {
      const { solved, initial } = generateGrid(G, makeRng("dims"));
      expect(solved).toHaveLength(G);
      expect(initial).toHaveLength(G);
      for (let r = 0; r < G; r++) {
        expect(solved[r]).toHaveLength(G);
        expect(initial[r]).toHaveLength(G);
      }
    }
  });

  it("all cells in solved grid are non-zero (spanning tree reaches every cell)", () => {
    for (const G of SIZES) {
      for (const seed of SEEDS) {
        const { solved } = generateGrid(G, makeRng(seed));
        for (let r = 0; r < G; r++) {
          for (let c = 0; c < G; c++) {
            expect(solved[r][c], `cell [${r}][${c}] in seed ${seed}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("solved grid has only mutual connections (if A→B then B→A)", () => {
    for (const G of SIZES) {
      for (const seed of SEEDS) {
        const { solved } = generateGrid(G, makeRng(seed));
        for (let r = 0; r < G; r++) {
          for (let c = 0; c < G; c++) {
            for (const d of ALL_DIRS) {
              if (!(solved[r][c] & d)) continue;
              const nr = r + DR[d];
              const nc = c + DC[d];
              // Must be in-bounds (spanning tree never points off-grid)
              expect(
                nr >= 0 && nr < G && nc >= 0 && nc < G,
                `cell [${r}][${c}] dir ${d} points off-grid in seed ${seed}`
              ).toBe(true);
              // Neighbour must point back
              expect(
                solved[nr][nc] & OPP[d],
                `[${r}][${c}]→[${nr}][${nc}] not mutual, seed ${seed}`
              ).toBeTruthy();
            }
          }
        }
      }
    }
  });

  it("no connector in solved grid points off-grid", () => {
    for (const G of SIZES) {
      for (const seed of SEEDS) {
        const { solved } = generateGrid(G, makeRng(seed));
        for (let r = 0; r < G; r++) {
          for (let c = 0; c < G; c++) {
            for (const d of ALL_DIRS) {
              if (!(solved[r][c] & d)) continue;
              const nr = r + DR[d];
              const nc = c + DC[d];
              expect(nr >= 0 && nr < G && nc >= 0 && nc < G).toBe(true);
            }
          }
        }
      }
    }
  });

  it("initial scrambled masks differ from solved for most cells (scrambling happened)", () => {
    // Count mismatches: should be non-zero across seeds
    let totalMismatch = 0;
    for (const seed of SEEDS) {
      const { solved, initial } = generateGrid(7, makeRng(seed));
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (solved[r][c] !== initial[r][c]) totalMismatch++;
        }
      }
    }
    // For 4 seeds × 49 cells, at least a third should be scrambled
    expect(totalMismatch).toBeGreaterThan(40);
  });

  it("initial masks are obtainable by rotating the solved masks (0–3 CW)", () => {
    for (const seed of SEEDS) {
      const { solved, initial, size: G } = generateGrid(7, makeRng(seed));
      for (let r = 0; r < G; r++) {
        for (let c = 0; c < G; c++) {
          // One of the 4 rotation counts must reproduce initial from solved
          const reachable = [0, 1, 2, 3].map((k) => rotateCWK(solved[r][c], k));
          expect(reachable, `[${r}][${c}] initial not a rotation of solved`).toContain(
            initial[r][c]
          );
        }
      }
    }
  });
});

// ---- computePowered ----
describe("computePowered", () => {
  it("with a trivial 1×1 grid the single source cell is always powered", () => {
    // A 1×1 grid: one cell with mask 0 (no connectors), at (0,0) = source.
    const pw = computePowered([[0]], 1, 0, 0);
    expect(pw[0][0]).toBe(true);
  });

  it("solved grid: every cell is powered", () => {
    for (const seed of ["seed-1", "seed-2", "pipes-test"]) {
      const { solved, srcR, srcC, size: G } = generateGrid(7, makeRng(seed));
      const pw = computePowered(solved, G, srcR, srcC);
      for (let r = 0; r < G; r++) {
        for (let c = 0; c < G; c++) {
          expect(pw[r][c], `[${r}][${c}] not powered in solved grid (seed ${seed})`).toBe(true);
        }
      }
    }
  });

  it("2×2 grid: manually constructed — only source is powered when no mutual connection", () => {
    // Source at (0,0). Cell (0,1) has W=8 pointing back but (0,0) has no E.
    // (0,0) = N (points up, off-grid), (0,1) = W only, (1,0) = N only, (1,1) = 0
    const cells = [
      [N, W],
      [N, 0],
    ];
    const pw = computePowered(cells, 2, 0, 0);
    // (0,0) is always the source
    expect(pw[0][0]).toBe(true);
    // (0,1) has W but (0,0) doesn't have E — not connected
    expect(pw[0][1]).toBe(false);
  });

  it("2×2 fully connected ring: all cells powered", () => {
    // A ring: (0,0)→E, (0,1)→S, (1,1)→W, (1,0)→N
    // Each tile also needs the opposite of the direction its neighbour uses.
    // Let's build a spanning tree manually:
    // (0,0): E+S  meaning it connects East (to 0,1) and South (to 1,0)
    // (0,1): W+S  meaning it connects West (back to 0,0) and South (to 1,1)
    // (1,0): N+E  meaning it connects North (back to 0,0) and East (to 1,1)
    // (1,1): N+W  meaning it connects North (back to 0,1) and West (back to 1,0)
    const cells = [
      [E | S, W | S],
      [N | E, N | W],
    ];
    const pw = computePowered(cells, 2, 0, 0);
    expect(pw[0][0]).toBe(true);
    expect(pw[0][1]).toBe(true);
    expect(pw[1][0]).toBe(true);
    expect(pw[1][1]).toBe(true);
  });
});

// ---- isSolved ----
describe("isSolved", () => {
  it("solved grid returns true", () => {
    for (const seed of ["abc", "xyz", "pipes-win"]) {
      const { solved, srcR, srcC, size: G } = generateGrid(7, makeRng(seed));
      expect(isSolved(solved, G, srcR, srcC)).toBe(true);
    }
  });

  it("returns false for the initial (scrambled) grid", () => {
    // This used to skip seeds whose scramble coincided with the solution.
    // generateGrid now nudges such a scramble one extra quarter turn (see the
    // "scramble guard" suite below), so the start is never a winning layout.
    for (const seed of ["seed-1", "seed-2", "seed-3", "seed-4", "seed-5"]) {
      const { initial, srcR, srcC, size: G } = generateGrid(7, makeRng(seed));
      expect(isSolved(initial, G, srcR, srcC), `seed ${seed}`).toBe(false);
    }
  });

  it("rotating one tile away from solution breaks isSolved", () => {
    const { solved, srcR, srcC, size: G } = generateGrid(5, makeRng("break-test"));
    // Deep copy and rotate one tile
    const broken = solved.map((row) => [...row]);
    // Find a tile that is not all-four (cross) — rotating a cross still passes
    let rotated = false;
    outer: for (let r = 0; r < G; r++) {
      for (let c = 0; c < G; c++) {
        const m = solved[r][c];
        // Skip the full cross (rotation-invariant) and source (would still be powered, test below)
        if (m === (N | E | S | W)) continue;
        // Rotate once: if it changes, the grid is broken
        const newM = rotateCW(m);
        if (newM !== m) {
          broken[r][c] = newM;
          rotated = true;
          break outer;
        }
      }
    }
    expect(rotated).toBe(true);
    expect(isSolved(broken, G, srcR, srcC)).toBe(false);
  });

  it("returns false when a connector points off-grid", () => {
    // 3×3 grid: manually put a connector pointing north from top row
    const cells = Array.from({ length: 3 }, () => new Array(3).fill(0));
    // Source at (1,1); give (0,1) a North connector (points off-grid)
    cells[1][1] = N; // source points North
    cells[0][1] = S | N; // connects South (back to source) but also North (off-grid!)
    expect(isSolved(cells, 3, 1, 1)).toBe(false);
  });

  it("returns false when not all cells are powered (disconnected component)", () => {
    // 3×3: source at (1,1) with a loop that doesn't reach (0,0)
    const cells = Array.from({ length: 3 }, () => new Array(3).fill(0));
    // Give each cell mask 0 (no connections) except source
    // Source alone → only (1,1) powered → fails condition B
    cells[1][1] = 0;
    expect(isSolved(cells, 3, 1, 1)).toBe(false);
  });

  it("full round-trip: generate, verify solved, rotate one tile, unrotate, verify solved again", () => {
    const { solved, srcR, srcC, size: G } = generateGrid(5, makeRng("roundtrip"));
    expect(isSolved(solved, G, srcR, srcC)).toBe(true);

    // Find a non-invariant tile
    let testR = -1, testC = -1, origMask = 0;
    outer: for (let r = 0; r < G; r++) {
      for (let c = 0; c < G; c++) {
        const m = solved[r][c];
        if (rotateCW(m) !== m) { testR = r; testC = c; origMask = m; break outer; }
      }
    }
    expect(testR).toBeGreaterThanOrEqual(0);

    const cells = solved.map((row) => [...row]);
    cells[testR][testC] = rotateCW(origMask);
    expect(isSolved(cells, G, srcR, srcC)).toBe(false);

    // Restore
    cells[testR][testC] = origMask;
    expect(isSolved(cells, G, srcR, srcC)).toBe(true);
  });
});

// ---- Connectivity invariant across sizes ----
describe("connectivity invariant", () => {
  it("generateGrid produces fully-connected grids for all supported sizes", () => {
    const SEEDS = ["alpha", "beta", "gamma", "delta", "epsilon"];
    for (const G of [5, 7, 9]) {
      for (const seed of SEEDS) {
        const { solved, srcR, srcC } = generateGrid(G, makeRng(seed));
        const pw = computePowered(solved, G, srcR, srcC);
        let unpowered = 0;
        for (let r = 0; r < G; r++) {
          for (let c = 0; c < G; c++) {
            if (!pw[r][c]) unpowered++;
          }
        }
        expect(unpowered, `${G}×${G} grid seed ${seed} has ${unpowered} unpowered cells`).toBe(0);
      }
    }
  });

  it("isSolved is true for the solved output of generateGrid across all sizes", () => {
    for (const G of [5, 7, 9]) {
      for (const seed of ["s1", "s2", "s3"]) {
        const { solved, srcR, srcC } = generateGrid(G, makeRng(seed));
        expect(isSolved(solved, G, srcR, srcC), `${G}×${G} seed ${seed}`).toBe(true);
      }
    }
  });
});

// =========================================================================
// Independent verifier + solver, written from the rules shown to the player
// =========================================================================
//
// The side panel says: tap to rotate a tile; connect every pipe, leave no open
// end, and make the whole board reach the central source. Encoded here without
// calling computePowered/isSolved, so the two implementations check each other:
//   (1) every connector meets a matching connector on the neighbouring tile —
//       no open end, nothing pointing off the board;
//   (2) walking along matched connectors from the source visits every tile.
// Nothing compares against the stored solution: any layout obeying (1)+(2) wins.

const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;

/** Quarter turn clockwise, written independently of rotateCW. */
function turn(mask: number): number {
  return (
    (mask & UP ? RIGHT : 0) |
    (mask & RIGHT ? DOWN : 0) |
    (mask & DOWN ? LEFT : 0) |
    (mask & LEFT ? UP : 0)
  );
}

/** The distinct masks a tile can show by rotating it (1, 2 or 4 of them). */
function orientations(mask: number): number[] {
  const out: number[] = [];
  let m = mask;
  for (let k = 0; k < 4; k++) {
    if (!out.includes(m)) out.push(m);
    m = turn(m);
  }
  return out;
}

/** Rules (1) + (2). */
function verifyRules(cells: number[][], G: number, sr: number, sc: number): boolean {
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      const m = cells[r][c];
      if ((m & UP) && (r === 0 || !(cells[r - 1][c] & DOWN))) return false;
      if ((m & DOWN) && (r === G - 1 || !(cells[r + 1][c] & UP))) return false;
      if ((m & LEFT) && (c === 0 || !(cells[r][c - 1] & RIGHT))) return false;
      if ((m & RIGHT) && (c === G - 1 || !(cells[r][c + 1] & LEFT))) return false;
    }
  }
  const seen = new Set<number>([sr * G + sc]);
  const stack = [sr * G + sc];
  while (stack.length) {
    const i = stack.pop()!;
    const r = Math.floor(i / G);
    const c = i % G;
    const m = cells[r][c];
    // Rule (1) already holds, so every connector leads to an in-grid tile that points back.
    const next = [
      m & UP ? i - G : -1,
      m & DOWN ? i + G : -1,
      m & LEFT ? i - 1 : -1,
      m & RIGHT ? i + 1 : -1,
    ];
    for (const j of next) {
      if (j >= 0 && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === G * G;
}

/**
 * Backtracking solver over per-tile rotations. Tiles are fixed in row-major
 * order; a candidate orientation must agree with the fixed tiles above and to
 * the left and must not point off the board. Once a tile is boxed in by fixed
 * tiles, its group is inspected: a group with no connector left toward an
 * unfixed tile can never grow, so it must be the source's group and must
 * already hold every tile — otherwise the branch is dead. Returns up to `limit`
 * layouts satisfying verifyRules.
 */
function solveAll(start: number[][], G: number, sr: number, sc: number, limit = 1): number[][][] {
  const n = G * G;
  const cur = new Array<number>(n).fill(0);
  const fixed = new Array<boolean>(n).fill(false);
  const options = start.flat().map(orientations);
  const found: number[][][] = [];

  function groupIsDeadEnd(from: number): boolean {
    const seen = new Set<number>([from]);
    const stack = [from];
    while (stack.length) {
      const i = stack.pop()!;
      const r = Math.floor(i / G);
      const c = i % G;
      const m = cur[i];
      const next = [
        m & UP ? i - G : -1,
        m & DOWN ? i + G : -1,
        m & LEFT ? i - 1 : -1,
        m & RIGHT ? i + 1 : -1,
      ];
      for (const j of next) {
        if (j < 0) continue;
        if (!fixed[j]) return false; // still open toward an unfixed tile
        if (!seen.has(j)) {
          seen.add(j);
          stack.push(j);
        }
      }
    }
    return !seen.has(sr * G + sc) || seen.size !== n;
  }

  function place(i: number): boolean {
    if (i === n) {
      const grid = Array.from({ length: G }, (_, r) => cur.slice(r * G, r * G + G));
      if (verifyRules(grid, G, sr, sc)) found.push(grid);
      return found.length >= limit;
    }
    const r = Math.floor(i / G);
    const c = i % G;
    const needUp = r > 0 && (cur[i - G] & DOWN) !== 0;
    const needLeft = c > 0 && (cur[i - 1] & RIGHT) !== 0;
    for (const m of options[i]) {
      if (((m & UP) !== 0) !== needUp) continue;
      if (((m & LEFT) !== 0) !== needLeft) continue;
      if (r === G - 1 && (m & DOWN)) continue;
      if (c === G - 1 && (m & RIGHT)) continue;
      cur[i] = m;
      fixed[i] = true;
      // The tile above is now boxed in; at the end of a row so is this tile.
      const dead = (r > 0 && groupIsDeadEnd(i - G)) || (c === G - 1 && groupIsDeadEnd(i));
      if (!dead && place(i + 1)) return true;
      fixed[i] = false;
    }
    return false;
  }

  place(0);
  return found;
}

const sameGrid = (a: number[][], b: number[][]) =>
  a.every((row, r) => row.every((m, c) => m === b[r][c]));

/** Rotate the first tile whose shape changes under a quarter turn; returns the copy. */
function breakOneTile(cells: number[][]): number[][] {
  const out = cells.map((row) => [...row]);
  for (let r = 0; r < out.length; r++) {
    for (let c = 0; c < out[r].length; c++) {
      if (turn(out[r][c]) !== out[r][c]) {
        out[r][c] = turn(out[r][c]);
        return out;
      }
    }
  }
  throw new Error("no rotatable tile");
}

// Sizes exactly as PipesGame.vue offers them: 簡單 5×5, 普通 7×7, 困難 9×9;
// the Daily Challenge (props.daily) always uses 7×7 with a "YYYY-MM-DD" seed.
const UI_SIZES = [5, 7, 9];
const DAILY_SIZE = 7;
const SWEEP_SEEDS = Array.from({ length: 300 }, (_, i) => `pipes-${i}`);
const DAILY_SEEDS: string[] = [];
for (const y of [2025, 2026, 2027]) {
  for (let d = new Date(y, 0, 1); d.getFullYear() === y; d.setDate(d.getDate() + 1)) {
    DAILY_SEEDS.push(todaySeed(d));
  }
}

describe("independent verifier matches the module's encoding", () => {
  it("uses the same direction bits as the module", () => {
    expect([UP, RIGHT, DOWN, LEFT]).toEqual([N, E, S, W]);
  });

  it("turn() agrees with rotateCW for every 4-bit mask", () => {
    for (let m = 0; m < 16; m++) expect(turn(m)).toBe(rotateCW(m));
  });

  it("orientations(): cross 1, straight 2, everything else 4 (empty tile 1)", () => {
    expect(orientations(N | E | S | W)).toHaveLength(1);
    expect(orientations(N | S)).toHaveLength(2);
    expect(orientations(E | W)).toHaveLength(2);
    expect(orientations(N)).toHaveLength(4);
    expect(orientations(N | E)).toHaveLength(4);
    expect(orientations(N | E | S)).toHaveLength(4);
    expect(orientations(0)).toEqual([0]);
  });

  it("verifyRules agrees with isSolved on hand-made layouts", () => {
    // 2×2 path, source at (1,1) — wins.
    const path = [
      [E, W | S],
      [E, N | W],
    ];
    // Two mutual pairs, but the top pair never reaches the source — no win.
    const twoIslands = [
      [E, W],
      [E, W],
    ];
    // Everything reaches the source, but (0,0) has an open end pointing up.
    const openEnd = [
      [N | E, W | S],
      [E, N | W],
    ];
    // (0,1) points down at a tile that does not point back.
    const mismatch = [
      [E, W | S],
      [E, W],
    ];
    for (const [cells, win] of [
      [path, true],
      [twoIslands, false],
      [openEnd, false],
      [mismatch, false],
    ] as [number[][], boolean][]) {
      expect(verifyRules(cells, 2, 1, 1)).toBe(win);
      expect(isSolved(cells, 2, 1, 1)).toBe(win);
    }
  });

  it("solver finds the unique layout of a scrambled 2×2 path and none for an impossible board", () => {
    const scrambled = [
      [S, N | E],
      [W, S | E],
    ];
    const sols = solveAll(scrambled, 2, 1, 1, 10);
    expect(sols).toHaveLength(1);
    expect(sols[0]).toEqual([
      [E, W | S],
      [E, N | W],
    ]);
    // A T-piece needs three in-grid neighbours; a 2×2 corner has two.
    const impossible = [
      [N | E | S, W],
      [E, W],
    ];
    expect(solveAll(impossible, 2, 1, 1, 10)).toHaveLength(0);
  });
});

describe("every generated puzzle is solvable and the win check accepts the solutions", () => {
  it(`300 seeds × ${UI_SIZES.join("/")}: solver finds a layout; isSolved agrees; start is unsolved`, () => {
    let puzzles = 0;
    for (const G of UI_SIZES) {
      for (const seed of SWEEP_SEEDS) {
        const { solved, initial, srcR, srcC, size } = generateGrid(G, makeRng(seed));
        const tag = `${G}×${G} seed ${seed}`;
        expect(size).toBe(G);
        // (d) nothing degenerate: every tile carries 1–4 pipe ends, and the total
        // number of ends is exactly two per spanning-tree edge.
        let ends = 0;
        for (let r = 0; r < G; r++) {
          for (let c = 0; c < G; c++) {
            expect(solved[r][c], `${tag} solved[${r}][${c}]`).toBeGreaterThanOrEqual(1);
            expect(solved[r][c], `${tag} solved[${r}][${c}]`).toBeLessThanOrEqual(15);
            ends += ALL_DIRS.filter((d) => solved[r][c] & d).length;
            expect(orientations(solved[r][c]), `${tag} initial[${r}][${c}]`).toContain(initial[r][c]);
          }
        }
        expect(ends, `${tag} pipe ends`).toBe(2 * (G * G - 1));
        // (a) the independent solver finds a valid layout from the scrambled start.
        const sols = solveAll(initial, G, srcR, srcC, 1);
        expect(sols, `${tag} has no solution`).toHaveLength(1);
        expect(verifyRules(sols[0], G, srcR, srcC), `${tag} solver layout`).toBe(true);
        // (b) the win check accepts the solver's layout and the stored solution …
        expect(isSolved(sols[0], G, srcR, srcC), `${tag} isSolved(solver layout)`).toBe(true);
        expect(verifyRules(solved, G, srcR, srcC), `${tag} stored solution`).toBe(true);
        expect(isSolved(solved, G, srcR, srcC), `${tag} isSolved(stored)`).toBe(true);
        // … and rejects a layout that is one quarter turn away from winning.
        expect(isSolved(breakOneTile(sols[0]), G, srcR, srcC), `${tag} broken layout`).toBe(false);
        // (c) the scrambled start is never already a win.
        expect(verifyRules(initial, G, srcR, srcC), `${tag} start`).toBe(false);
        expect(isSolved(initial, G, srcR, srcC), `${tag} isSolved(start)`).toBe(false);
        puzzles++;
      }
    }
    expect(puzzles).toBe(UI_SIZES.length * SWEEP_SEEDS.length);
  });

  it(`Daily Challenge: every "YYYY-MM-DD" seed of 2025–2027 at ${DAILY_SIZE}×${DAILY_SIZE} is solvable and starts unsolved`, () => {
    expect(DAILY_SEEDS.length).toBe(365 * 3);
    for (const seed of DAILY_SEEDS) {
      const { solved, initial, srcR, srcC } = generateGrid(DAILY_SIZE, makeRng(seed));
      const sols = solveAll(initial, DAILY_SIZE, srcR, srcC, 1);
      expect(sols, `daily ${seed} has no solution`).toHaveLength(1);
      expect(isSolved(sols[0], DAILY_SIZE, srcR, srcC), `daily ${seed}`).toBe(true);
      expect(isSolved(solved, DAILY_SIZE, srcR, srcC), `daily ${seed} stored`).toBe(true);
      expect(isSolved(initial, DAILY_SIZE, srcR, srcC), `daily ${seed} start`).toBe(false);
    }
  });

  it("the same daily seed reproduces the same puzzle (shared challenge)", () => {
    const a = generateGrid(DAILY_SIZE, makeRng("2026-08-29"));
    const b = generateGrid(DAILY_SIZE, makeRng("2026-08-29"));
    expect(a).toEqual(b);
  });
});

describe("win check accepts any layout that obeys the rules, not just the stored one", () => {
  // A 3×3 "pinwheel": cross in the centre, an elbow on each side, a leaf in each
  // corner. Each elbow can hook either adjacent corner, so the mirror image of
  // the pinwheel is a second, equally valid layout of the very same tiles.
  //
  //
  //     A:  ╻ ┏━╸        B:  ╺━┓ ╻
  //         ┗━╋━┓            ┏━╋━┛
  //         ╺━┛ ╹            ╹ ┗━╸
  const PINWHEEL_A = [
    [S, E | S, W],
    [N | E, N | E | S | W, S | W],
    [E, N | W, N],
  ];
  const PINWHEEL_B = [
    [E, S | W, S],
    [E | S, N | E | S | W, N | W],
    [N, N | E, W],
  ];

  it("both pinwheel layouts satisfy the rules and the win check", () => {
    expect(sameGrid(PINWHEEL_A, PINWHEEL_B)).toBe(false);
    for (const layout of [PINWHEEL_A, PINWHEEL_B]) {
      expect(verifyRules(layout, 3, 1, 1)).toBe(true);
      expect(isSolved(layout, 3, 1, 1)).toBe(true);
    }
    // Same tile shapes cell by cell.
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(orientations(PINWHEEL_A[r][c])).toContain(PINWHEEL_B[r][c]);
      }
    }
  });

  it("the solver finds exactly these two layouts from a scrambled pinwheel", () => {
    const scrambled = PINWHEEL_A.map((row) => row.map((m) => turn(turn(m))));
    expect(isSolved(scrambled, 3, 1, 1)).toBe(false);
    const sols = solveAll(scrambled, 3, 1, 1, 10);
    expect(sols).toHaveLength(2);
    expect(sols.some((s) => sameGrid(s, PINWHEEL_A))).toBe(true);
    expect(sols.some((s) => sameGrid(s, PINWHEEL_B))).toBe(true);
  });

  it("generated puzzles with two valid layouts: isSolved accepts the one that is not stored", () => {
    // With the current generator, 7×7 seeds pipes-188 / pipes-190 / pipes-241
    // and 9×9 seed pipes-145 each admit a second layout (all other sweep
    // puzzles are unique). The player may build either one and must win.
    let withAlternative = 0;
    for (const G of UI_SIZES) {
      for (const seed of SWEEP_SEEDS) {
        const { solved, initial, srcR, srcC } = generateGrid(G, makeRng(seed));
        const sols = solveAll(initial, G, srcR, srcC, 8);
        expect(sols.some((s) => sameGrid(s, solved)), `${G}×${G} ${seed}: stored solution not found`).toBe(true);
        for (const s of sols) {
          if (sameGrid(s, solved)) continue;
          withAlternative++;
          expect(verifyRules(s, G, srcR, srcC), `${G}×${G} ${seed} alternative`).toBe(true);
          expect(isSolved(s, G, srcR, srcC), `${G}×${G} ${seed}: isSolved rejects a valid alternative`).toBe(true);
        }
      }
    }
    expect(withAlternative).toBeGreaterThanOrEqual(1);
  });
});

describe("scramble guard: the player never starts on a winning layout", () => {
  it("2×2 seed 539: the raw scramble coincided with the solution and is nudged one quarter turn", () => {
    // Found by scanning numeric seeds: without the guard, seed 539 (and the
    // string seed "s157") scrambles [[E|S, S|W],[N, N]] by 0 turns everywhere.
    for (const seed of [539, "s157"]) {
      const { solved, initial, srcR, srcC } = generateGrid(2, makeRng(seed));
      expect(solved).toEqual([
        [E | S, S | W],
        [N, N],
      ]);
      // (0,0) is the first tile that changes under a quarter turn, so it is the one nudged.
      expect(initial).toEqual([
        [rotateCW(E | S), S | W],
        [N, N],
      ]);
      expect(isSolved(initial, 2, srcR, srcC)).toBe(false);
      expect(verifyRules(initial, 2, srcR, srcC)).toBe(false);
      // Still solvable: rotating (0,0) back wins, and the solver agrees.
      const sols = solveAll(initial, 2, srcR, srcC, 5);
      expect(sols).toHaveLength(1);
      expect(sols[0]).toEqual(solved);
    }
  });

  it("3×3 seed \"s8413\": same guard on a larger board", () => {
    const { solved, initial, srcR, srcC } = generateGrid(3, makeRng("s8413"));
    expect(solved).toEqual([
      [E, E | W, S | W],
      [E | S, W, N | S],
      [N | E, E | W, N | W],
    ]);
    expect(initial).toEqual([
      [rotateCW(E), E | W, S | W],
      [E | S, W, N | S],
      [N | E, E | W, N | W],
    ]);
    expect(isSolved(initial, 3, srcR, srcC)).toBe(false);
    expect(solveAll(initial, 3, srcR, srcC, 5)).toEqual([solved]);
  });

  it("no seed in 0..2999 starts solved on 2×2, 3×3 or 4×4 boards", () => {
    // Without the guard roughly 1 in 256 2×2 scrambles would start solved.
    for (const G of [2, 3, 4]) {
      for (let seed = 0; seed < 3000; seed++) {
        const { initial, srcR, srcC } = generateGrid(G, makeRng(seed));
        expect(isSolved(initial, G, srcR, srcC), `${G}×${G} seed ${seed}`).toBe(false);
      }
    }
  });

  it("1×1 board (never offered by the UI) is a single empty tile and trivially solved", () => {
    const grid = generateGrid(1, makeRng("one"));
    expect(grid).toEqual({ size: 1, solved: [[0]], initial: [[0]], srcR: 0, srcC: 0 });
    // Nothing to connect and no tile whose shape changes under rotation, so
    // the guard has nothing to nudge and the board stays trivially solved.
    expect(isSolved(grid.initial, 1, 0, 0)).toBe(true);
  });
});
