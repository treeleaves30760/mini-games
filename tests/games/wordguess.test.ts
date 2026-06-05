import { describe, it, expect, beforeAll } from "vitest";
import {
  WORD_LENGTHS,
  DEFAULT_LENGTH,
  guessesFor,
  scoreGuess,
  isWin,
  isValidWord,
  pickAnswer,
  definitionOf,
  loadWordPack,
  type WordPack,
  type WordLength,
} from "~/games/wordguess";
import { makeRng } from "~/utils/rng";

// Load every length's pack once; the dynamic imports also bring the four
// generated data modules under coverage.
const packs = {} as Record<WordLength, WordPack>;
beforeAll(async () => {
  for (const len of WORD_LENGTHS) packs[len] = await loadWordPack(len);
});

describe("scoreGuess", () => {
  it("marks an exact match all-correct", () => {
    expect(scoreGuess("WORLD", "WORLD")).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
    ]);
  });

  it("marks a fully-wrong guess all-absent", () => {
    expect(scoreGuess("FGHJK", "WORLD")).toEqual([
      "absent",
      "absent",
      "absent",
      "absent",
      "absent",
    ]);
  });

  it("marks present letters in the wrong position", () => {
    const r = scoreGuess("BANDA", "ABODE");
    expect(r[3]).toBe("correct"); // D in place
    expect(r[0]).toBe("present"); // B exists elsewhere
    expect(r[1]).toBe("present"); // A exists elsewhere
    expect(r[2]).toBe("absent"); // N not in answer
    expect(r[4]).toBe("absent"); // second A has no remaining A in pool
  });

  it("handles duplicate guess letters: only as many as the answer has", () => {
    const r = scoreGuess("LOLLY", "ALERT");
    expect(r.filter((s) => s === "present")).toHaveLength(1);
    expect(r.filter((s) => s === "correct")).toHaveLength(0);
  });

  it("prioritises correct positions over present for duplicates", () => {
    const r = scoreGuess("EEEEE", "EERIE");
    expect(r[0]).toBe("correct");
    expect(r[1]).toBe("correct");
    expect(r[4]).toBe("correct");
    expect(r[2]).toBe("absent");
    expect(r[3]).toBe("absent");
  });

  it("classic Wordle duplicate case: SPEED vs ERASE", () => {
    const r = scoreGuess("SPEED", "ERASE");
    expect(r[0]).toBe("present"); // S in ERASE
    expect(r[1]).toBe("absent"); // P not in ERASE
    expect(r[4]).toBe("absent"); // D not in ERASE
    expect(r[2]).toBe("present");
    expect(r[3]).toBe("present");
  });

  it("is case-insensitive", () => {
    expect(scoreGuess("world", "WORLD")).toEqual(scoreGuess("WORLD", "WORLD"));
  });

  it("works for longer words too (8 letters)", () => {
    expect(scoreGuess("COMPUTER", "COMPUTER")).toEqual(Array(8).fill("correct"));
    const r = scoreGuess("XXXXXXXX", "COMPUTER");
    expect(r.every((s) => s === "absent")).toBe(true);
  });
});

describe("isWin", () => {
  it("true only when every state is correct", () => {
    expect(isWin(scoreGuess("WORLD", "WORLD"))).toBe(true);
    expect(isWin(scoreGuess("WORDS", "WORLD"))).toBe(false);
    expect(isWin([])).toBe(false);
  });
});

describe("guessesFor — longer words get more attempts", () => {
  it("is length + 1 (5→6 classic, up to 8→9)", () => {
    expect(guessesFor(5)).toBe(6);
    expect(guessesFor(6)).toBe(7);
    expect(guessesFor(7)).toBe(8);
    expect(guessesFor(8)).toBe(9);
  });
});

describe("length config", () => {
  it("offers 5–8 and defaults to 5", () => {
    expect([...WORD_LENGTHS]).toEqual([5, 6, 7, 8]);
    expect(DEFAULT_LENGTH).toBe(5);
    expect(WORD_LENGTHS).toContain(DEFAULT_LENGTH);
  });
});

describe("loadWordPack", () => {
  it("returns a well-formed pack for each length", () => {
    for (const len of WORD_LENGTHS) {
      const pack = packs[len];
      expect(pack.length).toBe(len);
      expect(pack.maxGuesses).toBe(guessesFor(len));
      expect(pack.answers.length).toBeGreaterThan(100);
      expect(pack.valid.size).toBeGreaterThan(5000);
    }
  });

  it("caches: the same length returns the identical object", async () => {
    const again = await loadWordPack(5);
    expect(again).toBe(packs[5]); // cache hit, not a rebuild
  });

  it("every answer is also accepted as a valid guess", () => {
    for (const len of WORD_LENGTHS) {
      const pack = packs[len];
      const notGuessable = pack.answers.filter((w) => !pack.valid.has(w));
      expect(notGuessable).toEqual([]);
    }
  });
});

describe("isValidWord", () => {
  it("accepts WORLD (the original regression) — case-insensitive", () => {
    expect(isValidWord("WORLD", packs[5])).toBe(true);
    expect(isValidWord("world", packs[5])).toBe(true);
  });

  it("now accepts the previously-missing proper nouns APRIL and KOREA", () => {
    expect(isValidWord("APRIL", packs[5])).toBe(true);
    expect(isValidWord("KOREA", packs[5])).toBe(true);
  });

  it("accepts everyday words across lengths", () => {
    expect(isValidWord("PLANET", packs[6])).toBe(true);
    expect(isValidWord("JOURNEY", packs[7])).toBe(true);
    expect(isValidWord("COMPUTER", packs[8])).toBe(true);
  });

  it("rejects non-words and wrong-length input", () => {
    expect(isValidWord("ZZZZZ", packs[5])).toBe(false);
    expect(isValidWord("CAT", packs[5])).toBe(false);
    expect(isValidWord("COMPUTER", packs[5])).toBe(false); // 8 letters, not in the 5-pack
    expect(isValidWord("", packs[5])).toBe(false);
  });
});

describe("definitionOf", () => {
  it("returns a gloss for an answer (case-insensitive)", () => {
    const def = definitionOf("WORLD", packs[5]);
    expect(typeof def).toBe("string");
    expect((def as string).length).toBeGreaterThan(0);
    expect(definitionOf("world", packs[5])).toBe(def);
  });

  it("returns null for a valid guess that is not an answer", () => {
    // APRIL is an accepted guess but excluded from the answer pool, so no gloss.
    expect(isValidWord("APRIL", packs[5])).toBe(true);
    expect(definitionOf("APRIL", packs[5])).toBeNull();
    expect(definitionOf("ZZZZZ", packs[5])).toBeNull();
  });
});

describe("pickAnswer — seeded + reproducible", () => {
  it("returns a member of the pack's answer pool", () => {
    for (let i = 0; i < 30; i++) {
      const w = pickAnswer(makeRng(`s${i}`), packs[5]);
      expect(packs[5].answers).toContain(w);
    }
  });

  it("is deterministic for a given seed (same daily puzzle worldwide)", () => {
    expect(pickAnswer(makeRng("2026-06-05"), packs[5])).toBe(
      pickAnswer(makeRng("2026-06-05"), packs[5]),
    );
  });

  it("picks an answer of the right length for every pack", () => {
    for (const len of WORD_LENGTHS) {
      expect(pickAnswer(makeRng("x"), packs[len]).length).toBe(len);
    }
  });
});

describe("data-pack invariants (per length)", () => {
  it("answers are the right length, unique, and each has a definition", () => {
    for (const len of WORD_LENGTHS) {
      const pack = packs[len];
      const re = new RegExp(`^[A-Z]{${len}}$`);
      expect(pack.answers.filter((w) => !re.test(w))).toEqual([]);
      expect(new Set(pack.answers).size).toBe(pack.answers.length);
      const noDef = pack.answers.filter((w) => !definitionOf(w, pack));
      expect(noDef).toEqual([]);
      // every definition key is an answer (no orphan glosses)
      expect(Object.keys(pack.definitions).sort()).toEqual([...pack.answers].sort());
    }
  });

  it("every valid guess is exactly N uppercase letters", () => {
    for (const len of WORD_LENGTHS) {
      const re = new RegExp(`^[A-Z]{${len}}$`);
      const bad = [...packs[len].valid].filter((w) => !re.test(w));
      expect(bad).toEqual([]);
    }
  });

  it("every answer can be solved (scoring it against itself is a win)", () => {
    for (const len of WORD_LENGTHS) {
      for (const w of packs[len].answers) {
        expect(isWin(scoreGuess(w, w)), `${w} not winnable`).toBe(true);
      }
    }
  });

  it("the 5-letter dictionary covers the whole alphabet", () => {
    const firstLetters = new Set([...packs[5].valid].map((w) => w[0]));
    for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      expect(firstLetters.has(c), `no valid word starts with ${c}`).toBe(true);
    }
  });
});
