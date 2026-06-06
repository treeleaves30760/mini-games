import type { Rng } from "~/utils/rng";

export type PrimeHunterDifficultyKey = "easy" | "normal" | "hard" | "expert";
export type PrimeRuleKind = "prime" | "hasFactor" | "semiprime" | "threeDistinct";

export interface PrimeHunterDifficulty {
  key: PrimeHunterDifficultyKey;
  label: string;
  size: number;
  min: number;
  max: number;
  rule: PrimeRuleKind;
}

export interface PrimeRule {
  kind: PrimeRuleKind;
  factor?: number;
  label: string;
}

export interface PrimeHunterPuzzle {
  difficulty: PrimeHunterDifficultyKey;
  size: number;
  numbers: number[];
  rule: PrimeRule;
  answers: boolean[];
}

export const PRIME_HUNTER_DIFFICULTIES: PrimeHunterDifficulty[] = [
  { key: "easy", label: "簡單", size: 5, min: 2, max: 60, rule: "prime" },
  { key: "normal", label: "普通", size: 6, min: 10, max: 140, rule: "hasFactor" },
  { key: "hard", label: "困難", size: 7, min: 20, max: 220, rule: "semiprime" },
  { key: "expert", label: "專家", size: 8, min: 30, max: 420, rule: "threeDistinct" },
];

export function getPrimeHunterDifficulty(key: string): PrimeHunterDifficulty {
  return PRIME_HUNTER_DIFFICULTIES.find((d) => d.key === key) ?? PRIME_HUNTER_DIFFICULTIES[1];
}

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let d = 3; d * d <= n; d += 2) {
    if (n % d === 0) return false;
  }
  return true;
}

export function factorize(n: number): number[] {
  const factors: number[] = [];
  let x = n;
  for (let d = 2; d * d <= x; d++) {
    while (x % d === 0) {
      factors.push(d);
      x /= d;
    }
  }
  if (x > 1) factors.push(x);
  return factors;
}

export function isSemiprime(n: number): boolean {
  return factorize(n).length === 2;
}

export function matchesPrimeRule(n: number, rule: PrimeRule): boolean {
  if (rule.kind === "prime") return isPrime(n);
  if (rule.kind === "hasFactor") return !!rule.factor && n % rule.factor === 0;
  if (rule.kind === "semiprime") return isSemiprime(n);
  if (rule.kind === "threeDistinct") return new Set(factorize(n)).size >= 3;
  return false;
}

function makeRule(rng: Rng, difficulty: PrimeHunterDifficulty): PrimeRule {
  if (difficulty.rule === "prime") return { kind: "prime", label: "找出所有質數" };
  if (difficulty.rule === "hasFactor") {
    const factor = rng.pick([3, 5, 7, 11]);
    return { kind: "hasFactor", factor, label: `找出所有含因數 ${factor} 的數` };
  }
  if (difficulty.rule === "semiprime") return { kind: "semiprime", label: "找出所有半質數（剛好兩個質因數）" };
  return { kind: "threeDistinct", label: "找出所有含至少三種不同質因數的數" };
}

export function generatePrimeHunterPuzzle(rng: Rng, difficultyKey = "normal"): PrimeHunterPuzzle {
  const difficulty = getPrimeHunterDifficulty(difficultyKey);
  for (let attempt = 0; attempt < 80; attempt++) {
    const rule = makeRule(rng, difficulty);
    const numbers = Array.from({ length: difficulty.size * difficulty.size }, () => rng.int(difficulty.min, difficulty.max));
    const answers = numbers.map((n) => matchesPrimeRule(n, rule));
    const count = answers.filter(Boolean).length;
    if (count >= Math.max(3, difficulty.size - 1) && count <= Math.floor(numbers.length * 0.45)) {
      return { difficulty: difficulty.key, size: difficulty.size, numbers, rule, answers };
    }
  }
  const rule = makeRule(rng, difficulty);
  const numbers = Array.from({ length: difficulty.size * difficulty.size }, (_, i) => difficulty.min + i);
  return {
    difficulty: difficulty.key,
    size: difficulty.size,
    numbers,
    rule,
    answers: numbers.map((n) => matchesPrimeRule(n, rule)),
  };
}

export function checkPrimeHunterSelection(puzzle: PrimeHunterPuzzle, selected: boolean[]): { solved: boolean; correct: number; wrong: number; missing: number } {
  let correct = 0;
  let wrong = 0;
  let missing = 0;
  for (let i = 0; i < puzzle.answers.length; i++) {
    if (selected[i] && puzzle.answers[i]) correct++;
    if (selected[i] && !puzzle.answers[i]) wrong++;
    if (!selected[i] && puzzle.answers[i]) missing++;
  }
  return { solved: wrong === 0 && missing === 0, correct, wrong, missing };
}
