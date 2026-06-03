/* Simon (記憶序列) — framework-free game logic.
   Extracts the two pure pieces that are independently testable:
     1. Sequence generation: build a deterministic sequence from a seeded RNG.
     2. Input checking: compare a player press against the expected sequence
        position and report whether the press was wrong, still in progress,
        or completed the current round.

   Everything else (timers, WebAudio, reactive state, overlays) stays in the
   Vue component. */

import type { Rng } from "~/utils/rng";

/** Number of valid pad IDs: 0 = green, 1 = red, 2 = yellow, 3 = blue. */
export const PAD_COUNT = 4;

/** The maximum pre-generated sequence length (same constant as the component). */
export const SEQ_LEN = 30;

/**
 * Build a full Simon sequence of `length` steps using the given RNG.
 * Each step is a pad ID in [0, PAD_COUNT-1].
 *
 * Deterministic for a given seed: calling buildSimonSequence with the same
 * Rng state always produces the same array.
 */
export function buildSimonSequence(rng: Rng, length: number = SEQ_LEN): number[] {
  return Array.from({ length }, () => rng.int(0, PAD_COUNT - 1));
}

/** Possible outcomes when a player presses a pad. */
export type PressResult =
  | { verdict: "wrong" }        // pressed the wrong pad — game over
  | { verdict: "progress" }     // correct press, more presses needed this round
  | { verdict: "round-complete" }; // correct press AND last press of this round

/**
 * Check a single player press against the target sequence.
 *
 * @param sequence  - The full pre-built pad sequence.
 * @param round     - Current round number (1-indexed).  The player must match
 *                    the first `round` elements of `sequence`.
 * @param inputIndex - How many presses the player has already made this round
 *                    (0-based, i.e. the index of the press being evaluated).
 * @param padId     - The pad ID the player just pressed.
 */
export function checkPress(
  sequence: number[],
  round: number,
  inputIndex: number,
  padId: number,
): PressResult {
  const expected = sequence[inputIndex];
  if (padId !== expected) {
    return { verdict: "wrong" };
  }
  // Correct press: is this the last one for the round?
  if (inputIndex + 1 >= round) {
    return { verdict: "round-complete" };
  }
  return { verdict: "progress" };
}
