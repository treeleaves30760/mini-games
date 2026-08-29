import { describe, it, expect } from "vitest";
import {
  DISK_COUNTS,
  DAILY_DISK_RANGE,
  GOAL_PEG,
  initPegs,
  isLegalMove,
  applyMove,
  isWin,
  optimalMoves,
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

// ---------------------------------------------------------------------------
// Audit: independent verification of the rules and the displayed minimum.
// Nothing below relies on solveHanoi for correctness — the reference solver
// and the BFS are written from scratch and only replay through the game's
// own isLegalMove / applyMove / isWin.
// ---------------------------------------------------------------------------

/** Every disk count a player can be given: free-play selector plus the daily range. */
const OFFERED_DISK_COUNTS: number[] = Array.from(
  new Set([
    ...DISK_COUNTS,
    ...Array.from(
      { length: DAILY_DISK_RANGE.max - DAILY_DISK_RANGE.min + 1 },
      (_, i) => DAILY_DISK_RANGE.min + i
    ),
  ])
).sort((a, b) => a - b);

/**
 * From-scratch recursive optimal solver: move n disks from `from` to `to`
 * using `via` as the spare peg. Returns [from, to] pairs.
 */
function referenceSolution(
  n: number,
  from: number,
  to: number,
  via: number,
  out: Array<[number, number]> = []
): Array<[number, number]> {
  if (n > 0) {
    referenceSolution(n - 1, from, via, to, out);
    out.push([from, to]);
    referenceSolution(n - 1, via, to, from, out);
  }
  return out;
}

/** Mirror of the component's move contract: apply only legal moves, count only applied ones. */
interface Session {
  pegs: Pegs;
  moves: number;
}
function tryMove(s: Session, from: number, to: number): Session {
  if (!isLegalMove(s.pegs, from, to)) return s;
  return { pegs: applyMove(s.pegs, from, to), moves: s.moves + 1 };
}

/** Collect every legal (from, to) pair in scan order. */
function legalMoves(pegs: Pegs): Array<[number, number]> {
  const legal: Array<[number, number]> = [];
  for (let from = 0; from < 3; from++) {
    for (let to = 0; to < 3; to++) {
      if (isLegalMove(pegs, from, to)) legal.push([from, to]);
    }
  }
  return legal;
}

describe("audit: offered disk counts and the displayed minimum", () => {
  it("free play offers 3–6 disks and daily draws 4–6, a subset of those", () => {
    expect([...DISK_COUNTS]).toEqual([3, 4, 5, 6]);
    expect(DAILY_DISK_RANGE.min).toBe(4);
    expect(DAILY_DISK_RANGE.max).toBe(6);
    for (let n = DAILY_DISK_RANGE.min; n <= DAILY_DISK_RANGE.max; n++) {
      expect(DISK_COUNTS).toContain(n);
    }
    expect(OFFERED_DISK_COUNTS).toEqual([3, 4, 5, 6]);
  });

  it("the HUD minimum (optimalMoves) is 2^n − 1 for every offered n", () => {
    const expected: Record<number, number> = { 3: 7, 4: 15, 5: 31, 6: 63 };
    for (const n of OFFERED_DISK_COUNTS) {
      expect(optimalMoves(n)).toBe(expected[n]);
    }
    expect(optimalMoves(0)).toBe(0);
    expect(optimalMoves(1)).toBe(1);
    expect(optimalMoves(2)).toBe(3);
  });

  it("the goal peg is peg C (index 2), matching the on-screen instructions", () => {
    expect(GOAL_PEG).toBe(2);
  });
});

describe("audit: from-scratch solver replayed through the game's own rules", () => {
  for (const n of OFFERED_DISK_COUNTS) {
    it(`n=${n}: ${2 ** n - 1} moves, all legal, win fires exactly at the last move`, () => {
      const moves = referenceSolution(n, 0, GOAL_PEG, 1);
      expect(moves).toHaveLength(2 ** n - 1);
      expect(moves).toHaveLength(optimalMoves(n));

      let session: Session = { pegs: initPegs(n), moves: 0 };
      expect(isWin(session.pegs, n)).toBe(false);
      moves.forEach(([from, to], i) => {
        expect(from).not.toBe(to);
        expect(isLegalMove(session.pegs, from, to), `step ${i}: ${from}→${to}`).toBe(true);
        session = tryMove(session, from, to);
        expect(session.moves).toBe(i + 1);
        expect(
          isWin(session.pegs, n),
          `win must fire only after step ${moves.length - 1}, not step ${i}`
        ).toBe(i === moves.length - 1);
      });
      expect(session.pegs).toEqual([[], [], initPegs(n)[0]]);
      // Move counter equals the displayed minimum, so the "perfect solve" banner triggers.
      expect(session.moves).toBe(optimalMoves(n));
    });
  }

  it("agrees move-for-move with solveHanoi (the optimal 3-peg solution is unique)", () => {
    for (const n of OFFERED_DISK_COUNTS) {
      const reference = referenceSolution(n, 0, GOAL_PEG, 1).map(([from, to]) => ({ from, to }));
      expect(solveHanoi(n)).toEqual(reference);
    }
  });
});

describe("audit: BFS over the game's own move rules proves 2^n − 1 is the true minimum", () => {
  function explore(n: number): { minMoves: number; reachable: number } {
    const key = (p: Pegs) => p.map((peg) => peg.join(",")).join("|");
    const start = initPegs(n);
    const dist = new Map<string, number>([[key(start), 0]]);
    const queue: Pegs[] = [start];
    let minMoves = -1;
    for (let head = 0; head < queue.length; head++) {
      const state = queue[head];
      const d = dist.get(key(state))!;
      // BFS dequeues in distance order, so the first winning state is the closest.
      if (minMoves < 0 && isWin(state, n)) minMoves = d;
      for (const [from, to] of legalMoves(state)) {
        const next = applyMove(state, from, to);
        const k = key(next);
        if (!dist.has(k)) {
          dist.set(k, d + 1);
          queue.push(next);
        }
      }
    }
    return { minMoves, reachable: dist.size };
  }

  for (let n = 1; n <= 6; n++) {
    it(`n=${n}: shortest solution is exactly ${2 ** n - 1} moves and all 3^${n} states are reachable`, () => {
      const { minMoves, reachable } = explore(n);
      expect(minMoves).toBe(2 ** n - 1);
      expect(minMoves).toBe(optimalMoves(n));
      expect(reachable).toBe(3 ** n);
    });
  }
});

describe("audit: illegal moves are rejected without touching state or the move counter", () => {
  it("a larger disk cannot be placed on a smaller one", () => {
    const before: Session = { pegs: [[3, 2], [1], []], moves: 5 };
    expect(isLegalMove(before.pegs, 0, 1)).toBe(false); // disk 2 onto disk 1
    const after = tryMove(before, 0, 1);
    expect(after).toBe(before);
    expect(after.moves).toBe(5);
    expect(after.pegs).toEqual([[3, 2], [1], []]);
  });

  it("nothing can be moved from an empty peg", () => {
    const before: Session = { pegs: initPegs(4), moves: 0 };
    for (const [from, to] of [[1, 0], [1, 2], [2, 0], [2, 1]] as const) {
      expect(isLegalMove(before.pegs, from, to)).toBe(false);
      expect(tryMove(before, from, to)).toBe(before);
    }
    expect(before.pegs).toEqual([[4, 3, 2, 1], [], []]);
    expect(before.moves).toBe(0);
  });

  it("a same-peg move is rejected, whether the peg is occupied or empty", () => {
    const mid: Pegs = [[3], [2], [1]];
    for (let peg = 0; peg < 3; peg++) {
      expect(isLegalMove(mid, peg, peg)).toBe(false);
    }
    expect(isLegalMove(initPegs(3), 1, 1)).toBe(false);
    const before: Session = { pegs: mid, moves: 2 };
    expect(tryMove(before, 0, 0)).toBe(before);
    expect(before.moves).toBe(2);
    expect(mid).toEqual([[3], [2], [1]]);
  });

  it("in a mid-game position exactly the expected pairs are legal", () => {
    // [[4,3],[2],[1]]: disk 1 may go anywhere, disk 2 only onto disk 3, disk 3 nowhere.
    expect(legalMoves([[4, 3], [2], [1]])).toEqual([
      [1, 0],
      [2, 0],
      [2, 1],
    ]);
  });
});

describe("audit: the win requires the whole tower on peg C, not merely off peg A", () => {
  for (const n of OFFERED_DISK_COUNTS) {
    it(`n=${n}: carrying the tower to peg B never wins; carrying it on to peg C does`, () => {
      let state = initPegs(n);
      for (const [from, to] of referenceSolution(n, 0, 1, GOAL_PEG)) {
        expect(isLegalMove(state, from, to)).toBe(true);
        state = applyMove(state, from, to);
        expect(isWin(state, n)).toBe(false);
      }
      expect(state).toEqual([[], initPegs(n)[0], []]);

      const onward = referenceSolution(n, 1, GOAL_PEG, 0);
      onward.forEach(([from, to], i) => {
        expect(isLegalMove(state, from, to)).toBe(true);
        state = applyMove(state, from, to);
        expect(isWin(state, n)).toBe(i === onward.length - 1);
      });
      expect(state).toEqual([[], [], initPegs(n)[0]]);
    });
  }
});

describe("audit: legal play keeps every peg sorted, so the count-only win check is sound", () => {
  function randomWalk(n: number, steps: number, seed: number) {
    // Small deterministic LCG so the walk is reproducible.
    let s = seed >>> 0;
    const rand = (k: number) => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s % k;
    };
    const allDisks = initPegs(n)[0].slice().sort((a, b) => a - b);
    let pegs = initPegs(n);
    let wins = 0;
    for (let step = 0; step < steps; step++) {
      const legal = legalMoves(pegs);
      expect(legal.length).toBeGreaterThan(0); // the player can never get stuck
      const [from, to] = legal[rand(legal.length)];
      pegs = applyMove(pegs, from, to);
      for (const peg of pegs) {
        for (let i = 1; i < peg.length; i++) expect(peg[i]).toBeLessThan(peg[i - 1]);
      }
      expect(pegs.flat().sort((a, b) => a - b)).toEqual(allDisks);
      if (isWin(pegs, n)) {
        wins++;
        expect(pegs).toEqual([[], [], initPegs(n)[0]]);
      }
    }
    return wins;
  }

  it("n=3, 2000 moves: pegs stay strictly descending and every win is the full ordered tower on C", () => {
    expect(randomWalk(3, 2000, 20260829)).toBeGreaterThan(0);
  });

  it("n=6, 2000 moves: pegs stay strictly descending and disks are never lost or duplicated", () => {
    randomWalk(6, 2000, 7);
  });
});
