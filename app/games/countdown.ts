import type { Rng } from "~/utils/rng";

/* =========================================================================
   Countdown Numbers — pure game logic (framework-free).

   Rules shown to the player (see CountdownGame.vue):
     • every number card must be used exactly once — cards are merged pairwise
       with + − × ÷ until a single card remains, and that card must equal the
       target;
     • subtraction must stay positive (a − b needs a > b), division must be
       exact. Every intermediate value is therefore a positive integer.

   The generator builds the target by folding the drawn cards with random legal
   operations, so every puzzle ships with a solution that uses all cards.
   ========================================================================= */

export type CountdownDifficultyKey = "easy" | "normal" | "hard" | "expert";
export type CountdownOp = "+" | "-" | "×" | "÷";

export interface CountdownDifficulty {
  key: CountdownDifficultyKey;
  label: string;
  /** number of cards dealt */
  count: number;
  minTarget: number;
  maxTarget: number;
  /** how many of the cards come from the large set {25, 50, 75, 100} */
  large: number;
}

/** A card on the table: its value and the expression that produced it. */
export interface CountdownCard {
  value: number;
  expr: string;
}

export interface CountdownPuzzle {
  difficulty: CountdownDifficultyKey;
  numbers: number[];
  target: number;
  /** one fully parenthesised solution that uses every card exactly once */
  solution: string;
}

export const COUNTDOWN_DIFFICULTIES: CountdownDifficulty[] = [
  { key: "easy", label: "簡單", count: 4, minTarget: 50, maxTarget: 250, large: 0 },
  { key: "normal", label: "普通", count: 5, minTarget: 100, maxTarget: 500, large: 1 },
  { key: "hard", label: "困難", count: 6, minTarget: 150, maxTarget: 850, large: 2 },
  { key: "expert", label: "專家", count: 6, minTarget: 300, maxTarget: 999, large: 3 },
];

/** Largest intermediate value the generator allows while folding the cards. */
const MAX_INTERMEDIATE = 1200;
/** Random draws before falling back to a fixed puzzle (see FALLBACK_PUZZLES). */
const MAX_ATTEMPTS = 500;

/**
 * Safety net for a degenerate Rng only. With a real Rng a single draw lands in
 * the target range with probability ≈ 0.2–0.45 (measured per difficulty), so
 * MAX_ATTEMPTS consecutive misses have probability below 1e-50. Each fallback
 * respects its difficulty (card count, large-card count, target range) and its
 * solution uses every card exactly once.
 */
const FALLBACK_PUZZLES: Record<CountdownDifficultyKey, Omit<CountdownPuzzle, "difficulty">> = {
  easy: { numbers: [7, 5, 6, 4], target: 120, solution: "((7 + 5) × (6 + 4))" },
  normal: { numbers: [50, 7, 2, 6, 4], target: 474, solution: "((50 × (7 + 2)) + (6 × 4))" },
  hard: { numbers: [75, 25, 9, 6, 4, 2], target: 831, solution: "(((75 × 9) + (25 × 6)) + (4 + 2))" },
  expert: { numbers: [100, 75, 50, 8, 3, 2], target: 931, solution: "(((100 × 8) + (75 + 50)) + (3 × 2))" },
};

/**
 * A drawn target is used only when it sits inside the difficulty's band and is
 * not already printed on one of the cards (that would make a dull round where
 * the player just reads the answer off the table).
 */
export function isAcceptableTarget(
  value: number,
  numbers: number[],
  difficulty: CountdownDifficulty,
): boolean {
  if (value < difficulty.minTarget || value > difficulty.maxTarget) return false;
  return !numbers.includes(value);
}

export function getCountdownDifficulty(key: string): CountdownDifficulty {
  return COUNTDOWN_DIFFICULTIES.find((d) => d.key === key) ?? COUNTDOWN_DIFFICULTIES[1]!;
}

/**
 * Apply one operation under the game's rules. Returns null for an illegal move:
 * a non-positive difference, an inexact (or zero) division, or an unknown op —
 * the component passes the op straight from UI state, so it is validated here.
 */
export function applyCountdownOp(op: CountdownOp, a: number, b: number): number | null {
  if (op === "+") return a + b;
  if (op === "-") return a > b ? a - b : null;
  if (op === "×") return a * b;
  if (op === "÷") return b !== 0 && a % b === 0 ? a / b : null;
  return null;
}

/** Merge two cards into one, or null when the operation is illegal for them. */
export function combineCountdownCards(op: CountdownOp, a: CountdownCard, b: CountdownCard): CountdownCard | null {
  const value = applyCountdownOp(op, a.value, b.value);
  return value === null ? null : { value, expr: `(${a.expr} ${op} ${b.expr})` };
}

/**
 * Play one move: merge the cards at indices `ai` and `bi` (in that order, so
 * `ai − bi` and `ai ÷ bi`) with `op`. Returns the new hand — the untouched cards
 * in their original order followed by the merged card — or null when the move
 * is illegal: the same card used twice, a missing card, or an illegal operation.
 * Because both source cards leave the hand, no number can ever be reused.
 */
export function playCountdownMove(cards: CountdownCard[], ai: number, bi: number, op: CountdownOp): CountdownCard[] | null {
  const a = cards[ai];
  const b = cards[bi];
  if (ai === bi || !a || !b) return null;
  const merged = combineCountdownCards(op, a, b);
  if (!merged) return null;
  const rest = cards.filter((_, index) => index !== ai && index !== bi);
  rest.push(merged);
  return rest;
}

export function isCountdownSolved(value: number | null, target: number): boolean {
  return value === target;
}

/** The round is won only when every card has been merged into one equal to the target. */
export function isCountdownWon(cards: CountdownCard[], target: number): boolean {
  return cards.length === 1 && isCountdownSolved(cards[0]!.value, target);
}

function numberPool(rng: Rng, difficulty: CountdownDifficulty): number[] {
  const small = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const large = [25, 50, 75, 100];
  rng.shuffle(small);
  rng.shuffle(large);
  return [...large.slice(0, difficulty.large), ...small.slice(0, difficulty.count - difficulty.large)];
}

/**
 * Fold all numbers into a single card using random legal operations, keeping
 * every intermediate value within MAX_INTERMEDIATE. The result's expression is
 * a solution that uses every number exactly once.
 */
function foldRandomly(numbers: number[], rng: Rng): CountdownCard {
  const work: CountdownCard[] = numbers.map((value) => ({ value, expr: String(value) }));
  while (work.length > 1) {
    const ai = rng.int(0, work.length - 1);
    let bi = rng.int(0, work.length - 2);
    if (bi >= ai) bi++;
    const a = work[ai]!;
    const b = work[bi]!;
    const candidates = rng.shuffle<[CountdownOp, CountdownCard, CountdownCard]>([
      ["+", a, b],
      ["-", a, b],
      ["-", b, a],
      ["×", a, b],
      ["÷", a, b],
      ["÷", b, a],
    ]);
    // Every card in `work` is a positive integer ≤ MAX_INTERMEDIATE (the pool
    // values are ≤ 100 and every merged value is capped below), so at least one
    // candidate always fits: a + b when it is within the cap, otherwise the two
    // values are distinct with a positive difference below the cap, or equal
    // and a ÷ b = 1. Hence `find` cannot come back empty.
    const picked = candidates
      .map(([op, left, right]) => combineCountdownCards(op, left, right))
      .find((card): card is CountdownCard => card !== null && card.value <= MAX_INTERMEDIATE)!;
    const remove = [ai, bi].sort((x, y) => y - x);
    for (const idx of remove) work.splice(idx, 1);
    work.push(picked);
  }
  return work[0]!;
}

export function generateCountdownPuzzle(rng: Rng, difficultyKey = "normal"): CountdownPuzzle {
  const difficulty = getCountdownDifficulty(difficultyKey);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const numbers = numberPool(rng, difficulty);
    const result = foldRandomly(numbers, rng);
    if (!isAcceptableTarget(result.value, numbers, difficulty)) continue;
    return { difficulty: difficulty.key, numbers, target: result.value, solution: result.expr };
  }
  const fallback = FALLBACK_PUZZLES[difficulty.key];
  return { difficulty: difficulty.key, numbers: [...fallback.numbers], target: fallback.target, solution: fallback.solution };
}
