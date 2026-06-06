import { describe, expect, it } from "vitest";
import { makeRng } from "~/utils/rng";
import {
  FUNCTION_RUNNER_DIFFICULTIES,
  evaluateFunction,
  functionRunnerStatus,
  generateFunctionRunnerPuzzle,
  hitsPoint,
} from "~/games/function-runner";

describe("function runner", () => {
  it("evaluates lines and quadratics", () => {
    expect(evaluateFunction("line", { a: 0, b: 2, c: -1 }, 4)).toBe(7);
    expect(evaluateFunction("quadratic", { a: 2, b: -3, c: 1 }, 4)).toBe(21);
  });

  it("generates puzzles solved by their hidden coefficients", () => {
    for (const difficulty of FUNCTION_RUNNER_DIFFICULTIES) {
      const puzzle = generateFunctionRunnerPuzzle(makeRng(`function-${difficulty.key}`), difficulty.key);
      expect(puzzle.kind).toBe(difficulty.kind);
      expect(puzzle.targets.every((point) => hitsPoint(puzzle.kind, puzzle.solution, point))).toBe(true);
      expect(puzzle.blockers.some((point) => hitsPoint(puzzle.kind, puzzle.solution, point))).toBe(false);
      const status = functionRunnerStatus(puzzle, puzzle.solution);
      expect(status.solved).toBe(true);
      expect(status.hits).toBe(puzzle.targets.length);
      expect(status.blocked).toBe(0);
    }
  });
});
