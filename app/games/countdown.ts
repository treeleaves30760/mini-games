import type { Rng } from "~/utils/rng";

export type CountdownDifficultyKey = "easy" | "normal" | "hard" | "expert";
export type CountdownOp = "+" | "-" | "×" | "÷";

export interface CountdownDifficulty {
  key: CountdownDifficultyKey;
  label: string;
  count: number;
  minTarget: number;
  maxTarget: number;
  large: number;
}

export interface CountdownPuzzle {
  difficulty: CountdownDifficultyKey;
  numbers: number[];
  target: number;
  solution: string;
}

interface ExprValue {
  value: number;
  expr: string;
}

export const COUNTDOWN_DIFFICULTIES: CountdownDifficulty[] = [
  { key: "easy", label: "簡單", count: 4, minTarget: 50, maxTarget: 250, large: 0 },
  { key: "normal", label: "普通", count: 5, minTarget: 100, maxTarget: 500, large: 1 },
  { key: "hard", label: "困難", count: 6, minTarget: 150, maxTarget: 850, large: 2 },
  { key: "expert", label: "專家", count: 6, minTarget: 300, maxTarget: 999, large: 3 },
];

export function getCountdownDifficulty(key: string): CountdownDifficulty {
  return COUNTDOWN_DIFFICULTIES.find((d) => d.key === key) ?? COUNTDOWN_DIFFICULTIES[1];
}

export function applyCountdownOp(op: CountdownOp, a: number, b: number): number | null {
  if (op === "+") return a + b;
  if (op === "-") return a > b ? a - b : null;
  if (op === "×") return a * b;
  if (op === "÷") return b !== 0 && a % b === 0 ? a / b : null;
  return null;
}

function numberPool(rng: Rng, difficulty: CountdownDifficulty): number[] {
  const small = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const large = [25, 50, 75, 100];
  rng.shuffle(small);
  rng.shuffle(large);
  return [...large.slice(0, difficulty.large), ...small.slice(0, difficulty.count - difficulty.large)];
}

function combineAll(numbers: number[], rng: Rng): ExprValue | null {
  const work = numbers.map((value) => ({ value, expr: String(value) }));
  while (work.length > 1) {
    const ai = rng.int(0, work.length - 1);
    let bi = rng.int(0, work.length - 2);
    if (bi >= ai) bi++;
    const a = work[ai];
    const b = work[bi];
    const pairs = rng.shuffle([
      { op: "+", left: a, right: b },
      { op: "-", left: a, right: b },
      { op: "-", left: b, right: a },
      { op: "×", left: a, right: b },
      { op: "÷", left: a, right: b },
      { op: "÷", left: b, right: a },
    ] as { op: CountdownOp; left: ExprValue; right: ExprValue }[]);
    const picked = pairs
      .map((pair) => ({ ...pair, value: applyCountdownOp(pair.op, pair.left.value, pair.right.value) }))
      .find((pair) => pair.value !== null && pair.value > 0 && pair.value <= 1200);
    if (!picked || picked.value === null) return null;
    const next = { value: picked.value, expr: `(${picked.left.expr} ${picked.op} ${picked.right.expr})` };
    const remove = [ai, bi].sort((x, y) => y - x);
    for (const idx of remove) work.splice(idx, 1);
    work.push(next);
  }
  return work[0];
}

export function generateCountdownPuzzle(rng: Rng, difficultyKey = "normal"): CountdownPuzzle {
  const difficulty = getCountdownDifficulty(difficultyKey);
  for (let attempt = 0; attempt < 500; attempt++) {
    const numbers = numberPool(rng, difficulty);
    const result = combineAll(numbers, rng);
    if (!result) continue;
    if (result.value >= difficulty.minTarget && result.value <= difficulty.maxTarget) {
      return { difficulty: difficulty.key, numbers, target: result.value, solution: result.expr };
    }
  }
  if (difficulty.count === 4) {
    return { difficulty: difficulty.key, numbers: [75, 25, 6, 4], target: 100, solution: "(75 + 25)" };
  }
  if (difficulty.count === 5) {
    return { difficulty: difficulty.key, numbers: [75, 25, 10, 6, 4], target: 400, solution: "((75 + 25) × (10 - 6))" };
  }
  return {
    difficulty: difficulty.key,
    numbers: [100, 75, 25, 10, 6, 4],
    target: 796,
    solution: "(((100 + 75 + 25) × (10 - 6)) - 4)",
  };
}

export function isCountdownSolved(value: number | null, target: number): boolean {
  return value === target;
}
