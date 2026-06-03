/* Make 24 (24點) — framework-free pure game logic.
   Shared by TwentyFourGame.vue and the unit tests.

   Exact rational arithmetic (no floating-point rounding errors).
   Brute-force solver iterates all 5 binary-tree shapes × all permutations
   of 4 numbers × all 4^3 operator combinations. */

import type { Rng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Rational arithmetic
// ---------------------------------------------------------------------------

export interface Rat {
  n: number; // numerator (sign lives here; d is always positive)
  d: number; // denominator (> 0)
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** Construct a canonical rational, or null for division-by-zero. */
export function rat(n: number, d = 1): Rat | null {
  if (d === 0) return null;
  if (n === 0) return { n: 0, d: 1 };
  const g = gcd(Math.abs(n), Math.abs(d));
  const sign = d < 0 ? -1 : 1;
  return { n: (sign * n) / g, d: (sign * d) / g };
}

export function radd(a: Rat, b: Rat): Rat | null {
  return rat(a.n * b.d + b.n * a.d, a.d * b.d);
}
export function rsub(a: Rat, b: Rat): Rat | null {
  return rat(a.n * b.d - b.n * a.d, a.d * b.d);
}
export function rmul(a: Rat, b: Rat): Rat | null {
  return rat(a.n * b.n, a.d * b.d);
}
export function rdiv(a: Rat, b: Rat): Rat | null {
  if (b.n === 0) return null;
  return rat(a.n * b.d, a.d * b.n);
}
export function req(a: Rat | null, b: Rat | null): boolean {
  return a !== null && b !== null && a.n === b.n && a.d === b.d;
}

export function applyOp(op: string, a: Rat, b: Rat): Rat | null {
  if (op === "+") return radd(a, b);
  if (op === "-") return rsub(a, b);
  if (op === "*") return rmul(a, b);
  if (op === "/") return rdiv(a, b);
  return null;
}

// ---------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------

export const OPS = ["+", "-", "*", "/"] as const;

function* permutations(arr: number[]): Generator<number[]> {
  if (arr.length <= 1) {
    yield [...arr];
    return;
  }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) yield [arr[i], ...p];
  }
}

/**
 * Try all 5 binary-tree shapes × all permutations × all op triples.
 * Returns a compact expression string on the first hit, or null if unsolvable.
 * tr must be a Rat representing the target (e.g. rat(24)).
 */
export function solveFor(nums: number[], tr: Rat): string | null {
  const rats = nums.map((n) => rat(n) as Rat);
  for (const perm of permutations([0, 1, 2, 3])) {
    const [a, b, c, d] = perm.map((i) => rats[i]);
    const [na, nb, nc, nd] = perm.map((i) => nums[i]);
    for (const o1 of OPS)
      for (const o2 of OPS)
        for (const o3 of OPS) {
          // Shape 1: ((a o1 b) o2 c) o3 d
          {
            const ab = applyOp(o1, a, b);
            if (ab) {
              const abc = applyOp(o2, ab, c);
              if (abc) {
                const abcd = applyOp(o3, abc, d);
                if (abcd && req(abcd, tr))
                  return `((${na}${o1}${nb})${o2}${nc})${o3}${nd}`;
              }
            }
          }
          // Shape 2: (a o1 (b o2 c)) o3 d
          {
            const bc = applyOp(o2, b, c);
            if (bc) {
              const abc = applyOp(o1, a, bc);
              if (abc) {
                const abcd = applyOp(o3, abc, d);
                if (abcd && req(abcd, tr))
                  return `(${na}${o1}(${nb}${o2}${nc}))${o3}${nd}`;
              }
            }
          }
          // Shape 3: (a o1 b) o2 (c o3 d)
          {
            const ab = applyOp(o1, a, b);
            const cd = applyOp(o3, c, d);
            if (ab && cd) {
              const abcd = applyOp(o2, ab, cd);
              if (abcd && req(abcd, tr))
                return `(${na}${o1}${nb})${o2}(${nc}${o3}${nd})`;
            }
          }
          // Shape 4: a o1 ((b o2 c) o3 d)
          {
            const bc = applyOp(o2, b, c);
            if (bc) {
              const bcd = applyOp(o3, bc, d);
              if (bcd) {
                const abcd = applyOp(o1, a, bcd);
                if (abcd && req(abcd, tr))
                  return `${na}${o1}((${nb}${o2}${nc})${o3}${nd})`;
              }
            }
          }
          // Shape 5: a o1 (b o2 (c o3 d))
          {
            const cd = applyOp(o3, c, d);
            if (cd) {
              const bcd = applyOp(o2, b, cd);
              if (bcd) {
                const abcd = applyOp(o1, a, bcd);
                if (abcd && req(abcd, tr))
                  return `${na}${o1}(${nb}${o2}(${nc}${o3}${nd}))`;
              }
            }
          }
        }
  }
  return null;
}

/**
 * Returns true if the given multiset of integers can be combined (using + - * /
 * and parentheses, each number exactly once) to reach `target`.
 */
export function canSolve(nums: number[], target: number): boolean {
  const tr = rat(target);
  /* v8 ignore start */ if (!tr) return false; /* v8 ignore stop */
  return solveFor(nums, tr) !== null;
}

/**
 * Returns one solution expression string, or null if none exists.
 */
export function findSolution(nums: number[], target: number): string | null {
  const tr = rat(target);
  /* v8 ignore start */ if (!tr) return null; /* v8 ignore stop */
  return solveFor(nums, tr);
}

// ---------------------------------------------------------------------------
// Pretty-print
// ---------------------------------------------------------------------------

/** Formats a compact solver expression for human display. */
export function prettySolution(expr: string | null | undefined): string {
  if (!expr) return "";
  return expr
    .replace(/\*/g, " × ")
    .replace(/\//g, " ÷ ")
    .replace(/\+/g, " + ")
    .replace(/-/g, " − ")
    .replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Factor-rich targets that four 1–9 cards can reach many ways. */
export const TARGET_POOL = [24, 36, 48, 60] as const;

export const TARGET_MODES = [
  { v: "mix", label: "隨機" },
  { v: "24", label: "24" },
  { v: "36", label: "36" },
  { v: "48", label: "48" },
  { v: "60", label: "60" },
] as const;

/** Known-solvable fallbacks per target — used only if 600 random draws all fail. */
export const FALLBACKS: Record<number, { nums: number[]; solution: string }> = {
  24: { nums: [3, 3, 8, 8], solution: "8/(3-8/3)" },
  36: { nums: [9, 9, 9, 9], solution: "((9+9)+9)+9" },
  48: { nums: [6, 8, 1, 1], solution: "((6*8)*1)*1" },
  60: { nums: [5, 6, 2, 1], solution: "((5*6)*2)*1" },
};

// ---------------------------------------------------------------------------
// Puzzle generator
// ---------------------------------------------------------------------------

function chooseTarget(rng: Rng, mode: string): number {
  if (mode === "mix") return rng.pick([...TARGET_POOL]);
  const n = Number(mode);
  return TARGET_POOL.includes(n as (typeof TARGET_POOL)[number]) ? n : 24;
}

export interface Puzzle {
  nums: number[];
  solution: string;
  target: number;
}

/**
 * Generate a guaranteed-solvable puzzle.
 * `mode` is the target-mode string: "mix" | "24" | "36" | "48" | "60".
 */
export function genPuzzle(rng: Rng, mode = "mix"): Puzzle {
  const goal = chooseTarget(rng, mode);
  const tr = rat(goal) as Rat;
  for (let i = 0; i < 600; i++) {
    const nums = [
      rng.int(1, 9),
      rng.int(1, 9),
      rng.int(1, 9),
      rng.int(1, 9),
    ];
    const sol = solveFor(nums, tr);
    if (sol) return { nums, solution: sol, target: goal };
  }
  const fb = FALLBACKS[goal] ?? FALLBACKS[24];
  return {
    nums: fb.nums,
    solution: fb.solution,
    target: FALLBACKS[goal] ? goal : 24,
  };
}
