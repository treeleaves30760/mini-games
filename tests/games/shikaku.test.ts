import { describe, it, expect } from "vitest";
import {
  areaOf,
  containsCell,
  intersects,
  cluesInRect,
  rectIsValid,
  generateShikaku,
  isSolved,
} from "~/games/shikaku";
import type { Rect, Clue } from "~/games/shikaku";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// areaOf
// ---------------------------------------------------------------------------
describe("areaOf", () => {
  it("single cell", () => {
    expect(areaOf({ r0: 2, c0: 3, r1: 2, c1: 3 })).toBe(1);
  });
  it("1×4 horizontal strip", () => {
    expect(areaOf({ r0: 0, c0: 0, r1: 0, c1: 3 })).toBe(4);
  });
  it("3×2 rectangle", () => {
    expect(areaOf({ r0: 1, c0: 1, r1: 3, c1: 2 })).toBe(6);
  });
  it("full 5×5 grid", () => {
    expect(areaOf({ r0: 0, c0: 0, r1: 4, c1: 4 })).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// containsCell
// ---------------------------------------------------------------------------
describe("containsCell", () => {
  const R: Rect = { r0: 1, c0: 2, r1: 3, c1: 4 };
  it("interior point is contained", () => {
    expect(containsCell(R, 2, 3)).toBe(true);
  });
  it("corner points are contained", () => {
    expect(containsCell(R, 1, 2)).toBe(true);
    expect(containsCell(R, 3, 4)).toBe(true);
    expect(containsCell(R, 1, 4)).toBe(true);
    expect(containsCell(R, 3, 2)).toBe(true);
  });
  it("point just outside is not contained", () => {
    expect(containsCell(R, 0, 2)).toBe(false); // row too small
    expect(containsCell(R, 4, 2)).toBe(false); // row too large
    expect(containsCell(R, 2, 1)).toBe(false); // col too small
    expect(containsCell(R, 2, 5)).toBe(false); // col too large
  });
});

// ---------------------------------------------------------------------------
// intersects
// ---------------------------------------------------------------------------
describe("intersects", () => {
  const A: Rect = { r0: 0, c0: 0, r1: 2, c1: 2 };
  it("overlapping rectangles intersect", () => {
    expect(intersects(A, { r0: 1, c0: 1, r1: 3, c1: 3 })).toBe(true);
  });
  it("touching at corner — they share a cell, so they intersect", () => {
    expect(intersects(A, { r0: 2, c0: 2, r1: 4, c1: 4 })).toBe(true);
  });
  it("adjacent but non-overlapping do not intersect", () => {
    expect(intersects(A, { r0: 3, c0: 0, r1: 5, c1: 2 })).toBe(false);
    expect(intersects(A, { r0: 0, c0: 3, r1: 2, c1: 5 })).toBe(false);
  });
  it("disjoint rectangles do not intersect", () => {
    expect(intersects(A, { r0: 5, c0: 5, r1: 7, c1: 7 })).toBe(false);
  });
  it("one contained in the other intersects", () => {
    expect(intersects(A, { r0: 1, c0: 1, r1: 1, c1: 1 })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cluesInRect
// ---------------------------------------------------------------------------
describe("cluesInRect", () => {
  const clues: Clue[] = [
    { id: 1, r: 0, c: 0, value: 4 },
    { id: 2, r: 2, c: 3, value: 2 },
    { id: 3, r: 5, c: 5, value: 1 },
  ];
  it("finds clues inside the rectangle", () => {
    const R: Rect = { r0: 0, c0: 0, r1: 3, c1: 4 };
    const found = cluesInRect(R, clues);
    expect(found.map((c) => c.id)).toEqual([1, 2]);
  });
  it("returns empty when no clue falls inside", () => {
    const R: Rect = { r0: 0, c0: 0, r1: 1, c1: 1 };
    expect(cluesInRect(R, [clues[1]])).toHaveLength(0);
  });
  it("boundary cells are included", () => {
    const R: Rect = { r0: 5, c0: 5, r1: 5, c1: 5 };
    expect(cluesInRect(R, clues)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// rectIsValid
// ---------------------------------------------------------------------------
describe("rectIsValid", () => {
  const clues: Clue[] = [
    { id: 1, r: 0, c: 0, value: 6 },
    { id: 2, r: 1, c: 3, value: 3 },
  ];
  it("valid: exactly one clue, area equals clue value", () => {
    // 2 rows × 3 cols = 6 — matches clue 1
    expect(rectIsValid({ r0: 0, c0: 0, r1: 1, c1: 2 }, clues)).toBe(true);
  });
  it("invalid: correct area but contains zero clues", () => {
    expect(rectIsValid({ r0: 2, c0: 2, r1: 3, c1: 3 }, clues)).toBe(false);
  });
  it("invalid: contains the clue but wrong area", () => {
    // 1×1 around clue 1, area=1 ≠ 6
    expect(rectIsValid({ r0: 0, c0: 0, r1: 0, c1: 0 }, clues)).toBe(false);
  });
  it("invalid: two clues inside, even if area happens to match one", () => {
    // large rect covering both clues
    expect(rectIsValid({ r0: 0, c0: 0, r1: 1, c1: 4 }, clues)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateShikaku — structural invariants across multiple seeds
// ---------------------------------------------------------------------------
describe("generateShikaku — puzzle generation invariants", () => {
  const CONFIGS = [
    { rows: 5, cols: 5, maxArea: 6 },
    { rows: 7, cols: 7, maxArea: 8 },
    { rows: 9, cols: 9, maxArea: 9 },
  ];

  for (const cfg of CONFIGS) {
    const label = `${cfg.rows}×${cfg.cols} maxArea=${cfg.maxArea}`;

    it(`${label}: sum of clue values equals grid area`, () => {
      for (let s = 0; s < 10; s++) {
        const { clues } = generateShikaku(cfg.rows, cfg.cols, cfg.maxArea, makeRng(`seed-${s}`));
        const total = clues.reduce((acc, k) => acc + k.value, 0);
        expect(total).toBe(cfg.rows * cfg.cols);
      }
    });

    it(`${label}: solution rectangles tile the grid — every cell covered exactly once`, () => {
      for (let s = 0; s < 5; s++) {
        const { clues, solution } = generateShikaku(
          cfg.rows,
          cfg.cols,
          cfg.maxArea,
          makeRng(`cov-${s}`)
        );
        // Build a coverage grid
        const grid = Array.from({ length: cfg.rows }, () => new Array(cfg.cols).fill(0));
        for (const k of clues) {
          const rect = solution.get(k.id)!;
          for (let r = rect.r0; r <= rect.r1; r++) {
            for (let c = rect.c0; c <= rect.c1; c++) {
              grid[r][c]++;
            }
          }
        }
        for (let r = 0; r < cfg.rows; r++) {
          for (let c = 0; c < cfg.cols; c++) {
            expect(grid[r][c], `cell (${r},${c}) covered ${grid[r][c]} times`).toBe(1);
          }
        }
      }
    });

    it(`${label}: solution rectangles do not overlap each other`, () => {
      const { clues, solution } = generateShikaku(
        cfg.rows,
        cfg.cols,
        cfg.maxArea,
        makeRng("no-overlap")
      );
      const rects = clues.map((k) => solution.get(k.id)!);
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          expect(
            intersects(rects[i], rects[j]),
            `rect ${i} and rect ${j} should not overlap`
          ).toBe(false);
        }
      }
    });

    it(`${label}: each clue cell lies inside its solution rectangle`, () => {
      const { clues, solution } = generateShikaku(
        cfg.rows,
        cfg.cols,
        cfg.maxArea,
        makeRng("clue-inside")
      );
      for (const k of clues) {
        const rect = solution.get(k.id)!;
        expect(
          containsCell(rect, k.r, k.c),
          `clue ${k.id} at (${k.r},${k.c}) not inside its rect`
        ).toBe(true);
      }
    });

    it(`${label}: each solution rectangle area matches its clue value`, () => {
      const { clues, solution } = generateShikaku(
        cfg.rows,
        cfg.cols,
        cfg.maxArea,
        makeRng("area-match")
      );
      for (const k of clues) {
        const rect = solution.get(k.id)!;
        expect(areaOf(rect), `clue ${k.id} value=${k.value} vs area=${areaOf(rect)}`).toBe(
          k.value
        );
      }
    });

    it(`${label}: no rectangle exceeds maxArea`, () => {
      for (let s = 0; s < 5; s++) {
        const { clues } = generateShikaku(cfg.rows, cfg.cols, cfg.maxArea, makeRng(`max-${s}`));
        for (const k of clues) {
          expect(k.value).toBeLessThanOrEqual(cfg.maxArea);
        }
      }
    });
  }

  it("is fully deterministic: same seed → same puzzle", () => {
    const rng1 = makeRng("deterministic");
    const rng2 = makeRng("deterministic");
    const a = generateShikaku(7, 7, 8, rng1);
    const b = generateShikaku(7, 7, 8, rng2);
    expect(a.clues).toEqual(b.clues);
    // solution maps should have identical content
    for (const [id, rect] of a.solution) {
      expect(b.solution.get(id)).toEqual(rect);
    }
  });
});

// ---------------------------------------------------------------------------
// isSolved — win detection
// ---------------------------------------------------------------------------
describe("isSolved", () => {
  // Build a tiny explicit 2×3 puzzle with two rectangles:
  //   Rect A: rows 0-1, cols 0-1 (2×2 = area 4) — clue at (0,0)=4
  //   Rect B: rows 0-1, cols 2-2 (2×1 = area 2) — clue at (1,2)=2
  const ROWS = 2;
  const COLS = 3;
  const clues: Clue[] = [
    { id: 1, r: 0, c: 0, value: 4 },
    { id: 2, r: 1, c: 2, value: 2 },
  ];
  const correctRects: Rect[] = [
    { r0: 0, c0: 0, r1: 1, c1: 1 }, // area 4, contains clue 1
    { r0: 0, c0: 2, r1: 1, c1: 2 }, // area 2, contains clue 2
  ];

  it("accepts a correct complete tiling", () => {
    expect(isSolved(correctRects, clues, ROWS, COLS)).toBe(true);
  });

  it("rejects empty rectangles", () => {
    expect(isSolved([], clues, ROWS, COLS)).toBe(false);
  });

  it("rejects a partial tiling (one rect missing)", () => {
    expect(isSolved([correctRects[0]], clues, ROWS, COLS)).toBe(false);
  });

  it("rejects rects with wrong area (covers all cells but values don't match)", () => {
    // One big 2×3 rect covering everything, but it contains 2 clues → invalid
    const wrongRects: Rect[] = [{ r0: 0, c0: 0, r1: 1, c1: 2 }];
    expect(isSolved(wrongRects, clues, ROWS, COLS)).toBe(false);
  });

  it("rejects when rect contains no clue", () => {
    // Swap: cover (0,0)-(1,0) area=2 (contains clue1=4 → mismatch) and (0,1)-(1,2) area=4 (contains clue2=2 → mismatch)
    const wrong: Rect[] = [
      { r0: 0, c0: 0, r1: 1, c1: 0 }, // area 2, contains clue1 (value 4) → invalid
      { r0: 0, c0: 1, r1: 1, c1: 2 }, // area 4, contains clue2 (value 2) → invalid
    ];
    expect(isSolved(wrong, clues, ROWS, COLS)).toBe(false);
  });

  it("rejects when rect count doesn't match clue count even if area sums match", () => {
    // Three rects that cover the 2×3 = 6 cells but don't match the 2 clues properly
    const threeRects: Rect[] = [
      { r0: 0, c0: 0, r1: 0, c1: 1 }, // area 2, contains clue1 (value 4) → invalid
      { r0: 1, c0: 0, r1: 1, c1: 1 }, // area 2, no clue → invalid
      { r0: 0, c0: 2, r1: 1, c1: 2 }, // area 2, contains clue2 (value 2) → valid
    ];
    expect(isSolved(threeRects, clues, ROWS, COLS)).toBe(false);
  });

  it("uses isSolved with the actual solution from generateShikaku", () => {
    const rng = makeRng("win-test");
    const { clues: gc, solution } = generateShikaku(5, 5, 6, rng);
    // Build the perfect player rects from the solution
    const playerRects: Rect[] = gc.map((k) => ({ ...solution.get(k.id)! }));
    expect(isSolved(playerRects, gc, 5, 5)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule-based win check — alternate partitions, overlaps, out-of-bounds
// ---------------------------------------------------------------------------
describe("isSolved — validates the rules, not identity with the stored solution", () => {
  // 2×2 grid, clues (0,0)=2 and (1,1)=2. Two different valid partitions exist:
  // two horizontal dominoes, or two vertical dominoes.
  const clues: Clue[] = [
    { id: 1, r: 0, c: 0, value: 2 },
    { id: 2, r: 1, c: 1, value: 2 },
  ];
  const horizontal: Rect[] = [
    { r0: 0, c0: 0, r1: 0, c1: 1 },
    { r0: 1, c0: 0, r1: 1, c1: 1 },
  ];
  const vertical: Rect[] = [
    { r0: 0, c0: 0, r1: 1, c1: 0 },
    { r0: 0, c0: 1, r1: 1, c1: 1 },
  ];

  it("accepts every valid partition, regardless of rectangle order", () => {
    expect(isSolved(horizontal, clues, 2, 2)).toBe(true);
    expect(isSolved(vertical, clues, 2, 2)).toBe(true);
    expect(isSolved([...vertical].reverse(), clues, 2, 2)).toBe(true);
  });

  it("rejects overlapping rectangles even when their areas sum to the grid area", () => {
    // Before the exact-cover check this passed: two individually valid rects
    // (4 + 2 = 6 cells on a 2×3 grid) that overlap on (1,1) and leave (0,2) empty.
    const twoByThree: Clue[] = [
      { id: 1, r: 0, c: 0, value: 4 },
      { id: 2, r: 1, c: 2, value: 2 },
    ];
    const overlapping: Rect[] = [
      { r0: 0, c0: 0, r1: 1, c1: 1 }, // valid on its own
      { r0: 1, c0: 1, r1: 1, c1: 2 }, // valid on its own, overlaps (1,1)
    ];
    expect(rectIsValid(overlapping[0], twoByThree)).toBe(true);
    expect(rectIsValid(overlapping[1], twoByThree)).toBe(true);
    expect(isSolved(overlapping, twoByThree, 2, 3)).toBe(false);
    // The same rectangle listed twice is an overlap too.
    expect(isSolved([horizontal[0], horizontal[0], horizontal[1]], clues, 2, 2)).toBe(false);
  });

  it("rejects rectangles that hang outside the grid or are inverted", () => {
    // Area/clue-wise these are fine; geometrically they leave the grid.
    expect(isSolved([{ r0: 0, c0: 0, r1: 0, c1: 1 }, { r0: 1, c0: 1, r1: 2, c1: 1 }], clues, 2, 2)).toBe(false);
    expect(isSolved([{ r0: 0, c0: -1, r1: 0, c1: 0 }, { r0: 1, c0: 0, r1: 1, c1: 1 }], clues, 2, 2)).toBe(false);
    expect(isSolved([{ r0: -1, c0: 0, r1: 0, c1: 0 }, { r0: 0, c0: 1, r1: 1, c1: 1 }], clues, 2, 2)).toBe(false);
    expect(isSolved([{ r0: 0, c0: 0, r1: 0, c1: 2 }, { r0: 1, c0: 0, r1: 1, c1: 1 }], clues, 2, 2)).toBe(false);
    // inverted corners (r0 > r1 / c0 > c1) are malformed, never a win
    expect(isSolved([{ r0: 1, c0: 0, r1: 0, c1: 1 }, { r0: 1, c0: 0, r1: 1, c1: 1 }], clues, 2, 2)).toBe(false);
    expect(isSolved([{ r0: 0, c0: 1, r1: 0, c1: 0 }, { r0: 1, c0: 0, r1: 1, c1: 1 }], clues, 2, 2)).toBe(false);
  });

  it("rejects a tiling that leaves a gap", () => {
    expect(isSolved([horizontal[0]], clues, 2, 2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Independent solver — written from the rules only, never from the generator
// ---------------------------------------------------------------------------

/** The difficulties the UI offers (mirrors DIFFS in ShikakuGame.vue). */
const UI_DIFFS = [
  { key: "easy", rows: 5, cols: 5, maxArea: 6 },
  { key: "medium", rows: 7, cols: 7, maxArea: 8 },
  { key: "hard", rows: 9, cols: 9, maxArea: 9 },
] as const;

/**
 * Backtracking exact-cover solver. The first uncovered cell (row-major) must be
 * the top-left corner of whichever rectangle covers it, so each step tries every
 * height × width anchored there and keeps those that are free, contain exactly
 * one clue, and whose area equals that clue. Returns up to `cap` partitions.
 */
function solvePartitions(
  rows: number,
  cols: number,
  clues: readonly Clue[],
  cap: number
): Rect[][] {
  const owner = new Int16Array(rows * cols).fill(-1);
  const found: Rect[][] = [];
  const stack: Rect[] = [];
  const paint = (R: Rect, v: number) => {
    for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) owner[r * cols + c] = v;
  };
  const isFree = (R: Rect) => {
    for (let r = R.r0; r <= R.r1; r++) {
      for (let c = R.c0; c <= R.c1; c++) if (owner[r * cols + c] >= 0) return false;
    }
    return true;
  };
  const search = (): boolean => {
    const first = owner.indexOf(-1);
    if (first < 0) {
      found.push(stack.map((R) => ({ ...R })));
      return found.length >= cap;
    }
    const r = Math.floor(first / cols);
    const c = first % cols;
    for (let h = 1; r + h <= rows; h++) {
      for (let w = 1; c + w <= cols; w++) {
        const R: Rect = { r0: r, c0: c, r1: r + h - 1, c1: c + w - 1 };
        if (!isFree(R)) continue;
        const inside = clues.filter((k) => containsCell(R, k.r, k.c));
        if (inside.length !== 1 || inside[0].value !== h * w) continue;
        paint(R, stack.length);
        stack.push(R);
        const done = search();
        stack.pop();
        paint(R, -1);
        if (done) return true;
      }
    }
    return false;
  };
  search();
  return found;
}

const rectKey = (R: Rect) => `${R.r0},${R.c0},${R.r1},${R.c1}`;
function samePartition(a: readonly Rect[], b: readonly Rect[]): boolean {
  const keys = new Set(a.map(rectKey));
  return a.length === b.length && b.every((R) => keys.has(rectKey(R)));
}

/** Plain string seeds, numeric seeds, and a full year of Daily-Challenge-style
 *  "YYYY-MM-DD" seeds (the component currently seeds from Math.random, but the
 *  generator must be sound for any seed the app could ever hand it). */
function sweepSeeds(): (string | number)[] {
  const seeds: (string | number)[] = [];
  for (let s = 0; s < 400; s++) seeds.push(`seed-${s}`);
  for (let s = 0; s < 200; s++) seeds.push(s);
  for (let day = 0; day < 365; day++) {
    seeds.push(new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10));
  }
  return seeds;
}

describe("generateShikaku — every UI difficulty × seed is solvable (independent solver)", () => {
  const SEEDS = sweepSeeds();

  for (const d of UI_DIFFS) {
    const label = `${d.key} ${d.rows}×${d.cols} maxArea=${d.maxArea}`;

    it(`${label}: ${SEEDS.length} seeds — stored answer is a valid tiling, solver finds a partition, isSolved agrees`, () => {
      let alternates = 0;
      let multi = 0;
      for (const seed of SEEDS) {
        const { clues, solution } = generateShikaku(d.rows, d.cols, d.maxArea, makeRng(seed));
        const tag = `${label} seed=${seed}`;

        // (d) not degenerate: several clues, every clue in-grid on its own cell,
        // 1 <= value <= maxArea, values sum to the grid area
        expect(clues.length, tag).toBeGreaterThanOrEqual(2);
        expect(new Set(clues.map((k) => `${k.r},${k.c}`)).size, tag).toBe(clues.length);
        expect(new Set(clues.map((k) => k.id)).size, tag).toBe(clues.length);
        for (const k of clues) {
          expect(k.r >= 0 && k.r < d.rows && k.c >= 0 && k.c < d.cols, tag).toBe(true);
          expect(k.value >= 1 && k.value <= d.maxArea, tag).toBe(true);
        }
        expect(clues.reduce((a, k) => a + k.value, 0), tag).toBe(d.rows * d.cols);

        // (c) clue value == area of its stored rect, clue inside it, and the
        // stored rects tile the grid exactly once
        const stored = clues.map((k) => solution.get(k.id)!);
        expect(solution.size, tag).toBe(clues.length);
        const cover = new Uint8Array(d.rows * d.cols);
        clues.forEach((k, i) => {
          expect(areaOf(stored[i]), tag).toBe(k.value);
          expect(containsCell(stored[i], k.r, k.c), tag).toBe(true);
          for (let r = stored[i].r0; r <= stored[i].r1; r++)
            for (let c = stored[i].c0; c <= stored[i].c1; c++) cover[r * d.cols + c]++;
        });
        expect(cover.every((n) => n === 1), tag).toBe(true);

        // (a) the independent solver finds at least one partition
        const partitions = solvePartitions(d.rows, d.cols, clues, 2);
        expect(partitions.length, tag).toBeGreaterThanOrEqual(1);
        if (partitions.length > 1) multi++;

        // (b) the win check accepts the stored answer and every solver partition
        expect(isSolved(stored, clues, d.rows, d.cols), tag).toBe(true);
        for (const P of partitions) {
          expect(isSolved(P, clues, d.rows, d.cols), tag).toBe(true);
          if (!samePartition(P, stored)) alternates++;
        }

        // (b) ...and rejects wrong / incomplete states built from the answer
        expect(isSolved(stored.slice(1), clues, d.rows, d.cols), `${tag} partial`).toBe(false);
        expect(isSolved([...stored, stored[0]], clues, d.rows, d.cols), `${tag} duplicate`).toBe(false);
        expect(
          isSolved([{ r0: 0, c0: 0, r1: d.rows - 1, c1: d.cols - 1 }], clues, d.rows, d.cols),
          `${tag} one big rect`
        ).toBe(false);
      }
      // Shikaku puzzles routinely admit several partitions; the win check must
      // accept partitions that differ from the stored one.
      expect(multi).toBeGreaterThan(0);
      expect(alternates).toBeGreaterThan(0);
    });
  }

  it("easy: isSolved accepts every partition the solver can enumerate", () => {
    let total = 0;
    for (let s = 0; s < 60; s++) {
      const { clues } = generateShikaku(5, 5, 6, makeRng(`enumerate-${s}`));
      const all = solvePartitions(5, 5, clues, 500);
      expect(all.length).toBeGreaterThanOrEqual(1);
      for (const P of all) expect(isSolved(P, clues, 5, 5), `enumerate-${s}`).toBe(true);
      total += all.length;
    }
    expect(total).toBeGreaterThan(60);
  });

  it("maxArea = 2 (dominoes only) still yields a valid puzzle instead of dividing by zero", () => {
    const { clues, solution } = generateShikaku(4, 4, 2, makeRng("dominoes"));
    expect(clues.every((k) => k.value === 1 || k.value === 2)).toBe(true);
    expect(clues.some((k) => k.value === 2)).toBe(true);
    expect(clues.reduce((a, k) => a + k.value, 0)).toBe(16);
    const stored = clues.map((k) => solution.get(k.id)!);
    expect(isSolved(stored, clues, 4, 4)).toBe(true);
    expect(solvePartitions(4, 4, clues, 1)).toHaveLength(1);
  });
});
