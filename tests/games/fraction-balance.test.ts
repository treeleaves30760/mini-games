import { describe, expect, it } from "vitest";
import { makeRng } from "~/utils/rng";
import {
  FRACTION_BALANCE_DIFFICULTIES,
  formatFraction,
  generateFractionBalancePuzzle,
  getFractionBalanceDifficulty,
  isFractionBalanceSolved,
  signedSum,
  type FractionBalanceDifficulty,
  type FractionBalancePuzzle,
  type FractionCard,
} from "~/games/fraction-balance";
import { req } from "~/games/twenty-four";

/* ---------------------------------------------------------------------------
   Independent brute-force solver.
   Uses its own exact integer arithmetic (gcd-reduced, cross-multiplied
   equality) so it never leans on the game's rational helpers. It enumerates
   every subset of exactly `slots` distinct cards and every +/- assignment,
   which is exactly what the player can do: fill every slot, never reuse a
   card, toggle each slot's sign.
   --------------------------------------------------------------------------- */

interface Frac {
  n: number;
  d: number;
}
type Sign = 1 | -1;
interface Arrangement {
  ids: string[];
  signs: Sign[];
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

function reduce(n: number, d: number): Frac {
  if (n === 0) return { n: 0, d: 1 };
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

function add(a: Frac, b: Frac): Frac {
  return reduce(a.n * b.d + b.n * a.d, a.d * b.d);
}

function sameValue(a: Frac, b: Frac): boolean {
  return a.n * b.d === b.n * a.d;
}

function signedTotal(cards: FractionCard[], ids: string[], signs: Sign[]): Frac {
  let total: Frac = { n: 0, d: 1 };
  ids.forEach((id, i) => {
    const card = cards.find((c) => c.id === id)!;
    total = add(total, { n: signs[i] * card.value.n, d: card.value.d });
  });
  return total;
}

/** Every arrangement (subset of `slots` distinct cards x signs) that balances the target. */
function solveAll(puzzle: FractionBalancePuzzle, allowMinus: boolean): Arrangement[] {
  const found: Arrangement[] = [];
  const chosen: number[] = [];
  const signCombos = allowMinus ? 1 << puzzle.slots : 1;
  const recurse = (start: number) => {
    if (chosen.length === puzzle.slots) {
      const ids = chosen.map((i) => puzzle.cards[i].id);
      for (let mask = 0; mask < signCombos; mask++) {
        const signs = chosen.map((_, i): Sign => ((mask >> i) & 1 ? -1 : 1));
        if (sameValue(signedTotal(puzzle.cards, ids, signs), puzzle.target)) found.push({ ids, signs });
      }
      return;
    }
    for (let i = start; i < puzzle.cards.length; i++) {
      chosen.push(i);
      recurse(i + 1);
      chosen.pop();
    }
  };
  recurse(0);
  return found;
}

/** Order-insensitive identity of an arrangement, e.g. "+d2 -s0 +s1". */
function arrangementKey(ids: string[], signs: Sign[]): string {
  return ids
    .map((id, i) => `${signs[i] === -1 ? "-" : "+"}${id}`)
    .sort()
    .join(" ");
}

/** Build a hand-made puzzle from canonical fractions (the generator only ever emits canonical values). */
function handPuzzle(values: [number, number][], target: [number, number], slots: number): FractionBalancePuzzle {
  return {
    difficulty: "hard",
    target: { n: target[0], d: target[1] },
    cards: values.map(([n, d], i) => ({ id: `c${i}`, value: { n, d } })),
    solutionIds: [],
    solutionSigns: [],
    slots,
  };
}

const SEEDS_PER_DIFFICULTY = 300;

/** Full audit of one generated round against the rules shown to the player. */
function auditPuzzle(puzzle: FractionBalancePuzzle, difficulty: FractionBalanceDifficulty, label: string): void {
  // Shape
  expect(puzzle.difficulty, label).toBe(difficulty.key);
  expect(puzzle.slots, label).toBe(difficulty.slots);
  expect(puzzle.cards, label).toHaveLength(difficulty.slots + difficulty.distractors);
  expect(new Set(puzzle.cards.map((c) => c.id)).size, label).toBe(puzzle.cards.length);

  // Cards: canonical, nonzero, pairwise distinct, inside the difficulty's range
  const seen = new Set<string>();
  for (const card of puzzle.cards) {
    expect(card.value.d, label).toBeGreaterThanOrEqual(1);
    expect(card.value.d, label).toBeLessThanOrEqual(difficulty.maxDen);
    expect(card.value.n, label).not.toBe(0);
    expect(gcd(card.value.n, card.value.d), label).toBe(1);
    if (!difficulty.allowNegative) expect(card.value.n, label).toBeGreaterThan(0);
    const key = `${card.value.n}/${card.value.d}`;
    expect(seen.has(key), `${label}: duplicate card value ${key}`).toBe(false);
    seen.add(key);
  }

  // Not degenerate: the empty right pan sums to 0, so a zero target would look balanced at start
  expect(puzzle.target.n, `${label}: zero target`).not.toBe(0);
  expect(puzzle.target.d, label).toBeGreaterThanOrEqual(1);
  expect(gcd(puzzle.target.n, puzzle.target.d), label).toBe(1);

  // Stored solution: right length, distinct cards that all exist, signs match the difficulty
  expect(puzzle.solutionIds, label).toHaveLength(difficulty.slots);
  expect(puzzle.solutionSigns, label).toHaveLength(difficulty.slots);
  expect(new Set(puzzle.solutionIds).size, label).toBe(difficulty.slots);
  for (const id of puzzle.solutionIds) expect(puzzle.cards.some((c) => c.id === id), label).toBe(true);
  if (!difficulty.allowNegative) expect(puzzle.solutionSigns.every((s) => s === 1), label).toBe(true);

  // Independent solver: a solution exists under the stated rules (no subtraction needed
  // below hard), and the stored solution is one of them
  const strict = solveAll(puzzle, difficulty.allowNegative);
  expect(strict.length, `${label}: unsolvable`).toBeGreaterThan(0);
  const strictKeys = new Set(strict.map((s) => arrangementKey(s.ids, s.signs)));
  expect(strictKeys.has(arrangementKey(puzzle.solutionIds, puzzle.solutionSigns)), label).toBe(true);

  // The game accepts EVERY valid arrangement the UI allows (signs can be toggled in any
  // difficulty), in any slot order - not just the generator's stored one
  const all = difficulty.allowNegative ? strict : solveAll(puzzle, true);
  for (const s of all) {
    expect(isFractionBalanceSolved(puzzle, s.ids, s.signs), label).toBe(true);
    const order = s.ids.map((_, i) => i).reverse();
    expect(
      isFractionBalanceSolved(
        puzzle,
        order.map((i) => s.ids[i]),
        order.map((i) => s.signs[i]),
      ),
      label,
    ).toBe(true);
  }

  // ...and rejects unbalanced arrangements (confirmed unbalanced by the solver first)
  const first = strict[0];
  const flipped = first.signs.map((s, i) => (i === 0 ? -s : s)) as Sign[];
  expect(sameValue(signedTotal(puzzle.cards, first.ids, flipped), puzzle.target), label).toBe(false);
  expect(isFractionBalanceSolved(puzzle, first.ids, flipped), label).toBe(false);

  const unused = puzzle.cards.find((c) => !first.ids.includes(c.id))!;
  const swapped = [unused.id, ...first.ids.slice(1)];
  expect(sameValue(signedTotal(puzzle.cards, swapped, first.signs), puzzle.target), label).toBe(false);
  expect(isFractionBalanceSolved(puzzle, swapped, first.signs), label).toBe(false);

  // Fewer cards than slots never wins, whatever the partial sum happens to be
  expect(isFractionBalanceSolved(puzzle, first.ids.slice(0, -1), first.signs.slice(0, -1)), label).toBe(false);
  expect(isFractionBalanceSolved(puzzle, [], []), label).toBe(false);
}

describe("fraction balance", () => {
  it("generates a solvable puzzle for every difficulty", () => {
    for (const difficulty of FRACTION_BALANCE_DIFFICULTIES) {
      const puzzle = generateFractionBalancePuzzle(makeRng(`fraction-${difficulty.key}`), difficulty.key);
      expect(puzzle.slots).toBe(difficulty.slots);
      const sum = signedSum(puzzle.cards, puzzle.solutionIds, puzzle.solutionSigns);
      expect(req(sum, puzzle.target)).toBe(true);
      expect(isFractionBalanceSolved(puzzle, puzzle.solutionIds, puzzle.solutionSigns)).toBe(true);
    }
  });

  it("every round is solvable and the check accepts any valid arrangement (hundreds of seeds x every difficulty)", () => {
    for (const difficulty of FRACTION_BALANCE_DIFFICULTIES) {
      for (let i = 0; i < SEEDS_PER_DIFFICULTY; i++) {
        const seed = `fb-${i}`;
        const puzzle = generateFractionBalancePuzzle(makeRng(seed), difficulty.key);
        auditPuzzle(puzzle, difficulty, `${difficulty.key}/${seed}`);
      }
    }
  });

  it("daily challenge seeds (YYYY-MM-DD, hard) are solvable and deterministic", () => {
    const hard = getFractionBalanceDifficulty("hard");
    for (let day = 0; day < 400; day++) {
      const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      // Mirrors rng() in FractionBalanceGame.vue: `${seed}:fraction-balance:${difficulty}`
      const seed = `${date}:fraction-balance:hard`;
      const puzzle = generateFractionBalancePuzzle(makeRng(seed), "hard");
      expect(generateFractionBalancePuzzle(makeRng(seed), "hard")).toEqual(puzzle);
      auditPuzzle(puzzle, hard, `daily/${date}`);
    }
  });

  it("never emits a zero target (the empty pan would already look balanced)", () => {
    // Before the guard these seeds produced a signed sum of 0 (e.g. a + b - (a + b));
    // the generator now flips the last solution sign, so undoing that flip recovers the 0.
    for (const [key, seed] of [
      ["hard", "fb-5"],
      ["hard", "fb-291"],
      ["expert", "fb-100"],
    ] as const) {
      const puzzle = generateFractionBalancePuzzle(makeRng(seed), key);
      expect(puzzle.target.n).not.toBe(0);
      expect(isFractionBalanceSolved(puzzle, puzzle.solutionIds, puzzle.solutionSigns)).toBe(true);
      const unflipped = puzzle.solutionSigns.map((s, i) => (i === puzzle.slots - 1 ? -s : s)) as Sign[];
      expect(signedSum(puzzle.cards, puzzle.solutionIds, unflipped)).toEqual({ n: 0, d: 1 });
      expect(req(puzzle.target, signedSum(puzzle.cards, puzzle.solutionIds, puzzle.solutionSigns))).toBe(true);
    }
  });

  it("balances with exact rational arithmetic, not floats", () => {
    // 1/3 + 1/6 = 1/2 and 1/10 + 1/5 = 3/10 (0.1 + 0.2 !== 0.3 in floating point)
    const halves = handPuzzle([[1, 3], [1, 6], [1, 2], [1, 4]], [1, 2], 2);
    expect(isFractionBalanceSolved(halves, ["c0", "c1"], [1, 1])).toBe(true);
    expect(isFractionBalanceSolved(halves, ["c1", "c0"], [1, 1])).toBe(true);
    expect(isFractionBalanceSolved(halves, ["c0", "c2"], [1, 1])).toBe(false);

    const tenths = handPuzzle([[1, 10], [1, 5], [3, 10], [2, 5]], [3, 10], 2);
    expect(isFractionBalanceSolved(tenths, ["c0", "c1"], [1, 1])).toBe(true);
    expect(isFractionBalanceSolved(tenths, ["c3", "c0"], [1, -1])).toBe(true); // 2/5 - 1/10 = 3/10
    expect(isFractionBalanceSolved(tenths, ["c0", "c1"], [1, -1])).toBe(false);

    // Subtraction and negative targets: 1/3 - 5/6 = -1/2, and 1/7 + 2/7 + 4/7 = 1
    const negative = handPuzzle([[5, 6], [1, 3], [1, 2]], [-1, 2], 2);
    expect(isFractionBalanceSolved(negative, ["c1", "c0"], [1, -1])).toBe(true);
    expect(isFractionBalanceSolved(negative, ["c0", "c1"], [1, -1])).toBe(false);
    const sevenths = handPuzzle([[1, 7], [2, 7], [4, 7], [3, 7]], [1, 1], 3);
    expect(isFractionBalanceSolved(sevenths, ["c0", "c1", "c2"], [1, 1, 1])).toBe(true);
    expect(isFractionBalanceSolved(sevenths, ["c0", "c1", "c3"], [1, 1, 1])).toBe(false);
  });

  it("requires exactly `slots` distinct cards", () => {
    const puzzle = handPuzzle([[1, 2], [1, 4], [3, 4]], [3, 4], 2);
    expect(isFractionBalanceSolved(puzzle, ["c0", "c1"], [1, 1])).toBe(true);
    expect(isFractionBalanceSolved(puzzle, ["c2"], [1])).toBe(false); // right value, too few cards
    expect(isFractionBalanceSolved(puzzle, ["c0", "c1", "c2"], [1, 1, -1])).toBe(false); // too many
    expect(isFractionBalanceSolved(puzzle, ["c0", "nope"], [1, 1])).toBe(false); // unknown card
  });

  it("rejects duplicated cards", () => {
    const puzzle = generateFractionBalancePuzzle(makeRng("fraction-dup"), "normal");
    const repeated = [puzzle.cards[0].id, puzzle.cards[0].id];
    expect(isFractionBalanceSolved(puzzle, repeated, [1, 1])).toBe(false);
  });

  it("signedSum defaults missing signs to + and returns null for unknown cards", () => {
    const cards: FractionCard[] = [
      { id: "a", value: { n: 1, d: 2 } },
      { id: "b", value: { n: 1, d: 3 } },
    ];
    expect(signedSum(cards, [], [])).toEqual({ n: 0, d: 1 });
    expect(signedSum(cards, ["a", "b"], [])).toEqual({ n: 5, d: 6 });
    expect(signedSum(cards, ["a", "b"], [1, -1])).toEqual({ n: 1, d: 6 });
    expect(signedSum(cards, ["b", "a"], [-1])).toEqual({ n: 1, d: 6 });
    expect(signedSum(cards, ["a", "zzz"], [1, 1])).toBeNull();
  });

  it("falls back to normal for unknown difficulty keys", () => {
    expect(getFractionBalanceDifficulty("expert").key).toBe("expert");
    expect(getFractionBalanceDifficulty("nope").key).toBe("normal");
    expect(generateFractionBalancePuzzle(makeRng("fallback"), "nope").difficulty).toBe("normal");
    expect(generateFractionBalancePuzzle(makeRng("fallback")).difficulty).toBe("normal");
  });

  it("formats whole numbers, proper and improper fractions", () => {
    expect(formatFraction({ n: 0, d: 1 })).toBe("0");
    expect(formatFraction({ n: 3, d: 1 })).toBe("3");
    expect(formatFraction({ n: -2, d: 1 })).toBe("-2");
    expect(formatFraction({ n: 1, d: 2 })).toBe("1/2");
    expect(formatFraction({ n: -1, d: 2 })).toBe("-1/2");
    expect(formatFraction({ n: 7, d: 3 })).toBe("2 1/3");
    expect(formatFraction({ n: -7, d: 3 })).toBe("-2 1/3");
    // An unreduced whole number still prints without a fractional part
    expect(formatFraction({ n: 6, d: 3 })).toBe("2");
    expect(formatFraction({ n: -6, d: 3 })).toBe("-2");
  });
});
