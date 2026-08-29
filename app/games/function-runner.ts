import type { Rng } from "~/utils/rng";

export type FunctionRunnerDifficultyKey = "easy" | "normal" | "hard" | "expert";
export type FunctionKind = "line" | "quadratic";

export interface FunctionRunnerDifficulty {
  key: FunctionRunnerDifficultyKey;
  label: string;
  kind: FunctionKind;
  range: number;
  targets: number;
  blockers: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface FunctionCoefficients {
  a: number;
  b: number;
  c: number;
}

export interface FunctionRunnerPuzzle {
  difficulty: FunctionRunnerDifficultyKey;
  kind: FunctionKind;
  range: number;
  solution: FunctionCoefficients;
  targets: Point[];
  blockers: Point[];
}

export const FUNCTION_RUNNER_DIFFICULTIES: FunctionRunnerDifficulty[] = [
  { key: "easy", label: "簡單", kind: "line", range: 6, targets: 2, blockers: 0 },
  { key: "normal", label: "普通", kind: "line", range: 8, targets: 3, blockers: 1 },
  { key: "hard", label: "困難", kind: "quadratic", range: 8, targets: 3, blockers: 2 },
  { key: "expert", label: "專家", kind: "quadratic", range: 10, targets: 4, blockers: 3 },
];

/**
 * How far the +/- buttons let the player push each coefficient. The component
 * clamps to these values, so they bound the player's choice space: a round is
 * only solvable if its hidden solution stays inside them.
 */
export const FUNCTION_RUNNER_COEFFICIENT_LIMITS: Record<keyof FunctionCoefficients, number> = { a: 3, b: 8, c: 8 };

/**
 * Coefficient values a hidden solution may use, per curve kind. Deliberately a
 * subset of FUNCTION_RUNNER_COEFFICIENT_LIMITS so the curves stay readable.
 */
const SOLUTION_A: Record<FunctionKind, number[]> = { line: [0], quadratic: [-2, -1, 1, 2] };
const SOLUTION_B: Record<FunctionKind, number[]> = { line: [-3, -2, -1, 1, 2, 3], quadratic: [-3, -2, -1, 0, 1, 2, 3] };
const SOLUTION_C = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];

/** Targets sit on non-zero xs with |x| <= 5 so their coordinates are easy to read off the grid. */
const TARGET_X_LIMIT = 5;

export function getFunctionRunnerDifficulty(key: string): FunctionRunnerDifficulty {
  return FUNCTION_RUNNER_DIFFICULTIES.find((d) => d.key === key) ?? FUNCTION_RUNNER_DIFFICULTIES[1];
}

export function evaluateFunction(kind: FunctionKind, coeffs: FunctionCoefficients, x: number): number {
  if (kind === "line") return coeffs.b * x + coeffs.c;
  return coeffs.a * x * x + coeffs.b * x + coeffs.c;
}

/** Candidate target xs whose y on this curve is still on the visible board. */
function targetXsOnBoard(kind: FunctionKind, coeffs: FunctionCoefficients, range: number): number[] {
  const limit = Math.min(TARGET_X_LIMIT, range);
  const xs: number[] = [];
  for (let x = -limit; x <= limit; x++) {
    if (x !== 0 && Math.abs(evaluateFunction(kind, coeffs, x)) <= range) xs.push(x);
  }
  return xs;
}

/** Every curve the generator may draw for a difficulty: those with room for all of its targets. */
function solutionPool(difficulty: FunctionRunnerDifficulty): FunctionCoefficients[] {
  const pool: FunctionCoefficients[] = [];
  for (const a of SOLUTION_A[difficulty.kind]) {
    for (const b of SOLUTION_B[difficulty.kind]) {
      for (const c of SOLUTION_C) {
        const coeffs = { a, b, c };
        if (targetXsOnBoard(difficulty.kind, coeffs, difficulty.range).length >= difficulty.targets) pool.push(coeffs);
      }
    }
  }
  return pool;
}

/**
 * Build the round from its answer: draw a curve, put the targets on it and the
 * blockers off it. Every round is therefore solvable with the curve it was built
 * from and always has exactly the target/blocker counts of its difficulty.
 */
export function generateFunctionRunnerPuzzle(rng: Rng, difficultyKey = "normal"): FunctionRunnerPuzzle {
  const difficulty = getFunctionRunnerDifficulty(difficultyKey);
  const { kind, range } = difficulty;
  const solution = rng.pick(solutionPool(difficulty));
  const xs = rng.shuffle(targetXsOnBoard(kind, solution, range)).slice(0, difficulty.targets).sort((a, b) => a - b);
  const targets = xs.map((x) => ({ x, y: evaluateFunction(kind, solution, x) }));

  // Cells the solution curve misses can neither coincide with a target nor block the answer.
  const offCurve: Point[] = [];
  for (let x = -range; x <= range; x++) {
    for (let y = -range; y <= range; y++) {
      if (evaluateFunction(kind, solution, x) !== y) offCurve.push({ x, y });
    }
  }
  const blockers = rng.shuffle(offCurve).slice(0, difficulty.blockers);

  return { difficulty: difficulty.key, kind, range, solution, targets, blockers };
}

export function hitsPoint(kind: FunctionKind, coeffs: FunctionCoefficients, point: Point): boolean {
  return evaluateFunction(kind, coeffs, point.x) === point.y;
}

export function functionRunnerStatus(puzzle: FunctionRunnerPuzzle, coeffs: FunctionCoefficients): { hits: number; blocked: number; solved: boolean } {
  const hits = puzzle.targets.filter((point) => hitsPoint(puzzle.kind, coeffs, point)).length;
  const blocked = puzzle.blockers.filter((point) => hitsPoint(puzzle.kind, coeffs, point)).length;
  return {
    hits,
    blocked,
    solved: hits === puzzle.targets.length && blocked === 0,
  };
}
