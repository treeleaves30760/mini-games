import { describe, expect, it } from "vitest";
import { makeRng } from "~/utils/rng";
import {
  KENKEN_DIFFICULTIES,
  cageSatisfied,
  cellHasDuplicate,
  generateKenKenPuzzle,
  isKenKenSolved,
} from "~/games/kenken";

describe("kenken", () => {
  it("generates valid puzzles for every difficulty", () => {
    for (const difficulty of KENKEN_DIFFICULTIES) {
      const puzzle = generateKenKenPuzzle(makeRng(`kenken-${difficulty.key}`), difficulty.key);
      expect(puzzle.size).toBe(difficulty.size);
      expect(puzzle.solution).toHaveLength(puzzle.size * puzzle.size);
      expect(puzzle.cageOf).toHaveLength(puzzle.size * puzzle.size);

      const covered = new Set(puzzle.cages.flatMap((cage) => cage.cells));
      expect(covered.size).toBe(puzzle.size * puzzle.size);
      expect(puzzle.cages.every((cage) => cageSatisfied(cage, puzzle.solution))).toBe(true);
      expect(isKenKenSolved(puzzle, puzzle.solution)).toBe(true);
    }
  });

  it("detects row and column duplicates", () => {
    const puzzle = generateKenKenPuzzle(makeRng("kenken-duplicate"), "easy");
    const cells = puzzle.solution.slice();
    cells[1] = cells[0];
    expect(cellHasDuplicate(cells, puzzle.size, 0)).toBe(true);
    expect(isKenKenSolved(puzzle, cells)).toBe(false);
  });

  it("rejects incomplete boards", () => {
    const puzzle = generateKenKenPuzzle(makeRng("kenken-incomplete"), "normal");
    const cells = puzzle.solution.slice() as (number | null)[];
    cells[0] = null;
    expect(isKenKenSolved(puzzle, cells)).toBe(false);
  });
});
