import { describe, it, expect } from "vitest";
import { buildDeck, isMatch, canFlip, isWin } from "~/games/memory";
import { makeRng } from "~/utils/rng";

// Minimal symbol sets used across tests.
const THREE_SYMS = ["A", "B", "C"]; // 3 pairs → 6 cards
const TWO_SYMS = ["X", "Y"];        // 2 pairs → 4 cards

// ---------------------------------------------------------------------------
// buildDeck — deck generation
// ---------------------------------------------------------------------------

describe("buildDeck — deck generation", () => {
  it("deck length is exactly 2 × symbols.length", () => {
    const deck = buildDeck(THREE_SYMS, makeRng("seed1"));
    expect(deck.length).toBe(6);
  });

  it("deck length is always even", () => {
    for (const n of [1, 2, 5, 8, 18]) {
      const syms = Array.from({ length: n }, (_, i) => String(i));
      const deck = buildDeck(syms, makeRng(n));
      expect(deck.length % 2).toBe(0);
    }
  });

  it("each symbol appears exactly twice", () => {
    const deck = buildDeck(THREE_SYMS, makeRng("seed2"));
    for (const sym of THREE_SYMS) {
      const count = deck.filter((c) => c.sym === sym).length;
      expect(count, `${sym} should appear exactly twice`).toBe(2);
    }
  });

  it("all cards start face-down and unmatched", () => {
    const deck = buildDeck(TWO_SYMS, makeRng("seed3"));
    for (const card of deck) {
      expect(card.flipped).toBe(false);
      expect(card.matched).toBe(false);
    }
  });

  it("all card ids are unique", () => {
    const deck = buildDeck(THREE_SYMS, makeRng("seed4"));
    const ids = deck.map((c) => c.id);
    expect(new Set(ids).size).toBe(deck.length);
  });

  it("shuffle is deterministic for a given seed", () => {
    const d1 = buildDeck(THREE_SYMS, makeRng("det-seed"));
    const d2 = buildDeck(THREE_SYMS, makeRng("det-seed"));
    expect(d1.map((c) => c.sym)).toEqual(d2.map((c) => c.sym));
  });

  it("different seeds produce (virtually) different orderings", () => {
    // With 6 cards there are 720 permutations — two distinct seeds are
    // extremely unlikely to land on the same shuffle.
    const d1 = buildDeck(THREE_SYMS, makeRng("seedA"));
    const d2 = buildDeck(THREE_SYMS, makeRng("seedB"));
    // Compare symbol order; they should differ.
    expect(d1.map((c) => c.sym)).not.toEqual(d2.map((c) => c.sym));
  });
});

// ---------------------------------------------------------------------------
// isMatch — pair recognition
// ---------------------------------------------------------------------------

describe("isMatch — pair recognition", () => {
  it("returns true for two cards with the same symbol", () => {
    const [a, b] = buildDeck(["🐸"], makeRng(1)); // only one pair → cards[0] and cards[1]
    expect(isMatch(a, b)).toBe(true);
  });

  it("returns false for two cards with different symbols", () => {
    const deck = buildDeck(["🦊", "🐼"], makeRng("m-seed"));
    // Find one card of each symbol.
    const fox = deck.find((c) => c.sym === "🦊")!;
    const panda = deck.find((c) => c.sym === "🐼")!;
    expect(isMatch(fox, panda)).toBe(false);
  });

  it("is purely symbol-based — does not depend on id", () => {
    const cardA = { id: 1, sym: "Z", flipped: true, matched: false };
    const cardB = { id: 99, sym: "Z", flipped: false, matched: true };
    expect(isMatch(cardA, cardB)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canFlip — flip legality
// ---------------------------------------------------------------------------

describe("canFlip — flip legality", () => {
  function makeFreshDeck() {
    return buildDeck(["A", "B", "C"], makeRng("legal-seed"));
  }

  it("allows flipping a normal face-down unmatched card when no first is set", () => {
    const deck = makeFreshDeck();
    expect(canFlip(deck, 0, null)).toBe(true);
  });

  it("allows flipping a different card when a first card is already up", () => {
    const deck = makeFreshDeck();
    deck[0].flipped = true;
    expect(canFlip(deck, 1, 0)).toBe(true);
  });

  it("blocks re-selecting the exact same card that was flipped first", () => {
    const deck = makeFreshDeck();
    deck[2].flipped = true;
    expect(canFlip(deck, 2, 2)).toBe(false);
  });

  it("blocks selecting an already-matched card", () => {
    const deck = makeFreshDeck();
    deck[0].matched = true;
    deck[0].flipped = true;
    expect(canFlip(deck, 0, null)).toBe(false);
  });

  it("blocks a matched card even when it is not the firstIdx card", () => {
    const deck = makeFreshDeck();
    deck[3].matched = true;
    deck[3].flipped = true;
    // Card 1 is the first pick; card 3 is matched — still illegal.
    expect(canFlip(deck, 3, 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isWin — win detection
// ---------------------------------------------------------------------------

describe("isWin — win detection", () => {
  it("returns false for a fresh (all unmatched) deck", () => {
    const deck = buildDeck(TWO_SYMS, makeRng("win-seed"));
    expect(isWin(deck)).toBe(false);
  });

  it("returns false when only some cards are matched", () => {
    const deck = buildDeck(TWO_SYMS, makeRng("win-seed2"));
    deck[0].matched = true;
    deck[1].matched = true;
    // deck[2] and deck[3] still unmatched
    expect(isWin(deck)).toBe(false);
  });

  it("returns true when every card is matched", () => {
    const deck = buildDeck(TWO_SYMS, makeRng("win-seed3"));
    for (const card of deck) card.matched = true;
    expect(isWin(deck)).toBe(true);
  });

  it("returns false for an empty deck (no cards = no completed game)", () => {
    expect(isWin([])).toBe(false);
  });

  it("win detected after simulating a full 2-pair game", () => {
    // Build a 2-pair deck and manually walk through flipping both pairs.
    const deck = buildDeck(["🐱", "🐶"], makeRng("full-game"));
    let firstIdx: number | null = null;

    // Collect pairs by symbol.
    const cats = deck.map((c, i) => ({ ...c, idx: i })).filter((c) => c.sym === "🐱");
    const dogs = deck.map((c, i) => ({ ...c, idx: i })).filter((c) => c.sym === "🐶");

    // Match cats.
    expect(canFlip(deck, cats[0].idx, firstIdx)).toBe(true);
    deck[cats[0].idx].flipped = true;
    firstIdx = cats[0].idx;

    expect(canFlip(deck, cats[1].idx, firstIdx)).toBe(true);
    deck[cats[1].idx].flipped = true;
    expect(isMatch(deck[cats[0].idx], deck[cats[1].idx])).toBe(true);
    deck[cats[0].idx].matched = true;
    deck[cats[1].idx].matched = true;
    firstIdx = null;

    expect(isWin(deck)).toBe(false); // dogs still unmatched

    // Match dogs.
    expect(canFlip(deck, dogs[0].idx, firstIdx)).toBe(true);
    deck[dogs[0].idx].flipped = true;
    firstIdx = dogs[0].idx;

    expect(canFlip(deck, dogs[1].idx, firstIdx)).toBe(true);
    deck[dogs[1].idx].flipped = true;
    expect(isMatch(deck[dogs[0].idx], deck[dogs[1].idx])).toBe(true);
    deck[dogs[0].idx].matched = true;
    deck[dogs[1].idx].matched = true;
    firstIdx = null;

    expect(isWin(deck)).toBe(true);
  });
});
