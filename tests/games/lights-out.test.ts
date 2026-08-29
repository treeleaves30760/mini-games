import { describe, it, expect } from "vitest";
import {
  applyPress,
  pressCell,
  isWon,
  generateBoard,
  generateBoardFromSeed,
} from "~/games/lights-out";
import type { Rng } from "~/utils/rng";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an N×N all-off board. */
function allOff(N: number): number[] {
  return new Array(N * N).fill(0);
}

/** Build an N×N all-on board. */
function allOn(N: number): number[] {
  return new Array(N * N).fill(1);
}

/** Apply a list of (r, c) presses in sequence on a copy of the board. */
function applyPresses(
  board: number[],
  presses: Array<[number, number]>,
  N: number,
): number[] {
  const b = [...board];
  for (const [r, c] of presses) applyPress(b, r, c, N);
  return b;
}

/**
 * Stub Rng whose int() hands out the given values in order (cycling), so a
 * test can force an exact press sequence. Everything else is inert.
 */
function stubRng(ints: number[]): Rng {
  let i = 0;
  return {
    next: () => 0,
    int: () => ints[i++ % ints.length]!,
    float: () => 0,
    bool: () => false,
    pick: <T>(arr: T[]) => arr[0]!,
    shuffle: <T>(arr: T[]) => arr,
  };
}

// ---------------------------------------------------------------------------
// Independent solver — Gaussian elimination over GF(2)
//
// Deliberately written without touching the game module's press logic so it
// can act as an oracle: it builds the N²×N² toggle matrix from scratch,
// decides solvability, and enumerates the kernel to find a minimum-press
// solution. (On 5×5 the kernel has dimension 2, i.e. 4 solutions per solvable
// board and only 1 in 4 boards solvable — the reason generation must go
// through presses rather than random cell values.)
// ---------------------------------------------------------------------------

/** Toggle matrix: row i = which presses flip cell i (itself + 4 neighbours). */
function buildMatrix(N: number): number[][] {
  const n = N * N;
  const A: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = new Array(n).fill(0);
    const r = Math.floor(i / N);
    const c = i % N;
    row[i] = 1;
    if (r > 0) row[i - N] = 1;
    if (r < N - 1) row[i + N] = 1;
    if (c > 0) row[i - 1] = 1;
    if (c < N - 1) row[i + 1] = 1;
    A.push(row);
  }
  return A;
}

/**
 * Solve A·x = b over GF(2). Returns null when inconsistent, otherwise one
 * particular solution plus a basis of the kernel (all solutions = x + span).
 */
function solveGF2(
  A: number[][],
  b: number[],
): { x: number[]; kernel: number[][] } | null {
  const m = A.length;
  const n = A[0]!.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  const pivotCol: number[] = [];
  let rank = 0;
  for (let col = 0; col < n && rank < m; col++) {
    let p = -1;
    for (let r = rank; r < m; r++) {
      if (M[r]![col]) {
        p = r;
        break;
      }
    }
    if (p < 0) continue;
    [M[rank], M[p]] = [M[p]!, M[rank]!];
    for (let r = 0; r < m; r++) {
      if (r !== rank && M[r]![col]) {
        for (let k = col; k <= n; k++) M[r]![k] ^= M[rank]![k]!;
      }
    }
    pivotCol.push(col);
    rank++;
  }
  // A zero row with a 1 on the right-hand side means "no solution".
  for (let r = rank; r < m; r++) if (M[r]![n]) return null;

  const isPivot: boolean[] = new Array(n).fill(false);
  for (const c of pivotCol) isPivot[c] = true;
  const x: number[] = new Array(n).fill(0);
  for (let r = 0; r < rank; r++) x[pivotCol[r]!] = M[r]![n]!;
  const kernel: number[][] = [];
  for (let f = 0; f < n; f++) {
    if (isPivot[f]) continue;
    const v: number[] = new Array(n).fill(0);
    v[f] = 1;
    for (let r = 0; r < rank; r++) if (M[r]![f]) v[pivotCol[r]!] = 1;
    kernel.push(v);
  }
  return { x, kernel };
}

function weight(v: number[]): number {
  return v.reduce((a, b) => a + b, 0);
}

const matrixCache = new Map<number, number[][]>();
function matrixFor(N: number): number[][] {
  let A = matrixCache.get(N);
  if (!A) {
    A = buildMatrix(N);
    matrixCache.set(N, A);
  }
  return A;
}

/** Kernel dimension of the N×N toggle matrix. */
function kernelDim(N: number): number {
  return solveGF2(matrixFor(N), allOff(N))!.kernel.length;
}

/**
 * Minimum-press solution of `board` as a flat 0/1 press vector, or null when
 * the board is unsolvable. Enumerates every kernel combination (2^dim).
 */
function minimalSolution(board: number[], N: number): number[] | null {
  const res = solveGF2(matrixFor(N), board);
  if (!res) return null;
  const { x, kernel } = res;
  let best = x;
  let bestW = weight(x);
  for (let mask = 1; mask < 1 << kernel.length; mask++) {
    const cand = [...x];
    for (let i = 0; i < kernel.length; i++) {
      if (mask & (1 << i)) {
        for (let j = 0; j < cand.length; j++) cand[j] ^= kernel[i]![j]!;
      }
    }
    const w = weight(cand);
    if (w < bestW) {
      bestW = w;
      best = cand;
    }
  }
  return best;
}

/** Convert a flat 0/1 press vector into (r, c) presses. */
function toPresses(vec: number[], N: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  vec.forEach((v, i) => {
    if (v) out.push([Math.floor(i / N), i % N]);
  });
  return out;
}

/**
 * Brute force for small N (bitmask boards): min presses for every reachable
 * board, computed purely from the toggle matrix columns. Used to validate the
 * elimination solver on tiny grids where exhaustive search is cheap.
 */
function bruteForceTable(N: number): Map<number, number> {
  const n = N * N;
  const A = matrixFor(N);
  const colMask: number[] = [];
  for (let j = 0; j < n; j++) {
    let mask = 0;
    for (let i = 0; i < n; i++) if (A[i]![j]) mask |= 1 << i;
    colMask.push(mask);
  }
  const table = new Map<number, number>();
  for (let subset = 0; subset < 1 << n; subset++) {
    let result = 0;
    let presses = 0;
    for (let j = 0; j < n; j++) {
      if (subset & (1 << j)) {
        result ^= colMask[j]!;
        presses++;
      }
    }
    const prev = table.get(result);
    if (prev === undefined || presses < prev) table.set(result, presses);
  }
  return table;
}

function boardFromMask(mask: number, N: number): number[] {
  const b = allOff(N);
  for (let i = 0; i < N * N; i++) if (mask & (1 << i)) b[i] = 1;
  return b;
}

// Seeds: plenty of numeric seeds, every Daily Challenge date for two years
// ("YYYY-MM-DD" is exactly what daily.vue passes as props.seed), and a few
// arbitrary strings.
const AUDIT_SEEDS: Array<string | number> = [];
for (let i = 1; i <= 1000; i++) AUDIT_SEEDS.push(i);
{
  const d = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < 730; i++) {
    AUDIT_SEEDS.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
}
AUDIT_SEEDS.push("", "lights", "out", "關燈", "a-b-c", "0", "12345");

/** Sizes the component offers (SIZES = [3, 5, 7]; the Daily uses 5×5). */
const UI_SIZES = [3, 5, 7];

// ---------------------------------------------------------------------------
// applyPress — toggle pattern
// ---------------------------------------------------------------------------

describe("applyPress — toggle pattern", () => {
  it("toggles the pressed cell itself", () => {
    const b = allOff(5);
    applyPress(b, 2, 2, 5); // centre of a 5×5
    expect(b[2 * 5 + 2]).toBe(1);
  });

  it("toggles all 4 orthogonal neighbours of an interior cell", () => {
    const N = 5;
    const b = allOff(N);
    applyPress(b, 2, 2, N);
    // centre + 4 neighbours should be on; everything else off
    const expectedOn = new Set([
      2 * N + 2, // (2,2) pressed
      1 * N + 2, // (1,2) above
      3 * N + 2, // (3,2) below
      2 * N + 1, // (2,1) left
      2 * N + 3, // (2,3) right
    ]);
    for (let i = 0; i < N * N; i++) {
      expect(b[i], `cell ${i}`).toBe(expectedOn.has(i) ? 1 : 0);
    }
  });

  it("corner cell (0,0) flips only itself and 2 neighbours, not out-of-bounds", () => {
    const N = 5;
    const b = allOff(N);
    applyPress(b, 0, 0, N);
    // (0,0), (0,1), (1,0) should be on — not (-1,0) or (0,-1) which are OOB
    const expectedOn = new Set([0 * N + 0, 0 * N + 1, 1 * N + 0]);
    for (let i = 0; i < N * N; i++) {
      expect(b[i], `cell ${i}`).toBe(expectedOn.has(i) ? 1 : 0);
    }
  });

  it("edge cell (0, mid) flips 3 neighbours (no row above)", () => {
    const N = 5;
    const b = allOff(N);
    applyPress(b, 0, 2, N); // top-centre
    const expectedOn = new Set([
      0 * N + 2, // itself
      0 * N + 1, // left
      0 * N + 3, // right
      1 * N + 2, // below — no above
    ]);
    for (let i = 0; i < N * N; i++) {
      expect(b[i], `cell ${i}`).toBe(expectedOn.has(i) ? 1 : 0);
    }
  });

  it("is an involution: pressing a cell twice returns to original board", () => {
    const N = 5;
    const original = allOff(N);
    const b = [...original];
    applyPress(b, 3, 1, N);
    applyPress(b, 3, 1, N); // second press
    expect(b).toEqual(original);
  });

  it("involution holds when the board starts all-on", () => {
    const N = 5;
    const original = allOn(N);
    const b = [...original];
    applyPress(b, 2, 3, N);
    applyPress(b, 2, 3, N);
    expect(b).toEqual(original);
  });

  it("presses are commutative: different order yields the same board", () => {
    const N = 5;
    const start = allOff(N);
    const presses: Array<[number, number]> = [
      [0, 0],
      [2, 2],
      [4, 4],
      [1, 3],
    ];
    const reversed = [...presses].reverse();

    const b1 = applyPresses(start, presses, N);
    const b2 = applyPresses(start, reversed, N);
    expect(b1).toEqual(b2);
  });

  it("works identically for 3×3 and 7×7 boards", () => {
    for (const N of [3, 7]) {
      const b = allOff(N);
      applyPress(b, Math.floor(N / 2), Math.floor(N / 2), N);
      // centre press: cell itself + 4 neighbours = 5 cells on (interior centre)
      const onCount = b.filter((v) => v === 1).length;
      expect(onCount, `N=${N} centre press`).toBe(5);
    }
  });

  it("matches the independent toggle matrix for every cell of every UI size", () => {
    for (const N of UI_SIZES) {
      const A = matrixFor(N);
      for (let j = 0; j < N * N; j++) {
        const b = allOff(N);
        applyPress(b, Math.floor(j / N), j % N, N);
        const column = A.map((row) => row[j]!);
        expect(b, `N=${N} press ${j}`).toEqual(column);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// pressCell — immutable variant
// ---------------------------------------------------------------------------

describe("pressCell — returns new board without mutating input", () => {
  it("does not mutate the original board", () => {
    const N = 5;
    const original = allOff(N);
    const snapshot = [...original];
    pressCell(original, 2, 2, N);
    expect(original).toEqual(snapshot);
  });

  it("produces the same result as applyPress on a copy", () => {
    const N = 5;
    const b = allOff(N);
    const mutated = [...b];
    applyPress(mutated, 1, 3, N);
    expect(pressCell(b, 1, 3, N)).toEqual(mutated);
  });
});

// ---------------------------------------------------------------------------
// isWon
// ---------------------------------------------------------------------------

describe("isWon", () => {
  it("returns true for an all-off board", () => {
    expect(isWon(allOff(5))).toBe(true);
  });

  it("returns false for an all-on board", () => {
    expect(isWon(allOn(5))).toBe(false);
  });

  it("returns false when at least one cell is on", () => {
    const b = allOff(5);
    b[12] = 1; // single lit cell
    expect(isWon(b)).toBe(false);
  });

  it("returns true for a 1-cell all-off board", () => {
    expect(isWon([0])).toBe(true);
  });

  it("returns false for a 1-cell all-on board", () => {
    expect(isWon([1])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Independent solver — self-checks against known facts and brute force
// ---------------------------------------------------------------------------

describe("independent GF(2) solver — self-checks", () => {
  it("kernel dimension matches the published nullity of the N×N Lights Out matrix", () => {
    // OEIS A159257: nullity for n = 2..9 is 0, 0, 4, 2, 0, 0, 0, 8.
    const expected: Record<number, number> = { 2: 0, 3: 0, 4: 4, 5: 2, 6: 0, 7: 0, 8: 0, 9: 8 };
    for (const [N, dim] of Object.entries(expected)) {
      expect(kernelDim(Number(N)), `N=${N}`).toBe(dim);
    }
  });

  it("agrees with exhaustive brute force on every 3×3 board (all 512 are solvable)", () => {
    const N = 3;
    const table = bruteForceTable(N);
    expect(table.size).toBe(512);
    for (let mask = 0; mask < 512; mask++) {
      const sol = minimalSolution(boardFromMask(mask, N), N);
      expect(sol, `board ${mask}`).not.toBeNull();
      expect(weight(sol!), `board ${mask} min presses`).toBe(table.get(mask));
    }
  });

  it("agrees with exhaustive brute force on 4×4 (exactly 1 in 16 boards solvable)", () => {
    const N = 4;
    const table = bruteForceTable(N);
    // Kernel dimension 4 ⇒ image has 2^(16-4) = 4096 boards.
    expect(table.size).toBe(4096);
    for (let mask = 0; mask < 1 << 16; mask += 37) {
      const sol = minimalSolution(boardFromMask(mask, N), N);
      const brute = table.get(mask);
      if (brute === undefined) {
        expect(sol, `board ${mask} should be unsolvable`).toBeNull();
      } else {
        expect(sol, `board ${mask} should be solvable`).not.toBeNull();
        expect(weight(sol!), `board ${mask} min presses`).toBe(brute);
      }
    }
  });

  it("knows a single lit 5×5 corner is unsolvable while a single lit centre is not", () => {
    // Solvable boards are exactly those orthogonal to both 5×5 quiet patterns;
    // the corners belong to a quiet pattern, the centre cell belongs to none.
    const N = 5;
    const corner = allOff(N);
    corner[0] = 1;
    expect(minimalSolution(corner, N)).toBeNull();
    const centre = allOff(N);
    centre[12] = 1;
    expect(minimalSolution(centre, N)).not.toBeNull();
    // ...and the all-on 5×5 board is solvable in 15 presses.
    const full = minimalSolution(allOn(N), N);
    expect(full).not.toBeNull();
    expect(weight(full!)).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// generateBoard — solvability guarantee (independent audit)
// ---------------------------------------------------------------------------

describe("generateBoard — every seed × every UI size is solvable", () => {
  it("audits 1000 numeric + 730 daily-date + string seeds on 3×3, 5×5 and 7×7", () => {
    let audited = 0;
    for (const N of UI_SIZES) {
      const unique = kernelDim(N) === 0; // 3×3 and 7×7: exactly one solution
      for (const seed of AUDIT_SEEDS) {
        const label = `N=${N} seed=${JSON.stringify(seed)}`;
        const { board, solution, size } = generateBoardFromSeed(N, seed);
        expect(size, label).toBe(N);
        expect(board.length, label).toBe(N * N);

        // (b) never handed to the player already solved
        expect(isWon(board), `${label} already solved`).toBe(false);

        // (a) solvable according to the independent solver
        const best = minimalSolution(board, N);
        expect(best, `${label} unsolvable`).not.toBeNull();
        const min = weight(best!);
        expect(min, label).toBeGreaterThan(0);

        // (d) win check: false before, true after the solver's presses
        const solved = applyPresses(board, toPresses(best!, N), N);
        expect(isWon(solved), `${label} solver presses`).toBe(true);

        // (c) the shown 目標 = solution.length is a real, achievable
        // reference: replaying it wins, and it can never undercut the optimum.
        expect(solution.length, `${label} 目標 below true minimum`).toBeGreaterThanOrEqual(min);
        expect(isWon(applyPresses(board, solution, N)), `${label} solution replay`).toBe(true);

        // the reference solution wastes no moves: each cell at most once
        const keys = solution.map(([r, c]) => r * N + c);
        expect(new Set(keys).size, `${label} duplicate presses`).toBe(keys.length);
        for (const [r, c] of solution) {
          expect(r >= 0 && r < N && c >= 0 && c < N, `${label} press (${r},${c}) out of bounds`).toBe(true);
        }

        // 3×3 / 7×7 have a unique solution, so the reference IS the optimum.
        if (unique) {
          expect(solution.length, `${label} 目標 should equal optimum`).toBe(min);
          expect(keys.sort((a, b) => a - b)).toEqual(toPresses(best!, N).map(([r, c]) => r * N + c));
        }
        audited++;
      }
    }
    expect(audited).toBe(UI_SIZES.length * AUDIT_SEEDS.length);
  });

  it("5×5: the reference solution is one of the 4 solutions and is often the optimum", () => {
    const N = 5;
    let optimal = 0;
    for (const seed of AUDIT_SEEDS) {
      const { board, solution } = generateBoardFromSeed(N, seed);
      const min = weight(minimalSolution(board, N)!);
      if (solution.length === min) optimal++;
    }
    // Deterministic for the fixed seed list (about 56% hit the optimum); the
    // remaining boards have a shorter solution via a kernel ("quiet") pattern,
    // which the on-screen hint text warns about.
    expect(optimal / AUDIT_SEEDS.length).toBeGreaterThan(0.4);
  });

  it("other sizes the module supports (4×4, 6×6) are solvable too", () => {
    for (const N of [4, 6]) {
      for (let seed = 1; seed <= 100; seed++) {
        const { board, solution } = generateBoardFromSeed(N, seed);
        expect(isWon(board), `N=${N} seed=${seed}`).toBe(false);
        const best = minimalSolution(board, N);
        expect(best, `N=${N} seed=${seed}`).not.toBeNull();
        expect(solution.length).toBeGreaterThanOrEqual(weight(best!));
        expect(isWon(applyPresses(board, solution, N))).toBe(true);
      }
    }
  });

  it("board is not all-off after generation (there is something to solve)", () => {
    for (const N of [3, 5, 7]) {
      const { board } = generateBoard(N, makeRng(`test-${N}`));
      expect(isWon(board), `N=${N} board should not be already solved`).toBe(false);
    }
  });

  it("replaying the solution presses on the generated board returns all-off", () => {
    for (const N of [3, 5, 7]) {
      const { board, solution } = generateBoard(N, makeRng(`solve-${N}`));
      const result = applyPresses(board, solution, N);
      expect(isWon(result), `N=${N} solution replay should win`).toBe(true);
    }
  });

  it("solution replay works with the seed-based convenience function", () => {
    const { board, solution, size: N } = generateBoardFromSeed(5, "deterministic-seed");
    const result = applyPresses(board, solution, N);
    expect(isWon(result)).toBe(true);
  });

  it("board length equals N*N", () => {
    for (const N of [3, 5, 7]) {
      const { board } = generateBoard(N, makeRng(N));
      expect(board.length).toBe(N * N);
    }
  });

  it("board cells are only 0 or 1", () => {
    const { board } = generateBoard(5, makeRng("validity"));
    expect(board.every((v) => v === 0 || v === 1)).toBe(true);
  });

  it("solution is the reduced press set: at most numPresses entries, no repeats, row-major", () => {
    // Previously this asserted solution.length === numPresses (+1), i.e. the
    // raw scramble count. That made the on-screen 目標 a constant N² for every
    // board (25 on 5×5, 49 on 7×7) — always achievable but never informative.
    // Presses that cancel in pairs are now dropped, so the length is a real
    // reference move count.
    const N = 5;
    const numPresses = N * N;
    const { solution } = generateBoard(N, makeRng("len-check"), numPresses);
    expect(solution.length).toBeGreaterThan(0);
    expect(solution.length).toBeLessThanOrEqual(numPresses);
    const keys = solution.map(([r, c]) => r * N + c);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });

  it("solution is exactly the cells pressed an odd number of times", () => {
    // Force the sequence (0,0) (1,1) (0,0) (2,2) (1,1) (1,1) on a 3×3:
    // (0,0) ×2 cancels, (1,1) ×3 stays, (2,2) ×1 stays.
    const N = 3;
    const rng = stubRng([0, 0, 1, 1, 0, 0, 2, 2, 1, 1, 1, 1]);
    const { board, solution } = generateBoard(N, rng, 6);
    expect(solution).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(board).toEqual(applyPresses(allOff(N), solution, N));
  });

  it("a custom numPresses (including tiny values) still yields a solvable, unsolved board", () => {
    for (const numPresses of [1, 2, 3, 10, 100]) {
      const { board, solution } = generateBoardFromSeed(5, `presses-${numPresses}`, numPresses);
      expect(isWon(board), `numPresses=${numPresses}`).toBe(false);
      expect(minimalSolution(board, 5), `numPresses=${numPresses}`).not.toBeNull();
      expect(solution.length).toBeLessThanOrEqual(numPresses);
      expect(isWon(applyPresses(board, solution, 5))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Daily Challenge — props.seed is a "YYYY-MM-DD" string, board is 5×5
// ---------------------------------------------------------------------------

describe("Daily Challenge seeds", () => {
  it("today's date seed gives a deterministic, solvable 5×5 whose 目標 is achievable", () => {
    const N = 5;
    const a = generateBoardFromSeed(N, "2026-08-29");
    const b = generateBoardFromSeed(N, "2026-08-29");
    expect(a).toEqual(b);
    expect(isWon(a.board)).toBe(false);
    const min = weight(minimalSolution(a.board, N)!);
    expect(a.solution.length).toBeGreaterThanOrEqual(min);
    // Playing the reference solution move-by-move wins in exactly 目標 moves.
    let board = a.board;
    let moves = 0;
    for (const [r, c] of a.solution) {
      expect(isWon(board)).toBe(false);
      board = pressCell(board, r, c, N);
      moves++;
    }
    expect(isWon(board)).toBe(true);
    expect(moves).toBe(a.solution.length);
  });

  it("consecutive dates give different boards", () => {
    const b1 = generateBoardFromSeed(5, "2026-08-29").board;
    const b2 = generateBoardFromSeed(5, "2026-08-30").board;
    expect(b1).not.toEqual(b2);
  });
});

// ---------------------------------------------------------------------------
// generateBoard — determinism
// ---------------------------------------------------------------------------

describe("generateBoard — determinism with seeded RNG", () => {
  it("same seed produces identical boards", () => {
    const N = 5;
    const seed = "reproducible";
    const { board: b1 } = generateBoardFromSeed(N, seed);
    const { board: b2 } = generateBoardFromSeed(N, seed);
    expect(b1).toEqual(b2);
  });

  it("same seed produces an identical solution", () => {
    const N = 5;
    const seed = "same-solution";
    const { solution: s1 } = generateBoardFromSeed(N, seed);
    const { solution: s2 } = generateBoardFromSeed(N, seed);
    expect(s1).toEqual(s2);
  });

  it("different seeds produce different boards (with overwhelming probability)", () => {
    const boards = ["seed-a", "seed-b", "seed-c", "seed-d", "seed-e"].map(
      (s) => generateBoardFromSeed(5, s).board,
    );
    // Not all identical
    const allSame = boards.every((b) => JSON.stringify(b) === JSON.stringify(boards[0]));
    expect(allSame).toBe(false);
  });

  it("unseeded generation (props.seed = null in free play) still yields a solvable board", () => {
    for (let i = 0; i < 20; i++) {
      const { board, solution } = generateBoardFromSeed(5, null);
      expect(isWon(board)).toBe(false);
      expect(minimalSolution(board, 5)).not.toBeNull();
      expect(isWon(applyPresses(board, solution, 5))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// generateBoard — all-off edge-case guard (centre-press fallback)
// ---------------------------------------------------------------------------

describe("generateBoard — all-off guard (centre-press fallback)", () => {
  it("triggers the centre-press fallback when all presses cancel out", () => {
    // Every press lands on (0,0); with numPresses=2 the two presses cancel
    // (press same cell twice = XOR back to 0) leaving the board all-off, which
    // must trigger the centre-press guard.
    const N = 3;
    const { board, solution } = generateBoard(N, stubRng([0]), 2);

    // Board must NOT be all-off after generation (the guard pressed the centre).
    expect(isWon(board)).toBe(false);
    expect(board).toEqual(pressCell(allOff(N), 1, 1, N));

    // The cancelled presses are dropped: the centre press alone is the
    // reference solution (it used to be reported as 3 presses, which was a
    // valid but wasteful solution for a board solvable in 1).
    expect(solution).toEqual([[1, 1]]);
    expect(isWon(applyPresses(board, solution, N))).toBe(true);
  });

  it("numPresses = 0 falls back to a single centre press", () => {
    const { board, solution } = generateBoardFromSeed(5, "zero", 0);
    expect(board).toEqual(pressCell(allOff(5), 2, 2, 5));
    expect(solution).toEqual([[2, 2]]);
  });

  it("5×5: a scramble that is a quiet (kernel) pattern also falls back to one centre press", () => {
    // On 5×5 a non-empty press set can leave the board all-off. Feed exactly
    // such a kernel vector (taken from the independent solver) as the scramble
    // and check the guard reports the 1-press optimum instead of kernel ⊕ centre.
    const N = 5;
    const quiet = solveGF2(matrixFor(N), allOff(N))!.kernel[0]!;
    const presses = toPresses(quiet, N);
    expect(presses.length).toBeGreaterThan(0);
    const ints = presses.flatMap(([r, c]) => [r, c]);
    const { board, solution } = generateBoard(N, stubRng(ints), presses.length);
    expect(board).toEqual(pressCell(allOff(N), 2, 2, N));
    expect(solution).toEqual([[2, 2]]);
    expect(weight(minimalSolution(board, N)!)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// generateBoardFromSeed — size field
// ---------------------------------------------------------------------------

describe("generateBoardFromSeed — size field", () => {
  it("returns the correct size in the result", () => {
    for (const N of [3, 5, 7]) {
      const { size } = generateBoardFromSeed(N, "size-check");
      expect(size).toBe(N);
    }
  });
});

// ---------------------------------------------------------------------------
// Commutativity at scale
// ---------------------------------------------------------------------------

describe("press commutativity at scale", () => {
  it("applying a solution in shuffled order still solves the board", () => {
    const N = 5;
    const { board, solution } = generateBoardFromSeed(N, "commute-test");

    // Reverse the solution order — since presses are commutative, should still win.
    const reversed = [...solution].reverse();
    const result = applyPresses(board, reversed, N);
    expect(isWon(result)).toBe(true);
  });

  it("applying the solution in arbitrary permutation still solves the board", () => {
    const N = 5;
    const { board, solution } = generateBoardFromSeed(N, "permute-test");

    // Sort by (c, r) — a different but deterministic order.
    const sorted = [...solution].sort(([r1, c1], [r2, c2]) =>
      c1 !== c2 ? c1 - c2 : r1 - r2,
    );
    const result = applyPresses(board, sorted, N);
    expect(isWon(result)).toBe(true);
  });
});
