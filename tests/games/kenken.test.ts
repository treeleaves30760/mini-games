import { describe, expect, it } from "vitest";
import { makeRng } from "~/utils/rng";
import {
  KENKEN_DIFFICULTIES,
  cageEdges,
  cageLabel,
  cageSatisfied,
  cellHasDuplicate,
  generateKenKenPuzzle,
  getKenKenDifficulty,
  isKenKenSolved,
  type KenKenCage,
  type KenKenOp,
  type KenKenPuzzle,
} from "~/games/kenken";

/* -------------------------------------------------------------------------- */
/* Independent reference implementation — deliberately does not reuse the      */
/* module's own rule checks, so it can catch bugs in them.                     */
/* -------------------------------------------------------------------------- */

/** Can the values placed so far in a cage still reach its target? With every
 *  cell placed this is the exact cage rule. */
function cageFeasible(cage: KenKenCage, filled: number[], size: number): boolean {
  const remaining = cage.cells.length - filled.length;
  switch (cage.op) {
    case "=":
      return cage.cells.length === 1 && filled[0] === cage.target;
    case "+": {
      const sum = filled.reduce((a, b) => a + b, 0);
      return remaining === 0
        ? sum === cage.target
        : sum + remaining <= cage.target && sum + remaining * size >= cage.target;
    }
    case "×": {
      const product = filled.reduce((a, b) => a * b, 1);
      return remaining === 0 ? product === cage.target : cage.target % product === 0;
    }
    case "-": {
      if (cage.cells.length !== 2) return false;
      if (remaining === 0) return Math.abs(filled[0] - filled[1]) === cage.target;
      return filled[0] + cage.target <= size || filled[0] - cage.target >= 1;
    }
    case "÷": {
      if (cage.cells.length !== 2) return false;
      if (remaining === 0) {
        return Math.max(filled[0], filled[1]) === Math.min(filled[0], filled[1]) * cage.target;
      }
      return filled[0] * cage.target <= size || filled[0] % cage.target === 0;
    }
  }
  return false;
}

/** Backtracking solver (most-constrained cell first) that counts solutions up to `cap`. */
function countSolutions(puzzle: KenKenPuzzle, cap = 2): number[][] {
  const n = puzzle.size;
  const cells = new Array<number>(n * n).fill(0);
  const rowUsed = Array.from({ length: n }, () => new Array<boolean>(n + 1).fill(false));
  const colUsed = Array.from({ length: n }, () => new Array<boolean>(n + 1).fill(false));
  const solutions: number[][] = [];

  function candidates(idx: number): number[] {
    const r = Math.floor(idx / n);
    const c = idx % n;
    const cage = puzzle.cages[puzzle.cageOf[idx]];
    const out: number[] = [];
    for (let v = 1; v <= n; v++) {
      if (rowUsed[r][v] || colUsed[c][v]) continue;
      cells[idx] = v;
      const placed = cage.cells.map((i) => cells[i]).filter((x) => x !== 0);
      if (cageFeasible(cage, placed, n)) out.push(v);
      cells[idx] = 0;
    }
    return out;
  }

  function search(filled: number): void {
    if (solutions.length >= cap) return;
    if (filled === n * n) {
      solutions.push(cells.slice());
      return;
    }
    let best = -1;
    let bestCands: number[] = [];
    for (let i = 0; i < n * n; i++) {
      if (cells[i] !== 0) continue;
      const cands = candidates(i);
      if (cands.length === 0) return;
      if (best === -1 || cands.length < bestCands.length) {
        best = i;
        bestCands = cands;
        if (cands.length === 1) break;
      }
    }
    const r = Math.floor(best / n);
    const c = best % n;
    for (const v of bestCands) {
      cells[best] = v;
      rowUsed[r][v] = colUsed[c][v] = true;
      search(filled + 1);
      cells[best] = 0;
      rowUsed[r][v] = colUsed[c][v] = false;
      if (solutions.length >= cap) return;
    }
  }

  search(0);
  return solutions;
}

function isLatin(grid: number[], size: number): boolean {
  for (let i = 0; i < size; i++) {
    const row = new Set<number>();
    const col = new Set<number>();
    for (let j = 0; j < size; j++) {
      const a = grid[i * size + j];
      const b = grid[j * size + i];
      if (!Number.isInteger(a) || a < 1 || a > size) return false;
      row.add(a);
      col.add(b);
    }
    if (row.size !== size || col.size !== size) return false;
  }
  return true;
}

function isConnected(cells: number[], size: number): boolean {
  const set = new Set(cells);
  const seen = new Set<number>([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const idx = stack.pop() as number;
    const r = Math.floor(idx / size);
    const c = idx % size;
    const next = [
      r > 0 ? idx - size : -1,
      r + 1 < size ? idx + size : -1,
      c > 0 ? idx - 1 : -1,
      c + 1 < size ? idx + 1 : -1,
    ];
    for (const other of next) {
      if (other >= 0 && set.has(other) && !seen.has(other)) {
        seen.add(other);
        stack.push(other);
      }
    }
  }
  return seen.size === cells.length;
}

/** Plain seeds interleaved with Daily-Challenge seeds in exactly the form
 *  KenKenGame.vue builds them: `${"YYYY-MM-DD"}:kenken:${difficulty}`. */
function seedsFor(key: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    if (i % 2 === 0) return `kenken-seed-${i}`;
    const k = i >> 1;
    const year = 2026 + Math.floor(k / 336);
    const month = String((Math.floor(k / 28) % 12) + 1).padStart(2, "0");
    const day = String((k % 28) + 1).padStart(2, "0");
    return `${year}-${month}-${day}:kenken:${key}`;
  });
}

// 7×7 puzzles are the slow ones for the reference solver; the smaller sizes get
// more seeds because they are cheap.
const SEED_COUNTS: Record<string, number> = { easy: 300, normal: 300, hard: 300, expert: 120 };

const cage = (op: KenKenOp, target: number, cells: number[]): KenKenCage => ({ id: 0, cells, op, target });

describe("kenken", () => {
  it("generates valid puzzles for every difficulty", () => {
    for (const difficulty of KENKEN_DIFFICULTIES) {
      const puzzle = generateKenKenPuzzle(makeRng(`kenken-${difficulty.key}`), difficulty.key);
      expect(puzzle.size).toBe(difficulty.size);
      expect(puzzle.solution).toHaveLength(puzzle.size * puzzle.size);
      expect(puzzle.cageOf).toHaveLength(puzzle.size * puzzle.size);

      const covered = new Set(puzzle.cages.flatMap((cage) => cage.cells));
      expect(covered.size).toBe(puzzle.size * puzzle.size);
      expect(puzzle.cages.every((cage) => cageSatisfied(cage, puzzle.solution))).toBe(true);
      expect(isKenKenSolved(puzzle, puzzle.solution)).toBe(true);
    }
  });

  it("detects row and column duplicates", () => {
    const puzzle = generateKenKenPuzzle(makeRng("kenken-duplicate"), "easy");
    const cells = puzzle.solution.slice();
    cells[1] = cells[0];
    expect(cellHasDuplicate(cells, puzzle.size, 0)).toBe(true);
    expect(isKenKenSolved(puzzle, cells)).toBe(false);

    const column = puzzle.solution.slice();
    column[puzzle.size] = column[0];
    expect(cellHasDuplicate(column, puzzle.size, 0)).toBe(true);
    expect(cellHasDuplicate(column, puzzle.size, puzzle.size)).toBe(true);
    expect(isKenKenSolved(puzzle, column)).toBe(false);

    expect(cellHasDuplicate([null, 1, 1, null], 2, 0)).toBe(false);
  });

  it("rejects incomplete boards", () => {
    const puzzle = generateKenKenPuzzle(makeRng("kenken-incomplete"), "normal");
    const cells = puzzle.solution.slice() as (number | null)[];
    cells[0] = null;
    expect(isKenKenSolved(puzzle, cells)).toBe(false);
    expect(cageSatisfied(puzzle.cages[puzzle.cageOf[0]], cells)).toBe(false);
  });

  it("falls back to normal for unknown difficulties and defaults to it", () => {
    expect(getKenKenDifficulty("bogus").key).toBe("normal");
    const puzzle = generateKenKenPuzzle(makeRng("kenken-default"));
    expect(puzzle.difficulty).toBe("normal");
    expect(puzzle.size).toBe(5);
    expect(generateKenKenPuzzle(makeRng("kenken-default"), "bogus")).toEqual(puzzle);
  });

  it("is deterministic for a seed", () => {
    for (const difficulty of KENKEN_DIFFICULTIES) {
      const seed = `2026-08-29:kenken:${difficulty.key}`;
      const a = generateKenKenPuzzle(makeRng(seed), difficulty.key);
      const b = generateKenKenPuzzle(makeRng(seed), difficulty.key);
      expect(a).toEqual(b);
      const c = generateKenKenPuzzle(makeRng(`2026-08-30:kenken:${difficulty.key}`), difficulty.key);
      expect(c.solution).not.toEqual(a.solution);
    }
  });
});

describe("kenken solvability (independent solver)", () => {
  for (const difficulty of KENKEN_DIFFICULTIES) {
    it(`${difficulty.key} (${difficulty.size}×${difficulty.size}): every seed is well-formed, solvable, and every solution wins`, () => {
      let alternatives = 0;
      for (const seed of seedsFor(difficulty.key, SEED_COUNTS[difficulty.key])) {
        const puzzle = generateKenKenPuzzle(makeRng(seed), difficulty.key);
        const n = puzzle.size;
        expect(n).toBe(difficulty.size);
        expect(puzzle.difficulty).toBe(difficulty.key);

        // (d) cages partition the grid exactly: every cell is in exactly one
        // connected cage, ids match positions and cageOf agrees with cages.
        expect(puzzle.cages.reduce((sum, cage) => sum + cage.cells.length, 0)).toBe(n * n);
        expect(new Set(puzzle.cages.flatMap((cage) => cage.cells)).size).toBe(n * n);
        expect(puzzle.cageOf).toHaveLength(n * n);
        puzzle.cages.forEach((cage, i) => {
          expect(cage.id).toBe(i);
          expect(cage.cells.length).toBeGreaterThanOrEqual(1);
          expect(cage.cells.length).toBeLessThanOrEqual(difficulty.maxCage);
          expect(isConnected(cage.cells, n)).toBe(true);
          // The label cell (cells[0]) is the cage's top-left cell.
          expect(cage.cells).toEqual([...cage.cells].sort((a, b) => a - b));
          for (const cell of cage.cells) expect(puzzle.cageOf[cell]).toBe(i);

          if (cage.cells.length === 1) expect(cage.op).toBe("=");
          if (cage.op === "=") expect(cage.cells).toHaveLength(1);
          if (cage.op === "-" || cage.op === "÷") expect(cage.cells).toHaveLength(2);
          if (cage.op === "-") {
            expect(cage.target).toBeGreaterThanOrEqual(1);
            expect(cage.target).toBeLessThanOrEqual(n - 1);
          }
          if (cage.op === "÷") {
            expect(Number.isInteger(cage.target)).toBe(true);
            expect(cage.target).toBeGreaterThanOrEqual(2);
            expect(cage.target).toBeLessThanOrEqual(n);
          }
          if (difficulty.key === "easy") expect(["=", "+", "×"]).toContain(cage.op);
          if (cage.cells.length > 2) expect(["+", "×"]).toContain(cage.op);
          // No cage target is impossible: the stored solution reaches it.
          expect(cageFeasible(cage, cage.cells.map((cell) => puzzle.solution[cell]), n)).toBe(true);
        });

        // (a) the stored solution is a Latin square that satisfies every cage.
        expect(isLatin(puzzle.solution, n)).toBe(true);
        expect(puzzle.cages.every((cage) => cageSatisfied(cage, puzzle.solution))).toBe(true);
        expect(isKenKenSolved(puzzle, puzzle.solution)).toBe(true);

        // (b) the independent solver finds at least one solution; every one it
        // finds — including alternatives that differ from the stored solution —
        // is accepted by the win check. If exactly one exists it is the stored one.
        const solutions = countSolutions(puzzle, 2);
        expect(solutions.length).toBeGreaterThanOrEqual(1);
        if (solutions.length === 1) expect(solutions[0]).toEqual(puzzle.solution);
        for (const solution of solutions) {
          expect(isLatin(solution, n)).toBe(true);
          expect(isKenKenSolved(puzzle, solution)).toBe(true);
          if (solution.some((v, i) => v !== puzzle.solution[i])) alternatives++;
        }
      }
      // Cages cut from a random Latin square are often not unique; the win
      // check must therefore be rule-based, which the loop above verified on
      // real alternative grids.
      expect(alternatives).toBeGreaterThan(0);
    });
  }

  it("(c) rejects valid Latin squares that break a cage", () => {
    let rejected = 0;
    for (const difficulty of KENKEN_DIFFICULTIES) {
      for (let i = 0; i < 20; i++) {
        const puzzle = generateKenKenPuzzle(makeRng(`kenken-flip-${i}`), difficulty.key);
        // Relabel v -> size + 1 - v: still a Latin square, but cage targets no longer match.
        const flipped = puzzle.solution.map((v) => puzzle.size + 1 - v);
        expect(isLatin(flipped, puzzle.size)).toBe(true);
        const cagesOk = puzzle.cages.every((cage) => cageFeasible(cage, cage.cells.map((c) => flipped[c]), puzzle.size));
        expect(isKenKenSolved(puzzle, flipped)).toBe(cagesOk);
        if (!cagesOk) rejected++;

        // Swapping two values inside one row breaks the Latin rule in the columns.
        const broken = puzzle.solution.slice();
        [broken[0], broken[1]] = [broken[1], broken[0]];
        expect(isKenKenSolved(puzzle, broken)).toBe(false);
      }
    }
    expect(rejected).toBeGreaterThan(0);
  });
});

describe("kenken rule helpers", () => {
  it("formats cage labels", () => {
    expect(cageLabel(cage("=", 3, [0]))).toBe("3");
    expect(cageLabel(cage("+", 7, [0, 1]))).toBe("7+");
    expect(cageLabel(cage("-", 1, [0, 1]))).toBe("1-");
    expect(cageLabel(cage("×", 12, [0, 1]))).toBe("12×");
    expect(cageLabel(cage("÷", 2, [0, 1]))).toBe("2÷");
  });

  it("evaluates every operation and rejects malformed cages", () => {
    expect(cageSatisfied(cage("=", 3, [0]), [3])).toBe(true);
    expect(cageSatisfied(cage("=", 3, [0]), [2])).toBe(false);
    expect(cageSatisfied(cage("+", 7, [0, 1, 2]), [1, 2, 4])).toBe(true);
    expect(cageSatisfied(cage("+", 7, [0, 1, 2]), [1, 2, 3])).toBe(false);
    expect(cageSatisfied(cage("×", 8, [0, 1, 2]), [1, 2, 4])).toBe(true);
    expect(cageSatisfied(cage("×", 8, [0, 1, 2]), [1, 2, 3])).toBe(false);
    expect(cageSatisfied(cage("-", 2, [0, 1]), [1, 3])).toBe(true);
    expect(cageSatisfied(cage("-", 2, [0, 1]), [3, 1])).toBe(true);
    expect(cageSatisfied(cage("-", 2, [0, 1]), [1, 4])).toBe(false);
    expect(cageSatisfied(cage("÷", 2, [0, 1]), [2, 4])).toBe(true);
    expect(cageSatisfied(cage("÷", 2, [0, 1]), [4, 2])).toBe(true);
    expect(cageSatisfied(cage("÷", 2, [0, 1]), [3, 4])).toBe(false);
    // The ratio must divide evenly; a non-integer target can never be met.
    expect(cageSatisfied(cage("÷", 1.5, [0, 1]), [2, 3])).toBe(false);
    // Defensive: a zero value never satisfies a division cage.
    expect(cageSatisfied(cage("÷", 2, [0, 1]), [0, 2])).toBe(false);
    // − and ÷ are only defined for two-cell cages.
    expect(cageSatisfied(cage("-", 1, [0, 1, 2]), [1, 2, 3])).toBe(false);
    expect(cageSatisfied(cage("÷", 2, [0, 1, 2]), [1, 2, 4])).toBe(false);
    // Incomplete cages are never satisfied.
    expect(cageSatisfied(cage("+", 3, [0, 1]), [1, null])).toBe(false);
    // Unknown operators (malformed data) are never satisfied.
    expect(cageSatisfied(cage("%" as KenKenOp, 1, [0, 1]), [1, 2])).toBe(false);
  });

  it("reports cage outlines for the board", () => {
    const puzzle: KenKenPuzzle = {
      difficulty: "easy",
      size: 2,
      solution: [1, 2, 2, 1],
      cages: [
        { id: 0, cells: [0, 1], op: "+", target: 3 },
        { id: 1, cells: [2], op: "=", target: 2 },
        { id: 2, cells: [3], op: "=", target: 1 },
      ],
      cageOf: [0, 0, 1, 2],
    };
    expect(isKenKenSolved(puzzle, puzzle.solution)).toBe(true);
    expect(cageEdges(puzzle, 0)).toEqual({ top: true, right: false, bottom: true, left: true });
    expect(cageEdges(puzzle, 1)).toEqual({ top: true, right: true, bottom: true, left: false });
    expect(cageEdges(puzzle, 2)).toEqual({ top: true, right: true, bottom: true, left: true });
    expect(cageEdges(puzzle, 3)).toEqual({ top: true, right: true, bottom: true, left: true });

    // Generated boards: outlines are consistent between neighbours, an edge is
    // drawn exactly where the cage changes, and every cage has a top-left label cell.
    for (const difficulty of KENKEN_DIFFICULTIES) {
      const generated = generateKenKenPuzzle(makeRng(`kenken-edges-${difficulty.key}`), difficulty.key);
      const n = generated.size;
      for (let idx = 0; idx < n * n; idx++) {
        const r = Math.floor(idx / n);
        const c = idx % n;
        const edges = cageEdges(generated, idx);
        expect(edges.top).toBe(r === 0 || generated.cageOf[idx - n] !== generated.cageOf[idx]);
        expect(edges.left).toBe(c === 0 || generated.cageOf[idx - 1] !== generated.cageOf[idx]);
        if (c + 1 < n) expect(edges.right).toBe(cageEdges(generated, idx + 1).left);
        else expect(edges.right).toBe(true);
        if (r + 1 < n) expect(edges.bottom).toBe(cageEdges(generated, idx + n).top);
        else expect(edges.bottom).toBe(true);
      }
      for (const cage of generated.cages) {
        const head = cageEdges(generated, cage.cells[0]);
        expect(head.top && head.left).toBe(true);
      }
    }
  });
});
