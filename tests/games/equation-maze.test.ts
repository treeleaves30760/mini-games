import { describe, expect, it } from "vitest";
import { makeRng, type Rng } from "~/utils/rng";
import {
  EQUATION_MAZE_DIFFICULTIES,
  areAdjacent,
  evaluateTokens,
  formatRat,
  generateEquationMazePuzzle,
  getEquationMazeDifficulty,
  isEquationMazeSolved,
  isValidMazeSelection,
  selectedTokens,
  type EquationMazePuzzle,
} from "~/games/equation-maze";
import { req, type Rat } from "~/games/twenty-four";

/* ---------------------------------------------------------------------------
 * Independent reference solver. It re-implements the rules exactly as the
 * player experiences them — start on a number, alternate number/operator, step
 * only to orthogonal neighbours, never revisit a cell, evaluate strictly left
 * to right — with its own rational arithmetic, and never looks at
 * puzzle.path or puzzle.expression.
 * ------------------------------------------------------------------------- */
interface Frac {
  n: number;
  d: number;
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

function frac(n: number, d: number): Frac {
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(Math.abs(n), d);
  return { n: n / g, d: d / g };
}

function step(acc: Frac, op: string, operand: number): Frac | null {
  switch (op) {
    case "+":
      return frac(acc.n + operand * acc.d, acc.d);
    case "-":
      return frac(acc.n - operand * acc.d, acc.d);
    case "×":
      return frac(acc.n * operand, acc.d);
    case "÷":
      return operand === 0 ? null : frac(acc.n, acc.d * operand);
    default:
      return null;
  }
}

const sameValue = (a: Frac, b: Rat): boolean => a.n === b.n && a.d === b.d;

/** First legal walk of exactly `length` cells whose value satisfies `accept`, or null. */
function findWalk(puzzle: EquationMazePuzzle, length: number, accept: (value: Frac) => boolean): number[] | null {
  const { size, cells } = puzzle;
  const visited = new Array<boolean>(cells.length).fill(false);
  const walk: number[] = [];
  const neighbours = (idx: number): number[] => {
    const r = Math.floor(idx / size);
    const c = idx % size;
    const out: number[] = [];
    if (r > 0) out.push(idx - size);
    if (r < size - 1) out.push(idx + size);
    if (c > 0) out.push(idx - 1);
    if (c < size - 1) out.push(idx + 1);
    return out;
  };
  const dfs = (idx: number, value: Frac, pendingOp: string): boolean => {
    if (walk.length === length) return accept(value);
    const wantOp = walk.length % 2 === 1;
    for (const nb of neighbours(idx)) {
      if (visited[nb]) continue;
      const cell = cells[nb];
      if (cell.kind !== (wantOp ? "op" : "number")) continue;
      let nextValue = value;
      if (!wantOp) {
        const v = step(value, pendingOp, Number(cell.token));
        if (!v) continue;
        nextValue = v;
      }
      visited[nb] = true;
      walk.push(nb);
      if (dfs(nb, nextValue, wantOp ? cell.token : pendingOp)) return true;
      walk.pop();
      visited[nb] = false;
    }
    return false;
  };
  for (let start = 0; start < cells.length; start++) {
    if (cells[start].kind !== "number") continue;
    visited[start] = true;
    walk.push(start);
    if (dfs(start, frac(Number(cells[start].token), 1), "")) return walk.slice();
    walk.pop();
    visited[start] = false;
  }
  return null;
}

/** Same seed derivation as EquationMazeGame.vue: `${seed}:equation-maze:${difficulty}`. */
function componentRng(seed: string | number, difficulty: string): Rng {
  return makeRng(`${seed}:equation-maze:${difficulty}`);
}

/** Daily Challenge seeds are local "YYYY-MM-DD" strings and always play "hard". */
function dailySeeds(days: number): string[] {
  return Array.from({ length: days }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
}

/** Rng whose first `int` call and first `picks.length` `pick` calls follow a script, then defers to a seeded stream. */
function scriptedRng(start: number, picks: number[]): Rng {
  const base = makeRng("scripted");
  const queue = picks.slice();
  let ints = 0;
  return {
    ...base,
    int: (min, max) => (ints++ === 0 ? start : base.int(min, max)),
    pick: (arr) => (queue.length ? arr[queue.shift() as number] : base.pick(arr)),
  };
}

const SWEEP_SEEDS = 250;
const DAILY_DAYS = 366;

describe("equation maze", () => {
  it("keeps the difficulty table within the generator's invariants", () => {
    const keys = new Set(EQUATION_MAZE_DIFFICULTIES.map((d) => d.key));
    expect(keys.size).toBe(EQUATION_MAZE_DIFFICULTIES.length);
    for (const d of EQUATION_MAZE_DIFFICULTIES) {
      // A self-avoiding walk of 2·size − 1 cells exists from every start cell.
      expect(d.terms * 2 - 1).toBeLessThanOrEqual(2 * d.size - 1);
      // Some operator always keeps the running value within the ±200 cap.
      expect(d.maxNumber).toBeLessThanOrEqual(200);
      expect(d.division || !d.negatives).toBe(true);
    }
  });

  it("falls back to normal for an unknown difficulty key", () => {
    expect(getEquationMazeDifficulty("nope").key).toBe("normal");
    expect(getEquationMazeDifficulty("expert").size).toBe(8);
  });

  it("generates a valid winning path for every difficulty", () => {
    for (const difficulty of EQUATION_MAZE_DIFFICULTIES) {
      const puzzle = generateEquationMazePuzzle(makeRng(`maze-${difficulty.key}`), difficulty.key);
      expect(puzzle.size).toBe(difficulty.size);
      expect(puzzle.path).toHaveLength(difficulty.terms * 2 - 1);
      expect(puzzle.expression).toHaveLength(difficulty.terms * 2 - 1);
      for (let i = 1; i < puzzle.path.length; i++) {
        expect(areAdjacent(puzzle.path[i - 1], puzzle.path[i], puzzle.size)).toBe(true);
      }
      expect(req(evaluateTokens(puzzle.expression), puzzle.target)).toBe(true);
      expect(isValidMazeSelection(puzzle, puzzle.path)).toBe(true);
      expect(isEquationMazeSolved(puzzle, puzzle.path)).toBe(true);
    }
  });

  it("is deterministic for a seed and defaults to normal", () => {
    const a = generateEquationMazePuzzle(makeRng("same-seed"), "hard");
    const b = generateEquationMazePuzzle(makeRng("same-seed"), "hard");
    expect(a).toEqual(b);
    expect(generateEquationMazePuzzle(makeRng("default")).size).toBe(6);
  });

  it("rejects a non-adjacent path", () => {
    const puzzle = generateEquationMazePuzzle(makeRng("maze-invalid"), "easy");
    const bad = puzzle.path.slice();
    bad[1] = puzzle.cells.findIndex((_, i) => i !== bad[0] && !areAdjacent(bad[0], i, puzzle.size) && puzzle.cells[i].kind === "op");
    expect(isValidMazeSelection(puzzle, bad)).toBe(false);
  });

  it("rejects revisited cells, wrong kinds and out-of-range cells", () => {
    const puzzle = generateEquationMazePuzzle(makeRng("maze-selection"), "normal");
    const [first, second] = puzzle.path;
    expect(isValidMazeSelection(puzzle, [])).toBe(false);
    expect(isValidMazeSelection(puzzle, [first, second])).toBe(true);
    // Stepping back onto the start cell is adjacent and the right kind, but a revisit.
    expect(isValidMazeSelection(puzzle, [first, second, first])).toBe(false);
    expect(isValidMazeSelection(puzzle, [second])).toBe(false);
    expect(isValidMazeSelection(puzzle, [first, first])).toBe(false);
    expect(isValidMazeSelection(puzzle, [puzzle.cells.length])).toBe(false);
    expect(selectedTokens(puzzle, [first, puzzle.cells.length, -1])).toEqual([puzzle.cells[first].token, "", ""]);
  });

  it("every maze is solvable and the win check accepts exactly the legal walks that hit the target", () => {
    let checked = 0;
    let solverPathDiffers = 0;
    let wrongValueWalks = 0;
    const cases: { label: string; rng: Rng; difficulty: string }[] = [];
    for (const difficulty of EQUATION_MAZE_DIFFICULTIES) {
      for (let seed = 0; seed < SWEEP_SEEDS; seed++) {
        cases.push({ label: `${difficulty.key} seed ${seed}`, rng: componentRng(seed, difficulty.key), difficulty: difficulty.key });
      }
    }
    for (const date of dailySeeds(DAILY_DAYS)) {
      cases.push({ label: `daily ${date}`, rng: componentRng(date, "hard"), difficulty: "hard" });
    }

    for (const { label, rng, difficulty } of cases) {
      const spec = getEquationMazeDifficulty(difficulty);
      const puzzle = generateEquationMazePuzzle(rng, difficulty);
      const length = spec.terms * 2 - 1;
      const ops = spec.division ? ["+", "-", "×", "÷"] : ["+", "-", "×"];
      checked++;

      // (e) No degenerate maze: right shape, sane tokens, no zero anywhere (so "÷" is always defined),
      //     target within the readable range, hint flags match the stored walk.
      expect(puzzle.cells, label).toHaveLength(spec.size * spec.size);
      expect(puzzle.path, label).toHaveLength(length);
      expect(puzzle.expression, label).toHaveLength(length);
      expect(new Set(puzzle.path).size, label).toBe(length);
      for (const cell of puzzle.cells) {
        if (cell.kind === "number") {
          const value = Number(cell.token);
          expect(Number.isInteger(value) && value !== 0, `${label}: token ${cell.token}`).toBe(true);
          expect(Math.abs(value), label).toBeLessThanOrEqual(spec.maxNumber);
          if (!spec.negatives) expect(value, label).toBeGreaterThan(0);
        } else {
          expect(ops, `${label}: op ${cell.token}`).toContain(cell.token);
        }
      }
      expect(puzzle.cells.filter((c) => c.onSolution).length, label).toBe(length);
      expect(puzzle.path.every((idx) => puzzle.cells[idx].onSolution), label).toBe(true);
      expect(puzzle.target.d, label).toBeGreaterThan(0);
      expect(Math.abs(puzzle.target.n / puzzle.target.d), label).toBeLessThanOrEqual(200);

      // (a) The stored walk is a legal solution and matches the stored expression.
      expect(puzzle.path.map((idx) => puzzle.cells[idx].token), label).toEqual(puzzle.expression);
      expect(req(evaluateTokens(puzzle.expression), puzzle.target), label).toBe(true);
      expect(isEquationMazeSolved(puzzle, puzzle.path), label).toBe(true);

      // (a)+(d) The independent solver finds a walk of the required (minimum) length on its own.
      const walk = findWalk(puzzle, length, (value) => sameValue(value, puzzle.target));
      expect(walk, `${label}: no solution found by the reference solver`).not.toBeNull();
      if (walk!.some((idx, i) => idx !== puzzle.path[i])) solverPathDiffers++;

      // (b) Replaying it tap by tap: every prefix is a legal move, none wins early, the full walk wins.
      for (let i = 1; i < walk!.length; i++) {
        expect(isValidMazeSelection(puzzle, walk!.slice(0, i)), label).toBe(true);
        expect(isEquationMazeSolved(puzzle, walk!.slice(0, i)), label).toBe(false);
      }
      expect(isEquationMazeSolved(puzzle, walk!), label).toBe(true);

      // (c) Incomplete, operator-terminated, revisiting and wrong-valued walks are rejected.
      expect(isEquationMazeSolved(puzzle, puzzle.path.slice(0, -2)), label).toBe(false);
      expect(isEquationMazeSolved(puzzle, puzzle.path.slice(0, -1)), label).toBe(false);
      expect(isEquationMazeSolved(puzzle, [...puzzle.path.slice(0, -1), puzzle.path[length - 3]]), label).toBe(false);
      const wrong = findWalk(puzzle, length, (value) => !sameValue(value, puzzle.target));
      if (wrong) {
        wrongValueWalks++;
        expect(isEquationMazeSolved(puzzle, wrong), label).toBe(false);
      }
    }

    expect(checked).toBe(EQUATION_MAZE_DIFFICULTIES.length * SWEEP_SEEDS + DAILY_DAYS);
    // The solver regularly finds a different solution than the generator stored — and those win too.
    expect(solverPathDiffers).toBeGreaterThan(0);
    expect(wrongValueWalks).toBeGreaterThan(0);
  });

  it("accepts a legal walk longer than the intended solution when it hits the target", () => {
    const spec = getEquationMazeDifficulty("easy");
    let longer: { puzzle: EquationMazePuzzle; walk: number[] } | null = null;
    for (let seed = 0; seed < 200 && !longer; seed++) {
      const puzzle = generateEquationMazePuzzle(componentRng(seed, "easy"), "easy");
      const walk = findWalk(puzzle, spec.terms * 2 + 1, (value) => sameValue(value, puzzle.target));
      if (walk) longer = { puzzle, walk };
    }
    expect(longer).not.toBeNull();
    expect(longer!.walk).toHaveLength(longer!.puzzle.expression.length + 2);
    expect(isEquationMazeSolved(longer!.puzzle, longer!.walk)).toBe(true);
  });

  it("backtracks out of a dead end instead of restarting or falling back", () => {
    // 5×5 grid, start at cell 1 (row 0, col 1). The scripted picks steer the walk
    // 1 → 6 (down) → 5 (left) → 0 (up), where both neighbours of 0 are already used.
    // The search must step back to 5 and continue 10 → 15 → 20 → 21.
    const puzzle = generateEquationMazePuzzle(scriptedRng(1, [0, 1, 0, 0, 0, 0, 0]), "easy");
    expect(puzzle.path).toEqual([1, 6, 5, 10, 15, 20, 21]);
    expect(isEquationMazeSolved(puzzle, puzzle.path)).toBe(true);
    expect(findWalk(puzzle, 7, (value) => sameValue(value, puzzle.target))).not.toBeNull();
  });

  it("evaluates strictly left to right with exact fractions", () => {
    expect(evaluateTokens([])).toBeNull();
    expect(evaluateTokens(["5"])).toEqual({ n: 5, d: 1 });
    expect(evaluateTokens(["2", "+", "3", "×", "4"])).toEqual({ n: 20, d: 1 });
    expect(evaluateTokens(["7", "÷", "2"])).toEqual({ n: 7, d: 2 });
    expect(evaluateTokens(["7", "÷", "2", "×", "2"])).toEqual({ n: 7, d: 1 });
    expect(evaluateTokens(["-3", "-", "-4"])).toEqual({ n: 1, d: 1 });
    expect(evaluateTokens(["1", "÷", "0"])).toBeNull();
    // Malformed walks: ends on an operator, starts on one, operator where a number belongs, unknown operator.
    expect(evaluateTokens(["2", "+"])).toBeNull();
    expect(evaluateTokens(["×"])).toBeNull();
    expect(evaluateTokens(["×", "+", "1"])).toBeNull();
    expect(evaluateTokens(["1", "+", "×"])).toBeNull();
    expect(evaluateTokens(["1", "1", "1"])).toBeNull();
    expect(evaluateTokens(["1", "1", "1", "+", "2"])).toBeNull();
    expect(evaluateTokens(["", "+", "1"])).toBeNull();
  });

  it("formats rationals for the HUD", () => {
    expect(formatRat(null)).toBe("—");
    expect(formatRat({ n: 5, d: 1 })).toBe("5");
    expect(formatRat({ n: 7, d: 2 })).toBe("7/2");
    expect(formatRat({ n: -7, d: 2 })).toBe("-7/2");
  });
});
