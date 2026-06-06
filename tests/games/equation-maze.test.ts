import { describe, expect, it } from "vitest";
import { makeRng } from "~/utils/rng";
import {
  EQUATION_MAZE_DIFFICULTIES,
  areAdjacent,
  evaluateTokens,
  generateEquationMazePuzzle,
  isEquationMazeSolved,
  isValidMazeSelection,
} from "~/games/equation-maze";
import { req } from "~/games/twenty-four";

describe("equation maze", () => {
  it("generates a valid winning path for every difficulty", () => {
    for (const difficulty of EQUATION_MAZE_DIFFICULTIES) {
      const puzzle = generateEquationMazePuzzle(makeRng(`maze-${difficulty.key}`), difficulty.key);
      expect(puzzle.size).toBe(difficulty.size);
      expect(puzzle.path).toHaveLength(difficulty.terms * 2 - 1);
      expect(puzzle.expression).toHaveLength(difficulty.terms * 2 - 1);
      for (let i = 1; i < puzzle.path.length; i++) {
        expect(areAdjacent(puzzle.path[i - 1], puzzle.path[i], puzzle.size)).toBe(true);
      }
      expect(req(evaluateTokens(puzzle.expression), puzzle.target)).toBe(true);
      expect(isValidMazeSelection(puzzle, puzzle.path)).toBe(true);
      expect(isEquationMazeSolved(puzzle, puzzle.path)).toBe(true);
    }
  });

  it("rejects a non-adjacent path", () => {
    const puzzle = generateEquationMazePuzzle(makeRng("maze-invalid"), "easy");
    const bad = puzzle.path.slice();
    bad[1] = puzzle.cells.findIndex((_, i) => i !== bad[0] && !areAdjacent(bad[0], i, puzzle.size) && puzzle.cells[i].kind === "op");
    expect(isValidMazeSelection(puzzle, bad)).toBe(false);
  });
});
