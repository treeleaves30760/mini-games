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

export function getFunctionRunnerDifficulty(key: string): FunctionRunnerDifficulty {
  return FUNCTION_RUNNER_DIFFICULTIES.find((d) => d.key === key) ?? FUNCTION_RUNNER_DIFFICULTIES[1];
}

export function evaluateFunction(kind: FunctionKind, coeffs: FunctionCoefficients, x: number): number {
  if (kind === "line") return coeffs.b * x + coeffs.c;
  return coeffs.a * x * x + coeffs.b * x + coeffs.c;
}

function uniqueXs(rng: Rng, count: number, range: number): number[] {
  const xs = Array.from({ length: range * 2 + 1 }, (_, i) => i - range).filter((x) => x !== 0);
  rng.shuffle(xs);
  return xs.slice(0, count).sort((a, b) => a - b);
}

function pointKey(p: Point): string {
  return `${p.x},${p.y}`;
}

export function generateFunctionRunnerPuzzle(rng: Rng, difficultyKey = "normal"): FunctionRunnerPuzzle {
  const difficulty = getFunctionRunnerDifficulty(difficultyKey);
  for (let attempt = 0; attempt < 300; attempt++) {
    const coeffs: FunctionCoefficients =
      difficulty.kind === "line"
        ? { a: 0, b: rng.int(-3, 3) || 1, c: rng.int(-5, 5) }
        : { a: rng.pick([-2, -1, 1, 2]), b: rng.int(-3, 3), c: rng.int(-5, 5) };
    const xs = uniqueXs(rng, difficulty.targets, Math.min(5, difficulty.range));
    const targets = xs.map((x) => ({ x, y: evaluateFunction(difficulty.kind, coeffs, x) }));
    if (targets.some((p) => Math.abs(p.y) > difficulty.range)) continue;

    const used = new Set(targets.map(pointKey));
    const blockers: Point[] = [];
    let guard = 0;
    while (blockers.length < difficulty.blockers && guard++ < 200) {
      const p = { x: rng.int(-difficulty.range, difficulty.range), y: rng.int(-difficulty.range, difficulty.range) };
      if (used.has(pointKey(p))) continue;
      if (evaluateFunction(difficulty.kind, coeffs, p.x) === p.y) continue;
      used.add(pointKey(p));
      blockers.push(p);
    }

    return {
      difficulty: difficulty.key,
      kind: difficulty.kind,
      range: difficulty.range,
      solution: coeffs,
      targets,
      blockers,
    };
  }

  return {
    difficulty: difficulty.key,
    kind: difficulty.kind,
    range: difficulty.range,
    solution: difficulty.kind === "line" ? { a: 0, b: 1, c: 0 } : { a: 1, b: 0, c: 0 },
    targets: difficulty.kind === "line" ? [{ x: -2, y: -2 }, { x: 3, y: 3 }] : [{ x: -2, y: 4 }, { x: 0, y: 0 }, { x: 2, y: 4 }],
    blockers: [],
  };
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
