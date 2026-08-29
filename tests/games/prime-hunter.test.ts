import { describe, expect, it } from "vitest";
import { makeRng, type Rng } from "~/utils/rng";
import {
  PRIME_HUNTER_DIFFICULTIES,
  type PrimeHunterDifficulty,
  type PrimeHunterPuzzle,
  type PrimeRule,
  type PrimeRuleKind,
  checkPrimeHunterSelection,
  factorize,
  generatePrimeHunterPuzzle,
  getPrimeHunterDifficulty,
  isPrime,
  isSemiprime,
  matchesPrimeRule,
} from "~/games/prime-hunter";

/* -------------------------------------------------------------------------
   Independent reference implementations — written from scratch with plain
   trial division so the game's own sieve/factorizer is checked against
   something that shares no code with it.
   ------------------------------------------------------------------------- */

function refIsPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false;
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) return false;
  }
  return true;
}

/** Ascending prime factors with multiplicity (refFactors(12) -> [2, 2, 3]). */
function refFactors(n: number): number[] {
  const out: number[] = [];
  let x = n;
  for (let d = 2; x > 1; d++) {
    while (x % d === 0) {
      out.push(d);
      x /= d;
    }
  }
  return out;
}

/** The rule exactly as the task text describes it to the player. */
function refMatches(n: number, rule: PrimeRule): boolean {
  switch (rule.kind) {
    case "prime": // 找出所有質數
      return refIsPrime(n);
    case "hasFactor": // 找出所有含因數 f 的數
      return rule.factor !== undefined && n % rule.factor === 0;
    case "semiprime": // 剛好兩個質因數 (with multiplicity: 49 = 7 × 7 counts)
      return refFactors(n).length === 2;
    case "threeDistinct": // 至少三種不同質因數
      return new Set(refFactors(n)).size >= 3;
  }
}

const RANGE_MAX = Math.max(...PRIME_HUNTER_DIFFICULTIES.map((d) => d.max)); // 420
const FACTOR_CHOICES = [3, 5, 7, 11];

/** Every rule a difficulty can present (the hasFactor rule picks one of four factors). */
function rulesFor(difficulty: PrimeHunterDifficulty): PrimeRule[] {
  if (difficulty.rule === "hasFactor") {
    return FACTOR_CHOICES.map((factor) => ({ kind: "hasFactor" as const, factor, label: "" }));
  }
  return [{ kind: difficulty.rule, label: "" }];
}

/** Mirrors the generator's acceptance window: at least max(3, size - 1) targets,
 *  at most 45% of the cells. Kept independent so a regression in the generator
 *  is caught rather than mirrored. */
function targetWindow(difficulty: PrimeHunterDifficulty) {
  const total = difficulty.size * difficulty.size;
  return { total, lo: Math.max(3, difficulty.size - 1), hi: Math.floor(total * 0.45) };
}

/** Seeds exactly as the component composes them: `${seed}:prime-hunter:${difficulty}`
 *  with the Daily Challenge passing a "YYYY-MM-DD" seed (and forcing "hard"). */
function dailySeeds(difficultyKey: string): string[] {
  const seeds: string[] = [];
  for (let t = Date.UTC(2025, 0, 1); t <= Date.UTC(2027, 11, 31); t += 86400000) {
    seeds.push(`${new Date(t).toISOString().slice(0, 10)}:prime-hunter:${difficultyKey}`);
  }
  return seeds;
}

function allSeeds(difficultyKey: string): (string | number)[] {
  const seeds: (string | number)[] = [];
  for (let s = 1; s <= 400; s++) seeds.push(s);
  return seeds.concat(dailySeeds(difficultyKey));
}

/** Wraps a real rng and counts `int()` calls so the number of generation
 *  attempts can be recovered (each attempt draws exactly size² integers). */
function countingRng(seed: string | number): { rng: Rng; ints: () => number } {
  const base = makeRng(seed);
  let calls = 0;
  const rng: Rng = {
    ...base,
    int: (min, max) => {
      calls++;
      return base.int(min, max);
    },
  };
  return { rng, ints: () => calls };
}

/** A degenerate rng: every drawn number is the range minimum, so every random
 *  attempt produces a board that is either all targets or no targets and is
 *  rejected — this is the only way to reach the deterministic safety net. */
function stubRng(pickIndex: number): Rng {
  return {
    next: () => 0,
    int: (min) => min,
    float: (min) => min,
    bool: () => false,
    pick: (arr) => arr[pickIndex],
    shuffle: (arr) => arr,
  };
}

function expectCompletableBoard(puzzle: PrimeHunterPuzzle, difficulty: PrimeHunterDifficulty) {
  const { total, lo, hi } = targetWindow(difficulty);
  expect(puzzle.difficulty).toBe(difficulty.key);
  expect(puzzle.size).toBe(difficulty.size);
  expect(puzzle.numbers).toHaveLength(total);
  expect(puzzle.answers).toHaveLength(total);
  expect(puzzle.rule.kind).toBe(difficulty.rule);
  if (difficulty.rule === "hasFactor") expect(FACTOR_CHOICES).toContain(puzzle.rule.factor);
  expect(puzzle.rule.label.length).toBeGreaterThan(0);

  // Cell checks are collected in plain JS and asserted once per board — this
  // helper runs on thousands of boards, and one `expect` per cell would be slow.
  const outOfRange = puzzle.numbers.filter((n) => !Number.isInteger(n) || n < difficulty.min || n > difficulty.max);
  expect(outOfRange).toEqual([]);
  // (a) the answer key agrees with an independent evaluation of the rule
  expect(puzzle.answers).toEqual(puzzle.numbers.map((n) => refMatches(n, puzzle.rule)));

  // (b)/(d) non-degenerate: something to hunt, and something to leave alone
  const count = puzzle.answers.filter(Boolean).length;
  expect(count).toBeGreaterThanOrEqual(lo);
  expect(count).toBeLessThanOrEqual(hi);
  expect(count).toBeGreaterThanOrEqual(3);
  expect(count).toBeLessThan(total);

  // (c) selecting exactly the targets wins
  const status = checkPrimeHunterSelection(puzzle, puzzle.answers);
  expect(status).toEqual({ solved: true, correct: count, wrong: 0, missing: 0 });
}

describe("prime hunter classification", () => {
  it("isPrime agrees with trial division for every number the board can show, and beyond", () => {
    for (let n = 0; n <= Math.max(2000, RANGE_MAX); n++) {
      expect(isPrime(n), `isPrime(${n})`).toBe(refIsPrime(n));
    }
    // explicit edge cases
    expect(isPrime(0)).toBe(false);
    expect(isPrime(1)).toBe(false);
    expect(isPrime(2)).toBe(true);
    expect(isPrime(3)).toBe(true);
    for (const square of [4, 9, 25, 49, 121, 169, 289, 361]) expect(isPrime(square), `${square}`).toBe(false);
    for (const p of [397, 401, 409, 419, 421]) expect(isPrime(p), `${p}`).toBe(true); // primes around the 420 range max
    expect(isPrime(420)).toBe(false);
    for (const carmichael of [561, 1105, 1729]) expect(isPrime(carmichael), `${carmichael}`).toBe(false);
  });

  it("factorize returns the ascending prime factorization with multiplicity", () => {
    expect(factorize(1)).toEqual([]);
    expect(factorize(84)).toEqual([2, 2, 3, 7]);
    for (let n = 2; n <= 2000; n++) {
      const factors = factorize(n);
      expect(factors, `factorize(${n})`).toEqual(refFactors(n));
      expect(factors.reduce((acc, f) => acc * f, 1)).toBe(n);
      for (const f of factors) expect(refIsPrime(f)).toBe(true);
      for (let i = 1; i < factors.length; i++) expect(factors[i]).toBeGreaterThanOrEqual(factors[i - 1]);
    }
  });

  it("isSemiprime counts prime factors with multiplicity (49 = 7 × 7 is a semiprime)", () => {
    for (let n = 0; n <= 2000; n++) {
      expect(isSemiprime(n), `isSemiprime(${n})`).toBe(refFactors(n).length === 2);
    }
    for (const semiprime of [4, 6, 9, 49, 221]) expect(isSemiprime(semiprime)).toBe(true);
    for (const other of [1, 2, 8, 12, 30, 97, 210]) expect(isSemiprime(other)).toBe(false);
  });

  it("matchesPrimeRule implements every rule the player can be shown", () => {
    for (const difficulty of PRIME_HUNTER_DIFFICULTIES) {
      for (const rule of rulesFor(difficulty)) {
        for (let n = 0; n <= RANGE_MAX; n++) {
          expect(matchesPrimeRule(n, rule), `${rule.kind}/${rule.factor ?? "-"} on ${n}`).toBe(refMatches(n, rule));
        }
      }
    }
    // spot checks tied to the task text
    expect(matchesPrimeRule(30, { kind: "threeDistinct", label: "" })).toBe(true); // 2 × 3 × 5
    expect(matchesPrimeRule(60, { kind: "threeDistinct", label: "" })).toBe(true); // 2 × 2 × 3 × 5 (three distinct)
    expect(matchesPrimeRule(36, { kind: "threeDistinct", label: "" })).toBe(false); // 2 × 2 × 3 × 3 (two distinct)
    expect(matchesPrimeRule(121, { kind: "hasFactor", factor: 11, label: "" })).toBe(true);
    expect(matchesPrimeRule(120, { kind: "hasFactor", factor: 11, label: "" })).toBe(false);
  });

  it("matchesPrimeRule matches nothing for a malformed rule", () => {
    // A hasFactor rule without a factor and an unknown kind can only come from
    // untyped callers; both must never mark a cell as a target.
    for (let n = 0; n <= RANGE_MAX; n++) {
      expect(matchesPrimeRule(n, { kind: "hasFactor", label: "" })).toBe(false);
      expect(matchesPrimeRule(n, { kind: "bogus" as PrimeRuleKind, label: "" })).toBe(false);
    }
  });

  it("getPrimeHunterDifficulty resolves every key and falls back to normal", () => {
    for (const difficulty of PRIME_HUNTER_DIFFICULTIES) expect(getPrimeHunterDifficulty(difficulty.key)).toBe(difficulty);
    expect(getPrimeHunterDifficulty("nope")).toBe(PRIME_HUNTER_DIFFICULTIES[1]);
    expect(getPrimeHunterDifficulty("nope").key).toBe("normal");
    expect(generatePrimeHunterPuzzle(makeRng("default")).difficulty).toBe("normal");
  });
});

describe("prime hunter generation", () => {
  it("every difficulty × hundreds of seeds (numeric and Daily Challenge dates) is completable", () => {
    for (const difficulty of PRIME_HUNTER_DIFFICULTIES) {
      const { total } = targetWindow(difficulty);
      let maxAttempts = 0;
      for (const seed of allSeeds(difficulty.key)) {
        const { rng, ints } = countingRng(seed);
        const puzzle = generatePrimeHunterPuzzle(rng, difficulty.key);
        expectCompletableBoard(puzzle, difficulty);
        // The board was accepted on the random path (80 attempts would mean the safety net ran).
        const attempts = ints() / total;
        expect(Number.isInteger(attempts)).toBe(true);
        expect(attempts).toBeLessThan(80);
        maxAttempts = Math.max(maxAttempts, attempts);
      }
      // Generation converges quickly for every rule; a jump here means the
      // range/window tuning has drifted.
      expect(maxAttempts).toBeLessThanOrEqual(20);
    }
  });

  it("is deterministic per seed and difficulty (Daily Challenge replays identically)", () => {
    for (const difficulty of PRIME_HUNTER_DIFFICULTIES) {
      for (const seed of ["2026-08-29:prime-hunter:" + difficulty.key, 7, "hunt"]) {
        const a = generatePrimeHunterPuzzle(makeRng(seed), difficulty.key);
        const b = generatePrimeHunterPuzzle(makeRng(seed), difficulty.key);
        expect(a).toEqual(b);
      }
    }
    const x = generatePrimeHunterPuzzle(makeRng("x"), "easy");
    const y = generatePrimeHunterPuzzle(makeRng("y"), "easy");
    expect(x.numbers).not.toEqual(y.numbers);
  });

  it("the safety net (every random attempt rejected) still builds a fair, completable board for every rule", () => {
    for (const difficulty of PRIME_HUNTER_DIFFICULTIES) {
      const { total, lo, hi } = targetWindow(difficulty);
      const pickIndexes = difficulty.rule === "hasFactor" ? FACTOR_CHOICES.map((_, i) => i) : [0];
      for (const pickIndex of pickIndexes) {
        const stub = stubRng(pickIndex);
        // Precondition: the constant board the stub produces is outside the
        // window (all targets or none), so all 80 attempts really are rejected.
        const rule = rulesFor(difficulty)[pickIndex];
        const constantCount = refMatches(difficulty.min, rule) ? total : 0;
        expect(constantCount < lo || constantCount > hi).toBe(true);

        const puzzle = generatePrimeHunterPuzzle(stub, difficulty.key);
        expectCompletableBoard(puzzle, difficulty);
        if (difficulty.rule === "hasFactor") expect(puzzle.rule.factor).toBe(FACTOR_CHOICES[pickIndex]);
        // Assembled from the range itself: no duplicates, and the count sits mid-window.
        expect(new Set(puzzle.numbers).size).toBe(total);
        expect(puzzle.answers.filter(Boolean).length).toBe(Math.floor((lo + hi) / 2));
      }
    }
  });

  it("every range holds more targets and non-targets than the safety net needs, for every rule", () => {
    // This is the invariant that lets the safety net assemble a board without clamping.
    for (const difficulty of PRIME_HUNTER_DIFFICULTIES) {
      const { total, lo, hi } = targetWindow(difficulty);
      const want = Math.floor((lo + hi) / 2);
      for (const rule of rulesFor(difficulty)) {
        let targets = 0;
        for (let n = difficulty.min; n <= difficulty.max; n++) if (refMatches(n, rule)) targets++;
        const others = difficulty.max - difficulty.min + 1 - targets;
        expect(targets, `${difficulty.key} ${rule.kind}/${rule.factor ?? "-"} targets`).toBeGreaterThanOrEqual(want);
        expect(others, `${difficulty.key} ${rule.kind}/${rule.factor ?? "-"} others`).toBeGreaterThanOrEqual(total - want);
      }
    }
  });
});

describe("prime hunter selection check", () => {
  it("solves only when the selection equals the target set exactly", () => {
    for (const difficulty of PRIME_HUNTER_DIFFICULTIES) {
      const puzzle = generatePrimeHunterPuzzle(makeRng(`select-${difficulty.key}`), difficulty.key);
      const count = puzzle.answers.filter(Boolean).length;
      const firstTarget = puzzle.answers.indexOf(true);
      const firstOther = puzzle.answers.indexOf(false);
      expect(firstTarget).toBeGreaterThanOrEqual(0);
      expect(firstOther).toBeGreaterThanOrEqual(0);

      // nothing selected: everything is still missing
      const none = new Array(puzzle.numbers.length).fill(false);
      expect(checkPrimeHunterSelection(puzzle, none)).toEqual({ solved: false, correct: 0, wrong: 0, missing: count });
      // a selection array shorter than the board counts as unselected
      expect(checkPrimeHunterSelection(puzzle, [])).toEqual({ solved: false, correct: 0, wrong: 0, missing: count });

      // one target left out: not solved, one missing
      const short = puzzle.answers.slice();
      short[firstTarget] = false;
      expect(checkPrimeHunterSelection(puzzle, short)).toEqual({ solved: false, correct: count - 1, wrong: 0, missing: 1 });

      // one non-target added: not solved, one wrong — the mistake is a true non-target
      const extra = puzzle.answers.slice();
      extra[firstOther] = true;
      expect(refMatches(puzzle.numbers[firstOther], puzzle.rule)).toBe(false);
      expect(checkPrimeHunterSelection(puzzle, extra)).toEqual({ solved: false, correct: count, wrong: 1, missing: 0 });

      // deselecting the mistake again restores the win
      extra[firstOther] = false;
      expect(checkPrimeHunterSelection(puzzle, extra).solved).toBe(true);
    }
  });

  it("flags a wrong pick only for cells that truly fail the rule", () => {
    for (const difficulty of PRIME_HUNTER_DIFFICULTIES) {
      const puzzle = generatePrimeHunterPuzzle(makeRng(`wrong-${difficulty.key}`), difficulty.key);
      const inverted = puzzle.answers.map((a) => !a);
      const status = checkPrimeHunterSelection(puzzle, inverted);
      const count = puzzle.answers.filter(Boolean).length;
      expect(status).toEqual({ solved: false, correct: 0, wrong: puzzle.numbers.length - count, missing: count });
      for (let i = 0; i < puzzle.numbers.length; i++) {
        // the component paints `is-wrong` for selected && !answers[i]
        const paintedWrong = inverted[i] && !puzzle.answers[i];
        expect(paintedWrong).toBe(!refMatches(puzzle.numbers[i], puzzle.rule));
      }
    }
  });
});
