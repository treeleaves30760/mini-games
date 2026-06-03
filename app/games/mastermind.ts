/* Mastermind (猜數字 / 1A2B) — framework-free game logic.
   Shared by the Vue component and the unit tests.

   The game uses a 4-digit secret drawn from 10 distinct digits (no duplicates).
   Guesses are also required to have no duplicates by the UI validation layer.
   The scoring function below handles the general duplicate case correctly anyway,
   using the standard peg-counting algorithm:
     exact (A)    = right digit, right position (claimed first)
     misplaced (B) = right digit, wrong position (min over each digit of remaining counts)
   A digit guessed more times than it appears in the secret is never over-credited. */

import type { Rng } from "~/utils/rng";

export const CODE_LEN = 4;
export const MAX_TRIES = 8;
export const DIGIT_COUNT = 10; // digits 0–9

export type Feedback = { exact: number; misplaced: number };

/**
 * Generate a secret code: CODE_LEN distinct digits drawn from 0–9 using a
 * seeded RNG.  Mirrors the component's init() logic exactly.
 */
export function generateSecret(rng: Rng): number[] {
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  rng.shuffle(digits);
  return digits.slice(0, CODE_LEN);
}

/**
 * Score a guess against the secret with correct duplicate-handling.
 *
 * Pass 1 – claim exact matches and null them out of both pools.
 * Pass 2 – for each unmatched guess digit, look it up in the remaining secret
 *           pool and consume one occurrence if found (misplaced).
 *
 * This ensures a digit is never credited more times than it actually appears
 * in the secret, even in the degenerate cases the tests exercise.
 */
export function scoreMastermind(
  guess: number[],
  secret: number[]
): Feedback {
  const len = secret.length;
  const secretPool: (number | null)[] = secret.slice();
  const guessPool: (number | null)[] = guess.slice();

  let exact = 0;

  // Pass 1: exact matches.
  for (let i = 0; i < len; i++) {
    if (guessPool[i] === secretPool[i]) {
      exact++;
      secretPool[i] = null;
      guessPool[i] = null;
    }
  }

  // Pass 2: misplaced (present but wrong position).
  let misplaced = 0;
  for (let i = 0; i < len; i++) {
    if (guessPool[i] === null) continue; // already matched exactly
    const idx = secretPool.indexOf(guessPool[i] as number);
    if (idx !== -1) {
      misplaced++;
      secretPool[idx] = null;
    }
  }

  return { exact, misplaced };
}

/**
 * True when the guess is a perfect match (all digits exact).
 * Equivalent to exact === CODE_LEN for the standard game.
 */
export function isWin(feedback: Feedback, codeLen: number = CODE_LEN): boolean {
  return feedback.exact === codeLen;
}
