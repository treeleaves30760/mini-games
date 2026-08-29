import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import {
  WORD_LENGTHS,
  DEFAULT_LENGTH,
  guessesFor,
  scoreGuess,
  isWin,
  isValidWord,
  validateGuess,
  mergeKeyStates,
  roundOutcome,
  pickAnswer,
  definitionOf,
  loadWordPack,
  type WordPack,
  type WordLength,
  type LetterState,
  type RoundOutcome,
} from "~/games/wordguess";
import { makeRng, todaySeed } from "~/utils/rng";
// The raw generated data, imported directly so the solvability checks below do
// not depend on loadWordPack() — the loader unions ANSWERS into `valid` itself,
// which would make a pack-level "every answer is valid" check tautological.
import * as raw5 from "~/games/wordguessWords5";
import * as raw6 from "~/games/wordguessWords6";
import * as raw7 from "~/games/wordguessWords7";
import * as raw8 from "~/games/wordguessWords8";

interface RawData {
  ANSWERS: string[];
  DEFINITIONS: Record<string, string>;
  VALID_GUESSES: string[];
}
const RAW: Record<WordLength, RawData> = { 5: raw5, 6: raw6, 7: raw7, 8: raw8 };

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

  it("exposes the generated data unchanged (answers, glosses, guess list)", () => {
    for (const len of WORD_LENGTHS) {
      const pack = packs[len];
      expect(pack.answers).toBe(RAW[len].ANSWERS);
      expect(pack.definitions).toBe(RAW[len].DEFINITIONS);
      for (const w of RAW[len].VALID_GUESSES) expect(pack.valid.has(w)).toBe(true);
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

describe("validateGuess — what the component's submit path enforces", () => {
  it("reports 'short' for a partially filled row", () => {
    expect(validateGuess("", packs[5])).toBe("short");
    expect(validateGuess("WORL", packs[5])).toBe("short");
    expect(validateGuess("COMPUTE", packs[8])).toBe("short");
  });

  it("reports 'unknown' for a full row that is not in the dictionary", () => {
    expect(validateGuess("ZZZZZ", packs[5])).toBe("unknown");
    expect(validateGuess("QQQQQQQQ", packs[8])).toBe("unknown");
    // longer than the row can never be in this length's dictionary
    expect(validateGuess("WORLDS", packs[5])).toBe("unknown");
  });

  it("returns null for a dictionary word, case-insensitive", () => {
    expect(validateGuess("WORLD", packs[5])).toBeNull();
    expect(validateGuess("world", packs[5])).toBeNull();
    expect(validateGuess("planet", packs[6])).toBeNull();
    expect(validateGuess("COMPUTER", packs[8])).toBeNull();
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

// ---------------------------------------------------------------------------
// Independent solvability audit. These deliberately avoid trusting the loader
// or scoreGuess: they read the generated data directly and compare the game's
// scoring against a from-scratch reference implementation.
// ---------------------------------------------------------------------------

describe("solvability — every possible answer can be entered as a guess", () => {
  it("raw data: every ANSWERS entry is already in VALID_GUESSES for its length", () => {
    for (const len of WORD_LENGTHS) {
      const valid = new Set(RAW[len].VALID_GUESSES);
      const missing = RAW[len].ANSWERS.filter((w) => !valid.has(w));
      expect(missing, `${len}-letter answers absent from VALID_GUESSES`).toEqual([]);
    }
  });

  it("the game's validator accepts every answer of every length, in either case", () => {
    let checked = 0;
    for (const len of WORD_LENGTHS) {
      const pack = packs[len];
      const rejected = pack.answers.filter(
        (w) =>
          validateGuess(w, pack) !== null ||
          validateGuess(w.toLowerCase(), pack) !== null ||
          !isValidWord(w, pack),
      );
      expect(rejected, `${len}-letter answers the validator rejects`).toEqual([]);
      checked += pack.answers.length;
    }
    // 980 + 913 + 837 + 646 answers at the time of writing; guard against an
    // accidentally emptied pool without pinning the exact generator output.
    expect(checked).toBeGreaterThan(3000);
  });

  it("every answer is typeable on the game's A–Z keyboard and fills its row exactly", () => {
    for (const len of WORD_LENGTHS) {
      const re = new RegExp(`^[A-Z]{${len}}$`);
      const untypeable = RAW[len].ANSWERS.filter((w) => !re.test(w));
      expect(untypeable, `${len}-letter answers with non A–Z or wrong length`).toEqual([]);
    }
  });
});

describe("answer-pool hygiene (raw generated data)", () => {
  it("answers are unique within a length and every one has a non-empty gloss", () => {
    for (const len of WORD_LENGTHS) {
      const { ANSWERS, DEFINITIONS } = RAW[len];
      expect(ANSWERS.length).toBeGreaterThan(500);
      expect(new Set(ANSWERS).size).toBe(ANSWERS.length);
      const noGloss = ANSWERS.filter((w) => !(DEFINITIONS[w] ?? "").trim());
      expect(noGloss, `${len}-letter answers without a gloss`).toEqual([]);
    }
  });

  it("the valid-guess list has no duplicates and only exact-length A–Z words", () => {
    for (const len of WORD_LENGTHS) {
      const list = RAW[len].VALID_GUESSES;
      const re = new RegExp(`^[A-Z]{${len}}$`);
      expect(new Set(list).size).toBe(list.length);
      expect(list.filter((w) => !re.test(w))).toEqual([]);
      expect(list.length).toBeGreaterThan(5000);
    }
  });

  it("no word of one length is stored in another length's pool", () => {
    for (const len of WORD_LENGTHS) {
      for (const other of WORD_LENGTHS) {
        if (other === len) continue;
        const leaked = RAW[len].ANSWERS.filter((w) => w.length === other);
        expect(leaked).toEqual([]);
      }
    }
  });
});

/* From-scratch Wordle scorer used as an oracle: count the answer's letters that
   are NOT exact matches, then hand each remaining guess letter a "present" only
   while that count lasts. Algorithmically different from scoreGuess (which
   consumes from a positional pool), so agreement is meaningful. */
function referenceScore(guess: string, answer: string): LetterState[] {
  const g = guess.toUpperCase();
  const a = answer.toUpperCase();
  const spare: Record<string, number> = {};
  for (let i = 0; i < a.length; i++) {
    if (g[i] !== a[i]) spare[a[i] as string] = (spare[a[i] as string] ?? 0) + 1;
  }
  const out: LetterState[] = [];
  for (let i = 0; i < a.length; i++) {
    const c = g[i] as string;
    if (c === a[i]) out.push("correct");
    else if ((spare[c] ?? 0) > 0) {
      out.push("present");
      spare[c] = (spare[c] as number) - 1;
    } else out.push("absent");
  }
  return out;
}

describe("scoreGuess agrees with an independent reference scorer", () => {
  it("hand-checked duplicate-letter cases", () => {
    // answer ABBEY, guess BABES: B present, A present, B correct, E correct, S absent
    expect(scoreGuess("BABES", "ABBEY")).toEqual(["present", "present", "correct", "correct", "absent"]);
    // one E in the answer, two in the guess: first E present, second E absent
    expect(scoreGuess("SPEED", "ABIDE")).toEqual(["absent", "absent", "present", "absent", "present"]);
    // two E's on both sides: both light up as present
    expect(scoreGuess("ERASE", "SPEED")).toEqual(["present", "absent", "absent", "present", "present"]);
    // answer LLAMA, guess ALLEY: A present, L correct, L present, E absent, Y absent
    expect(scoreGuess("ALLEY", "LLAMA")).toEqual(["present", "correct", "present", "absent", "absent"]);
    // the later copy is the exact match; the earlier copy must not steal it
    expect(scoreGuess("EERIE", "ABIDE")).toEqual(["absent", "absent", "absent", "present", "correct"]);
    for (const [g, a] of [
      ["BABES", "ABBEY"],
      ["SPEED", "ABIDE"],
      ["ERASE", "SPEED"],
      ["ALLEY", "LLAMA"],
      ["EERIE", "ABIDE"],
    ] as const) {
      expect(referenceScore(g, a)).toEqual(scoreGuess(g, a));
    }
  });

  it("agrees on thousands of random answer/guess pairs from the real dictionaries", () => {
    const rng = makeRng("feedback-fuzz");
    const mismatches: string[] = [];
    let checked = 0;
    for (const len of WORD_LENGTHS) {
      const pack = packs[len];
      const validArr = [...pack.valid];
      for (let i = 0; i < 1500; i++) {
        const answer = rng.pick(pack.answers);
        const guess = rng.pick(validArr);
        const got = scoreGuess(guess, answer);
        const want = referenceScore(guess, answer);
        if (got.join() !== want.join()) mismatches.push(`${guess} vs ${answer}: ${got} != ${want}`);
        checked++;
      }
    }
    expect(mismatches).toEqual([]);
    expect(checked).toBe(6000);
  });

  it("agrees on duplicate-heavy synthetic pairs and never over-credits a letter", () => {
    // A three-letter alphabet forces repeats in almost every word, which is
    // exactly where naive scorers go wrong.
    const rng = makeRng("dup-fuzz");
    const alphabet = ["A", "B", "C"];
    const word = (n: number) => Array.from({ length: n }, () => rng.pick(alphabet)).join("");
    const mismatches: string[] = [];
    for (let i = 0; i < 3000; i++) {
      const n = rng.int(5, 8);
      const a = word(n);
      const g = word(n);
      const got = scoreGuess(g, a);
      if (got.join() !== referenceScore(g, a).join()) mismatches.push(`${g} vs ${a}`);
      // Property: per letter, lit tiles (correct + present) == min(count in guess, count in answer).
      for (const c of alphabet) {
        const inGuess = [...g].filter((x) => x === c).length;
        const inAnswer = [...a].filter((x) => x === c).length;
        const lit = got.filter((s, k) => g[k] === c && s !== "absent").length;
        if (lit !== Math.min(inGuess, inAnswer)) mismatches.push(`${g} vs ${a}: ${c} lit ${lit}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("Daily Challenge seed — deterministic, Math.random-free", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a YYYY-MM-DD seed picks the same answer every time for every length, without Math.random", () => {
    const first = {} as Record<WordLength, string>;
    for (const len of WORD_LENGTHS) first[len] = pickAnswer(makeRng("2026-08-29"), packs[len]);

    const spy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random must not influence a seeded pick");
    });
    for (let i = 0; i < 5; i++) {
      for (const len of WORD_LENGTHS) {
        const w = pickAnswer(makeRng("2026-08-29"), packs[len]);
        expect(w).toBe(first[len]);
        expect(packs[len].answers).toContain(w);
      }
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("the todaySeed() string the daily page passes is exactly what fixes the puzzle", () => {
    const seed = todaySeed(new Date(2026, 7, 29));
    expect(seed).toBe("2026-08-29");
    expect(pickAnswer(makeRng(seed), packs[DEFAULT_LENGTH])).toBe(
      pickAnswer(makeRng("2026-08-29"), packs[DEFAULT_LENGTH]),
    );
  });

  it("different days give different puzzles (the seed really drives the pick)", () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 30; d++) {
      seen.add(pickAnswer(makeRng(`2026-09-${String(d).padStart(2, "0")}`), packs[DEFAULT_LENGTH]));
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it("free play (no seed) draws from Math.random and still returns a pool member", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.123456);
    const w = pickAnswer(makeRng(null), packs[5]);
    expect(spy).toHaveBeenCalled();
    expect(packs[5].answers).toContain(w);
  });
});

describe("round rules — win only on an exact match, attempt limit as displayed", () => {
  it("wins iff the guess equals the answer; anagrams and near-misses never win", () => {
    expect(roundOutcome(scoreGuess("LISTEN", "LISTEN"), 0, 7)).toBe("won");
    expect(roundOutcome(scoreGuess("SILENT", "LISTEN"), 0, 7)).toBe("playing");
    expect(roundOutcome(scoreGuess("WORDS", "WORLD"), 0, 6)).toBe("playing");
    expect(roundOutcome(scoreGuess("WORDS", "WORLD"), 5, 6)).toBe("lost");
    expect(roundOutcome([], 0, 6)).toBe("playing"); // an empty score is never a win

    const rng = makeRng("win-fuzz");
    for (const len of WORD_LENGTHS) {
      const pack = packs[len];
      const validArr = [...pack.valid];
      for (let i = 0; i < 500; i++) {
        const answer = rng.pick(pack.answers);
        const guess = rng.bool(0.1) ? answer : rng.pick(validArr);
        const outcome = roundOutcome(scoreGuess(guess, answer), 0, pack.maxGuesses);
        expect(outcome === "won", `${guess} vs ${answer}`).toBe(guess === answer);
      }
    }
  });

  it("every length allows exactly guessesFor(len) attempts — the number the HUD, hint and board show", () => {
    for (const len of WORD_LENGTHS) {
      const pack = packs[len];
      const max = pack.maxGuesses;
      expect(max).toBe(guessesFor(len));

      const answer = pickAnswer(makeRng(`limit-${len}`), pack);
      const wrong = [...pack.valid].find((w) => w !== answer) as string;

      // Drive a round the way the component does: score the current row, then
      // ask where the round stands before moving to the next row.
      let row = 0;
      let outcome: RoundOutcome = "playing";
      while (outcome === "playing") {
        outcome = roundOutcome(scoreGuess(wrong, answer), row, max);
        row++;
      }
      expect(outcome).toBe("lost");
      expect(row).toBe(max); // exactly `max` rows were consumed — no more, no fewer

      // a correct guess on the very last row still wins…
      expect(roundOutcome(scoreGuess(answer, answer), max - 1, max)).toBe("won");
      // …and a wrong guess before the last row keeps the round open
      expect(roundOutcome(scoreGuess(wrong, answer), max - 2, max)).toBe("playing");
    }
  });
});

describe("mergeKeyStates — keyboard colours only ever upgrade", () => {
  it("colours each guessed key and keeps the best state seen so far", () => {
    // SPEED vs ABIDE: S absent, P absent, E present, E absent, D present
    let keys = mergeKeyStates({}, "SPEED", scoreGuess("SPEED", "ABIDE"));
    expect(keys).toEqual({ S: "absent", P: "absent", E: "present", D: "present" });

    keys = mergeKeyStates(keys, "abide", scoreGuess("ABIDE", "ABIDE"));
    expect(keys.E).toBe("correct");
    expect(keys.D).toBe("correct");
    expect(keys.S).toBe("absent"); // untouched keys keep their state

    // a later guess that misplaces E must not demote the green key
    keys = mergeKeyStates(keys, "EERIE", scoreGuess("EERIE", "ABIDE"));
    expect(keys.E).toBe("correct");
    expect(keys.R).toBe("absent");
  });

  it("a letter repeated within one guess takes its best tile, whichever copy it is", () => {
    // EERIE vs ABIDE: the first two E's are absent, the last E is correct
    expect(mergeKeyStates({}, "EERIE", scoreGuess("EERIE", "ABIDE")).E).toBe("correct");
    // SPEED vs ABIDE: first E present, second E absent → present wins
    expect(mergeKeyStates({}, "SPEED", scoreGuess("SPEED", "ABIDE")).E).toBe("present");
  });

  it("returns a new map and leaves the previous one untouched", () => {
    const prev: Record<string, LetterState> = { A: "present" };
    const next = mergeKeyStates(prev, "ABOUT", scoreGuess("ABOUT", "ABOUT"));
    expect(prev).toEqual({ A: "present" });
    expect(next).not.toBe(prev);
    expect(next.A).toBe("correct");
  });
});
