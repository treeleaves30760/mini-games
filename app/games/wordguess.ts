/* Word Guess (Wordle-style) — framework-free game logic, shared by the Vue
   component and the unit tests. Keeping the scoring and dictionary here (rather
   than inside the component's <script setup>) makes the rules independently
   testable. */
import type { Rng } from "~/utils/rng";
import { ANSWERS, VALID_GUESSES } from "~/games/wordguessWords";

export { ANSWERS, VALID_GUESSES };

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

export type LetterState = "correct" | "present" | "absent";

/** Every accepted guess: the curated answers plus the full valid-word list. */
const VALID_SET: ReadonlySet<string> = new Set([...VALID_GUESSES, ...ANSWERS]);

/** Is `word` a real 5-letter word the game accepts as a guess? Case-insensitive. */
export function isValidWord(word: string): boolean {
  return VALID_SET.has(String(word).toUpperCase());
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

/** Pick a puzzle answer from the curated pool using a seeded RNG. */
export function pickAnswer(rng: Rng): string {
  return rng.pick(ANSWERS);
}
