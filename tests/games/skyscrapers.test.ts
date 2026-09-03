import { describe, expect, it } from "vitest";
import { makeRng } from "~/utils/rng";
import {
  CLUE_SIDES,
  SKYSCRAPERS_SIZES,
  clueStates,
  cluesFor,
  duplicateCells,
  generatePuzzle,
  initialGivenCount,
  isSolved,
  latinSquare,
  lineFrom,
  lineIndex,
  minClueCount,
  solve,
  solveBounded,
  visibleCount,
  type SkyscrapersClues,
  type SkyscrapersPuzzle,
} from "~/games/skyscrapers";

/* -------------------------------------------------------------------------- */
/* Independent reference solver written from the rules — it does not reuse    */
/* the module's helpers, so it can catch bugs in them.                        */
/* -------------------------------------------------------------------------- */

/** Walk along the heights and count every building taller than all before it. */
function seenFrom(heights: number[]): number {
  let tallest = 0;
  let count = 0;
  for (const h of heights) {
    if (h > tallest) {
      tallest = h;
      count++;
    }
  }
  return count;
}

function permutations(n: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const used = new Array<boolean>(n + 1).fill(false);
  (function go() {
    if (cur.length === n) {
      out.push(cur.slice());
      return;
    }
    for (let v = 1; v <= n; v++) {
      if (used[v]) continue;
      used[v] = true;
      cur.push(v);
      go();
      cur.pop();
      used[v] = false;
    }
  })();
  return out;
}

const PERMS: Record<number, number[][]> = {};

/** Enumerates Latin squares row by row (rows are permutations, columns must not
 *  repeat), checks each finished row against its left/right clues, each column
 *  prefix against its top clue (buildings seen so far can only grow) and the
 *  full columns at the end. Returns up to `cap` solutions as 2-D arrays. */
function referenceSolve(puzzle: SkyscrapersPuzzle, cap = 2): number[][][] {
  const n = puzzle.size;
  const { top, bottom, left, right } = puzzle.clues;
  const perms = (PERMS[n] ??= permutations(n));
  const rows: number[][] = [];
  const found: number[][][] = [];

  /** Rule-derived bounds for a column whose top rows are placed: from the top
   *  the count can only grow until the tallest building (n) is placed and is
   *  then final; from the bottom everything above n is hidden, so without n
   *  placed the bottom clue can only be met by the unfilled rows. */
  function columnOk(c: number): boolean {
    const column = rows.map((row) => row[c]);
    const unfilled = n - column.length;
    const hasTallest = column.includes(n);
    const fromTop = seenFrom(column);
    if (top[c]) {
      if (hasTallest || unfilled === 0) {
        if (fromTop !== top[c]) return false;
      } else if (fromTop >= top[c]) return false;
    }
    if (bottom[c]) {
      if (!hasTallest) {
        if (bottom[c] > unfilled) return false;
      } else {
        const fromBottom = seenFrom(column.slice().reverse());
        if (unfilled === 0) {
          if (fromBottom !== bottom[c]) return false;
        } else if (bottom[c] < 2 || bottom[c] > unfilled + fromBottom) return false;
      }
    }
    return true;
  }

  function place(r: number): void {
    if (found.length >= cap) return;
    if (r === n) {
      found.push(rows.map((row) => row.slice()));
      return;
    }
    for (const perm of perms) {
      let ok = true;
      for (let c = 0; c < n && ok; c++) {
        const given = puzzle.givens[r * n + c];
        if (given && given !== perm[c]) ok = false;
        for (const prev of rows) if (prev[c] === perm[c]) ok = false;
      }
      if (!ok) continue;
      if (left[r] && seenFrom(perm) !== left[r]) continue;
      if (right[r] && seenFrom(perm.slice().reverse()) !== right[r]) continue;
      rows.push(perm);
      let columnsOk = true;
      for (let c = 0; c < n && columnsOk; c++) columnsOk = columnOk(c);
      if (columnsOk) place(r + 1);
      rows.pop();
      if (found.length >= cap) return;
    }
  }

  place(0);
  return found;
}

function isLatin(grid: number[], n: number): boolean {
  if (grid.length !== n * n) return false;
  for (let i = 0; i < n; i++) {
    const row = new Set<number>();
    const col = new Set<number>();
    for (let j = 0; j < n; j++) {
      const a = grid[i * n + j];
      if (!Number.isInteger(a) || a < 1 || a > n) return false;
      row.add(a);
      col.add(grid[j * n + i]);
    }
    if (row.size !== n || col.size !== n) return false;
  }
  return true;
}

function allClues(clues: SkyscrapersClues): number[] {
  return [...clues.top, ...clues.bottom, ...clues.left, ...clues.right];
}

/** Plain seeds interleaved with Daily-Challenge seeds in the form the
 *  component builds them: `${"YYYY-MM-DD"}:skyscrapers:${size}`. */
function seedsFor(size: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    if (i % 2 === 0) return `sky-${size}-${i}`;
    const k = i >> 1;
    const month = String((Math.floor(k / 28) % 12) + 1).padStart(2, "0");
    const day = String((k % 28) + 1).padStart(2, "0");
    return `2026-${month}-${day}:skyscrapers:${size}`;
  });
}

const SEED_COUNTS: Record<number, number> = { 4: 60, 5: 60, 6: 16 };

// 4×4: rows 1234 / 2341 / 3412 / 4123
const SQUARE_4 = [1, 2, 3, 4, 2, 3, 4, 1, 3, 4, 1, 2, 4, 1, 2, 3];
const CLUES_4: SkyscrapersClues = {
  top: [4, 3, 2, 1],
  bottom: [1, 2, 2, 2],
  left: [4, 3, 2, 1],
  right: [1, 2, 2, 2],
};

describe("skyscrapers rules", () => {
  it("counts visible buildings", () => {
    expect(visibleCount([])).toBe(0);
    expect(visibleCount([1, 2, 3, 4])).toBe(4);
    expect(visibleCount([4, 3, 2, 1])).toBe(1);
    expect(visibleCount([2, 1, 4, 3])).toBe(2);
    expect(visibleCount([3, 1, 4, 2, 5])).toBe(3);
    // Empty cells (0) are never visible and never hide anything.
    expect(visibleCount([0, 2, 0, 3])).toBe(2);
    expect(visibleCount([0, 0, 0])).toBe(0);
  });

  it("reads lines from every side", () => {
    const grid = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(lineFrom(grid, 3, "top", 0)).toEqual([1, 4, 7]);
    expect(lineFrom(grid, 3, "bottom", 0)).toEqual([7, 4, 1]);
    expect(lineFrom(grid, 3, "left", 1)).toEqual([4, 5, 6]);
    expect(lineFrom(grid, 3, "right", 1)).toEqual([6, 5, 4]);
    expect(lineIndex(3, "right", 2, 0)).toBe(8);
    expect(CLUE_SIDES).toEqual(["top", "bottom", "left", "right"]);
  });

  it("computes clues from a grid", () => {
    expect(cluesFor(SQUARE_4, 4)).toEqual(CLUES_4);
    for (const side of CLUE_SIDES) {
      for (let i = 0; i < 4; i++) {
        expect(CLUES_4[side][i]).toBe(seenFrom(lineFrom(SQUARE_4, 4, side, i)));
      }
    }
  });

  it("builds random Latin squares deterministically", () => {
    for (const n of [3, 4, 5, 6, 7]) {
      const a = latinSquare(makeRng(`latin-${n}`), n);
      expect(isLatin(a, n)).toBe(true);
      expect(latinSquare(makeRng(`latin-${n}`), n)).toEqual(a);
      expect(latinSquare(makeRng(`latin-${n}-other`), n)).not.toEqual(a);
    }
  });

  it("exposes the three board sizes", () => {
    expect(SKYSCRAPERS_SIZES.map((s) => s.size)).toEqual([4, 5, 6]);
    expect(SKYSCRAPERS_SIZES.map((s) => s.label)).toEqual(["簡單", "普通", "困難"]);
    expect(initialGivenCount(4)).toBe(0);
    expect(initialGivenCount(5)).toBe(0);
    expect(initialGivenCount(6)).toBe(2);
    expect(minClueCount(4)).toBe(8);
    expect(minClueCount(6)).toBe(12);
  });
});

describe("skyscrapers solver", () => {
  it("solves a fully-clued square and respects the solution limit", () => {
    expect(solve(CLUES_4, 4)).toEqual([SQUARE_4]);
    expect(solveBounded(CLUES_4, 4).nodes).toBeGreaterThan(0);

    // Without clues every Latin square is a solution; the limit caps the list.
    const none: SkyscrapersClues = { top: [0, 0, 0, 0], bottom: [0, 0, 0, 0], left: [0, 0, 0, 0], right: [0, 0, 0, 0] };
    expect(solve(none, 4, [], 1)).toHaveLength(1);
    expect(solve(none, 4, [], 5)).toHaveLength(5);
    expect(solve(none, 4, [], 600)).toHaveLength(576);
    for (const s of solve(none, 4, [], 600)) expect(isLatin(s, 4)).toBe(true);
  });

  it("honours givens and rejects impossible ones", () => {
    const none: SkyscrapersClues = { top: [0, 0, 0, 0], bottom: [0, 0, 0, 0], left: [0, 0, 0, 0], right: [0, 0, 0, 0] };
    const withGivens = solve(none, 4, [1, 2, 3, 4, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0], 100);
    expect(withGivens).toHaveLength(4);
    for (const s of withGivens) expect(s.slice(0, 4)).toEqual([1, 2, 3, 4]);
    // The full solution as givens yields exactly itself.
    expect(solve(CLUES_4, 4, SQUARE_4)).toEqual([SQUARE_4]);

    // Two equal givens in a row: no solution, no search.
    const clash = solveBounded(none, 4, [1, 1, 0, 0]);
    expect(clash).toEqual({ solutions: [], aborted: false, nodes: 0 });
    // Same in a column.
    expect(solve(none, 4, [1, 0, 0, 0, 1])).toEqual([]);
    // A full row of givens that contradicts its clue (left clue 4 needs 1,2,3,4).
    expect(solveBounded(CLUES_4, 4, [4, 3, 2, 1])).toEqual({ solutions: [], aborted: false, nodes: 0 });
    // A wrong given inside the grid is found during the search instead.
    expect(solve(CLUES_4, 4, [0, 0, 0, 0, 0, 4])).toEqual([]);
  });

  it("stops at the node cap and reports it", () => {
    const none: SkyscrapersClues = { top: [0, 0, 0, 0, 0], bottom: [0, 0, 0, 0, 0], left: [0, 0, 0, 0, 0], right: [0, 0, 0, 0, 0] };
    const capped = solveBounded(none, 5, [], 1000, 50);
    expect(capped.aborted).toBe(true);
    expect(capped.nodes).toBe(51);
    expect(capped.solutions.length).toBeLessThan(1000);
    const free = solveBounded(none, 5, [], 3);
    expect(free.aborted).toBe(false);
    expect(free.solutions).toHaveLength(3);
  });

  it("prunes with partial clues the same way the reference solver does", () => {
    // Hide a few clues from the 4×4 square and compare against the reference solver.
    for (let i = 0; i < 30; i++) {
      const rng = makeRng(`prune-${i}`);
      const clues: SkyscrapersClues = { top: [], bottom: [], left: [], right: [] };
      for (const side of CLUE_SIDES) clues[side] = CLUES_4[side].map((v) => (rng.bool(0.5) ? v : 0));
      const puzzle: SkyscrapersPuzzle = { size: 4, clues, solution: SQUARE_4, givens: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
      const ours = solve(clues, 4, [], 1000).map((s) => s.join(""));
      const theirs = referenceSolve(puzzle, 1000).map((s) => s.flat().join(""));
      expect(ours.sort()).toEqual(theirs.sort());
      expect(ours).toContain(SQUARE_4.join(""));
    }
  });
});

describe("skyscrapers generator (independent solver)", () => {
  for (const { size } of SKYSCRAPERS_SIZES) {
    it(`${size}×${size}: every seed has exactly one solution, the stored one`, () => {
      let hidden = 0;
      let extraGivens = 0;
      for (const seed of seedsFor(size, SEED_COUNTS[size])) {
        const puzzle = generatePuzzle(makeRng(seed), size);
        const n = puzzle.size;
        expect(n).toBe(size);
        expect(isLatin(puzzle.solution, n)).toBe(true);

        // Givens are copies of the solution; small boards start with none.
        expect(puzzle.givens).toHaveLength(n * n);
        const givenCount = puzzle.givens.filter(Boolean).length;
        expect(givenCount).toBeGreaterThanOrEqual(initialGivenCount(n));
        expect(givenCount).toBeLessThanOrEqual(initialGivenCount(n) + 5);
        if (givenCount > initialGivenCount(n)) extraGivens++;
        puzzle.givens.forEach((g, i) => {
          if (g) expect(g).toBe(puzzle.solution[i]);
        });

        // Every shown clue is what the solution shows from that side.
        const full = cluesFor(puzzle.solution, n);
        for (const side of CLUE_SIDES) {
          expect(puzzle.clues[side]).toHaveLength(n);
          puzzle.clues[side].forEach((clue, i) => {
            if (clue) expect(clue).toBe(seenFrom(lineFrom(puzzle.solution, n, side, i)));
            if (clue) expect(clue).toBe(full[side][i]);
            else hidden++;
          });
        }
        const shown = allClues(puzzle.clues).filter(Boolean).length;
        expect(shown).toBeGreaterThanOrEqual(minClueCount(n));
        expect(shown).toBeLessThanOrEqual(4 * n);

        // Independent proof of uniqueness.
        const found = referenceSolve(puzzle, 2);
        expect(found).toHaveLength(1);
        expect(found[0].flat()).toEqual(puzzle.solution);
        expect(isSolved(puzzle.solution, puzzle.clues, n)).toBe(true);
        expect(isSolved(puzzle.givens, puzzle.clues, n)).toBe(false);
      }
      // Clue removal actually happened; extra givens are the exception on
      // small boards and the norm on 6×6, where full clues rarely pin a square.
      expect(hidden).toBeGreaterThan(0);
      if (size === 6) expect(extraGivens).toBeGreaterThan(0);
      else expect(extraGivens).toBeLessThanOrEqual(SEED_COUNTS[size] / 10);
    });
  }

  it("keeps uniqueness at every removal step", () => {
    // Re-adding any hidden clue keeps the puzzle unique; hiding one more of
    // the shown clues on a minimal board sometimes breaks it, which is why the
    // generator stops where it does.
    let broke = 0;
    for (let i = 0; i < 12; i++) {
      const puzzle = generatePuzzle(makeRng(`sky-step-${i}`), 4);
      const full = cluesFor(puzzle.solution, 4);
      for (const side of CLUE_SIDES) {
        for (let k = 0; k < 4; k++) {
          const clues = { top: [...puzzle.clues.top], bottom: [...puzzle.clues.bottom], left: [...puzzle.clues.left], right: [...puzzle.clues.right] };
          if (!clues[side][k]) {
            clues[side][k] = full[side][k];
            expect(solve(clues, 4, puzzle.givens)).toEqual([puzzle.solution]);
          } else {
            clues[side][k] = 0;
            const sols = solve(clues, 4, puzzle.givens, 1000);
            expect(sols.length).toBeGreaterThanOrEqual(1);
            expect(sols).toContainEqual(puzzle.solution);
            if (sols.length > 1) broke++;
          }
        }
      }
    }
    expect(broke).toBeGreaterThan(0);
  });

  it("is deterministic for a seed", () => {
    for (const { size } of SKYSCRAPERS_SIZES) {
      const seed = `2026-09-04:skyscrapers:${size}`;
      const a = generatePuzzle(makeRng(seed), size);
      const b = generatePuzzle(makeRng(seed), size);
      expect(a).toEqual(b);
      const c = generatePuzzle(makeRng(`2026-09-05:skyscrapers:${size}`), size);
      expect(c.solution).not.toEqual(a.solution);
    }
  });

  it("falls back to given cells when the search budget is too small", () => {
    // With a node cap of 1 nothing can be proven unless the grid is fully
    // given, so the generator keeps adding givens and still returns a valid,
    // trivially unique puzzle.
    const puzzle = generatePuzzle(makeRng("sky-capped"), 4, 1);
    expect(isLatin(puzzle.solution, 4)).toBe(true);
    expect(puzzle.givens).toEqual(puzzle.solution);
    expect(allClues(puzzle.clues).filter(Boolean).length).toBe(minClueCount(4));
    expect(referenceSolve(puzzle, 2)).toHaveLength(1);
    expect(isSolved(puzzle.givens, puzzle.clues, 4)).toBe(true);
  });
});

describe("skyscrapers board checks", () => {
  it("flags duplicated numbers in rows and columns", () => {
    expect(duplicateCells([0, 0, 0, 0], 2)).toEqual([false, false, false, false]);
    expect(duplicateCells([1, 1, 0, 0], 2)).toEqual([true, true, false, false]);
    expect(duplicateCells([1, 0, 1, 0], 2)).toEqual([true, false, true, false]);
    expect(duplicateCells([1, 2, 2, 1], 2)).toEqual([false, false, false, false]);
    expect(duplicateCells([2, 1, 2, 2], 2)).toEqual([true, false, true, true]);
    expect(duplicateCells(SQUARE_4, 4).some(Boolean)).toBe(false);
  });

  it("reports pending, satisfied and broken clues", () => {
    const empty = new Array(16).fill(0);
    const pending = clueStates(empty, CLUES_4, 4);
    for (const side of CLUE_SIDES) expect(pending[side]).toEqual(["pending", "pending", "pending", "pending"]);

    const ok = clueStates(SQUARE_4, CLUES_4, 4);
    for (const side of CLUE_SIDES) expect(ok[side]).toEqual(["ok", "ok", "ok", "ok"]);

    // Only the first row filled, in reverse: left clue 4 broken, right clue 1 broken, columns pending.
    const rowOnly = [4, 3, 2, 1, ...new Array(12).fill(0)];
    const partial = clueStates(rowOnly, CLUES_4, 4);
    expect(partial.left).toEqual(["bad", "pending", "pending", "pending"]);
    expect(partial.right).toEqual(["bad", "pending", "pending", "pending"]);
    expect(partial.top).toEqual(["pending", "pending", "pending", "pending"]);

    // Hidden clues stay pending even on a full line.
    const hidden: SkyscrapersClues = { ...CLUES_4, left: [0, 3, 2, 1] };
    expect(clueStates(SQUARE_4, hidden, 4).left).toEqual(["pending", "ok", "ok", "ok"]);
  });

  it("decides when the board is solved", () => {
    expect(isSolved(SQUARE_4, CLUES_4, 4)).toBe(true);
    // Hidden clues do not matter.
    expect(isSolved(SQUARE_4, { top: [0, 0, 0, 0], bottom: [0, 0, 0, 0], left: [0, 0, 0, 0], right: [0, 0, 0, 0] }, 4)).toBe(true);
    // Any other Latin square breaks some visible clue.
    const swapped = [2, 1, 3, 4, 1, 2, 4, 3, 3, 4, 1, 2, 4, 3, 2, 1];
    expect(isLatin(swapped, 4)).toBe(true);
    expect(isSolved(swapped, CLUES_4, 4)).toBe(false);
    // Incomplete, out-of-range, duplicated or mis-sized grids are never solved.
    expect(isSolved(SQUARE_4.map((v, i) => (i === 5 ? 0 : v)), CLUES_4, 4)).toBe(false);
    expect(isSolved(SQUARE_4.map((v, i) => (i === 5 ? 7 : v)), CLUES_4, 4)).toBe(false);
    expect(isSolved(SQUARE_4.map((v, i) => (i === 5 ? 1 : v)), CLUES_4, 4)).toBe(false);
    expect(isSolved(SQUARE_4.slice(0, 15), CLUES_4, 4)).toBe(false);
  });
});
