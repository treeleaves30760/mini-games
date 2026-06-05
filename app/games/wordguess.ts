/* Word Guess (Wordle-style) — framework-free game logic, shared by the Vue
   component and the unit tests. Keeping the scoring and dictionary access here
   (rather than inside the component's <script setup>) makes the rules
   independently testable.

   Supports four word lengths (5–8). Each length's data (answers, definitions,
   and the full valid-guess list) lives in its own generated module and is
   loaded on demand so a 1 MB+ dictionary never ships up-front — see
   scripts/gen-wordguess.mjs and app/games/wordguessWords{5,6,7,8}.ts. */
import type { Rng } from "~/utils/rng";

/** Word lengths the game offers. 5 is the classic daily length. */
export const WORD_LENGTHS = [5, 6, 7, 8] as const;
export type WordLength = (typeof WORD_LENGTHS)[number];
export const DEFAULT_LENGTH: WordLength = 5;

export type LetterState = "correct" | "present" | "absent";

/** A fully-loaded dictionary for one word length. */
export interface WordPack {
  length: WordLength;
  /** Guesses allowed for this length. */
  maxGuesses: number;
  /** Curated/common pool the puzzle answer is drawn from. */
  answers: string[];
  /** Short gloss for every answer, shown when a round ends. */
  definitions: Record<string, string>;
  /** Every word accepted as a guess (answers included). */
  valid: ReadonlySet<string>;
}

/** How many guesses a length gets — longer words earn more so they stay fair:
 *  5→6 (classic Wordle), 6→7, 7→8, 8→9. */
export function guessesFor(length: WordLength): number {
  return length + 1;
}

/**
 * Score a guess against the answer, Wordle-style, with correct duplicate-letter
 * handling: exact-position matches are claimed first, then remaining letters are
 * matched against the unused pool. A letter guessed more times than it occurs in
 * the answer only lights up as many times as it actually appears.
 */
export function scoreGuess(guess: string, answer: string): LetterState[] {
  const g = String(guess).toUpperCase();
  const a = String(answer).toUpperCase();
  const n = a.length;
  const result: LetterState[] = Array(n).fill("absent");
  const pool: (string | null)[] = a.split("");

  // Pass 1: letters in the correct position.
  for (let i = 0; i < n; i++) {
    if (g[i] === a[i]) {
      result[i] = "correct";
      pool[i] = null;
    }
  }
  // Pass 2: letters present elsewhere, consuming from the remaining pool.
  for (let i = 0; i < n; i++) {
    if (result[i] === "correct") continue;
    const idx = pool.indexOf(g[i]);
    if (idx !== -1) {
      result[i] = "present";
      pool[idx] = null;
    }
  }
  return result;
}

/** True when every letter of the guess is in the correct position. */
export function isWin(states: LetterState[]): boolean {
  return states.length > 0 && states.every((s) => s === "correct");
}

/** Is `word` a real word this pack accepts as a guess? Case-insensitive. */
export function isValidWord(word: string, pack: WordPack): boolean {
  return pack.valid.has(String(word).toUpperCase());
}

/** Pick a puzzle answer from the pack's pool using a seeded RNG. */
export function pickAnswer(rng: Rng, pack: WordPack): string {
  return rng.pick(pack.answers);
}

/** The dictionary definition for a word, or null if the pack has none. */
export function definitionOf(word: string, pack: WordPack): string | null {
  return pack.definitions[String(word).toUpperCase()] ?? null;
}

// ---- on-demand per-length data loading -------------------------------------

interface RawPack {
  ANSWERS: string[];
  DEFINITIONS: Record<string, string>;
  VALID_GUESSES: string[];
}

const loaders: Record<WordLength, () => Promise<RawPack>> = {
  5: () => import("./wordguessWords5"),
  6: () => import("./wordguessWords6"),
  7: () => import("./wordguessWords7"),
  8: () => import("./wordguessWords8"),
};

const packCache = new Map<WordLength, WordPack>();

/** Load (and cache) the dictionary for a given word length. */
export async function loadWordPack(length: WordLength): Promise<WordPack> {
  const cached = packCache.get(length);
  if (cached) return cached;

  const mod = await loaders[length]();
  const valid = new Set<string>(mod.VALID_GUESSES);
  for (const answer of mod.ANSWERS) valid.add(answer);

  const pack: WordPack = {
    length,
    maxGuesses: guessesFor(length),
    answers: mod.ANSWERS,
    definitions: mod.DEFINITIONS,
    valid,
  };
  packCache.set(length, pack);
  return pack;
}
