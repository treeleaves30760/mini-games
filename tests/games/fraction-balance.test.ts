import { describe, expect, it } from "vitest";
import { makeRng } from "~/utils/rng";
import {
  FRACTION_BALANCE_DIFFICULTIES,
  formatFraction,
  generateFractionBalancePuzzle,
  isFractionBalanceSolved,
  signedSum,
} from "~/games/fraction-balance";
import { req } from "~/games/twenty-four";

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

  it("rejects duplicated cards", () => {
    const puzzle = generateFractionBalancePuzzle(makeRng("fraction-dup"), "normal");
    const repeated = [puzzle.cards[0].id, puzzle.cards[0].id];
    expect(isFractionBalanceSolved(puzzle, repeated, [1, 1])).toBe(false);
  });

  it("formats improper fractions as mixed numbers", () => {
    expect(formatFraction({ n: 7, d: 3 })).toBe("2 1/3");
    expect(formatFraction({ n: -7, d: 3 })).toBe("-2 1/3");
  });
});
