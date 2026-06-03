import { describe, it, expect } from "vitest";
import {
  applyPress,
  pressCell,
  isWon,
  generateBoard,
  generateBoardFromSeed,
} from "~/games/lights-out";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an N×N all-off board. */
function allOff(N: number): number[] {
  return new Array(N * N).fill(0);
}

/** Build an N×N all-on board. */
function allOn(N: number): number[] {
  return new Array(N * N).fill(1);
}

/** Apply a list of (r, c) presses in sequence on a copy of the board. */
function applyPresses(
  board: number[],
  presses: Array<[number, number]>,
  N: number,
): number[] {
  const b = [...board];
  for (const [r, c] of presses) applyPress(b, r, c, N);
  return b;
}

// ---------------------------------------------------------------------------
// applyPress — toggle pattern
// ---------------------------------------------------------------------------

describe("applyPress — toggle pattern", () => {
  it("toggles the pressed cell itself", () => {
    const b = allOff(5);
    applyPress(b, 2, 2, 5); // centre of a 5×5
    expect(b[2 * 5 + 2]).toBe(1);
  });

  it("toggles all 4 orthogonal neighbours of an interior cell", () => {
    const N = 5;
    const b = allOff(N);
    applyPress(b, 2, 2, N);
    // centre + 4 neighbours should be on; everything else off
    const expectedOn = new Set([
      2 * N + 2, // (2,2) pressed
      1 * N + 2, // (1,2) above
      3 * N + 2, // (3,2) below
      2 * N + 1, // (2,1) left
      2 * N + 3, // (2,3) right
    ]);
    for (let i = 0; i < N * N; i++) {
      expect(b[i], `cell ${i}`).toBe(expectedOn.has(i) ? 1 : 0);
    }
  });

  it("corner cell (0,0) flips only itself and 2 neighbours, not out-of-bounds", () => {
    const N = 5;
    const b = allOff(N);
    applyPress(b, 0, 0, N);
    // (0,0), (0,1), (1,0) should be on — not (-1,0) or (0,-1) which are OOB
    const expectedOn = new Set([0 * N + 0, 0 * N + 1, 1 * N + 0]);
    for (let i = 0; i < N * N; i++) {
      expect(b[i], `cell ${i}`).toBe(expectedOn.has(i) ? 1 : 0);
    }
  });

  it("edge cell (0, mid) flips 3 neighbours (no row above)", () => {
    const N = 5;
    const b = allOff(N);
    applyPress(b, 0, 2, N); // top-centre
    const expectedOn = new Set([
      0 * N + 2, // itself
      0 * N + 1, // left
      0 * N + 3, // right
      1 * N + 2, // below — no above
    ]);
    for (let i = 0; i < N * N; i++) {
      expect(b[i], `cell ${i}`).toBe(expectedOn.has(i) ? 1 : 0);
    }
  });

  it("is an involution: pressing a cell twice returns to original board", () => {
    const N = 5;
    const original = allOff(N);
    const b = [...original];
    applyPress(b, 3, 1, N);
    applyPress(b, 3, 1, N); // second press
    expect(b).toEqual(original);
  });

  it("involution holds when the board starts all-on", () => {
    const N = 5;
    const original = allOn(N);
    const b = [...original];
    applyPress(b, 2, 3, N);
    applyPress(b, 2, 3, N);
    expect(b).toEqual(original);
  });

  it("presses are commutative: different order yields the same board", () => {
    const N = 5;
    const start = allOff(N);
    const presses: Array<[number, number]> = [
      [0, 0],
      [2, 2],
      [4, 4],
      [1, 3],
    ];
    const reversed = [...presses].reverse();

    const b1 = applyPresses(start, presses, N);
    const b2 = applyPresses(start, reversed, N);
    expect(b1).toEqual(b2);
  });

  it("works identically for 3×3 and 7×7 boards", () => {
    for (const N of [3, 7]) {
      const b = allOff(N);
      applyPress(b, Math.floor(N / 2), Math.floor(N / 2), N);
      // centre press: cell itself + 4 neighbours = 5 cells on (interior centre)
      const onCount = b.filter((v) => v === 1).length;
      expect(onCount, `N=${N} centre press`).toBe(5);
    }
  });
});

// ---------------------------------------------------------------------------
// pressCell — immutable variant
// ---------------------------------------------------------------------------

describe("pressCell — returns new board without mutating input", () => {
  it("does not mutate the original board", () => {
    const N = 5;
    const original = allOff(N);
    const snapshot = [...original];
    pressCell(original, 2, 2, N);
    expect(original).toEqual(snapshot);
  });

  it("produces the same result as applyPress on a copy", () => {
    const N = 5;
    const b = allOff(N);
    const mutated = [...b];
    applyPress(mutated, 1, 3, N);
    expect(pressCell(b, 1, 3, N)).toEqual(mutated);
  });
});

// ---------------------------------------------------------------------------
// isWon
// ---------------------------------------------------------------------------

describe("isWon", () => {
  it("returns true for an all-off board", () => {
    expect(isWon(allOff(5))).toBe(true);
  });

  it("returns false for an all-on board", () => {
    expect(isWon(allOn(5))).toBe(false);
  });

  it("returns false when at least one cell is on", () => {
    const b = allOff(5);
    b[12] = 1; // single lit cell
    expect(isWon(b)).toBe(false);
  });

  it("returns true for a 1-cell all-off board", () => {
    expect(isWon([0])).toBe(true);
  });

  it("returns false for a 1-cell all-on board", () => {
    expect(isWon([1])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateBoard — solvability guarantee
// ---------------------------------------------------------------------------

describe("generateBoard — solvability", () => {
  it("board is not all-off after generation (there is something to solve)", () => {
    for (const N of [3, 5, 7]) {
      const { board } = generateBoard(N, makeRng(`test-${N}`));
      expect(isWon(board), `N=${N} board should not be already solved`).toBe(false);
    }
  });

  it("replaying the solution presses on the generated board returns all-off", () => {
    for (const N of [3, 5, 7]) {
      const { board, solution } = generateBoard(N, makeRng(`solve-${N}`));
      const result = applyPresses(board, solution, N);
      expect(isWon(result), `N=${N} solution replay should win`).toBe(true);
    }
  });

  it("solution replay works with the seed-based convenience function", () => {
    const { board, solution, size: N } = generateBoardFromSeed(5, "deterministic-seed");
    const result = applyPresses(board, solution, N);
    expect(isWon(result)).toBe(true);
  });

  it("board length equals N*N", () => {
    for (const N of [3, 5, 7]) {
      const { board } = generateBoard(N, makeRng(N));
      expect(board.length).toBe(N * N);
    }
  });

  it("board cells are only 0 or 1", () => {
    const { board } = generateBoard(5, makeRng("validity"));
    expect(board.every((v) => v === 0 || v === 1)).toBe(true);
  });

  it("solution.length equals numPresses (or numPresses+1 if board was all-off)", () => {
    const N = 5;
    const numPresses = N * N;
    const { solution } = generateBoard(N, makeRng("len-check"), numPresses);
    // Allow +1 for the fallback centre press if board happened to be all-off.
    expect(solution.length === numPresses || solution.length === numPresses + 1).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// generateBoard — determinism
// ---------------------------------------------------------------------------

describe("generateBoard — determinism with seeded RNG", () => {
  it("same seed produces identical boards", () => {
    const N = 5;
    const seed = "reproducible";
    const { board: b1 } = generateBoardFromSeed(N, seed);
    const { board: b2 } = generateBoardFromSeed(N, seed);
    expect(b1).toEqual(b2);
  });

  it("same seed produces an identical solution", () => {
    const N = 5;
    const seed = "same-solution";
    const { solution: s1 } = generateBoardFromSeed(N, seed);
    const { solution: s2 } = generateBoardFromSeed(N, seed);
    expect(s1).toEqual(s2);
  });

  it("different seeds produce different boards (with overwhelming probability)", () => {
    const boards = ["seed-a", "seed-b", "seed-c", "seed-d", "seed-e"].map(
      (s) => generateBoardFromSeed(5, s).board,
    );
    // Not all identical
    const allSame = boards.every((b) => JSON.stringify(b) === JSON.stringify(boards[0]));
    expect(allSame).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateBoard — all-off edge-case guard (lines 107-110)
// ---------------------------------------------------------------------------

describe("generateBoard — all-off guard (centre-press fallback)", () => {
  it("triggers the centre-press fallback when all presses cancel out", () => {
    // Craft a stub RNG whose int() always returns 0, so every press lands on
    // cell (0,0).  With numPresses=2 the two presses cancel (press same cell
    // twice = XOR back to 0) leaving the board all-off, which must trigger the
    // centre-press guard (lines 107-110).
    const stubRng = {
      next: () => 0,
      int: () => 0,          // always row=0, col=0
      float: () => 0,
      bool: () => false,
      pick: <T>(arr: T[]) => arr[0],
      shuffle: <T>(arr: T[]) => arr,
    };

    const N = 3;
    const { board, solution } = generateBoard(N, stubRng, 2);

    // Board must NOT be all-off after generation (the guard pressed the centre).
    expect(isWon(board)).toBe(false);

    // The solution has numPresses+1 entries: the two original (cancelling) presses
    // plus the centre-press fallback.
    expect(solution.length).toBe(3);

    // Replaying the solution on the generated board must still solve it.
    const result = applyPresses(board, solution, N);
    expect(isWon(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateBoardFromSeed — size field
// ---------------------------------------------------------------------------

describe("generateBoardFromSeed — size field", () => {
  it("returns the correct size in the result", () => {
    for (const N of [3, 5, 7]) {
      const { size } = generateBoardFromSeed(N, "size-check");
      expect(size).toBe(N);
    }
  });
});

// ---------------------------------------------------------------------------
// Commutativity at scale
// ---------------------------------------------------------------------------

describe("press commutativity at scale", () => {
  it("applying a solution in shuffled order still solves the board", () => {
    const N = 5;
    const { board, solution } = generateBoardFromSeed(N, "commute-test");

    // Reverse the solution order — since presses are commutative, should still win.
    const reversed = [...solution].reverse();
    const result = applyPresses(board, reversed, N);
    expect(isWon(result)).toBe(true);
  });

  it("applying the solution in arbitrary permutation still solves the board", () => {
    const N = 5;
    const { board, solution } = generateBoardFromSeed(N, "permute-test");

    // Sort by (c, r) — a different but deterministic order.
    const sorted = [...solution].sort(([r1, c1], [r2, c2]) =>
      c1 !== c2 ? c1 - c2 : r1 - r2,
    );
    const result = applyPresses(board, sorted, N);
    expect(isWon(result)).toBe(true);
  });
});
