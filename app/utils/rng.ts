/* =========================================================================
   Seeded RNG — deterministic pseudo-random numbers from a string/number seed.
   Powers the Daily Challenge: the same date seed always yields the same puzzle,
   so every player gets an identical challenge each day.

   Auto-imported by Nuxt (app/utils) — call makeRng()/todaySeed() anywhere.

   Usage in a game component:
     const rng = makeRng(props.seed);   // props.seed = null → truly random
     const n  = rng.int(1, 9);          // inclusive integer
     const c  = rng.pick(colors);       // random element
     rng.shuffle(deck);                 // in-place Fisher–Yates
   ========================================================================= */

export interface Rng {
  /** float in [0, 1) */
  next: () => number;
  /** inclusive integer in [min, max] */
  int: (min: number, max: number) => number;
  /** float in [min, max) */
  float: (min: number, max: number) => number;
  /** true with probability p (default 0.5) */
  bool: (p?: number) => boolean;
  /** random element of arr */
  pick: <T>(arr: T[]) => T;
  /** in-place Fisher–Yates shuffle; returns the same array */
  shuffle: <T>(arr: T[]) => T[];
}

/* cyrb128 — fast string → four 32-bit seeds (public-domain hash). */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

/* mulberry32 — tiny, well-distributed 32-bit PRNG. */
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash any string to a 32-bit unsigned integer (handy for ad-hoc seeds). */
export function hashStr(str: string): number {
  return cyrb128(str)[0];
}

/**
 * Build a seeded RNG. Pass a string or number for deterministic output, or
 * null/undefined for a fresh random stream (seeded off Math.random).
 */
export function makeRng(seed?: string | number | null): Rng {
  let a: number;
  if (seed === null || seed === undefined || seed === "") {
    a = (Math.random() * 4294967296) >>> 0;
  } else if (typeof seed === "number") {
    a = seed >>> 0 || 1;
  } else {
    a = cyrb128(String(seed))[0];
  }
  const next = mulberry32(a);
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    bool: (p = 0.5) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    },
  };
  return rng;
}

/** Local-date seed string "YYYY-MM-DD" — the canonical Daily Challenge seed. */
export function todaySeed(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Integer count of days since the Unix epoch for a local date — stable per day,
    used to rotate which game is featured each day. */
export function dayIndex(d: Date = new Date()): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}
