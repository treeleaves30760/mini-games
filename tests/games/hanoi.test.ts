import { describe, it, expect } from "vitest";
import {
  initPegs,
  isLegalMove,
  applyMove,
  isWin,
  solveHanoi,
} from "~/games/hanoi";
import type { Pegs } from "~/games/hanoi";

// ---------------------------------------------------------------------------
// initPegs
// ---------------------------------------------------------------------------
describe("initPegs", () => {
  it("puts all n disks on peg 0 in descending order (largest at bottom)", () => {
    const pegs = initPegs(3);
    expect(pegs[0]).toEqual([3, 2, 1]); // largest first, smallest (top) last
    expect(pegs[1]).toEqual([]);
    expect(pegs[2]).toEqual([]);
  });

  it("works for n=1", () => {
    const pegs = initPegs(1);
    expect(pegs[0]).toEqual([1]);
  });

  it("works for n=6", () => {
    const pegs = initPegs(6);
    expect(pegs[0]).toEqual([6, 5, 4, 3, 2, 1]);
    expect(pegs[1]).toEqual([]);
    expect(pegs[2]).toEqual([]);
  });

  it("returns independent arrays each call (no shared state)", () => {
    const a = initPegs(3);
    const b = initPegs(3);
    a[0].pop();
    expect(b[0]).toEqual([3, 2, 1]); // b is unaffected
  });
});

// ---------------------------------------------------------------------------
// isLegalMove
// ---------------------------------------------------------------------------
describe("isLegalMove", () => {
  it("returns false when source peg is empty", () => {
    const pegs = initPegs(3);
    // pegs[1] and pegs[2] are empty
    expect(isLegalMove(pegs, 1, 0)).toBe(false);
    expect(isLegalMove(pegs, 2, 0)).toBe(false);
  });

  it("returns true when destination peg is empty", () => {
    const pegs = initPegs(3);
    // top of peg 0 is disk 1 (smallest); peg 1 is empty
    expect(isLegalMove(pegs, 0, 1)).toBe(true);
    expect(isLegalMove(pegs, 0, 2)).toBe(true);
  });

  it("returns true when moving a smaller disk onto a larger disk", () => {
    // peg 0: [3,2], peg 1: [1] — moving disk 2 onto peg 2 is fine if peg 2 is empty
    // but moving disk 1 from peg 1 onto peg 0 (top=2) is legal
    const pegs: Pegs = [[3, 2], [1], []];
    expect(isLegalMove(pegs, 1, 0)).toBe(true); // disk 1 onto disk 2 ✓
  });

  it("returns false when moving a larger disk onto a smaller disk", () => {
    // peg 0: [3,2], peg 1: [1] — moving disk 2 from peg 0 onto peg 1 (top=1) is illegal
    const pegs: Pegs = [[3, 2], [1], []];
    expect(isLegalMove(pegs, 0, 1)).toBe(false); // disk 2 onto disk 1 ✗
  });

  it("returns false when moving a disk of equal size (edge case: same disk = illegal)", () => {
    // Although the puzzle never has equal-sized disks, size equality means the
    // moving disk is NOT smaller than the target top, so it must be illegal.
    const pegs: Pegs = [[2], [2], []];
    expect(isLegalMove(pegs, 0, 1)).toBe(false);
  });

  it("legal when source top is smaller than destination top regardless of depth", () => {
    // peg 0: [5,3,1] (top=1), peg 1: [4,2] (top=2): moving disk 1 onto disk 2 is legal
    const pegs: Pegs = [[5, 3, 1], [4, 2], []];
    expect(isLegalMove(pegs, 0, 1)).toBe(true);
  });

  it("illegal when source top is larger than destination top regardless of depth", () => {
    // peg 0: [5,3,2] (top=2), peg 1: [4,1] (top=1): moving disk 2 onto disk 1 is illegal
    const pegs: Pegs = [[5, 3, 2], [4, 1], []];
    expect(isLegalMove(pegs, 0, 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyMove
// ---------------------------------------------------------------------------
describe("applyMove", () => {
  it("transfers the top disk from source to destination", () => {
    const pegs = initPegs(3); // [[3,2,1],[],[]]
    const next = applyMove(pegs, 0, 2);
    expect(next[0]).toEqual([3, 2]);
    expect(next[2]).toEqual([1]);
    expect(next[1]).toEqual([]);
  });

  it("does NOT mutate the original pegs array", () => {
    const pegs = initPegs(3);
    applyMove(pegs, 0, 1);
    expect(pegs[0]).toEqual([3, 2, 1]); // unchanged
    expect(pegs[1]).toEqual([]);
  });

  it("stacks correctly when destination is non-empty", () => {
    const pegs: Pegs = [[3, 2], [1], []];
    const next = applyMove(pegs, 1, 0); // move disk 1 onto peg 0 (top=2)
    expect(next[0]).toEqual([3, 2, 1]);
    expect(next[1]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isWin
// ---------------------------------------------------------------------------
describe("isWin", () => {
  it("returns false on the initial state", () => {
    const pegs = initPegs(3);
    expect(isWin(pegs, 3)).toBe(false);
  });

  it("returns false when all disks are on peg 1 (middle), not peg 2", () => {
    const pegs: Pegs = [[], [3, 2, 1], []];
    expect(isWin(pegs, 3)).toBe(false);
  });

  it("returns true when all disks are stacked in order on peg 2 (goal)", () => {
    const pegs: Pegs = [[], [], [3, 2, 1]];
    expect(isWin(pegs, 3)).toBe(true);
  });

  it("returns false when pegs[2] is non-empty but not all disks are there yet", () => {
    const pegs: Pegs = [[3], [2], [1]];
    expect(isWin(pegs, 3)).toBe(false);
  });

  it("returns true for n=1 when disk is on peg 2", () => {
    const pegs: Pegs = [[], [], [1]];
    expect(isWin(pegs, 1)).toBe(true);
  });

  it("returns false for empty pegs[2] with numDisks=0 edge guard", () => {
    // numDisks=0 means no disks to place; peg 2 is already 'full' conceptually
    // but the function is called with numDisks > 0 in practice
    const pegs: Pegs = [[], [], []];
    expect(isWin(pegs, 3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// solveHanoi — move count and validity
// ---------------------------------------------------------------------------
describe("solveHanoi", () => {
  function simulateSolution(n: number) {
    const moves = solveHanoi(n);
    const pegs = initPegs(n);
    let state = pegs;
    for (const move of moves) {
      expect(
        isLegalMove(state, move.from, move.to),
        `move ${move.from}→${move.to} must be legal at this state`
      ).toBe(true);
      state = applyMove(state, move.from, move.to);
    }
    return { moves, finalState: state };
  }

  it("n=1: exactly 1 move (2^1 − 1), valid, reaches goal", () => {
    const { moves, finalState } = simulateSolution(1);
    expect(moves).toHaveLength(1); // 2^1 - 1
    expect(isWin(finalState, 1)).toBe(true);
  });

  it("n=2: exactly 3 moves (2^2 − 1), all legal, reaches goal", () => {
    const { moves, finalState } = simulateSolution(2);
    expect(moves).toHaveLength(3);
    expect(isWin(finalState, 2)).toBe(true);
  });

  it("n=3: exactly 7 moves (2^3 − 1), all legal, reaches goal", () => {
    const { moves, finalState } = simulateSolution(3);
    expect(moves).toHaveLength(7);
    expect(isWin(finalState, 3)).toBe(true);
  });

  it("n=4: exactly 15 moves (2^4 − 1), all legal, reaches goal", () => {
    const { moves, finalState } = simulateSolution(4);
    expect(moves).toHaveLength(15);
    expect(isWin(finalState, 4)).toBe(true);
  });

  it("n=5: exactly 31 moves (2^5 − 1), all legal, reaches goal", () => {
    const { moves, finalState } = simulateSolution(5);
    expect(moves).toHaveLength(31);
    expect(isWin(finalState, 5)).toBe(true);
  });

  it("n=6: exactly 63 moves (2^6 − 1), all legal, reaches goal", () => {
    const { moves, finalState } = simulateSolution(6);
    expect(moves).toHaveLength(63);
    expect(isWin(finalState, 6)).toBe(true);
  });

  it("move count equals 2^n − 1 for n=1..8", () => {
    for (let n = 1; n <= 8; n++) {
      const moves = solveHanoi(n);
      expect(moves).toHaveLength(Math.pow(2, n) - 1);
    }
  });

  it("all moves reference valid peg indices (0, 1, or 2)", () => {
    const moves = solveHanoi(5);
    for (const move of moves) {
      expect(move.from).toBeGreaterThanOrEqual(0);
      expect(move.from).toBeLessThanOrEqual(2);
      expect(move.to).toBeGreaterThanOrEqual(0);
      expect(move.to).toBeLessThanOrEqual(2);
      expect(move.from).not.toBe(move.to);
    }
  });

  it("n=0: returns empty sequence (no disks to move)", () => {
    expect(solveHanoi(0)).toEqual([]);
  });

  it("custom source/target: solveHanoi(3, 0, 1, 2) moves all disks to peg 1", () => {
    const moves = solveHanoi(3, 0, 1, 2);
    const pegs = initPegs(3);
    let state = pegs;
    for (const move of moves) {
      expect(isLegalMove(state, move.from, move.to)).toBe(true);
      state = applyMove(state, move.from, move.to);
    }
    expect(state[1]).toEqual([3, 2, 1]);
  });
});

// ---------------------------------------------------------------------------
// Integration: full round-trip for n=3 using the solver
// ---------------------------------------------------------------------------
describe("integration: solver round-trip", () => {
  it("n=3 solver produces a sequence that passes all legality checks and wins", () => {
    const n = 3;
    const moves = solveHanoi(n);
    let state = initPegs(n);

    for (let i = 0; i < moves.length; i++) {
      const { from, to } = moves[i];
      expect(isLegalMove(state, from, to), `step ${i}: move ${from}→${to}`).toBe(true);
      state = applyMove(state, from, to);
      if (i < moves.length - 1) {
        expect(isWin(state, n), `should not win before last move`).toBe(false);
      }
    }
    expect(isWin(state, n)).toBe(true);
  });

  it("manual illegal sequence is correctly rejected at every illegal step", () => {
    const pegs = initPegs(3); // [[3,2,1],[],[]]
    // disk 1 (top of peg 0) is size 1; try moving disk 3 from peg 0 to peg 1 is illegal
    // since peg 0 top is 1 and peg 1 is empty, peg 0→1 is legal
    // Instead: peg 0→2 (legal, moves disk 1); then try peg 0→2 again (disk 2 onto disk 1 = illegal)
    const s1 = applyMove(pegs, 0, 2); // [[3,2],[],[1]]
    expect(isLegalMove(s1, 0, 2)).toBe(false); // disk 2 onto disk 1: illegal
    expect(isLegalMove(s1, 0, 1)).toBe(true);  // disk 2 onto empty peg 1: legal
    expect(isLegalMove(s1, 2, 0)).toBe(true);  // disk 1 onto disk 2: legal
    expect(isLegalMove(s1, 2, 1)).toBe(true);  // disk 1 onto empty peg 1: legal
  });
});
