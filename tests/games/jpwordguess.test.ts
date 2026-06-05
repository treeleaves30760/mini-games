import { describe, it, expect } from "vitest";
import {
  WORDS,
  ANSWERS,
  KANA,
  KANA_ROWS,
  WORD_LENGTH,
  MAX_GUESSES,
  scoreGuess,
  isWin,
  isValidGuess,
  pickWord,
  parseRomaji,
} from "~/games/jpwordguess";
import { makeRng } from "~/utils/rng";

describe("constants", () => {
  it("uses 4-kana words and 6 guesses", () => {
    expect(WORD_LENGTH).toBe(4);
    expect(MAX_GUESSES).toBe(6);
  });

  it("KANA is the flattened keyboard and includes seion + dakuten + handakuten", () => {
    expect(KANA.size).toBe(KANA_ROWS.flat().length);
    for (const k of ["あ", "ん", "が", "ぴ", "を"]) expect(KANA.has(k)).toBe(true);
  });
});

describe("scoreGuess", () => {
  it("marks an exact match all-correct", () => {
    expect(scoreGuess("のみもの", "のみもの")).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
    ]);
  });

  it("marks a fully-wrong guess all-absent", () => {
    expect(scoreGuess("ぱぴぷぺ", "のみもの")).toEqual([
      "absent",
      "absent",
      "absent",
      "absent",
    ]);
  });

  it("marks present kana in the wrong position (and skips already-correct ones)", () => {
    // answer のみもの, guess みのもの:
    // も(2) and の(3) land correct; み(0) and の(1) exist elsewhere -> present.
    const r = scoreGuess("みのもの", "のみもの");
    expect(r).toEqual(["present", "present", "correct", "correct"]);
  });

  it("handles duplicate guess kana: only as many as the answer has", () => {
    // answer のみもの has exactly two の (indices 0 and 3). Guess ののの の (four の):
    // positions 0 and 3 are correct; the middle two have no remaining の -> absent.
    const r = scoreGuess("のののの", "のみもの");
    expect(r).toEqual(["correct", "absent", "absent", "correct"]);
    expect(r.filter((s) => s === "present")).toHaveLength(0);
  });
});

describe("isWin", () => {
  it("true only when every state is correct", () => {
    expect(isWin(scoreGuess("ともだち", "ともだち"))).toBe(true);
    expect(isWin(scoreGuess("ともだて", "ともだち"))).toBe(false);
    expect(isWin([])).toBe(false);
  });
});

describe("isValidGuess", () => {
  it("accepts exactly four keyboard kana", () => {
    expect(isValidGuess("ともだち")).toBe(true);
    expect(isValidGuess("ぎんこう")).toBe(true);
  });

  it("rejects the wrong length", () => {
    expect(isValidGuess("ねこ")).toBe(false); // too short
    expect(isValidGuess("ともだちん")).toBe(false); // too long
    expect(isValidGuess("")).toBe(false);
  });

  it("rejects non-keyboard characters (kanji, small kana, latin)", () => {
    expect(isValidGuess("学生です")).toBe(false);
    expect(isValidGuess("きょうは")).toBe(false); // small ょ is not a key
    expect(isValidGuess("abcd")).toBe(false);
  });
});

describe("word pool invariants", () => {
  it("every word is exactly WORD_LENGTH keyboard kana", () => {
    for (const w of WORDS) {
      const chars = [...w.kana];
      expect(chars, `${w.kana} length`).toHaveLength(WORD_LENGTH);
      for (const c of chars) {
        expect(KANA.has(c), `${w.kana}: ${c} not on keyboard`).toBe(true);
      }
    }
  });

  it("ANSWERS mirrors the word list with no duplicates", () => {
    expect(ANSWERS).toEqual(WORDS.map((w) => w.kana));
    expect(new Set(ANSWERS).size).toBe(ANSWERS.length);
  });

  it("every answer is itself a valid guess (otherwise unwinnable)", () => {
    expect(ANSWERS.filter((k) => !isValidGuess(k))).toEqual([]);
  });

  it("every answer can be solved: scoring it against itself wins", () => {
    for (const w of WORDS) {
      expect(isWin(scoreGuess(w.kana, w.kana)), `${w.kana} not winnable`).toBe(true);
    }
  });

  it("carries complete learner metadata for the reveal card", () => {
    for (const w of WORDS) {
      for (const field of [w.display, w.romaji, w.en, w.zh, w.category, w.note]) {
        expect(typeof field === "string" && field.length > 0, `${w.kana} field`).toBe(true);
      }
      // At least two worked example sentences, each fully translated.
      expect(Array.isArray(w.examples) && w.examples.length >= 2, `${w.kana} examples`).toBe(true);
      for (const ex of w.examples) {
        for (const f of [ex.jp, ex.romaji, ex.zh, ex.en]) {
          expect(typeof f === "string" && f.length > 0, `${w.kana} example field`).toBe(true);
        }
      }
      // The first example should actually contain the headword in kana.
      expect(w.examples[0].jp.includes(w.kana), `${w.kana} first example uses the word`).toBe(true);
    }
  });

  it("offers a substantial, varied vocabulary to learn from", () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(50);
    // Several distinct categories so the deck teaches more than one topic.
    const categories = new Set(WORDS.map((w) => w.category));
    expect(categories.size).toBeGreaterThanOrEqual(8);
  });
});

describe("pickWord — seeded + daily reproducibility", () => {
  it("returns a member of the word pool", () => {
    for (let i = 0; i < 50; i++) {
      const w = pickWord(makeRng(`s${i}`));
      expect(WORDS).toContain(w);
    }
  });

  it("is deterministic for a given seed (same daily puzzle worldwide)", () => {
    expect(pickWord(makeRng("2026-06-05"))).toBe(pickWord(makeRng("2026-06-05")));
  });
});

describe("parseRomaji — romaji to hiragana", () => {
  it("converts a full word, longest-token-first", () => {
    expect(parseRomaji("tomodachi")).toEqual({
      kana: ["と", "も", "だ", "ち"],
      rest: "",
    });
  });

  it("matches 3-, 2-, and 1-char tokens", () => {
    expect(parseRomaji("shi").kana).toEqual(["し"]); // 3-char
    expect(parseRomaji("ka").kana).toEqual(["か"]); // 2-char
    expect(parseRomaji("a").kana).toEqual(["あ"]); // 1-char (also exercises end-of-buffer length guard)
  });

  it("is case-insensitive", () => {
    expect(parseRomaji("KA").kana).toEqual(["か"]);
  });

  it("keeps an incomplete trailing syllable as rest", () => {
    expect(parseRomaji("hon")).toEqual({ kana: ["ほ"], rest: "n" });
    expect(parseRomaji("k")).toEqual({ kana: [], rest: "k" });
  });

  it("stops at an unknown character, leaving it as rest", () => {
    expect(parseRomaji("x")).toEqual({ kana: [], rest: "x" });
    expect(parseRomaji("kax")).toEqual({ kana: ["か"], rest: "x" });
  });

  it("returns empty for an empty buffer", () => {
    expect(parseRomaji("")).toEqual({ kana: [], rest: "" });
  });

  it("supports wāpuro spelling variants", () => {
    expect(parseRomaji("si").kana).toEqual(["し"]);
    expect(parseRomaji("tu").kana).toEqual(["つ"]);
    expect(parseRomaji("hu").kana).toEqual(["ふ"]);
    expect(parseRomaji("nn").kana).toEqual(["ん"]);
  });
});
