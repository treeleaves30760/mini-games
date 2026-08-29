import { describe, expect, it } from "vitest";
import { makeRng } from "~/utils/rng";
import {
  FUNCTION_RUNNER_COEFFICIENT_LIMITS,
  FUNCTION_RUNNER_DIFFICULTIES,
  evaluateFunction,
  functionRunnerStatus,
  generateFunctionRunnerPuzzle,
  getFunctionRunnerDifficulty,
  hitsPoint,
} from "~/games/function-runner";
import type { FunctionCoefficients, FunctionKind, FunctionRunnerDifficulty, FunctionRunnerPuzzle, Point } from "~/games/function-runner";

/* -------------------------------------------------------------------------
   Independent model of the player's choice space, mirrored from
   FunctionRunnerGame.vue on purpose (not imported from the module) so these
   tests notice the module drifting away from what the UI actually offers:
   - the player starts at a = b = c = 0 and steps one coefficient by ±1 per click;
   - the component clamps |a| <= 3 (quadratic rounds only) and |b|, |c| <= 8;
   - a line round only exposes b and c, so a stays 0.
   Every integer triple inside those clamps is reachable by clicking, so the
   choice space is exactly the integer box enumerated into CHOICES.
   ------------------------------------------------------------------------- */
const UI_LIMITS = { a: 3, b: 8, c: 8 };

function span(limit: number): number[] {
  return Array.from({ length: limit * 2 + 1 }, (_, i) => i - limit);
}

const CHOICES: Record<FunctionKind, FunctionCoefficients[]> = { line: [], quadratic: [] };
for (const kind of ["line", "quadratic"] as const) {
  for (const a of kind === "line" ? [0] : span(UI_LIMITS.a)) {
    for (const b of span(UI_LIMITS.b)) {
      for (const c of span(UI_LIMITS.c)) CHOICES[kind].push({ a, b, c });
    }
  }
}

/** From-scratch geometry: the curve's y at integer x, integer arithmetic only. */
function curveY(kind: FunctionKind, { a, b, c }: FunctionCoefficients, x: number): number {
  return kind === "line" ? b * x + c : a * x * x + b * x + c;
}

function passesThrough(kind: FunctionKind, coeffs: FunctionCoefficients, p: Point): boolean {
  return curveY(kind, coeffs, p.x) === p.y;
}

/** The rule shown to the player: through every target, through no blocker. */
function independentlySolved(puzzle: FunctionRunnerPuzzle, coeffs: FunctionCoefficients): boolean {
  return puzzle.targets.every((t) => passesThrough(puzzle.kind, coeffs, t)) && !puzzle.blockers.some((b) => passesThrough(puzzle.kind, coeffs, b));
}

function withinUiLimits({ a, b, c }: FunctionCoefficients): boolean {
  return Math.abs(a) <= UI_LIMITS.a && Math.abs(b) <= UI_LIMITS.b && Math.abs(c) <= UI_LIMITS.c;
}

/** Try every coefficient triple the buttons can reach; also cross-check the game's own verdict on each. */
function sweepChoices(puzzle: FunctionRunnerPuzzle): { solutions: number; disagreements: number } {
  let solutions = 0;
  let disagreements = 0;
  for (const choice of CHOICES[puzzle.kind]) {
    const expected = independentlySolved(puzzle, choice);
    if (expected) solutions++;
    if (functionRunnerStatus(puzzle, choice).solved !== expected) disagreements++;
  }
  return { solutions, disagreements };
}

/** What a thinking player does: read the answer straight off the targets with finite differences. */
function deduceFromTargets(puzzle: FunctionRunnerPuzzle): FunctionCoefficients {
  const [p, q, r] = puzzle.targets;
  if (!p || !q) throw new Error("a round needs at least two targets");
  const slope = (q.y - p.y) / (q.x - p.x);
  if (puzzle.kind === "line") return { a: 0, b: slope, c: p.y - slope * p.x };
  if (!r) throw new Error("a quadratic round needs at least three targets");
  const a = ((r.y - q.y) / (r.x - q.x) - slope) / (r.x - p.x);
  const b = slope - a * (p.x + q.x);
  return { a, b, c: p.y - a * p.x * p.x - b * p.x };
}

/** Everything a round must satisfy for the rules shown on screen to be meaningful. */
function wellFormednessIssues(puzzle: FunctionRunnerPuzzle, difficulty: FunctionRunnerDifficulty): string[] {
  const issues: string[] = [];
  if (puzzle.difficulty !== difficulty.key || puzzle.kind !== difficulty.kind || puzzle.range !== difficulty.range) issues.push("difficulty fields do not match");
  if (puzzle.targets.length !== difficulty.targets) issues.push(`${puzzle.targets.length} targets instead of ${difficulty.targets}`);
  if (puzzle.blockers.length !== difficulty.blockers) issues.push(`${puzzle.blockers.length} blockers instead of ${difficulty.blockers}`);
  if (!withinUiLimits(puzzle.solution)) issues.push("hidden solution outside the UI clamps");
  if (puzzle.kind === "quadratic" && puzzle.solution.a === 0) issues.push("quadratic round with a straight-line answer");
  const cells = new Set<string>();
  const xs = new Set<number>();
  for (const t of puzzle.targets) {
    if (!Number.isInteger(t.x) || !Number.isInteger(t.y)) issues.push("non-integer target");
    if (t.x === 0 || Math.abs(t.x) > 5 || Math.abs(t.y) > puzzle.range) issues.push(`target off the board (${t.x}, ${t.y})`);
    if (xs.has(t.x)) issues.push(`two targets share x = ${t.x}, no function can pass through both`);
    if (!passesThrough(puzzle.kind, puzzle.solution, t)) issues.push(`target (${t.x}, ${t.y}) is not on the hidden answer`);
    xs.add(t.x);
    cells.add(`${t.x},${t.y}`);
  }
  for (const b of puzzle.blockers) {
    if (!Number.isInteger(b.x) || !Number.isInteger(b.y)) issues.push("non-integer blocker");
    if (Math.abs(b.x) > puzzle.range || Math.abs(b.y) > puzzle.range) issues.push(`blocker off the board (${b.x}, ${b.y})`);
    if (cells.has(`${b.x},${b.y}`)) issues.push(`blocker on a target or duplicated (${b.x}, ${b.y})`);
    if (passesThrough(puzzle.kind, puzzle.solution, b)) issues.push(`blocker (${b.x}, ${b.y}) sits on the hidden answer`);
    cells.add(`${b.x},${b.y}`);
  }
  return issues;
}

const SEEDS: (string | number)[] = [
  ...Array.from({ length: 300 }, (_, i) => `function-runner-${i}`),
  ...Array.from({ length: 100 }, (_, i) => i * 7919),
];

/** The component seeds the Daily Challenge with `${date}:function-runner:${difficulty}` and forces "hard". */
function dailySeed(date: string, difficulty = "hard"): string {
  return `${date}:function-runner:${difficulty}`;
}

const DAILY_DATES = Array.from({ length: 3 * 366 }, (_, i) => {
  const d = new Date(2025, 0, 1 + i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
});

describe("function runner", () => {
  it("evaluates lines and quadratics", () => {
    expect(evaluateFunction("line", { a: 0, b: 2, c: -1 }, 4)).toBe(7);
    expect(evaluateFunction("quadratic", { a: 2, b: -3, c: 1 }, 4)).toBe(21);
  });

  it("hit test agrees with hand-computed geometry", () => {
    // y = 2x + 1 passes through (1, 3) but not (1, 4); a line round ignores a entirely
    expect(hitsPoint("line", { a: 0, b: 2, c: 1 }, { x: 1, y: 3 })).toBe(true);
    expect(hitsPoint("line", { a: 0, b: 2, c: 1 }, { x: 1, y: 4 })).toBe(false);
    expect(hitsPoint("line", { a: 3, b: 2, c: 1 }, { x: -2, y: -3 })).toBe(true);
    // y = x² passes through (2, 4) and (-2, 4) but not (2, 5)
    expect(hitsPoint("quadratic", { a: 1, b: 0, c: 0 }, { x: 2, y: 4 })).toBe(true);
    expect(hitsPoint("quadratic", { a: 1, b: 0, c: 0 }, { x: -2, y: 4 })).toBe(true);
    expect(hitsPoint("quadratic", { a: 1, b: 0, c: 0 }, { x: 2, y: 5 })).toBe(false);
    // y = -2x² + 3x - 5 at x = 3 is -18 + 9 - 5 = -14
    expect(hitsPoint("quadratic", { a: -2, b: 3, c: -5 }, { x: 3, y: -14 })).toBe(true);
  });

  it("status counts hits and blocks, and is solved only when every target is hit and nothing is blocked", () => {
    const puzzle: FunctionRunnerPuzzle = {
      difficulty: "normal",
      kind: "line",
      range: 8,
      solution: { a: 0, b: 2, c: 1 },
      targets: [{ x: -1, y: -1 }, { x: 1, y: 3 }, { x: 3, y: 7 }],
      // (0, 1) lies on y = 2x + 1, so this hand-built round blocks its own answer
      blockers: [{ x: 2, y: 4 }, { x: 0, y: 1 }],
    };
    expect(functionRunnerStatus(puzzle, { a: 0, b: 2, c: 1 })).toEqual({ hits: 3, blocked: 1, solved: false });
    expect(functionRunnerStatus(puzzle, { a: 0, b: 0, c: 0 })).toEqual({ hits: 0, blocked: 0, solved: false });
    expect(functionRunnerStatus(puzzle, { a: 0, b: 3, c: 0 })).toEqual({ hits: 1, blocked: 0, solved: false });
    const fair = { ...puzzle, blockers: [{ x: 2, y: 4 }] };
    expect(functionRunnerStatus(fair, { a: 0, b: 2, c: 1 })).toEqual({ hits: 3, blocked: 0, solved: true });
  });

  it("evaluation stays finite and integral over the whole choice space and board", () => {
    let bad = 0;
    for (const kind of ["line", "quadratic"] as const) {
      for (const coeffs of CHOICES[kind]) {
        for (let x = -10; x <= 10; x++) {
          const y = evaluateFunction(kind, coeffs, x);
          if (!Number.isInteger(y) || y !== curveY(kind, coeffs, x)) bad++;
        }
      }
    }
    expect(bad).toBe(0);
  });

  it("generates puzzles solved by their hidden coefficients", () => {
    for (const difficulty of FUNCTION_RUNNER_DIFFICULTIES) {
      const puzzle = generateFunctionRunnerPuzzle(makeRng(`function-${difficulty.key}`), difficulty.key);
      expect(puzzle.kind).toBe(difficulty.kind);
      expect(puzzle.targets.every((point) => hitsPoint(puzzle.kind, puzzle.solution, point))).toBe(true);
      expect(puzzle.blockers.some((point) => hitsPoint(puzzle.kind, puzzle.solution, point))).toBe(false);
      const status = functionRunnerStatus(puzzle, puzzle.solution);
      expect(status.solved).toBe(true);
      expect(status.hits).toBe(puzzle.targets.length);
      expect(status.blocked).toBe(0);
    }
  });

  it("unknown difficulty keys fall back to normal", () => {
    expect(getFunctionRunnerDifficulty("nope").key).toBe("normal");
    expect(generateFunctionRunnerPuzzle(makeRng("default")).difficulty).toBe("normal");
    expect(generateFunctionRunnerPuzzle(makeRng("default"), "nope")).toEqual(generateFunctionRunnerPuzzle(makeRng("default"), "normal"));
  });

  it("exports the same coefficient clamps the component applies", () => {
    expect(FUNCTION_RUNNER_COEFFICIENT_LIMITS).toEqual(UI_LIMITS);
  });

  it("is deterministic per seed and varies across seeds", () => {
    for (const difficulty of FUNCTION_RUNNER_DIFFICULTIES) {
      expect(generateFunctionRunnerPuzzle(makeRng("same"), difficulty.key)).toEqual(generateFunctionRunnerPuzzle(makeRng("same"), difficulty.key));
      const distinct = new Set(SEEDS.slice(0, 60).map((seed) => JSON.stringify(generateFunctionRunnerPuzzle(makeRng(seed), difficulty.key))));
      expect(distinct.size).toBeGreaterThanOrEqual(50);
    }
  });

  it("every round at every difficulty is well-formed and has exactly one solution the buttons can reach", () => {
    const issues: string[] = [];
    for (const difficulty of FUNCTION_RUNNER_DIFFICULTIES) {
      for (const seed of SEEDS) {
        const puzzle = generateFunctionRunnerPuzzle(makeRng(seed), difficulty.key);
        for (const issue of wellFormednessIssues(puzzle, difficulty)) issues.push(`${difficulty.key}/${seed}: ${issue}`);
        const { solutions, disagreements } = sweepChoices(puzzle);
        if (solutions !== 1) issues.push(`${difficulty.key}/${seed}: ${solutions} reachable solutions`);
        if (disagreements) issues.push(`${difficulty.key}/${seed}: game verdict differs from geometry on ${disagreements} choices`);
      }
    }
    expect(issues).toEqual([]);
  });

  it("every Daily Challenge date (seeded like the component, forced to hard) is solvable", () => {
    const hard = getFunctionRunnerDifficulty("hard");
    const issues: string[] = [];
    for (const date of DAILY_DATES) {
      const puzzle = generateFunctionRunnerPuzzle(makeRng(dailySeed(date)), hard.key);
      for (const issue of wellFormednessIssues(puzzle, hard)) issues.push(`${date}: ${issue}`);
      const { solutions, disagreements } = sweepChoices(puzzle);
      if (solutions !== 1) issues.push(`${date}: ${solutions} reachable solutions`);
      if (disagreements) issues.push(`${date}: game verdict differs from geometry on ${disagreements} choices`);
    }
    expect(issues).toEqual([]);
  });

  it("the targets alone pin down the answer, so no guessing is needed (and there is no attempt limit)", () => {
    const issues: string[] = [];
    for (const difficulty of FUNCTION_RUNNER_DIFFICULTIES) {
      for (const seed of SEEDS) {
        const puzzle = generateFunctionRunnerPuzzle(makeRng(seed), difficulty.key);
        const deduced = deduceFromTargets(puzzle);
        const enterable = [deduced.a, deduced.b, deduced.c].every(Number.isInteger) && withinUiLimits(deduced);
        if (!enterable) issues.push(`${difficulty.key}/${seed}: deduced ${JSON.stringify(deduced)} cannot be entered`);
        else if (!functionRunnerStatus(puzzle, deduced).solved) issues.push(`${difficulty.key}/${seed}: deduced answer rejected`);
      }
    }
    expect(issues).toEqual([]);
  });

  it("checking a guess never changes the round, so the player can keep adjusting until it fits", () => {
    const puzzle = generateFunctionRunnerPuzzle(makeRng("patient"), "expert");
    const snapshot = JSON.stringify(puzzle);
    for (const choice of CHOICES.quadratic) functionRunnerStatus(puzzle, choice);
    expect(JSON.stringify(puzzle)).toBe(snapshot);
    expect(functionRunnerStatus(puzzle, puzzle.solution).solved).toBe(true);
  });
});
