import type { Rng } from "~/utils/rng";
import { radd, rsub, rat, req, type Rat } from "~/games/twenty-four";

export type FractionBalanceDifficultyKey = "easy" | "normal" | "hard" | "expert";

export interface FractionBalanceDifficulty {
  key: FractionBalanceDifficultyKey;
  label: string;
  slots: number;
  maxDen: number;
  allowNegative: boolean;
  distractors: number;
}

export interface FractionCard {
  id: string;
  value: Rat;
}

export interface FractionBalancePuzzle {
  difficulty: FractionBalanceDifficultyKey;
  target: Rat;
  cards: FractionCard[];
  solutionIds: string[];
  solutionSigns: (1 | -1)[];
  slots: number;
}

export const FRACTION_BALANCE_DIFFICULTIES: FractionBalanceDifficulty[] = [
  { key: "easy", label: "簡單", slots: 1, maxDen: 10, allowNegative: false, distractors: 5 },
  { key: "normal", label: "普通", slots: 2, maxDen: 12, allowNegative: false, distractors: 6 },
  { key: "hard", label: "困難", slots: 3, maxDen: 16, allowNegative: true, distractors: 7 },
  { key: "expert", label: "專家", slots: 4, maxDen: 20, allowNegative: true, distractors: 8 },
];

export function getFractionBalanceDifficulty(key: string): FractionBalanceDifficulty {
  return FRACTION_BALANCE_DIFFICULTIES.find((d) => d.key === key) ?? FRACTION_BALANCE_DIFFICULTIES[1];
}

export function formatFraction(value: Rat): string {
  if (value.d === 1) return String(value.n);
  const sign = value.n < 0 ? "-" : "";
  const absN = Math.abs(value.n);
  if (absN > value.d) {
    const whole = Math.floor(absN / value.d);
    const rest = absN % value.d;
    return rest === 0 ? `${sign}${whole}` : `${sign}${whole} ${rest}/${value.d}`;
  }
  return `${value.n}/${value.d}`;
}

function randomFraction(rng: Rng, difficulty: FractionBalanceDifficulty): Rat {
  const denominator = rng.int(2, difficulty.maxDen);
  let numerator = rng.int(1, denominator * (difficulty.key === "expert" ? 2 : 1));
  if (difficulty.allowNegative && rng.int(0, 4) === 0) numerator *= -1;
  return rat(numerator, denominator)!;
}

export function signedSum(cards: FractionCard[], selectedIds: string[], signs: (1 | -1)[]): Rat | null {
  let total = rat(0)!;
  for (let i = 0; i < selectedIds.length; i++) {
    const card = cards.find((c) => c.id === selectedIds[i]);
    if (!card) return null;
    total = (signs[i] ?? 1) === 1 ? radd(total, card.value)! : rsub(total, card.value)!;
  }
  return total;
}

export function generateFractionBalancePuzzle(rng: Rng, difficultyKey = "normal"): FractionBalancePuzzle {
  const difficulty = getFractionBalanceDifficulty(difficultyKey);
  const solution: FractionCard[] = [];
  const solutionSigns: (1 | -1)[] = [];
  const seen = new Set<string>();

  while (solution.length < difficulty.slots) {
    const value = randomFraction(rng, difficulty);
    const key = `${value.n}/${value.d}`;
    if (seen.has(key)) continue;
    seen.add(key);
    solution.push({ id: `s${solution.length}`, value });
    solutionSigns.push(difficulty.allowNegative && solution.length > 1 && rng.bool() ? -1 : 1);
  }

  const target = signedSum(solution, solution.map((c) => c.id), solutionSigns) ?? rat(1, 2)!;
  const cards = [...solution];
  let distractorId = 0;
  while (cards.length < difficulty.slots + difficulty.distractors) {
    const value = randomFraction(rng, difficulty);
    const key = `${value.n}/${value.d}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ id: `d${distractorId++}`, value });
  }
  rng.shuffle(cards);

  return {
    difficulty: difficulty.key,
    target,
    cards,
    solutionIds: solution.map((c) => c.id),
    solutionSigns,
    slots: difficulty.slots,
  };
}

export function isFractionBalanceSolved(puzzle: FractionBalancePuzzle, selectedIds: string[], signs: (1 | -1)[]): boolean {
  if (selectedIds.length !== puzzle.slots) return false;
  if (new Set(selectedIds).size !== selectedIds.length) return false;
  const sum = signedSum(puzzle.cards, selectedIds, signs);
  return req(sum, puzzle.target);
}
