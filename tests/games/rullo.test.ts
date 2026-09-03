import { describe, it, expect } from "vitest";
import {
  LEVELS,
  generatePuzzle,
  sums,
  isSolved,
  toggle,
} from "~/games/rullo";
import type { RulloPuzzle } from "~/games/rullo";
import type { Rng } from "~/utils/rng";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Independent checker — written from the rules, not from the module helpers.
// ---------------------------------------------------------------------------

/** Sum of the kept cells in row r, computed directly from the flat arrays. */
function refRowSum(values: number[], keep: boolean[], N: number, r: number): number {
  let s = 0;
  for (let c = 0; c < N; c++) if (keep[r * N + c]) s += values[r * N + c]!;
  return s;
}

/** Sum of the kept cells in column c. */
function refColSum(values: number[], keep: boolean[], N: number, c: number): number {
  let s = 0;
  for (let r = 0; r < N; r++) if (keep[r * N + c]) s += values[r * N + c]!;
  return s;
}

/** Rule check: every row and column of kept cells equals its target. */
function refSatisfies(values: number[], keep: boolean[], p: RulloPuzzle): boolean {
  const N = p.size;
  for (let r = 0; r < N; r++) if (refRowSum(values, keep, N, r) !== p.rowTargets[r]) return false;
  for (let c = 0; c < N; c++) if (refColSum(values, keep, N, c) !== p.colTargets[c]) return false;
  return true;
}

/** Number of kept cells in each row / column. */
function keptPerLine(keep: boolean[], N: number): { rows: number[]; cols: number[] } {
  const rows = new Array(N).fill(0);
  const cols = new Array(N).fill(0);
  for (let i = 0; i < N * N; i++) {
    if (keep[i]) {
      rows[Math.floor(i / N)]++;
      cols[i % N]++;
    }
  }
  return { rows, cols };
}

/**
 * Stub Rng with scripted outputs. `bools` is what bool() returns (cycling),
 * `ints` is consumed by int() in order (cycling). shuffle is the identity.
 */
function stubRng(bools: boolean[], ints: number[]): Rng {
  let bi = 0;
  let ii = 0;
  return {
    next: () => 0,
    int: () => ints[ii++ % ints.length]!,
    float: () => 0,
    bool: () => bools[bi++ % bools.length]!,
    pick: <T>(arr: T[]) => arr[0]!,
    shuffle: <T>(arr: T[]) => arr,
  };
}

const SEEDS: Array<string | number> = [];
for (let i = 1; i <= 200; i++) SEEDS.push(i);
SEEDS.push("rullo", "數字開關", "2026-09-04", "2026-12-31", "");

// ---------------------------------------------------------------------------
// LEVELS
// ---------------------------------------------------------------------------

describe("LEVELS", () => {
  it("offers 5×5 (1–9), 6×6 (1–9) and 8×8 (1–19)", () => {
    expect(LEVELS.map((l) => [l.size, l.maxValue])).toEqual([
      [5, 9],
      [6, 9],
      [8, 19],
    ]);
    expect(LEVELS.map((l) => l.label)).toEqual(["簡單", "普通", "困難"]);
  });
});

// ---------------------------------------------------------------------------
// sums / isSolved / toggle
// ---------------------------------------------------------------------------

describe("sums", () => {
  it("adds only the active cells per row and per column", () => {
    // 1 2 3
    // 4 5 6
    // 7 8 9  with the diagonal switched off
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const active = [false, true, true, true, false, true, true, true, false];
    expect(sums(values, active, 3)).toEqual({ rows: [5, 10, 15], cols: [11, 10, 9] });
  });

  it("returns zeros when everything is off", () => {
    expect(sums([3, 3, 3, 3], [false, false, false, false], 2)).toEqual({
      rows: [0, 0],
      cols: [0, 0],
    });
  });
});

describe("isSolved", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const target = [false, true, true, true, false, true, true, true, false];
  const rowT = [5, 10, 15];
  const colT = [11, 10, 9];

  it("is true for an active set that hits every target", () => {
    expect(isSolved(values, target, rowT, colT, 3)).toBe(true);
  });

  it("is false when all cells are still on", () => {
    expect(isSolved(values, new Array(9).fill(true), rowT, colT, 3)).toBe(false);
  });

  it("is false when a row is wrong, and when only a column is wrong", () => {
    // Off 2, 5, 7 → rows 4, 10, 17: row 0 misses.
    const active = [true, false, true, true, false, true, false, true, true];
    expect(isSolved(values, active, rowT, colT, 3)).toBe(false);
    // Every row hits, the last column target is off by one.
    expect(isSolved(values, target, rowT, [11, 10, 8], 3)).toBe(false);
  });

  it("accepts any alternative active set that matches the targets", () => {
    // 2 2 / 2 2 — targets 2 per line: either diagonal works.
    const v = [2, 2, 2, 2];
    expect(isSolved(v, [true, false, false, true], [2, 2], [2, 2], 2)).toBe(true);
    expect(isSolved(v, [false, true, true, false], [2, 2], [2, 2], 2)).toBe(true);
  });
});

describe("toggle", () => {
  it("flips the cell and returns a new array without mutating the input", () => {
    const a = [true, true, false];
    const b = toggle(a, 0);
    expect(b).toEqual([false, true, false]);
    expect(a).toEqual([true, true, false]);
    expect(toggle(b, 2)).toEqual([false, true, true]);
    expect(b).not.toBe(a);
  });
});

// ---------------------------------------------------------------------------
// generatePuzzle — audit over many seeds and every level
// ---------------------------------------------------------------------------

describe("generatePuzzle — every seed × every level", () => {
  it("produces in-range values, consistent targets and a valid solution", () => {
    let audited = 0;
    for (const { size: N, maxValue } of LEVELS) {
      for (const seed of SEEDS) {
        const label = `N=${N} seed=${JSON.stringify(seed)}`;
        const p = generatePuzzle(makeRng(seed), N, maxValue);

        expect(p.size, label).toBe(N);
        expect(p.values.length, label).toBe(N * N);
        expect(p.solution.length, label).toBe(N * N);
        expect(p.rowTargets.length, label).toBe(N);
        expect(p.colTargets.length, label).toBe(N);

        for (const v of p.values) {
          expect(Number.isInteger(v) && v >= 1 && v <= maxValue, `${label} value ${v}`).toBe(true);
        }

        // Independent check: the solution's line sums are the targets.
        expect(refSatisfies(p.values, p.solution, p), `${label} solution`).toBe(true);
        expect(isSolved(p.values, p.solution, p.rowTargets, p.colTargets, N), label).toBe(true);

        // Every row and column keeps at least one cell, so no target is 0.
        const kept = keptPerLine(p.solution, N);
        for (let i = 0; i < N; i++) {
          expect(kept.rows[i], `${label} row ${i} empty`).toBeGreaterThanOrEqual(1);
          expect(kept.cols[i], `${label} col ${i} empty`).toBeGreaterThanOrEqual(1);
          expect(p.rowTargets[i], label).toBeGreaterThanOrEqual(1);
          expect(p.colTargets[i], label).toBeGreaterThanOrEqual(1);
        }

        // The starting all-on state is never already solved.
        expect(p.solution.some((k) => !k), `${label} nothing to switch off`).toBe(true);
        const allOn = new Array(N * N).fill(true);
        expect(refSatisfies(p.values, allOn, p), `${label} all-on solved`).toBe(false);
        expect(isSolved(p.values, allOn, p.rowTargets, p.colTargets, N), label).toBe(false);

        // Targets are exactly the module's own sums of the solution.
        expect(sums(p.values, p.solution, N), label).toEqual({
          rows: p.rowTargets,
          cols: p.colTargets,
        });
        audited++;
      }
    }
    expect(audited).toBe(LEVELS.length * SEEDS.length);
  });

  it("keeps roughly two thirds of the cells on", () => {
    let on = 0;
    let total = 0;
    for (const seed of SEEDS) {
      const p = generatePuzzle(makeRng(seed), 6, 9);
      on += p.solution.filter(Boolean).length;
      total += p.solution.length;
    }
    const ratio = on / total;
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(0.78);
  });

  it("uses the full value range across seeds", () => {
    const seen = new Set<number>();
    for (const seed of SEEDS) {
      for (const v of generatePuzzle(makeRng(seed), 8, 19).values) seen.add(v);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 19 }, (_, i) => i + 1),
    );
  });

  it("playing the solution by toggling the off cells solves it, one step early it does not", () => {
    for (const { size: N, maxValue } of LEVELS) {
      const p = generatePuzzle(makeRng(`play-${N}`), N, maxValue);
      let active: boolean[] = new Array(N * N).fill(true);
      const offs = p.solution.map((k, i) => (k ? -1 : i)).filter((i) => i >= 0);
      for (let k = 0; k < offs.length; k++) {
        expect(isSolved(p.values, active, p.rowTargets, p.colTargets, N), `N=${N} step ${k}`).toBe(false);
        active = toggle(active, offs[k]!);
      }
      expect(isSolved(p.values, active, p.rowTargets, p.colTargets, N)).toBe(true);
      expect(active).toEqual(p.solution);
    }
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("generatePuzzle — determinism", () => {
  it("same seed gives an identical puzzle", () => {
    for (const { size: N, maxValue } of LEVELS) {
      const a = generatePuzzle(makeRng("same"), N, maxValue);
      const b = generatePuzzle(makeRng("same"), N, maxValue);
      expect(a).toEqual(b);
    }
  });

  it("daily date seeds are stable and consecutive days differ", () => {
    const a = generatePuzzle(makeRng("2026-09-04"), 6, 9);
    const b = generatePuzzle(makeRng("2026-09-04"), 6, 9);
    const c = generatePuzzle(makeRng("2026-09-05"), 6, 9);
    expect(a).toEqual(b);
    expect(c.values).not.toEqual(a.values);
  });

  it("unseeded generation still yields a valid puzzle", () => {
    for (let i = 0; i < 20; i++) {
      const p = generatePuzzle(makeRng(null), 5, 9);
      expect(refSatisfies(p.values, p.solution, p)).toBe(true);
      expect(p.solution.some((k) => !k)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe("generatePuzzle — all-on guard", () => {
  it("switches one non-permutation cell off when every cell would be kept", () => {
    // bool() always true → every cell kept; the guard then reads int(0, N-1)
    // for the row and int(0, N-2) for the column offset. shuffle is identity,
    // so perm[r] = r; with ints [1, 0] the cell (1, (1+1+0)%3) = (1, 2) goes off.
    // The first 9 int() calls fill the values; the two after that hit the guard.
    const N = 3;
    const ints = [5, 5, 5, 5, 5, 5, 5, 5, 5, 1, 0];
    const p = generatePuzzle(stubRng([true], ints), N, 9);
    expect(p.values).toEqual(new Array(9).fill(5));
    expect(p.solution.filter((k) => !k).length).toBe(1);
    expect(p.solution[1 * N + 2]).toBe(false);
    // The permutation cell of that row stays on, so the row is not empty.
    expect(p.solution[1 * N + 1]).toBe(true);
    expect(p.rowTargets).toEqual([15, 10, 15]);
    expect(p.colTargets).toEqual([15, 15, 10]);
    expect(refSatisfies(p.values, p.solution, p)).toBe(true);
  });

  it("wraps the column offset around so it never lands on the permutation cell", () => {
    // Row 2, perm[2] = 2, offset N-2 = 1 → (2 + 1 + 1) % 3 = 1.
    const N = 3;
    const ints = [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1];
    const p = generatePuzzle(stubRng([true], ints), N, 9);
    expect(p.solution[2 * N + 1]).toBe(false);
    expect(p.solution[2 * N + 2]).toBe(true);
    expect(p.solution.filter((k) => !k).length).toBe(1);
  });

  it("with bool() always false only the permutation cells stay on", () => {
    const N = 4;
    const p = generatePuzzle(stubRng([false], [3]), N, 9);
    // Identity permutation → exactly the diagonal is kept.
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        expect(p.solution[r * N + c], `(${r},${c})`).toBe(r === c);
      }
    }
    expect(p.rowTargets).toEqual([3, 3, 3, 3]);
    expect(p.colTargets).toEqual([3, 3, 3, 3]);
  });
});
