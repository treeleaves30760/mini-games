import { describe, it, expect } from "vitest";
import {
  rat,
  req,
  radd,
  rsub,
  rmul,
  rdiv,
  applyOp,
  canSolve,
  findSolution,
  prettySolution,
  genPuzzle,
  TARGET_POOL,
  TARGET_MODES,
  FALLBACKS,
} from "~/games/twenty-four";
import type { Rat } from "~/games/twenty-four";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Independent brute-force oracle
// ---------------------------------------------------------------------------
// Deliberately does NOT reuse the module's Rat helpers: its own exact fractions,
// its own search (pairwise card combination, exactly the way the UI consumes
// cards), and its own expression evaluator. It is the ground truth the game
// logic is checked against further down.

interface Frac {
  p: number; // numerator (carries the sign)
  q: number; // denominator (> 0), lowest terms
}

function fracGcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

function frac(p: number, q: number): Frac | null {
  if (q === 0) return null;
  if (q < 0) {
    p = -p;
    q = -q;
  }
  const g = fracGcd(p, q) || 1;
  return { p: p / g, q: q / g };
}

function fracOp(op: string, a: Frac, b: Frac): Frac | null {
  if (op === "+") return frac(a.p * b.q + b.p * a.q, a.q * b.q);
  if (op === "-") return frac(a.p * b.q - b.p * a.q, a.q * b.q);
  if (op === "*") return frac(a.p * b.p, a.q * b.q);
  if (op === "/") return b.p === 0 ? null : frac(a.p * b.q, a.q * b.p);
  throw new Error(`unknown op ${op}`);
}

function fracIsInt(f: Frac | null, n: number): boolean {
  return f !== null && f.q === 1 && f.p === n;
}

/** One UI move: card i is the left operand, card j the right operand. */
interface Step {
  i: number;
  j: number;
  op: string;
}

const UI_OPS = ["+", "-", "*", "/"];

/** Applies one UI move to a card list with the component's bookkeeping:
    remove both operands, append the result. */
function oracleMove(cards: Frac[], { i, j, op }: Step): Frac[] | null {
  const r = fracOp(op, cards[i], cards[j]);
  if (!r) return null;
  const rest = cards.filter((_, k) => k !== i && k !== j);
  rest.push(r);
  return rest;
}

/**
 * Depth-first search over every sequence of pairwise combinations. Card
 * bookkeeping mirrors TwentyFourGame.vue's combineCards(), so the returned
 * steps can be replayed on the game's checker verbatim.
 */
function oracleSolve(nums: number[], target: number): Step[] | null {
  const search = (cards: Frac[], steps: Step[]): Step[] | null => {
    if (cards.length === 1) return fracIsInt(cards[0], target) ? steps : null;
    for (let i = 0; i < cards.length; i++) {
      for (let j = 0; j < cards.length; j++) {
        if (i === j) continue;
        for (const op of UI_OPS) {
          const step = { i, j, op };
          const rest = oracleMove(cards, step);
          if (!rest) continue;
          const found = search(rest, [...steps, step]);
          if (found) return found;
        }
      }
    }
    return null;
  };
  return search(
    nums.map((n) => ({ p: n, q: 1 })),
    []
  );
}

/** Every complete 3-move sequence over 4 cards (4·3·4 × 3·2·4 × 2·1·4 = 9216),
    including ones that hit a division by zero part-way. */
function* allStepSequences(): Generator<Step[]> {
  const rec = function* (n: number, prefix: Step[]): Generator<Step[]> {
    if (n === 1) {
      yield prefix;
      return;
    }
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        for (const op of UI_OPS) yield* rec(n - 1, [...prefix, { i, j, op }]);
      }
  };
  yield* rec(4, []);
}

/** Oracle verdict for a full step sequence: does it end on exactly `target`? */
function oracleAccepts(nums: number[], steps: Step[], target: number): boolean {
  let cards: Frac[] | null = nums.map((n) => ({ p: n, q: 1 }));
  for (const step of steps) {
    cards = oracleMove(cards, step);
    if (!cards) return false;
  }
  return cards.length === 1 && fracIsInt(cards[0], target);
}

/**
 * Replays a step sequence through the game's own arithmetic (rat/applyOp/req)
 * with the exact card semantics of TwentyFourGame.vue's combineCards() and
 * selectCard(): tapping the selected card again deselects (no move), a
 * division by zero is refused, both operands are removed, the result is
 * appended, and the puzzle counts as won only when a single card equal to the
 * target remains.
 */
function gameCheckerAccepts(nums: number[], steps: Step[], target: number): boolean {
  let cards = nums.map((n) => rat(n) as Rat);
  for (const { i, j, op } of steps) {
    if (i === j || cards[i] === undefined || cards[j] === undefined) return false;
    const r = applyOp(op, cards[i], cards[j]);
    if (r === null) return false;
    cards = cards.filter((_, k) => k !== i && k !== j);
    cards.push(r);
  }
  return cards.length === 1 && req(cards[0], rat(target));
}

/**
 * Minimal recursive-descent evaluator for the solver's compact expression
 * strings ("((1+2)*3)+4", "8/(3-8/3)"). Returns the exact value plus every
 * numeric literal consumed, so a test can check each card is used exactly once.
 */
function evalExpr(src: string): { value: Frac | null; literals: number[] } {
  let pos = 0;
  const literals: number[] = [];
  const peek = () => src[pos];
  const parsePrimary = (): Frac | null => {
    if (peek() === "(") {
      pos++;
      const v = parseAdd();
      if (peek() !== ")") throw new Error(`expected ')' at ${pos} in ${src}`);
      pos++;
      return v;
    }
    const m = /^\d+/.exec(src.slice(pos));
    if (!m) throw new Error(`unexpected '${peek()}' at ${pos} in ${src}`);
    pos += m[0].length;
    literals.push(Number(m[0]));
    return { p: Number(m[0]), q: 1 };
  };
  const parseMul = (): Frac | null => {
    let v = parsePrimary();
    while (peek() === "*" || peek() === "/") {
      const op = src[pos++];
      const r = parsePrimary();
      v = v && r ? fracOp(op, v, r) : null;
    }
    return v;
  };
  const parseAdd = (): Frac | null => {
    let v = parseMul();
    while (peek() === "+" || peek() === "-") {
      const op = src[pos++];
      const r = parseMul();
      v = v && r ? fracOp(op, v, r) : null;
    }
    return v;
  };
  const value = parseAdd();
  if (pos !== src.length) throw new Error(`trailing input at ${pos} in ${src}`);
  return { value, literals };
}

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

/** Asserts `expr` uses exactly the cards in `nums` and evaluates to `target`. */
function expectValidSolution(expr: string, nums: number[], target: number) {
  const { value, literals } = evalExpr(expr);
  expect(sorted(literals), `${expr} must use ${nums} exactly once`).toEqual(sorted(nums));
  expect(fracIsInt(value, target), `${expr} must equal ${target}`).toBe(true);
}

/** Every multiset {a<=b<=c<=d} of four cards drawn from 1..9 (495 of them). */
function allMultisets(): number[][] {
  const out: number[][] = [];
  for (let a = 1; a <= 9; a++)
    for (let b = a; b <= 9; b++)
      for (let c = b; c <= 9; c++)
        for (let d = c; d <= 9; d++) out.push([a, b, c, d]);
  return out;
}

/** Number of distinct orderings of a 4-card multiset (its weight among the
    9^4 = 6561 equally likely random draws). */
function orderings(ms: number[]): number {
  const counts = new Map<number, number>();
  for (const n of ms) counts.set(n, (counts.get(n) ?? 0) + 1);
  let denom = 1;
  for (const c of counts.values()) denom *= [1, 1, 2, 6, 24][c];
  return 24 / denom;
}

const ALL_MODES = TARGET_MODES.map((m) => m.v);

/** The Daily Challenge seeds the game with a "YYYY-MM-DD" string. */
function dailySeedsOfYear(year: number): string[] {
  const out: string[] = [];
  for (let m = 1; m <= 12; m++) {
    const days = new Date(year, m, 0).getDate();
    for (let d = 1; d <= days; d++) {
      out.push(`${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rational arithmetic
// ---------------------------------------------------------------------------

describe("rat — canonical rational construction", () => {
  it("normalises to lowest terms", () => {
    expect(rat(4, 6)).toEqual({ n: 2, d: 3 });
    expect(rat(9, 3)).toEqual({ n: 3, d: 1 });
  });

  it("sign lives in numerator, denominator is always positive", () => {
    expect(rat(3, -4)).toEqual({ n: -3, d: 4 });
    expect(rat(-6, -2)).toEqual({ n: 3, d: 1 });
  });

  it("returns null for division by zero", () => {
    expect(rat(5, 0)).toBeNull();
    expect(rat(0, 0)).toBeNull();
  });

  it("zero is always {n:0,d:1}", () => {
    expect(rat(0)).toEqual({ n: 0, d: 1 });
    expect(rat(0, 7)).toEqual({ n: 0, d: 1 });
  });
});

describe("rational arithmetic operations", () => {
  const half = rat(1, 2)!;
  const third = rat(1, 3)!;
  const two = rat(2)!;

  it("radd: 1/2 + 1/3 = 5/6", () => {
    expect(radd(half, third)).toEqual({ n: 5, d: 6 });
  });

  it("rsub: 1/2 - 1/3 = 1/6", () => {
    expect(rsub(half, third)).toEqual({ n: 1, d: 6 });
  });

  it("rmul: 1/2 * 2 = 1", () => {
    expect(rmul(half, two)).toEqual({ n: 1, d: 1 });
  });

  it("rdiv: 1/2 / (1/3) = 3/2", () => {
    expect(rdiv(half, third)).toEqual({ n: 3, d: 2 });
  });

  it("rdiv by zero returns null", () => {
    expect(rdiv(two, rat(0)!)).toBeNull();
  });

  it("req compares structurally after normalisation", () => {
    expect(req(rat(2, 4), rat(1, 2))).toBe(true);
    expect(req(rat(2, 4), rat(1, 3))).toBe(false);
    expect(req(null, rat(1))).toBe(false);
    expect(req(rat(1), null)).toBe(false);
  });
});

describe("applyOp", () => {
  const three = rat(3)!;
  const six = rat(6)!;

  it("+ - * / dispatch correctly", () => {
    expect(applyOp("+", three, six)).toEqual(rat(9));
    expect(applyOp("-", six, three)).toEqual(rat(3));
    expect(applyOp("*", three, six)).toEqual(rat(18));
    expect(applyOp("/", six, three)).toEqual(rat(2));
  });

  it("returns null for unknown op and /0", () => {
    expect(applyOp("^", three, six)).toBeNull();
    expect(applyOp("/", three, rat(0)!)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Solver — canSolve / findSolution
// ---------------------------------------------------------------------------

describe("canSolve — classic solvable sets", () => {
  it("[1,2,3,4] → true  (1*2*3*4=24)", () => {
    expect(canSolve([1, 2, 3, 4], 24)).toBe(true);
  });

  it("[3,3,8,8] → true  (8/(3-8/3)=24)", () => {
    expect(canSolve([3, 3, 8, 8], 24)).toBe(true);
  });

  it("[8,3,8,3] → true  (same multiset, different order)", () => {
    expect(canSolve([8, 3, 8, 3], 24)).toBe(true);
  });

  it("[6,6,6,6] → assert via solver (may or may not solve 24)", () => {
    // 6+6+6+6=24 → solvable
    expect(canSolve([6, 6, 6, 6], 24)).toBe(true);
  });

  it("[4,4,4,4] → (4+4+4+4=16≠24, 4*4+4+4=24) → true", () => {
    // 4*4+4+4 = 24
    expect(canSolve([4, 4, 4, 4], 24)).toBe(true);
  });
});

describe("canSolve — unsolvable sets", () => {
  it("[1,1,1,1] cannot make 24", () => {
    // max achievable with 1s: 1+1+1+1=4, 1*1*1*1=1 — never 24
    expect(canSolve([1, 1, 1, 1], 24)).toBe(false);
  });

  it("[0,0,0,0] cannot make 24", () => {
    // any combination of 0s stays 0
    expect(canSolve([0, 0, 0, 0], 24)).toBe(false);
  });

});

describe("canSolve — alternative targets", () => {
  it("[9,9,9,9] → 36  ((9+9)+9)+9=36", () => {
    expect(canSolve([9, 9, 9, 9], 36)).toBe(true);
  });

  it("[6,8,1,1] → 48  6*8*1*1=48", () => {
    expect(canSolve([6, 8, 1, 1], 48)).toBe(true);
  });

  it("[5,6,2,1] → 60  5*6*2*1=60", () => {
    expect(canSolve([5, 6, 2, 1], 60)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Solver — division/parentheses required
// ---------------------------------------------------------------------------

describe("findSolution — division and parentheses", () => {
  it("[3,3,8,8]: the returned expression evaluates to 24 via exact arithmetic", () => {
    // Previously this only re-ran canSolve (same code path as findSolution);
    // now the expression is evaluated by the independent evaluator, which also
    // verifies each card is used exactly once.
    const expr = findSolution([3, 3, 8, 8], 24);
    expect(expr).not.toBeNull();
    expectValidSolution(expr!, [3, 3, 8, 8], 24);
  });

  it("[1,1,1,1] returns null", () => {
    expect(findSolution([1, 1, 1, 1], 24)).toBeNull();
  });

  it("returned expression for [1,2,3,4] is a non-empty string", () => {
    const expr = findSolution([1, 2, 3, 4], 24);
    expect(typeof expr).toBe("string");
    expect(expr!.length).toBeGreaterThan(0);
  });

  it("[8,3,8,3] requires division — solution contains '/'", () => {
    // 8/(3-8/3) is the only family of solutions for this multiset; all require /
    const expr = findSolution([8, 3, 8, 3], 24);
    expect(expr).not.toBeNull();
    expect(expr).toContain("/");
  });
});

// ---------------------------------------------------------------------------
// prettySolution
// ---------------------------------------------------------------------------

describe("prettySolution", () => {
  it("replaces * with ×, / with ÷, - with −, + stays +", () => {
    const result = prettySolution("((3*8)-8)/3");
    expect(result).toContain("×");
    expect(result).toContain("÷");
    expect(result).not.toContain("*");
    expect(result).not.toContain("/");
  });

  it("returns empty string for null/undefined/empty", () => {
    expect(prettySolution(null)).toBe("");
    expect(prettySolution(undefined)).toBe("");
    expect(prettySolution("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// FALLBACKS are themselves solvable
// ---------------------------------------------------------------------------

describe("FALLBACKS", () => {
  it("every fallback entry is solvable for its own target", () => {
    for (const [targetStr, fb] of Object.entries(FALLBACKS)) {
      const target = Number(targetStr);
      expect(
        canSolve(fb.nums, target),
        `FALLBACK for ${target} with nums ${fb.nums} should be solvable`
      ).toBe(true);
    }
  });

  it("covers every target in TARGET_POOL", () => {
    for (const target of TARGET_POOL) expect(FALLBACKS[target]).toBeDefined();
  });

  it("every fallback's shipped solution string uses its cards exactly once and equals its target", () => {
    for (const [targetStr, fb] of Object.entries(FALLBACKS)) {
      expectValidSolution(fb.solution, fb.nums, Number(targetStr));
    }
  });
});

// ---------------------------------------------------------------------------
// genPuzzle — seeded generator always yields solvable puzzles
// ---------------------------------------------------------------------------

describe("genPuzzle — seeded reproducibility and solvability", () => {
  const seeds = [0, 1, 42, 999, "2026-06-03", "abc", "test-seed-x"];

  it("every seeded puzzle is solvable for its own target", () => {
    for (const seed of seeds) {
      const rng = makeRng(seed);
      const puzzle = genPuzzle(rng);
      expect(
        canSolve(puzzle.nums, puzzle.target),
        `seed=${seed} nums=${puzzle.nums} target=${puzzle.target} should be solvable`
      ).toBe(true);
    }
  });

  it("is deterministic — same seed yields same puzzle", () => {
    for (const seed of [1, 42, "hello"]) {
      const p1 = genPuzzle(makeRng(seed));
      const p2 = genPuzzle(makeRng(seed));
      expect(p1.nums).toEqual(p2.nums);
      expect(p1.target).toBe(p2.target);
      expect(p1.solution).toBe(p2.solution);
    }
  });

  it("target is always from TARGET_POOL when mode='mix'", () => {
    for (const seed of seeds) {
      const rng = makeRng(seed);
      const puzzle = genPuzzle(rng, "mix");
      expect(TARGET_POOL).toContain(puzzle.target);
    }
  });

  it("mode='24' always yields target 24", () => {
    for (const seed of seeds) {
      const puzzle = genPuzzle(makeRng(seed), "24");
      expect(puzzle.target).toBe(24);
    }
  });

  it("mode='36' always yields target 36", () => {
    for (const seed of seeds) {
      const puzzle = genPuzzle(makeRng(seed), "36");
      expect(puzzle.target).toBe(36);
    }
  });

  it("mode='48' always yields target 48", () => {
    for (const seed of seeds) {
      const puzzle = genPuzzle(makeRng(seed), "48");
      expect(puzzle.target).toBe(48);
    }
  });

  it("mode='60' always yields target 60", () => {
    for (const seed of seeds) {
      const puzzle = genPuzzle(makeRng(seed), "60");
      expect(puzzle.target).toBe(60);
    }
  });

  it("mode=unknown string falls back to target 24 (chooseTarget else branch)", () => {
    // chooseTarget: Number("99") = 99, not in TARGET_POOL → returns 24.
    const puzzle = genPuzzle(makeRng("fallback-mode-test"), "99");
    expect(puzzle.target).toBe(24);
    expect(canSolve(puzzle.nums, 24)).toBe(true);
  });

  it("all four nums are integers in [1,9]", () => {
    for (const seed of seeds) {
      const puzzle = genPuzzle(makeRng(seed));
      expect(puzzle.nums).toHaveLength(4);
      for (const n of puzzle.nums) {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(9);
      }
    }
  });

  it("solution string is non-empty for every generated puzzle", () => {
    for (const seed of seeds) {
      const puzzle = genPuzzle(makeRng(seed));
      expect(typeof puzzle.solution).toBe("string");
      expect(puzzle.solution.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// genPuzzle — fallback path: all 600 random draws unsolvable
// ---------------------------------------------------------------------------

describe("genPuzzle — fallback when 600 random draws all fail", () => {
  it("returns the known fallback puzzle when every draw yields [1,1,1,1] (unsolvable for target 24)", () => {
    // Stub RNG: int() always returns 1 → nums=[1,1,1,1] → never solvable for 24.
    // After 600 failed attempts genPuzzle falls through to FALLBACKS[24].
    const stubRng = {
      next: () => 0,
      int: (_min: number, _max: number) => 1,
      float: (_min: number, _max: number) => _min,
      bool: (_p?: number) => false,
      pick: <T>(arr: T[]) => arr[0],
      shuffle: <T>(arr: T[]) => arr,
    };
    // mode='24' fixes target=24 without consuming a pick() call,
    // and int(1,9)=1 always → nums=[1,1,1,1] → no combination reaches 24.
    const puzzle = genPuzzle(stubRng, "24");
    // Must have fallen through to FALLBACKS[24]
    expect(puzzle.target).toBe(24);
    expect(puzzle.nums).toEqual([3, 3, 8, 8]);
    expect(puzzle.solution).toBe("8/(3-8/3)");
    // The returned cards are a copy — mutating a puzzle never corrupts the
    // shared FALLBACKS constant.
    expect(puzzle.nums).not.toBe(FALLBACKS[24].nums);
  });

  it("returns fallback for target 36 when int always returns 1", () => {
    const stubRng = {
      next: () => 0,
      int: (_min: number, _max: number) => 1,
      float: (_min: number, _max: number) => _min,
      bool: (_p?: number) => false,
      pick: <T>(arr: T[]) => arr[0],
      shuffle: <T>(arr: T[]) => arr,
    };
    // [1,1,1,1] cannot reach 36 either
    const puzzle = genPuzzle(stubRng, "36");
    expect(puzzle.target).toBe(36);
    expect(puzzle.nums).toEqual([9, 9, 9, 9]);
    expect(puzzle.solution).toBe("((9+9)+9)+9");
  });
});

// ---------------------------------------------------------------------------
// Oracle self-checks — make sure the ground truth itself is trustworthy
// ---------------------------------------------------------------------------

describe("independent oracle — sanity", () => {
  it("evaluates compact expressions exactly, tracking the literals used", () => {
    expect(evalExpr("8/(3-8/3)")).toEqual({ value: { p: 24, q: 1 }, literals: [8, 3, 8, 3] });
    expect(evalExpr("((1+2)*3)+4")).toEqual({ value: { p: 13, q: 1 }, literals: [1, 2, 3, 4] });
    expect(evalExpr("1/(2-2)").value).toBeNull();
    expect(() => evalExpr("(1+2")).toThrow();
    expect(() => evalExpr("1+x")).toThrow();
    expect(() => evalExpr("1+2)")).toThrow();
  });

  it("solves the classics and refuses the impossible", () => {
    expect(oracleSolve([1, 2, 3, 4], 24)).not.toBeNull();
    expect(oracleSolve([3, 3, 8, 8], 24)).not.toBeNull();
    expect(oracleSolve([1, 1, 1, 1], 24)).toBeNull();
    expect(oracleSolve([9, 9, 9, 9], 36)).not.toBeNull();
    // Search must be exhaustive: a solvable set never gets a null verdict.
    expect(oracleSolve([1, 5, 5, 5], 24)).not.toBeNull(); // only via 5*(5-1/5)
  });

  it("enumerates exactly 9216 complete move sequences over 4 cards", () => {
    let count = 0;
    for (const _ of allStepSequences()) count++;
    expect(count).toBe(4 * 3 * 4 * (3 * 2 * 4) * (2 * 1 * 4));
  });

  it("weights multisets by their number of orderings (sums to 9^4)", () => {
    let total = 0;
    for (const ms of allMultisets()) total += orderings(ms);
    expect(total).toBe(6561);
    expect(orderings([1, 1, 1, 1])).toBe(1);
    expect(orderings([1, 1, 2, 2])).toBe(6);
    expect(orderings([1, 2, 3, 4])).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// Solver vs oracle — exhaustive over every 1..9 multiset and every target
// ---------------------------------------------------------------------------

describe("solver vs independent oracle — exhaustive", () => {
  const multisets = allMultisets();
  // Oracle verdict per "target:a,b,c,d", computed once and shared by the tests below.
  const verdicts = new Map<string, boolean>();
  const oracleSolvable = (ms: number[], target: number): boolean => {
    const key = `${target}:${ms}`;
    let v = verdicts.get(key);
    if (v === undefined) {
      v = oracleSolve(ms, target) !== null;
      verdicts.set(key, v);
    }
    return v;
  };

  it("enumerates all 495 multisets of four cards from 1..9", () => {
    expect(multisets).toHaveLength(495);
  });

  it("findSolution/canSolve agree with the oracle on every multiset × target (1980 cases), and every solution is valid", () => {
    // One solver search per case: findSolution and canSolve share solveFor,
    // so the null/non-null verdict is compared against the oracle and the
    // expression itself is checked by the independent evaluator.
    const disagreements: string[] = [];
    let solvable = 0;
    for (const target of TARGET_POOL) {
      for (const ms of multisets) {
        const expr = findSolution(ms, target);
        if ((expr !== null) !== oracleSolvable(ms, target)) disagreements.push(`${ms} → ${target}`);
        if (expr !== null) {
          solvable++;
          expectValidSolution(expr, ms, target);
        }
      }
    }
    expect(disagreements).toEqual([]);
    // Measured: 404 + 375 + 341 + 276 solvable multisets for 24/36/48/60.
    expect(solvable).toBe(404 + 375 + 341 + 276);
    // canSolve is the boolean view of the same search.
    for (const ms of multisets.filter((_, i) => i % 25 === 0)) {
      expect(canSolve(ms, 24)).toBe(oracleSolvable(ms, 24));
    }
  });

  it("every target is reachable by >= 60% of random draws, so 600 draws never fall back in practice", () => {
    // Measured: 24 → 88.5%, 36 → 82.1%, 48 → 76.1%, 60 → 64.0% of the 6561
    // equally likely ordered draws. Even at 64%, all 600 draws failing has
    // probability 0.36^600 ≈ 1e-266, so the FALLBACKS path is a pure safety net.
    for (const target of TARGET_POOL) {
      let solvableDraws = 0;
      for (const ms of multisets) {
        if (oracleSolvable(ms, target)) solvableDraws += orderings(ms);
      }
      expect(solvableDraws / 6561, `target ${target}`).toBeGreaterThanOrEqual(0.6);
    }
  });
});

// ---------------------------------------------------------------------------
// Generator sweep — hundreds of seeds × every mode, plus every daily seed
// ---------------------------------------------------------------------------

describe("genPuzzle — sweep over seeds × modes (independent oracle)", () => {
  const numericSeeds = Array.from({ length: 300 }, (_, i) => i);
  const stringSeeds = ["abc", "hello", "test-seed-x", "", "0", "-1", "2026-06-03"];
  const dailySeeds = dailySeedsOfYear(2026);
  // 307 seeds × all 5 modes, plus every daily seed of 2026 in the mode the
  // Daily Challenge actually uses ("mix"): 1900 puzzles.
  const cases: [string | number, string][] = [
    ...[...numericSeeds, ...stringSeeds].flatMap((seed) => ALL_MODES.map((mode): [string | number, string] => [seed, mode])),
    ...dailySeeds.map((seed): [string | number, string] => [seed, "mix"]),
  ];

  it("every puzzle (seeds × modes) is solvable, its solution is valid, and the UI checker accepts the oracle's moves", () => {
    let count = 0;
    for (const [seed, mode] of cases) {
      {
        const p = genPuzzle(makeRng(seed), mode);
        const tag = `seed=${JSON.stringify(seed)} mode=${mode} nums=${p.nums} target=${p.target}`;
        count++;

        // Well-formed: four integer cards in 1..9, target from the pool and
        // consistent with a fixed mode. Cards are all < 24, so no set is
        // degenerate (no card already equals the target).
        expect(p.nums, tag).toHaveLength(4);
        for (const n of p.nums) {
          expect(Number.isInteger(n) && n >= 1 && n <= 9, tag).toBe(true);
        }
        expect(TARGET_POOL, tag).toContain(p.target);
        if (mode !== "mix") expect(p.target, tag).toBe(Number(mode));

        // (a) Independently solvable with the moves the UI offers.
        const steps = oracleSolve(p.nums, p.target);
        expect(steps, `${tag}: oracle finds no solution`).not.toBeNull();

        // (b) The game's checker accepts the oracle's move sequence.
        expect(gameCheckerAccepts(p.nums, steps!, p.target), `${tag}: checker rejects ${JSON.stringify(steps)}`).toBe(true);

        // The shipped hint expression uses every card once and is exact.
        expectValidSolution(p.solution, p.nums, p.target);
      }
    }
    expect(count).toBe(cases.length);
    expect(count).toBe(1900);
  });

  it("Daily Challenge seeds (YYYY-MM-DD, mode 'mix') are deterministic across calls", () => {
    for (const seed of dailySeeds.slice(0, 60)) {
      const a = genPuzzle(makeRng(seed), "mix");
      const b = genPuzzle(makeRng(seed), "mix");
      expect(a).toEqual(b);
    }
  });

  it("the 'mix' mode actually spreads over all four targets", () => {
    const seen = new Set<number>();
    for (const seed of numericSeeds.slice(0, 50)) seen.add(genPuzzle(makeRng(seed), "mix").target);
    expect([...seen].sort((a, b) => a - b)).toEqual([24, 36, 48, 60]);
  });
});

// ---------------------------------------------------------------------------
// UI checker (combineCards semantics through the module's arithmetic)
// ---------------------------------------------------------------------------

describe("game checker — accepts every valid move sequence, rejects every invalid one", () => {
  it("agrees with the oracle on all 9216 move sequences for several sets × targets", () => {
    const sets = [
      [1, 2, 3, 4], // many solutions
      [3, 3, 8, 8], // 24 only via 8/(3-8/3)
      [1, 5, 5, 5], // 24 only via 5*(5-1/5)
      [2, 3, 5, 8], // mixed
      [1, 1, 1, 1], // unsolvable for every target
    ];
    let accepted = 0;
    const mismatches: string[] = [];
    for (const nums of sets) {
      for (const target of TARGET_POOL) {
        for (const steps of allStepSequences()) {
          const verdict = oracleAccepts(nums, steps, target);
          if (verdict) accepted++;
          if (gameCheckerAccepts(nums, steps, target) !== verdict) {
            mismatches.push(`nums=${nums} target=${target} steps=${JSON.stringify(steps)}`);
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
    expect(accepted).toBeGreaterThan(0);
  });

  it("accepts fraction-requiring classics (intermediate non-integers)", () => {
    const cases: { nums: number[]; steps: Step[]; note: string }[] = [
      // 8/(3-8/3): 8/3 → [3,8,8/3]; 3-8/3 → [8,1/3]; 8/(1/3) = 24
      { nums: [3, 3, 8, 8], steps: [{ i: 3, j: 1, op: "/" }, { i: 0, j: 2, op: "-" }, { i: 0, j: 1, op: "/" }], note: "8/(3-8/3)" },
      // 5*(5-1/5): 1/5 → [5,5,1/5]; 5-1/5 → [5,24/5]; 5*(24/5) = 24
      { nums: [1, 5, 5, 5], steps: [{ i: 0, j: 1, op: "/" }, { i: 0, j: 2, op: "-" }, { i: 0, j: 1, op: "*" }], note: "5*(5-1/5)" },
      // 7*(3+3/7): 3/7 → [3,7,3/7]; 3+3/7 → [7,24/7]; 7*(24/7) = 24
      { nums: [3, 3, 7, 7], steps: [{ i: 0, j: 2, op: "/" }, { i: 0, j: 2, op: "+" }, { i: 0, j: 1, op: "*" }], note: "7*(3+3/7)" },
      // (4-4/7)*7: 4/7 → [4,7,4/7]; 4-4/7 → [7,24/7]; (24/7)*7 = 24
      { nums: [4, 4, 7, 7], steps: [{ i: 0, j: 2, op: "/" }, { i: 0, j: 2, op: "-" }, { i: 1, j: 0, op: "*" }], note: "(4-4/7)*7" },
      // 6/(5/4-1): 5/4 → [1,6,5/4]; 5/4-1 → [6,1/4]; 6/(1/4) = 24
      { nums: [1, 4, 5, 6], steps: [{ i: 2, j: 1, op: "/" }, { i: 2, j: 0, op: "-" }, { i: 0, j: 1, op: "/" }], note: "6/(5/4-1)" },
      // 6/(1-6/8): 6/8 → [1,6,3/4]; 1-3/4 → [6,1/4]; 6/(1/4) = 24
      { nums: [1, 6, 6, 8], steps: [{ i: 1, j: 3, op: "/" }, { i: 0, j: 2, op: "-" }, { i: 0, j: 1, op: "/" }], note: "6/(1-6/8)" },
    ];
    for (const c of cases) {
      expect(oracleAccepts(c.nums, c.steps, 24), `${c.note}: oracle`).toBe(true);
      expect(gameCheckerAccepts(c.nums, c.steps, 24), `${c.note}: game checker`).toBe(true);
    }
  });

  it("accepts negative intermediates: (3-9)*(2-6) = 24", () => {
    const steps: Step[] = [
      { i: 0, j: 3, op: "-" }, // [3,2,6,9] → 3-9=-6 → [2,6,-6]
      { i: 0, j: 1, op: "-" }, // 2-6=-4 → [-6,-4]
      { i: 0, j: 1, op: "*" }, // (-6)*(-4)=24
    ];
    expect(gameCheckerAccepts([3, 2, 6, 9], steps, 24)).toBe(true);
  });

  it("accepts the same solution regardless of which card is tapped first when the op commutes", () => {
    // 1*2*3*4 entered in different tap orders / groupings.
    expect(gameCheckerAccepts([1, 2, 3, 4], [{ i: 0, j: 1, op: "*" }, { i: 0, j: 1, op: "*" }, { i: 0, j: 1, op: "*" }], 24)).toBe(true);
    expect(gameCheckerAccepts([1, 2, 3, 4], [{ i: 3, j: 2, op: "*" }, { i: 1, j: 0, op: "*" }, { i: 1, j: 0, op: "*" }], 24)).toBe(true);
    // (1+2+3)*4 — the fourth card multiplies a three-card sum.
    // Table after 1+2: [3,4,3]; after (1+2)+3: [4,6]; then 6*4.
    expect(gameCheckerAccepts([1, 2, 3, 4], [{ i: 0, j: 1, op: "+" }, { i: 2, j: 0, op: "+" }, { i: 1, j: 0, op: "*" }], 24)).toBe(true);
  });

  it("rejects a wrong final value", () => {
    // 1+2+3+4 = 10
    const steps: Step[] = [{ i: 0, j: 1, op: "+" }, { i: 0, j: 1, op: "+" }, { i: 0, j: 1, op: "+" }];
    expect(gameCheckerAccepts([1, 2, 3, 4], steps, 24)).toBe(false);
  });

  it("rejects sequences that leave cards unused (no win until one card remains)", () => {
    // 2*3*4 = 24 with the 1 still on the table: not a win yet ...
    const partial: Step[] = [{ i: 1, j: 2, op: "*" }, { i: 1, j: 2, op: "*" }];
    expect(gameCheckerAccepts([1, 2, 3, 4], partial, 24)).toBe(false);
    // ... 24+1 = 25 loses, 24*1 = 24 wins — the last card must be consumed.
    expect(gameCheckerAccepts([1, 2, 3, 4], [...partial, { i: 1, j: 0, op: "+" }], 24)).toBe(false);
    expect(gameCheckerAccepts([1, 2, 3, 4], [...partial, { i: 1, j: 0, op: "*" }], 24)).toBe(true);
  });

  it("rejects using one card twice (same-card tap deselects instead of combining)", () => {
    // 6*4 with 6 "used twice": [6,4,1,1] cannot be won by 6*4 then 6*... — a
    // same-index move is not a move at all.
    const steps: Step[] = [{ i: 0, j: 0, op: "*" }, { i: 0, j: 1, op: "*" }, { i: 0, j: 1, op: "*" }];
    expect(gameCheckerAccepts([6, 4, 1, 1], steps, 24)).toBe(false);
  });

  it("rejects a division by zero mid-sequence and out-of-range card indices", () => {
    // 3-3 = 0, then 8/0 is refused by the game (applyOp → null).
    const divZero: Step[] = [{ i: 0, j: 1, op: "-" }, { i: 0, j: 2, op: "/" }, { i: 0, j: 1, op: "*" }];
    expect(gameCheckerAccepts([3, 3, 8, 8], divZero, 24)).toBe(false);
    const badIndex: Step[] = [{ i: 0, j: 7, op: "+" }, { i: 0, j: 1, op: "+" }, { i: 0, j: 1, op: "+" }];
    expect(gameCheckerAccepts([6, 6, 6, 6], badIndex, 24)).toBe(false);
  });

  it("rejects the right total for the wrong target", () => {
    const steps: Step[] = [{ i: 0, j: 1, op: "+" }, { i: 0, j: 1, op: "+" }, { i: 0, j: 1, op: "+" }]; // 6+6+6+6 = 24
    expect(gameCheckerAccepts([6, 6, 6, 6], steps, 24)).toBe(true);
    expect(gameCheckerAccepts([6, 6, 6, 6], steps, 36)).toBe(false);
  });
});
