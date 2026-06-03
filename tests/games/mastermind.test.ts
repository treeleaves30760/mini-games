import { describe, it, expect } from "vitest";
import {
  CODE_LEN,
  MAX_TRIES,
  generateSecret,
  scoreMastermind,
  isWin,
} from "~/games/mastermind";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// scoreMastermind
// ---------------------------------------------------------------------------

describe("scoreMastermind — exact matches", () => {
  it("all exact → exact=CODE_LEN, misplaced=0", () => {
    const result = scoreMastermind([1, 2, 3, 4], [1, 2, 3, 4]);
    expect(result).toEqual({ exact: 4, misplaced: 0 });
  });

  it("first digit correct only → exact=1, misplaced=0 (others absent)", () => {
    // secret [5,6,7,8], guess [5,0,0,0] — only pos0 matches, 6/7/8 not in guess
    const result = scoreMastermind([5, 0, 0, 0], [5, 6, 7, 8]);
    expect(result).toEqual({ exact: 1, misplaced: 0 });
  });
});

describe("scoreMastermind — full permutation (all misplaced)", () => {
  it("reverse of [1,2,3,4] → 0 exact, 4 misplaced", () => {
    // [4,3,2,1] vs secret [1,2,3,4]: no position matches, every digit present
    const result = scoreMastermind([4, 3, 2, 1], [1, 2, 3, 4]);
    expect(result).toEqual({ exact: 0, misplaced: 4 });
  });

  it("cyclic shift [2,3,4,1] vs [1,2,3,4] → 0 exact, 4 misplaced", () => {
    const result = scoreMastermind([2, 3, 4, 1], [1, 2, 3, 4]);
    expect(result).toEqual({ exact: 0, misplaced: 4 });
  });
});

describe("scoreMastermind — totally wrong guess", () => {
  it("[5,6,7,8] vs [1,2,3,4] → 0 exact, 0 misplaced", () => {
    const result = scoreMastermind([5, 6, 7, 8], [1, 2, 3, 4]);
    expect(result).toEqual({ exact: 0, misplaced: 0 });
  });
});

describe("scoreMastermind — classic duplicate cases", () => {
  it("secret [1,1,2,3] vs guess [1,2,1,1]: exact=1, misplaced=2", () => {
    // Manual trace:
    //   Pass 1 exact: pos0 1==1 ✓ (only match) → exact=1
    //   secretPool after pass1: [null, 1, 2, 3]
    //   guessPool  after pass1: [null, 2, 1, 1]
    //   Pass 2 misplaced:
    //     pos1 guess=2 → secretPool[2]=2 consumed → misplaced=1
    //     pos2 guess=1 → secretPool[1]=1 consumed → misplaced=2
    //     pos3 guess=1 → no 1 left in secretPool → nothing
    const result = scoreMastermind([1, 2, 1, 1], [1, 1, 2, 3]);
    expect(result).toEqual({ exact: 1, misplaced: 2 });
  });

  it("secret [1,1,2,3] vs guess [1,1,1,1]: misplaced does not over-count", () => {
    // Pass 1: pos0 1==1 ✓, pos1 1==1 ✓ → exact=2
    // secretPool: [null,null,2,3], guessPool: [null,null,1,1]
    // Pass 2: pos2 guess=1 → no 1 in secretPool; pos3 guess=1 → no 1 in secretPool
    // Result: exact=2, misplaced=0  (only 2 ones in secret, both claimed exactly)
    const result = scoreMastermind([1, 1, 1, 1], [1, 1, 2, 3]);
    expect(result).toEqual({ exact: 2, misplaced: 0 });
  });

  it("guess has more occurrences than secret: over-count never happens", () => {
    // secret [1,2,3,4], guess [1,1,1,1]:
    //   Pass 1: pos0 1==1 ✓ → exact=1; secretPool=[null,2,3,4], guessPool=[null,1,1,1]
    //   Pass 2: pos1 1 → no 1 in pool; pos2 1 → no 1; pos3 1 → no 1
    //   Result: exact=1, misplaced=0
    const result = scoreMastermind([1, 1, 1, 1], [1, 2, 3, 4]);
    expect(result).toEqual({ exact: 1, misplaced: 0 });
  });

  it("secret duplicates vs distinct guess: exact and misplaced bounded by secret count", () => {
    // secret [3,3,3,3] vs guess [3,1,2,4]:
    //   Pass 1: pos0 3==3 ✓ → exact=1; secretPool=[null,3,3,3], guessPool=[null,1,2,4]
    //   Pass 2: pos1 guess=1 → not 1 in pool; pos2 guess=2 → not; pos3 guess=4 → not
    //   Result: exact=1, misplaced=0
    const result = scoreMastermind([3, 1, 2, 4], [3, 3, 3, 3]);
    expect(result).toEqual({ exact: 1, misplaced: 0 });
  });
});

describe("scoreMastermind — exact+misplaced never exceeds code length", () => {
  it("holds for all-correct", () => {
    const r = scoreMastermind([0, 1, 2, 3], [0, 1, 2, 3]);
    expect(r.exact + r.misplaced).toBeLessThanOrEqual(CODE_LEN);
  });

  it("holds for full permutation", () => {
    const r = scoreMastermind([3, 2, 1, 0], [0, 1, 2, 3]);
    expect(r.exact + r.misplaced).toBeLessThanOrEqual(CODE_LEN);
    expect(r.exact + r.misplaced).toBe(CODE_LEN); // exactly 4 for full permutation
  });

  it("holds for mixed exact+misplaced", () => {
    // secret [0,1,2,3], guess [0,2,3,4]: pos0 exact, pos1(2) misplaced, pos2(3) misplaced, pos3(4) absent
    const r = scoreMastermind([0, 2, 3, 4], [0, 1, 2, 3]);
    expect(r.exact + r.misplaced).toBeLessThanOrEqual(CODE_LEN);
    expect(r).toEqual({ exact: 1, misplaced: 2 });
  });

  it("brute-force: sum never exceeds CODE_LEN across many pairs", () => {
    // Spot-check 50 seeded random pairs
    for (let s = 0; s < 50; s++) {
      const rng = makeRng(s);
      const secret = [0,1,2,3,4,5,6,7,8,9];
      rng.shuffle(secret);
      const sec = secret.slice(0, CODE_LEN);
      const guess = secret.slice(CODE_LEN, CODE_LEN * 2);
      const r = scoreMastermind(guess, sec);
      expect(r.exact + r.misplaced, `seed=${s}`).toBeLessThanOrEqual(CODE_LEN);
    }
  });
});

// ---------------------------------------------------------------------------
// isWin
// ---------------------------------------------------------------------------

describe("isWin", () => {
  it("true only when exact equals code length", () => {
    expect(isWin({ exact: 4, misplaced: 0 })).toBe(true);
    expect(isWin({ exact: 3, misplaced: 1 })).toBe(false);
    expect(isWin({ exact: 0, misplaced: 4 })).toBe(false);
    expect(isWin({ exact: 0, misplaced: 0 })).toBe(false);
  });

  it("true iff scoreMastermind of identical arrays", () => {
    const code = [2, 5, 7, 9];
    expect(isWin(scoreMastermind(code, code))).toBe(true);
  });

  it("false for a near-win (3 exact, 0 misplaced)", () => {
    // [1,2,3,9] vs [1,2,3,4] — three exact, 9≠4 and 9 not in secret
    expect(isWin(scoreMastermind([1, 2, 3, 9], [1, 2, 3, 4]))).toBe(false);
  });

  it("respects custom codeLen parameter", () => {
    expect(isWin({ exact: 6, misplaced: 0 }, 6)).toBe(true);
    expect(isWin({ exact: 4, misplaced: 0 }, 6)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateSecret — seeded determinism and range invariants
// ---------------------------------------------------------------------------

describe("generateSecret", () => {
  it("is deterministic for a given seed", () => {
    const a = generateSecret(makeRng("test-seed"));
    const b = generateSecret(makeRng("test-seed"));
    expect(a).toEqual(b);
  });

  it("produces a different result for a different seed", () => {
    const a = generateSecret(makeRng("seed-alpha"));
    const b = generateSecret(makeRng("seed-beta"));
    // Very unlikely to collide across all 4 positions with different seeds
    expect(a).not.toEqual(b);
  });

  it("returns exactly CODE_LEN digits", () => {
    for (let i = 0; i < 20; i++) {
      const code = generateSecret(makeRng(`s${i}`));
      expect(code).toHaveLength(CODE_LEN);
    }
  });

  it("all digits are in [0, 9]", () => {
    for (let i = 0; i < 20; i++) {
      const code = generateSecret(makeRng(`s${i}`));
      for (const d of code) {
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(9);
      }
    }
  });

  it("no duplicate digits in the generated code", () => {
    for (let i = 0; i < 30; i++) {
      const code = generateSecret(makeRng(`s${i}`));
      expect(new Set(code).size).toBe(CODE_LEN);
    }
  });

  it("constants are as expected by the game rules", () => {
    expect(CODE_LEN).toBe(4);
    expect(MAX_TRIES).toBe(8);
  });
});
