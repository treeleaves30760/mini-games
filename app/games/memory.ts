/* Memory (記憶翻牌) — framework-free game logic, shared by the Vue component
   and the unit tests. Deck generation, match checking, flip legality, and win
   detection live here; flip animation, timers, and reactive state stay in the
   component. */
import type { Rng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemoryCard {
  /** Stable unique id (1-based index of the shuffled deck position). */
  id: number;
  /** The emoji / symbol on this card. */
  sym: string;
  /** True while the card is face-up (selected this turn or already matched). */
  flipped: boolean;
  /** True once this card is permanently matched. */
  matched: boolean;
}

// ---------------------------------------------------------------------------
// Deck generation
// ---------------------------------------------------------------------------

/**
 * Build a shuffled deck of paired cards.
 *
 * @param symbols  Array of distinct symbols; the deck will contain exactly two
 *                 of each.  Length must be ≥ 1.
 * @param rng      Seeded RNG used for the shuffle — same seed → same deck.
 * @returns        Array of `2 × symbols.length` cards, shuffled.
 */
export function buildDeck(symbols: string[], rng: Rng): MemoryCard[] {
  const pairs: string[] = [...symbols, ...symbols];
  rng.shuffle(pairs);
  return pairs.map((sym, i) => ({
    id: i + 1,
    sym,
    flipped: false,
    matched: false,
  }));
}

// ---------------------------------------------------------------------------
// Match checking
// ---------------------------------------------------------------------------

/**
 * Returns true when both cards carry the same symbol (i.e. they are a pair).
 * The cards' `matched` or `flipped` state is deliberately ignored here — this
 * is a pure symbol comparison used after the caller has already verified that
 * both cards are eligible for comparison.
 */
export function isMatch(a: MemoryCard, b: MemoryCard): boolean {
  return a.sym === b.sym;
}

// ---------------------------------------------------------------------------
// Flip legality
// ---------------------------------------------------------------------------

/**
 * Returns true when flipping card at index `i` is a legal move.
 *
 * Illegal when:
 *   - the card is already permanently matched, OR
 *   - the card is the same card that was flipped first this turn
 *     (same-card re-tap must be ignored, not treated as a match).
 *
 * Note: the `flipped` flag on other (unmatched) cards is intentionally NOT a
 * blocking condition here — the component's `lock` flag handles the mismatch
 * delay window.  This function only encodes the two rules that are
 * structurally illegal regardless of lock state.
 *
 * @param cards     Full deck array.
 * @param i         Index of the card the player just tapped.
 * @param firstIdx  Index of the first card flipped this turn, or null.
 */
export function canFlip(
  cards: MemoryCard[],
  i: number,
  firstIdx: number | null,
): boolean {
  const card = cards[i];
  if (card.matched) return false;
  if (firstIdx !== null && firstIdx === i) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Win detection
// ---------------------------------------------------------------------------

/**
 * Returns true when every card in the deck has been matched (game complete).
 */
export function isWin(cards: MemoryCard[]): boolean {
  return cards.length > 0 && cards.every((c) => c.matched);
}
