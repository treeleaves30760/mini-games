import { describe, expect, it } from "vitest";
import { makeRng } from "~/utils/rng";
import {
  PRIME_HUNTER_DIFFICULTIES,
  checkPrimeHunterSelection,
  factorize,
  generatePrimeHunterPuzzle,
  isPrime,
  isSemiprime,
  matchesPrimeRule,
} from "~/games/prime-hunter";

describe("prime hunter", () => {
  it("classifies primes and factors", () => {
    expect(isPrime(2)).toBe(true);
    expect(isPrime(97)).toBe(true);
    expect(isPrime(1)).toBe(false);
    expect(isPrime(91)).toBe(false);
    expect(factorize(84)).toEqual([2, 2, 3, 7]);
    expect(isSemiprime(49)).toBe(true);
    expect(isSemiprime(12)).toBe(false);
  });

  it("generates answers matching the rule for every difficulty", () => {
    for (const difficulty of PRIME_HUNTER_DIFFICULTIES) {
      const puzzle = generatePrimeHunterPuzzle(makeRng(`prime-${difficulty.key}`), difficulty.key);
      expect(puzzle.size).toBe(difficulty.size);
      expect(puzzle.answers).toEqual(puzzle.numbers.map((n) => matchesPrimeRule(n, puzzle.rule)));
      const status = checkPrimeHunterSelection(puzzle, puzzle.answers);
      expect(status.solved).toBe(true);
      expect(status.wrong).toBe(0);
      expect(status.missing).toBe(0);
    }
  });
});
