import { describe, expect, it } from "vitest";
import { makeRng } from "~/utils/rng";
import {
  COUNTDOWN_DIFFICULTIES,
  applyCountdownOp,
  generateCountdownPuzzle,
  getCountdownDifficulty,
  isCountdownSolved,
} from "~/games/countdown";

describe("countdown numbers", () => {
  it("applies only legal integer operations", () => {
    expect(applyCountdownOp("+", 7, 4)).toBe(11);
    expect(applyCountdownOp("-", 7, 4)).toBe(3);
    expect(applyCountdownOp("-", 4, 7)).toBeNull();
    expect(applyCountdownOp("×", 7, 4)).toBe(28);
    expect(applyCountdownOp("÷", 12, 4)).toBe(3);
    expect(applyCountdownOp("÷", 12, 5)).toBeNull();
  });

  it("generates targets inside each difficulty range", () => {
    for (const difficulty of COUNTDOWN_DIFFICULTIES) {
      const puzzle = generateCountdownPuzzle(makeRng(`countdown-${difficulty.key}`), difficulty.key);
      const settings = getCountdownDifficulty(difficulty.key);
      expect(puzzle.numbers).toHaveLength(settings.count);
      expect(puzzle.target).toBeGreaterThanOrEqual(settings.minTarget);
      expect(puzzle.target).toBeLessThanOrEqual(settings.maxTarget);
      expect(puzzle.solution).toContain("(");
      expect(isCountdownSolved(puzzle.target, puzzle.target)).toBe(true);
      expect(isCountdownSolved(puzzle.target + 1, puzzle.target)).toBe(false);
    }
  });
});
