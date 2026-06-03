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
import { makeRng } from "~/utils/rng";

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

  it("returns false for the initial (scrambled) grid when at least one cell differs", () => {
    // Most seeds will produce a scrambled start ≠ solved
    let checkedFalse = 0;
    for (const seed of ["seed-1", "seed-2", "seed-3", "seed-4", "seed-5"]) {
      const { initial, solved, srcR, srcC, size: G } = generateGrid(7, makeRng(seed));
      // If initial equals solved (all rotations happened to be 0), skip.
      const same = initial.every((row, r) => row.every((m, c) => m === solved[r][c]));
      if (!same) {
        expect(isSolved(initial, G, srcR, srcC)).toBe(false);
        checkedFalse++;
      }
    }
    // Ensure we actually tested at least one seed
    expect(checkedFalse).toBeGreaterThan(0);
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
