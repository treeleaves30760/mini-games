import { describe, it, expect } from "vitest";
import {
  CODE_LEN,
  MAX_TRIES,
  DIGIT_COUNT,
  generateSecret,
  scoreMastermind,
  isWin,
  type Feedback,
} from "~/games/mastermind";
import { makeRng, todaySeed } from "~/utils/rng";

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

// ===========================================================================
// Independent audit — reference feedback, secret/UI consistency, solvability.
//
// Nothing below reuses the game's algorithms except as the thing under test:
// the reference peg counter is written from the textbook definition, the
// candidate space is enumerated from the rules the UI shows the player, and the
// solver only ever sees feedback produced by the game's own scoreMastermind.
// ===========================================================================

/** Every code the UI lets a player submit: CODE_LEN digits from 0..DIGIT_COUNT-1
 *  with no repeats (the numpad greys out used digits and validate() rejects
 *  duplicates). 10·9·8·7 = 5040 codes, in lexicographic order. */
function enumerateCodes(): number[][] {
  const out: number[][] = [];
  const walk = (prefix: number[]) => {
    if (prefix.length === CODE_LEN) {
      out.push(prefix.slice());
      return;
    }
    for (let d = 0; d < DIGIT_COUNT; d++) {
      if (prefix.includes(d)) continue;
      prefix.push(d);
      walk(prefix);
      prefix.pop();
    }
  };
  walk([]);
  return out;
}
const ALL_CODES = enumerateCodes();
const N = ALL_CODES.length;
const CODE_INDEX = new Map(ALL_CODES.map((c, i) => [c.join(""), i]));

/** True when `code` obeys the constraints the UI imposes on a guess. */
function isUiLegal(code: number[]): boolean {
  return (
    code.length === CODE_LEN &&
    code.every((d) => Number.isInteger(d) && d >= 0 && d < DIGIT_COUNT) &&
    new Set(code).size === CODE_LEN
  );
}

/** Reference peg counter written from scratch (shares no code with the game):
 *  exact = agreeing positions; misplaced = Σ_d min(#d in guess, #d in secret) − exact.
 *  This is the textbook Mastermind rule and handles repeated symbols by construction. */
function refFeedback(guess: number[], secret: number[]): Feedback {
  let exact = 0;
  for (let i = 0; i < secret.length; i++) if (guess[i] === secret[i]) exact++;
  let common = 0;
  for (let d = 0; d < DIGIT_COUNT; d++) {
    let inGuess = 0;
    let inSecret = 0;
    for (let i = 0; i < secret.length; i++) {
      if (guess[i] === d) inGuess++;
      if (secret[i] === d) inSecret++;
    }
    common += Math.min(inGuess, inSecret);
  }
  return { exact, misplaced: common - exact };
}

/** Compact integer key for a feedback (0..24), used for bucketing. */
const FEEDBACK_SLOTS = (CODE_LEN + 1) * (CODE_LEN + 1);
const keyOf = (f: Feedback): number => f.exact * (CODE_LEN + 1) + f.misplaced;

/** Seeds a Daily Challenge would actually use (every date of 2026, via the
 *  same todaySeed() formatter the daily page uses) plus plain numeric seeds. */
function auditSeeds(): (string | number)[] {
  const seeds: (string | number)[] = [];
  for (const d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
    seeds.push(todaySeed(d));
  }
  for (let n = 1; n <= 300; n++) seeds.push(n);
  return seeds;
}

describe("audit — scoreMastermind vs an independent reference peg counter", () => {
  const cases: Array<[secret: number[], guess: number[], exact: number, misplaced: number]> = [
    // The classic repeat traps: a symbol must never be credited more often than it
    // appears in the secret, and exact matches are claimed before misplaced ones.
    [[1, 1, 2, 2], [2, 2, 1, 1], 0, 4],
    [[1, 1, 2, 3], [1, 1, 1, 1], 2, 0],
    [[1, 2, 3, 4], [1, 1, 2, 2], 1, 1],
    [[1, 1, 2, 2], [1, 1, 1, 1], 2, 0],
    [[1, 1, 1, 2], [2, 2, 2, 1], 0, 2],
    [[1, 2, 1, 3], [3, 1, 2, 1], 0, 4],
    [[1, 1, 2, 2], [1, 2, 1, 2], 2, 2],
    [[5, 5, 5, 5], [5, 5, 5, 5], 4, 0],
    [[5, 5, 5, 5], [5, 1, 2, 3], 1, 0],
    [[0, 1, 2, 3], [3, 2, 1, 0], 0, 4],
    [[1, 2, 3, 4], [5, 6, 7, 8], 0, 0],
  ];

  it.each(cases)("secret %j vs guess %j → %iA%iB", (secret, guess, exact, misplaced) => {
    expect(refFeedback(guess, secret)).toEqual({ exact, misplaced });
    expect(scoreMastermind(guess, secret)).toEqual({ exact, misplaced });
  });

  it("agrees with the reference on 20,000 seeded random pairs (repeats allowed)", () => {
    const rng = makeRng("mastermind-feedback-audit");
    for (let n = 0; n < 20_000; n++) {
      // Alternate between the full digit set and a 3-symbol alphabet so that
      // repeated digits (in both guess and secret) are exercised heavily.
      const top = n % 2 === 0 ? DIGIT_COUNT - 1 : 2;
      const guess = Array.from({ length: CODE_LEN }, () => rng.int(0, top));
      const secret = Array.from({ length: CODE_LEN }, () => rng.int(0, top));
      const got = scoreMastermind(guess, secret);
      const label = `guess ${guess.join("")} vs secret ${secret.join("")}`;
      expect(got, label).toEqual(refFeedback(guess, secret));
      // Peg feedback is symmetric in (guess, secret) and bounded by the code length.
      expect(scoreMastermind(secret, guess), label).toEqual(got);
      expect(got.exact + got.misplaced, label).toBeLessThanOrEqual(CODE_LEN);
      // 3A1B is impossible: if three positions match, the fourth digit is either
      // exact too or absent from the remaining pool.
      expect(got.exact === CODE_LEN - 1 && got.misplaced === 1, label).toBe(false);
    }
  });

  it("agrees with the reference for every UI-legal secret against a panel of guesses", () => {
    const panel = [
      [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 0, 1], [3, 2, 1, 0], [9, 8, 7, 6],
      [0, 0, 0, 0], [1, 1, 2, 2], [5, 5, 3, 1], // repeat-bearing guesses the UI forbids
    ];
    for (const secret of ALL_CODES) {
      for (const guess of panel) {
        expect(scoreMastermind(guess, secret), `guess ${guess.join("")} vs secret ${secret.join("")}`)
          .toEqual(refFeedback(guess, secret));
      }
    }
  });
});

describe("audit — the secret obeys the same rules the UI imposes on guesses", () => {
  it("enumerates 10·9·8·7 = 5040 UI-legal codes", () => {
    expect(N).toBe(5040);
    expect(ALL_CODES.every(isUiLegal)).toBe(true);
  });

  it("is UI-legal (4 distinct digits 0–9) for every 2026 Daily seed and 300 numeric seeds", () => {
    const seen = new Set<string>();
    for (const seed of auditSeeds()) {
      const secret = generateSecret(makeRng(seed));
      expect(isUiLegal(secret), `seed ${seed}: ${secret.join("")}`).toBe(true);
      // ...and is therefore one of the codes a player can actually enter.
      expect(CODE_INDEX.has(secret.join("")), `seed ${seed}`).toBe(true);
      seen.add(secret.join(""));
    }
    // 665 seeds over 5040 codes: expect ≈ 623 distinct; guard against a degenerate RNG.
    expect(seen.size).toBeGreaterThan(550);
  });

  it("keeps the published seed → secret mapping (Daily Challenge must be stable)", () => {
    // Golden values recorded from the original implementation; changing them would
    // silently change everybody's daily puzzle.
    expect(generateSecret(makeRng("2026-08-29"))).toEqual([5, 1, 6, 9]);
    expect(generateSecret(makeRng("2026-01-01"))).toEqual([1, 3, 8, 2]);
    expect(generateSecret(makeRng("2025-12-31"))).toEqual([8, 6, 4, 0]);
    expect(generateSecret(makeRng(1))).toEqual([7, 8, 3, 2]);
    expect(generateSecret(makeRng(42))).toEqual([0, 7, 3, 5]);
  });

  it("can produce every one of the 5040 codes (no secret is unreachable)", () => {
    const seen = new Uint8Array(N);
    let distinct = 0;
    // Coupon-collector bound: ≈ 5040·ln(5040) ≈ 43k draws expected; cap generously.
    // Seeds start at 1 because makeRng(0) is normalised to makeRng(1).
    for (let seed = 1; distinct < N && seed <= 400_000; seed++) {
      const i = CODE_INDEX.get(generateSecret(makeRng(seed)).join(""))!;
      if (!seen[i]) {
        seen[i] = 1;
        distinct++;
      }
    }
    expect(distinct).toBe(N);
  });
});

// ---------------------------------------------------------------------------
// Solvability — Knuth-style consistent-candidate solver driven only by the
// game's feedback.  The solver keeps the set S of codes consistent with every
// (guess, feedback) pair so far and guesses the member of S whose worst-case
// feedback bucket over S is smallest (minimax restricted to consistent guesses).
// A guess inside S can win immediately, so the count of guesses is exactly the
// number of attempts the player would use.
// ---------------------------------------------------------------------------

/** FB[g * N + s] = feedback key of guessing ALL_CODES[g] against secret
 *  ALL_CODES[s], computed with the game's own scoreMastermind. Built once
 *  (~1 s) and shared by the solver tests. */
let fbTable: Uint8Array | undefined;
function feedbackTable(): Uint8Array {
  if (!fbTable) {
    fbTable = new Uint8Array(N * N);
    for (let g = 0; g < N; g++) {
      const guess = ALL_CODES[g];
      for (let s = 0; s < N; s++) fbTable[g * N + s] = keyOf(scoreMastermind(guess, ALL_CODES[s]));
    }
  }
  return fbTable;
}

/** Choose the next guess from the consistent set S. Decisions depend only on the
 *  feedback history, so they are memoised across games (the decision tree is shared). */
function pickGuess(S: number[], history: string, memo: Map<string, number>): number {
  if (S.length <= 2) return S[0]; // a candidate guess wins now or leaves exactly one
  const cached = memo.get(history);
  if (cached !== undefined) return cached;
  const FB = feedbackTable();
  const buckets = new Int32Array(FEEDBACK_SLOTS);
  let best = S[0];
  let bestWorst = Infinity;
  for (const g of S) {
    buckets.fill(0);
    let worst = 0;
    for (const c of S) {
      const n = ++buckets[FB[g * N + c]];
      if (n > worst) worst = n;
    }
    if (worst < bestWorst) {
      bestWorst = worst;
      best = g;
    }
  }
  memo.set(history, best);
  return best;
}

type Oracle = (guess: number[]) => Feedback;
type Consistency = (guessIdx: number, candidateIdx: number) => number;

/** Play one game. `oracle` is the game's scoring bound to a hidden secret (the
 *  solver never sees the secret); `consistency(g, c)` is the feedback key guess g
 *  would receive if c were the secret, used to filter candidates. Returns the
 *  number of guesses used (MAX_TRIES + 1 when the attempt budget ran out) and the
 *  last code guessed. */
function solve(oracle: Oracle, consistency: Consistency, memo: Map<string, number>) {
  let S = ALL_CODES.map((_, i) => i);
  let history = "";
  let last: number[] = [];
  for (let turn = 1; turn <= MAX_TRIES; turn++) {
    const g = pickGuess(S, history, memo);
    last = ALL_CODES[g];
    const fb = oracle(last);
    if (isWin(fb)) return { guesses: turn, last };
    const key = keyOf(fb);
    history += `${g}:${key};`;
    S = S.filter((c) => consistency(g, c) === key);
    if (S.length === 0) throw new Error(`no candidate is consistent with history ${history}`);
  }
  return { guesses: MAX_TRIES + 1, last };
}

function summarize(label: string, dist: number[]): string {
  const total = dist.reduce((a, b) => a + b, 0);
  const mean = dist.reduce((a, b, i) => a + b * i, 0) / total;
  const worst = dist.length - 1 - [...dist].reverse().findIndex((n) => n > 0);
  const hist = dist.map((n, i) => (n ? `${i}:${n}` : "")).filter(Boolean).join(" ");
  return `${label}: ${total} games, worst ${worst} guesses, mean ${mean.toFixed(3)} (guesses:count ${hist})`;
}

describe("audit — solvability within MAX_TRIES (Knuth-style consistent solver)", () => {
  it(
    "cracks every one of the 5040 possible secrets within MAX_TRIES",
    () => {
      const FB = feedbackTable();
      const memo = new Map<string, number>();
      const dist: number[] = Array(MAX_TRIES + 2).fill(0);
      for (let s = 0; s < N; s++) {
        const secret = ALL_CODES[s];
        const { guesses, last } = solve(
          (guess) => scoreMastermind(guess, secret),
          (g, c) => FB[g * N + c],
          memo
        );
        expect(guesses, `secret ${secret.join("")}`).toBeLessThanOrEqual(MAX_TRIES);
        expect(last, `secret ${secret.join("")}`).toEqual(secret);
        dist[guesses]++;
      }
      console.log(summarize("mastermind solver, all 5040 secrets", dist));
    },
    30_000
  );

  it(
    "wins every 2026 Daily seed and 300 numeric seeds, filtering candidates with the game's own scoring",
    () => {
      const memo = new Map<string, number>();
      const dist: number[] = Array(MAX_TRIES + 2).fill(0);
      for (const seed of auditSeeds()) {
        const secret = generateSecret(makeRng(seed));
        const { guesses, last } = solve(
          (guess) => scoreMastermind(guess, secret),
          (g, c) => keyOf(scoreMastermind(ALL_CODES[g], ALL_CODES[c])),
          memo
        );
        expect(guesses, `seed ${seed} (secret ${secret.join("")})`).toBeLessThanOrEqual(MAX_TRIES);
        expect(last, `seed ${seed}`).toEqual(secret);
        dist[guesses]++;
      }
      console.log(summarize("mastermind solver, 2026 daily + 300 numeric seeds", dist));
    },
    30_000
  );
});
