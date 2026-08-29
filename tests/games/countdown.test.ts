import { describe, expect, it } from "vitest";
import { makeRng, type Rng } from "~/utils/rng";
import {
  COUNTDOWN_DIFFICULTIES,
  applyCountdownOp,
  combineCountdownCards,
  generateCountdownPuzzle,
  getCountdownDifficulty,
  isAcceptableTarget,
  isCountdownSolved,
  isCountdownWon,
  playCountdownMove,
  type CountdownCard,
  type CountdownOp,
  type CountdownPuzzle,
} from "~/games/countdown";

/* ===========================================================================
   Independent audit of Countdown Numbers / 倒數數字.

   The rules as the player reads them (CountdownGame.vue): every number card
   must be used exactly once; cards are merged pairwise with + − × ÷ until one
   card remains, and it must equal the target exactly; subtraction may not go
   negative and division must be exact.

   Everything below is written from those rules — the reference evaluator, the
   expression parser and the exhaustive solver share no code with the module,
   so they can disagree with it.
   =========================================================================== */

const OPS: CountdownOp[] = ["+", "-", "×", "÷"];

/** Reference implementation of one operation, straight from the rules. */
function refApply(op: CountdownOp, a: number, b: number): number | null {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a > b ? a - b : null;
    case "×":
      return a * b;
    case "÷":
      return b !== 0 && a % b === 0 ? a / b : null;
    /* v8 ignore next 2 -- OPS holds exactly the four operators; the default is
       only here so the switch is total for TypeScript. */
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Independent parser + evaluator for the shipped `solution` string
// ---------------------------------------------------------------------------

interface Node {
  op: CountdownOp;
  left: Node | number;
  right: Node | number;
}

/**
 * Parse a fully parenthesised expression such as "((50 × (7 + 2)) + (6 × 4))".
 * Throws on anything that is not exactly that shape, so a malformed solution
 * string can never quietly pass the audit.
 */
function parseExpr(text: string): Node | number {
  const tokens = text.replace(/\(/g, " ( ").replace(/\)/g, " ) ").trim().split(/\s+/);
  let pos = 0;

  function parseNode(): Node | number {
    const token = tokens[pos++];
    if (token === undefined) throw new Error(`unexpected end of expression in ${text}`);
    if (token !== "(") {
      if (!/^\d+$/.test(token)) throw new Error(`expected a number, got ${token} in ${text}`);
      return Number(token);
    }
    const left = parseNode();
    const op = tokens[pos++];
    if (op === undefined || !OPS.includes(op as CountdownOp)) {
      throw new Error(`expected an operator, got ${op} in ${text}`);
    }
    const right = parseNode();
    if (tokens[pos++] !== ")") throw new Error(`missing ) in ${text}`);
    return { op: op as CountdownOp, left, right };
  }

  const root = parseNode();
  if (pos !== tokens.length) throw new Error(`trailing tokens in ${text}`);
  return root;
}

/** Every leaf of the expression tree, in order. */
function leaves(node: Node | number): number[] {
  return typeof node === "number" ? [node] : [...leaves(node.left), ...leaves(node.right)];
}

/**
 * Evaluate the tree under the game's rules. Returns null when any step is
 * illegal (negative subtraction, inexact division), which the audit treats as
 * a broken certificate.
 */
function evalTree(node: Node | number): number | null {
  if (typeof node === "number") return node;
  const left = evalTree(node.left);
  const right = evalTree(node.right);
  if (left === null || right === null) return null;
  return refApply(node.op, left, right);
}

/** Multiset equality — the solution must use exactly the dealt cards. */
function sameMultiset(a: number[], b: number[]): boolean {
  const sort = (xs: number[]) => [...xs].sort((x, y) => x - y).join(",");
  return sort(a) === sort(b);
}

/**
 * Verify the certificate that ships with a puzzle: the solution expression uses
 * every dealt number exactly once, every intermediate step is legal, and the
 * result is the target. A puzzle that passes this is provably solvable.
 */
function certificateIsValid(puzzle: CountdownPuzzle): boolean {
  const tree = parseExpr(puzzle.solution);
  if (!sameMultiset(leaves(tree), puzzle.numbers)) return false;
  return evalTree(tree) === puzzle.target;
}

// ---------------------------------------------------------------------------
// Independent exhaustive solver (reachable-value DP over card subsets)
// ---------------------------------------------------------------------------

/**
 * All values reachable by merging exactly the cards in each subset. Used as a
 * second, search-based opinion on solvability: `reachable(numbers)` for the
 * full hand is the complete set of legal results, so `has(target)` decides the
 * puzzle without ever consulting the module.
 */
function reachableValues(numbers: number[]): Set<number> {
  const n = numbers.length;
  const full = (1 << n) - 1;
  const reach: Map<number, Set<number>> = new Map();
  for (let i = 0; i < n; i++) reach.set(1 << i, new Set([numbers[i]!]));

  const masks: number[] = [];
  for (let mask = 1; mask <= full; mask++) masks.push(mask);
  masks.sort((a, b) => popcount(a) - popcount(b));

  for (const mask of masks) {
    if (reach.has(mask)) continue;
    const values = new Set<number>();
    // Split the subset every way; a and b are disjoint and cover the mask.
    for (let sub = (mask - 1) & mask; sub > 0; sub = (sub - 1) & mask) {
      const other = mask ^ sub;
      if (sub > other) continue; // each unordered split once
      for (const x of reach.get(sub)!) {
        for (const y of reach.get(other)!) {
          values.add(x + y);
          values.add(x * y);
          if (x > y) values.add(x - y);
          if (y > x) values.add(y - x);
          if (y !== 0 && x % y === 0) values.add(x / y);
          if (x !== 0 && y % x === 0) values.add(y / x);
        }
      }
    }
    reach.set(mask, values);
  }
  return reach.get(full)!;
}

function popcount(mask: number): number {
  let count = 0;
  for (let m = mask; m; m >>= 1) count += m & 1;
  return count;
}

// ---------------------------------------------------------------------------
// Replay a certificate through the game's own move function
// ---------------------------------------------------------------------------

/**
 * Turn the solution tree into the move sequence a player would make and play it
 * through `playCountdownMove`, returning the final hand (or null if the game
 * ever rejected a move the rules allow).
 */
function replayCertificate(puzzle: CountdownPuzzle): CountdownCard[] | null {
  const tree = parseExpr(puzzle.solution);
  let hand: CountdownCard[] = puzzle.numbers.map((value) => ({ value, expr: String(value) }));
  const spent = new Set<CountdownCard>();

  function materialise(node: Node | number): CountdownCard | null {
    if (typeof node === "number") {
      const card = hand.find((c) => c.value === node && !spent.has(c) && c.expr === String(node));
      /* v8 ignore next -- leaves() matched the dealt multiset, so a leaf always
         has an unspent card of that value waiting in the hand. */
      if (!card) return null;
      spent.add(card);
      return card;
    }
    const left = materialise(node.left);
    const right = materialise(node.right);
    if (!left || !right) return null;
    const next = playCountdownMove(hand, hand.indexOf(left), hand.indexOf(right), node.op);
    if (!next) return null;
    hand = next;
    return next[next.length - 1]!;
  }

  return materialise(tree) === null ? null : hand;
}

// ---------------------------------------------------------------------------
// Test corpus
// ---------------------------------------------------------------------------

/** Seeds standing in for free play plus the Daily Challenge's date seeds. */
function corpusSeeds(count: number): string[] {
  const seeds: string[] = [];
  for (let i = 0; i < count; i++) seeds.push(`countdown-${i}`);
  for (let month = 1; month <= 12; month++) {
    for (let day = 1; day <= 28; day += 3) {
      const date = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      // The component seeds the module as `${seed}:countdown:${difficulty}`.
      seeds.push(`${date}:countdown:hard`);
    }
  }
  return seeds;
}

const SEEDS = corpusSeeds(200);

// ===========================================================================

describe("countdown numbers — rules", () => {
  it("applies only legal integer operations", () => {
    expect(applyCountdownOp("+", 7, 4)).toBe(11);
    expect(applyCountdownOp("-", 7, 4)).toBe(3);
    expect(applyCountdownOp("-", 4, 7)).toBeNull();
    expect(applyCountdownOp("-", 4, 4)).toBeNull();
    expect(applyCountdownOp("×", 7, 4)).toBe(28);
    expect(applyCountdownOp("÷", 12, 4)).toBe(3);
    expect(applyCountdownOp("÷", 12, 5)).toBeNull();
    expect(applyCountdownOp("÷", 12, 0)).toBeNull();
    // The component hands the op straight from UI state, so junk is rejected.
    expect(applyCountdownOp("^" as CountdownOp, 2, 3)).toBeNull();
  });

  it("agrees with an independent reference on every op over a wide range", () => {
    for (let a = 0; a <= 60; a++) {
      for (let b = 0; b <= 60; b++) {
        for (const op of OPS) {
          expect(applyCountdownOp(op, a, b)).toBe(refApply(op, a, b));
        }
      }
    }
  });

  it("combines cards into a parenthesised expression, or refuses", () => {
    const a: CountdownCard = { value: 9, expr: "9" };
    const b: CountdownCard = { value: 3, expr: "3" };
    expect(combineCountdownCards("÷", a, b)).toEqual({ value: 3, expr: "(9 ÷ 3)" });
    expect(combineCountdownCards("-", b, a)).toBeNull();
  });
});

describe("countdown numbers — moves can never reuse a card", () => {
  const hand: CountdownCard[] = [
    { value: 10, expr: "10" },
    { value: 4, expr: "4" },
    { value: 3, expr: "3" },
  ];

  it("removes both source cards and appends the merged one", () => {
    const next = playCountdownMove(hand, 0, 1, "-")!;
    expect(next).toEqual([{ value: 3, expr: "3" }, { value: 6, expr: "(10 - 4)" }]);
    // The original hand is untouched, so undo in the component stays safe.
    expect(hand).toHaveLength(3);
  });

  it("orders the operands by the indices given (ai − bi, ai ÷ bi)", () => {
    expect(playCountdownMove(hand, 1, 0, "-")).toBeNull(); // 4 − 10
    expect(playCountdownMove(hand, 0, 1, "-")![1]!.value).toBe(6); // 10 − 4
  });

  it("rejects the same card twice, a missing card and an illegal operation", () => {
    expect(playCountdownMove(hand, 1, 1, "+")).toBeNull();
    expect(playCountdownMove(hand, 0, 9, "+")).toBeNull();
    expect(playCountdownMove(hand, 9, 0, "+")).toBeNull();
    expect(playCountdownMove(hand, 2, 1, "÷")).toBeNull(); // 3 ÷ 4 is not exact
  });

  it("wins only when a single card equals the target", () => {
    expect(isCountdownSolved(120, 120)).toBe(true);
    expect(isCountdownSolved(121, 120)).toBe(false);
    expect(isCountdownSolved(null, 120)).toBe(false);
    expect(isCountdownWon([{ value: 120, expr: "x" }], 120)).toBe(true);
    expect(isCountdownWon([{ value: 121, expr: "x" }], 120)).toBe(false);
    // Cards left on the table means numbers went unused — not a win.
    expect(isCountdownWon([{ value: 120, expr: "x" }, { value: 5, expr: "5" }], 120)).toBe(false);
    expect(isCountdownWon([], 120)).toBe(false);
  });
});

describe("countdown numbers — difficulty settings", () => {
  it("falls back to 普通 for an unknown key", () => {
    expect(getCountdownDifficulty("normal").key).toBe("normal");
    expect(getCountdownDifficulty("nope").key).toBe("normal");
  });

  it("only accepts a target inside the band and not printed on a card", () => {
    const normal = getCountdownDifficulty("normal");
    expect(isAcceptableTarget(300, [100, 7, 3, 2, 1], normal)).toBe(true);
    expect(isAcceptableTarget(99, [100, 7, 3, 2, 1], normal)).toBe(false); // below the band
    expect(isAcceptableTarget(501, [100, 7, 3, 2, 1], normal)).toBe(false); // above the band
    expect(isAcceptableTarget(100, [100, 7, 3, 2, 1], normal)).toBe(false); // already on a card
    expect(isAcceptableTarget(100, [50, 7, 3, 2, 1], normal)).toBe(true); // band edge is inclusive
    expect(isAcceptableTarget(500, [50, 7, 3, 2, 1], normal)).toBe(true);
  });
});

describe("countdown numbers — the audit's own tools are sound", () => {
  it("parses, evaluates and rejects malformed expressions", () => {
    expect(evalTree(parseExpr("((7 + 5) × (6 + 4))"))).toBe(120);
    expect(leaves(parseExpr("((7 + 5) × (6 + 4))"))).toEqual([7, 5, 6, 4]);
    expect(evalTree(parseExpr("(4 - 7)"))).toBeNull(); // negative subtraction
    expect(evalTree(parseExpr("(7 ÷ 4)"))).toBeNull(); // inexact division
    expect(evalTree(parseExpr("((4 - 7) + 1)"))).toBeNull(); // illegal step propagates
    expect(() => parseExpr("(7 + )")).toThrow();
    expect(() => parseExpr("(7 ? 5)")).toThrow();
    expect(() => parseExpr("(7 + 5")).toThrow();
    expect(() => parseExpr("(7 + 5) 9")).toThrow();
    expect(() => parseExpr("(")).toThrow();
  });

  it("rejects a certificate that uses the wrong cards or misses the target", () => {
    const base: CountdownPuzzle = {
      difficulty: "easy",
      numbers: [7, 5, 6, 4],
      target: 120,
      solution: "((7 + 5) × (6 + 4))",
    };
    expect(certificateIsValid(base)).toBe(true);
    expect(certificateIsValid({ ...base, target: 121 })).toBe(false);
    expect(certificateIsValid({ ...base, numbers: [7, 5, 6, 9] })).toBe(false);
    expect(certificateIsValid({ ...base, solution: "((7 + 5) × 6)" })).toBe(false);
  });

  it("decides reachability the same way a hand search would", () => {
    const reach = reachableValues([7, 5, 6, 4]);
    expect(reach.has(120)).toBe(true); // (7+5)×(6+4)
    expect(reach.has(1)).toBe(true); // (7−6)×(5−4)
    expect(reach.has(9999)).toBe(false);
    // Using every card is mandatory, so a value needing only some cards is out.
    expect(reachableValues([2, 3]).has(2)).toBe(false);
    expect(reachableValues([2, 3]).has(6)).toBe(true);
  });
});

describe("countdown numbers — every generated puzzle is solvable", () => {
  for (const difficulty of COUNTDOWN_DIFFICULTIES) {
    it(`${difficulty.key}: ${SEEDS.length} seeds are all exactly reachable and well formed`, () => {
      const settings = getCountdownDifficulty(difficulty.key);
      const largeSet = new Set([25, 50, 75, 100]);

      for (const seed of SEEDS) {
        const puzzle = generateCountdownPuzzle(makeRng(seed), difficulty.key);

        // (c) shape of the deal
        expect(puzzle.difficulty).toBe(difficulty.key);
        expect(puzzle.numbers).toHaveLength(settings.count);
        expect(puzzle.numbers.filter((n) => largeSet.has(n))).toHaveLength(settings.large);
        for (const n of puzzle.numbers) {
          expect(Number.isInteger(n)).toBe(true);
          expect(n).toBeGreaterThan(0);
        }

        // (c) the target is in band and never printed on a card
        expect(puzzle.target).toBeGreaterThanOrEqual(settings.minTarget);
        expect(puzzle.target).toBeLessThanOrEqual(settings.maxTarget);
        expect(puzzle.numbers).not.toContain(puzzle.target);

        // (a) the shipped solution is a valid certificate: every card used once,
        // every step legal, result exactly the target.
        expect(certificateIsValid(puzzle), `${difficulty.key} ${seed}: ${puzzle.solution}`).toBe(true);

        // (b) and the game itself accepts that line of play as a win
        const finalHand = replayCertificate(puzzle);
        expect(finalHand, `${difficulty.key} ${seed} replay`).not.toBeNull();
        expect(isCountdownWon(finalHand!, puzzle.target)).toBe(true);
      }
    });
  }

  it("cross-checks a sample with an exhaustive independent search", () => {
    // The certificate already proves solvability; this confirms a search that
    // knows nothing about the generator finds the same targets reachable.
    for (const difficulty of COUNTDOWN_DIFFICULTIES) {
      for (let i = 0; i < 12; i++) {
        const puzzle = generateCountdownPuzzle(makeRng(`cross-${i}`), difficulty.key);
        const reach = reachableValues(puzzle.numbers);
        expect(reach.has(puzzle.target), `${difficulty.key} cross-${i}`).toBe(true);
      }
    }
  });

  it("is deterministic for a given seed and varies across seeds", () => {
    const a = generateCountdownPuzzle(makeRng("2026-08-29:countdown:hard"), "hard");
    const b = generateCountdownPuzzle(makeRng("2026-08-29:countdown:hard"), "hard");
    const c = generateCountdownPuzzle(makeRng("2026-08-30:countdown:hard"), "hard");
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("defaults to 普通 when no difficulty is named", () => {
    const puzzle = generateCountdownPuzzle(makeRng("default"));
    expect(puzzle.difficulty).toBe("normal");
    expect(certificateIsValid(puzzle)).toBe(true);
  });
});

describe("countdown numbers — the degenerate-Rng safety net", () => {
  /**
   * An Rng that always returns the low end and never shuffles. The fold then
   * produces the same small sum on every attempt, which no difficulty band
   * accepts, so the generator exhausts its draws and falls back.
   */
  function stubRng(): Rng {
    return {
      next: () => 0,
      int: (min) => min,
      float: (min) => min,
      bool: () => false,
      pick: <T>(arr: T[]) => arr[0]!,
      shuffle: <T>(arr: T[]) => arr,
    };
  }

  for (const difficulty of COUNTDOWN_DIFFICULTIES) {
    it(`${difficulty.key}: the fallback puzzle is itself solvable and in band`, () => {
      const settings = getCountdownDifficulty(difficulty.key);
      const puzzle = generateCountdownPuzzle(stubRng(), difficulty.key);

      expect(puzzle.numbers).toHaveLength(settings.count);
      expect(puzzle.target).toBeGreaterThanOrEqual(settings.minTarget);
      expect(puzzle.target).toBeLessThanOrEqual(settings.maxTarget);
      expect(puzzle.numbers.filter((n) => [25, 50, 75, 100].includes(n))).toHaveLength(settings.large);
      expect(certificateIsValid(puzzle)).toBe(true);
      expect(isCountdownWon(replayCertificate(puzzle)!, puzzle.target)).toBe(true);
    });
  }

  it("hands back a copy, so a caller cannot corrupt the shared fallback", () => {
    const first = generateCountdownPuzzle(stubRng(), "easy");
    first.numbers[0] = 999;
    const second = generateCountdownPuzzle(stubRng(), "easy");
    expect(second.numbers).not.toContain(999);
  });
});
