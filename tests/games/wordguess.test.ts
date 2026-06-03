import { describe, it, expect } from "vitest";
import {
  ANSWERS,
  VALID_GUESSES,
  WORD_LENGTH,
  scoreGuess,
  isValidWord,
  isWin,
  pickAnswer,
} from "~/games/wordguess";
import { makeRng } from "~/utils/rng";

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
    // answer WORLD, guess DROLL: D present, R present(?), ...
    // Use a clear case: answer "ABODE", guess "BANDA"
    // B present, A correct? positions: A B O D E / B A N D A
    // i0 B vs A -> not correct; i1 A vs B -> not correct; i2 N vs O; i3 D vs D correct; i4 A vs E
    const r = scoreGuess("BANDA", "ABODE");
    expect(r[3]).toBe("correct"); // D in place
    expect(r[0]).toBe("present"); // B exists elsewhere
    expect(r[1]).toBe("present"); // A exists elsewhere
    expect(r[2]).toBe("absent"); // N not in answer
    expect(r[4]).toBe("absent"); // second A has no remaining A in pool
  });

  it("handles duplicate guess letters: only as many as the answer has", () => {
    // answer "ALERT" has a single L (at index 1). Guess "LOLLY" has three L's,
    // none aligned with index 1 — only ONE should light (present), the rest absent.
    const r = scoreGuess("LOLLY", "ALERT");
    const present = r.filter((s) => s === "present");
    const correct = r.filter((s) => s === "correct");
    expect(correct).toHaveLength(0);
    expect(present).toHaveLength(1); // answer has exactly one L to credit
  });

  it("prioritises correct positions over present for duplicates", () => {
    // answer "EERIE" (E,E,R,I,E -> three E's), guess "EEEEE":
    // positions 0,1,4 are correct E; positions 2,3 absent (no E there, pool empty)
    const r = scoreGuess("EEEEE", "EERIE");
    expect(r[0]).toBe("correct");
    expect(r[1]).toBe("correct");
    expect(r[4]).toBe("correct");
    expect(r[2]).toBe("absent");
    expect(r[3]).toBe("absent");
  });

  it("classic Wordle duplicate case: SPEED vs ERASE", () => {
    // answer ERASE (E,R,A,S,E), guess SPEED (S,P,E,E,D)
    // S present (ERASE has S), P absent, E present, E correct? pos3 of ERASE is S not E
    // Expected per Wordle: S=present, P=absent, E=present, E=present(one E left)..D=absent
    const r = scoreGuess("SPEED", "ERASE");
    expect(r[0]).toBe("present"); // S in ERASE
    expect(r[1]).toBe("absent"); // P not in ERASE
    expect(r[4]).toBe("absent"); // D not in ERASE
    // two guessed E's, two answer E's, neither in matching position -> both present
    expect(r[2]).toBe("present");
    expect(r[3]).toBe("present");
  });

  it("is case-insensitive", () => {
    expect(scoreGuess("world", "WORLD")).toEqual(scoreGuess("WORLD", "WORLD"));
  });
});

describe("isWin", () => {
  it("true only when every state is correct", () => {
    expect(isWin(scoreGuess("WORLD", "WORLD"))).toBe(true);
    expect(isWin(scoreGuess("WORDS", "WORLD"))).toBe(false);
    expect(isWin([])).toBe(false);
  });
});

describe("dictionary — the bugs that prompted this", () => {
  it("accepts WORLD (the reported regression)", () => {
    expect(isValidWord("WORLD")).toBe(true);
    expect(isValidWord("world")).toBe(true);
  });

  it("accepts common everyday words across the whole alphabet", () => {
    const common = [
      "HELLO", "MONEY", "PLANT", "QUICK", "JUMPY", "VIVID", "ZEBRA", "OCEAN",
      "NIGHT", "GHOST", "KNIFE", "USAGE", "TIGER", "RIVER", "LUCKY", "MUSIC",
    ];
    for (const w of common) expect(isValidWord(w), `${w} should be valid`).toBe(true);
  });

  it("rejects non-words and wrong-length input", () => {
    expect(isValidWord("ZZZZZ")).toBe(false);
    expect(isValidWord("ABCDE")).toBe(false);
    expect(isValidWord("CAT")).toBe(false);
    expect(isValidWord("ELEPHANT")).toBe(false);
    expect(isValidWord("")).toBe(false);
  });

  it("every valid guess is exactly 5 uppercase letters (no 4/6-letter or dup garbage)", () => {
    const re = /^[A-Z]{5}$/;
    const bad = VALID_GUESSES.filter((w) => !re.test(w));
    expect(bad).toEqual([]);
  });

  it("the valid-guess list has no duplicates", () => {
    expect(new Set(VALID_GUESSES).size).toBe(VALID_GUESSES.length);
  });

  it("is a substantial dictionary (covers the language, not just A–F)", () => {
    expect(VALID_GUESSES.length).toBeGreaterThan(5000);
    const firstLetters = new Set(VALID_GUESSES.map((w) => w[0]));
    // Every letter A–Z should start at least one valid word.
    for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      expect(firstLetters.has(c), `no valid word starts with ${c}`).toBe(true);
    }
  });
});

describe("answers pool invariants", () => {
  it("is non-empty and all entries are 5 uppercase letters", () => {
    expect(ANSWERS.length).toBeGreaterThan(100);
    const re = /^[A-Z]{5}$/;
    expect(ANSWERS.filter((w) => !re.test(w))).toEqual([]);
  });

  it("has no duplicate answers", () => {
    expect(new Set(ANSWERS).size).toBe(ANSWERS.length);
  });

  it("every answer is itself a valid guess (otherwise the puzzle is unwinnable)", () => {
    const notGuessable = ANSWERS.filter((w) => !isValidWord(w));
    expect(notGuessable).toEqual([]);
  });

  it("every answer can be solved: scoring the answer against itself is a win", () => {
    for (const w of ANSWERS) {
      expect(isWin(scoreGuess(w, w)), `${w} not winnable`).toBe(true);
    }
  });
});

describe("pickAnswer — seeded + daily reproducibility", () => {
  it("returns a member of the answer pool", () => {
    for (let i = 0; i < 50; i++) {
      const w = pickAnswer(makeRng(`s${i}`));
      expect(ANSWERS).toContain(w);
    }
  });

  it("is deterministic for a given seed (same daily puzzle worldwide)", () => {
    expect(pickAnswer(makeRng("2026-06-03"))).toBe(pickAnswer(makeRng("2026-06-03")));
  });

  it("WORD_LENGTH matches the answer length", () => {
    expect(pickAnswer(makeRng("x")).length).toBe(WORD_LENGTH);
  });
});
