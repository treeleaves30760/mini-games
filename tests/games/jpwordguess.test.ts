import { describe, it, expect } from "vitest";
import {
  WORDS,
  ANSWERS,
  KANA,
  KANA_ROWS,
  KEYBOARD_SEION,
  KEYBOARD_DAKUTEN,
  WORD_LENGTH,
  MAX_GUESSES,
  scoreGuess,
  isWin,
  isValidGuess,
  pickWord,
  parseRomaji,
  flushRomaji,
  guessNumber,
  mergeKeyStates,
  type LetterState,
} from "~/games/jpwordguess";
import { makeRng, todaySeed } from "~/utils/rng";

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

describe("on-screen keyboard layout (what the component renders)", () => {
  // The component renders KEYBOARD_SEION / KEYBOARD_DAKUTEN verbatim; null is an
  // empty grid cell. These are therefore exactly the keys a player can press.
  const KEYS = [...KEYBOARD_SEION.flat(), ...KEYBOARD_DAKUTEN.flat()].filter(
    (k): k is string => k !== null,
  );

  it("is a 5-column grid (the CSS uses repeat(5, 1fr)) with no gaps in the dakuten block", () => {
    for (const row of KEYBOARD_SEION) expect(row).toHaveLength(5);
    for (const row of KEYBOARD_DAKUTEN) {
      expect(row).toHaveLength(5);
      for (const k of row) expect(typeof k).toBe("string");
    }
  });

  it("has no duplicate keys, and every key is a single hiragana", () => {
    expect(new Set(KEYS).size).toBe(KEYS.length);
    for (const k of KEYS) {
      expect([...k]).toHaveLength(1);
      expect(k).toMatch(/^[ぁ-ゖ]$/); // hiragana block, no ー
    }
  });

  it("offers exactly the legal-guess set — the validator cannot accept an untypeable kana or reject a key", () => {
    expect(new Set(KEYS)).toEqual(new Set(KANA));
    expect(KEYS).toHaveLength(71); // 46 seion + 20 dakuten + 5 handakuten
  });

  it("can type every character of every answer", () => {
    const keys = new Set(KEYS);
    const untypeable = WORDS.filter((w) => [...w.kana].some((c) => !keys.has(c))).map((w) => w.kana);
    expect(untypeable).toEqual([]);
  });

  it("has no small kana, long-vowel mark, or katakana (none of those keys exist)", () => {
    for (const k of KEYS) expect("ゃゅょっぁぃぅぇぉー".includes(k)).toBe(false);
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

  it("gives a correct match priority over an earlier present of the same kana", () => {
    // answer あいうあ: guess あああい — あ(0) correct, あ(1) present (second あ at
    // index 3), あ(2) absent (no third あ), い(3) present.
    expect(scoreGuess("あああい", "あいうあ")).toEqual(["correct", "present", "absent", "present"]);
    // guess いあああ: あ(3) is correct and must be claimed BEFORE あ(1)/あ(2) take
    // from the pool, leaving one あ for index 1 only.
    expect(scoreGuess("いあああ", "あいうあ")).toEqual(["present", "present", "absent", "correct"]);
  });
});

describe("scoreGuess vs an independent reference implementation", () => {
  // Written from scratch (count-based instead of pool-based) so that a bug in the
  // game's two-pass scorer would show up as a disagreement.
  function referenceScore(guess: string, answer: string): LetterState[] {
    const g = [...guess];
    const a = [...answer];
    const n = a.length;
    const result: LetterState[] = Array(n).fill("absent");
    const unmatched: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      if (g[i] === a[i]) result[i] = "correct";
      else unmatched[a[i]] = (unmatched[a[i]] || 0) + 1;
    }
    for (let i = 0; i < n; i++) {
      if (result[i] === "correct") continue;
      if ((unmatched[g[i]] || 0) > 0) {
        result[i] = "present";
        unmatched[g[i]]--;
      }
    }
    return result;
  }

  // Wordle's defining property: per kana, (correct + present) count equals
  // min(occurrences in guess, occurrences in answer), and "correct" is exactly
  // the set of positional matches.
  function checkInvariants(guess: string, answer: string, states: LetterState[]) {
    const g = [...guess];
    const a = [...answer];
    expect(states).toHaveLength(a.length);
    for (let i = 0; i < a.length; i++) {
      expect(states[i] === "correct").toBe(g[i] === a[i]);
    }
    for (const c of new Set(g)) {
      const inGuess = g.filter((x) => x === c).length;
      const inAnswer = a.filter((x) => x === c).length;
      const lit = g.filter((x, i) => x === c && states[i] !== "absent").length;
      expect(lit).toBe(Math.min(inGuess, inAnswer));
    }
  }

  function randomWord(rng: ReturnType<typeof makeRng>, alphabet: string[]): string {
    return Array.from({ length: WORD_LENGTH }, () => rng.pick(alphabet)).join("");
  }

  it("agrees on thousands of random pairs from a tiny alphabet (forces repeated kana)", () => {
    const rng = makeRng("jpwordguess-audit-small");
    const alphabet = ["あ", "い", "う"];
    let pairs = 0;
    for (let t = 0; t < 6000; t++) {
      const guess = randomWord(rng, alphabet);
      const answer = randomWord(rng, alphabet);
      const states = scoreGuess(guess, answer);
      expect(states, `${guess} vs ${answer}`).toEqual(referenceScore(guess, answer));
      checkInvariants(guess, answer, states);
      pairs++;
    }
    expect(pairs).toBe(6000);
  });

  it("agrees on thousands of random pairs from the full keyboard", () => {
    const rng = makeRng("jpwordguess-audit-full");
    const alphabet = [...KANA];
    for (let t = 0; t < 6000; t++) {
      const guess = randomWord(rng, alphabet);
      const answer = randomWord(rng, alphabet);
      const states = scoreGuess(guess, answer);
      expect(states, `${guess} vs ${answer}`).toEqual(referenceScore(guess, answer));
      checkInvariants(guess, answer, states);
    }
  });

  it("agrees on every answer-vs-answer pair in the pool", () => {
    let pairs = 0;
    for (const guess of ANSWERS) {
      for (const answer of ANSWERS) {
        const states = scoreGuess(guess, answer);
        expect(states, `${guess} vs ${answer}`).toEqual(referenceScore(guess, answer));
        checkInvariants(guess, answer, states);
        pairs++;
      }
    }
    expect(pairs).toBe(ANSWERS.length ** 2);
  });
});

describe("isWin", () => {
  it("true only when every state is correct", () => {
    expect(isWin(scoreGuess("ともだち", "ともだち"))).toBe(true);
    expect(isWin(scoreGuess("ともだて", "ともだち"))).toBe(false);
    expect(isWin([])).toBe(false);
  });

  it("is equivalent to guess === answer for legal guesses (no false wins, no missed wins)", () => {
    const rng = makeRng("jpwordguess-audit-win");
    const alphabet = ["か", "き"];
    for (let t = 0; t < 2000; t++) {
      const guess = Array.from({ length: WORD_LENGTH }, () => rng.pick(alphabet)).join("");
      const answer = Array.from({ length: WORD_LENGTH }, () => rng.pick(alphabet)).join("");
      expect(isWin(scoreGuess(guess, answer))).toBe(guess === answer);
    }
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

  it("every answer is itself a valid guess (otherwise unwinnable) and fills the 4 boxes", () => {
    expect(ANSWERS.filter((k) => !isValidGuess(k))).toEqual([]);
    // The board is WORD_LENGTH boxes wide; an answer of any other length could
    // never be entered, let alone matched.
    expect(ANSWERS.filter((k) => [...k].length !== WORD_LENGTH)).toEqual([]);
  });

  it("every answer is NFC-normalised precomposed hiragana (no combining ゛゜)", () => {
    for (const k of ANSWERS) {
      expect(k, `${k} not NFC`).toBe(k.normalize("NFC"));
      expect(/[゙゚゛゜]/.test(k), `${k} has a combining mark`).toBe(false);
    }
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

  it("is deterministic for every Daily Challenge seed of a whole year, and varies across days", () => {
    // The Daily page seeds the component with todaySeed() — a "YYYY-MM-DD" string.
    const picked = new Set<string>();
    for (let i = 0; i < 365; i++) {
      const seed = todaySeed(new Date(2026, 0, 1 + i));
      expect(seed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const first = pickWord(makeRng(seed));
      const second = pickWord(makeRng(seed));
      expect(second, seed).toBe(first);
      expect(WORDS).toContain(first);
      picked.add(first.kana);
    }
    // The seed must actually steer the pick: a year should cycle through most of
    // the pool rather than repeating a handful of words.
    expect(picked.size).toBeGreaterThanOrEqual(WORDS.length / 2);
  });

  it("accepts a numeric seed too (the component prop allows String | Number)", () => {
    expect(pickWord(makeRng(20260829))).toBe(pickWord(makeRng(20260829)));
    expect(WORDS).toContain(pickWord(makeRng(20260829)));
  });
});

describe("guessNumber — the HUD counter clamp", () => {
  it("counts 1..MAX_GUESSES while playing", () => {
    for (let row = 0; row < MAX_GUESSES; row++) expect(guessNumber(row)).toBe(row + 1);
  });

  it("never exceeds MAX_GUESSES after a loss advances past the last row (regression: showed 7 / 6)", () => {
    expect(guessNumber(MAX_GUESSES)).toBe(MAX_GUESSES);
    expect(guessNumber(MAX_GUESSES + 10)).toBe(MAX_GUESSES);
  });

  it("never drops below 1", () => {
    expect(guessNumber(-1)).toBe(1);
    expect(guessNumber(-100)).toBe(1);
  });
});

describe("mergeKeyStates — keyboard colours", () => {
  it("colours untouched keys from a scored guess and leaves the input untouched", () => {
    const prev: Record<string, LetterState> = {};
    const next = mergeKeyStates(prev, "みのもの", scoreGuess("みのもの", "のみもの"));
    expect(next).toEqual({ み: "present", の: "correct", も: "correct" });
    expect(prev).toEqual({});
  });

  it("only ever upgrades: absent → present → correct, never back down", () => {
    let keys: Record<string, LetterState> = {};
    keys = mergeKeyStates(keys, "あいうえ", ["absent", "present", "correct", "absent"]);
    keys = mergeKeyStates(keys, "あいうえ", ["present", "absent", "absent", "correct"]);
    expect(keys).toEqual({ あ: "present", い: "present", う: "correct", え: "correct" });
    keys = mergeKeyStates(keys, "あいうえ", ["correct", "correct", "absent", "absent"]);
    expect(keys).toEqual({ あ: "correct", い: "correct", う: "correct", え: "correct" });
  });

  it("resolves a kana repeated within one guess to its best state, regardless of order", () => {
    // のののの vs のみもの → [correct, absent, absent, correct]: の must end up correct.
    expect(mergeKeyStates({}, "のののの", scoreGuess("のののの", "のみもの"))).toEqual({ の: "correct" });
    // Absent first, then present later in the same guess.
    expect(mergeKeyStates({}, "ああいい", ["absent", "present", "absent", "absent"])).toEqual({
      あ: "present",
      い: "absent",
    });
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

  it("reads a bare n before another consonant as ん (ninjin → にんじん, no nn needed)", () => {
    expect(parseRomaji("ninjin")).toEqual({ kana: ["に", "ん", "じ"], rest: "n" });
    expect(parseRomaji("tenpura")).toEqual({ kana: ["て", "ん", "ぷ", "ら"], rest: "" });
    expect(parseRomaji("ginkou")).toEqual({ kana: ["ぎ", "ん", "こ", "う"], rest: "" });
    expect(parseRomaji("shinbun")).toEqual({ kana: ["し", "ん", "ぶ"], rest: "n" });
    // Mid-word, a lone "n" followed by a consonant converts immediately.
    expect(parseRomaji("nk")).toEqual({ kana: ["ん"], rest: "k" });
  });

  it("still lets a bare n combine with a following vowel, y or n", () => {
    expect(parseRomaji("na")).toEqual({ kana: ["な"], rest: "" });
    expect(parseRomaji("ny")).toEqual({ kana: [], rest: "ny" });
    expect(parseRomaji("nna")).toEqual({ kana: ["ん", "あ"], rest: "" });
    // A consonant that starts no syllable does not break the n either.
    expect(parseRomaji("nx")).toEqual({ kana: [], rest: "nx" });
  });
});

describe("flushRomaji — committing the buffer on Enter", () => {
  it("turns a trailing bare n into ん", () => {
    expect(flushRomaji("kaidan")).toEqual(["か", "い", "だ", "ん"]);
    expect(flushRomaji("n")).toEqual(["ん"]);
  });

  it("drops any other unfinished fragment", () => {
    expect(flushRomaji("kak")).toEqual(["か"]);
    expect(flushRomaji("x")).toEqual([]);
    expect(flushRomaji("")).toEqual([]);
  });
});

describe("every answer is typeable on a physical keyboard", () => {
  // Reverse of the ROMAJI table, built independently here (Hepburn spellings).
  const KANA_TO_ROMAJI: Record<string, string> = {};
  const TABLE: Record<string, string> = {
    a: "あ", i: "い", u: "う", e: "え", o: "お",
    ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
    sa: "さ", shi: "し", su: "す", se: "せ", so: "そ",
    ta: "た", chi: "ち", tsu: "つ", te: "て", to: "と",
    na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
    ha: "は", hi: "ひ", fu: "ふ", he: "へ", ho: "ほ",
    ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
    ya: "や", yu: "ゆ", yo: "よ",
    ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
    wa: "わ", wo: "を",
    ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
    za: "ざ", ji: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
    da: "だ", di: "ぢ", du: "づ", de: "で", do: "ど",
    ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
    pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
  };
  for (const [r, k] of Object.entries(TABLE)) KANA_TO_ROMAJI[k] = r;

  // Mirrors JpWordGuessGame.onKey + flushPending: each keystroke re-parses the
  // pending buffer, completed kana leave the buffer, Enter flushes what is left.
  function typeThenEnter(text: string): string {
    let pending = "";
    const out: string[] = [];
    for (const ch of text) {
      pending += ch;
      const { kana, rest } = parseRomaji(pending);
      out.push(...kana);
      pending = rest;
    }
    out.push(...flushRomaji(pending));
    return out.join("");
  }

  it("the reverse table covers every kana on the keyboard except ん", () => {
    for (const k of KANA) {
      if (k === "ん") continue;
      expect(KANA_TO_ROMAJI[k], `${k} has no romaji`).toBeTruthy();
    }
  });

  it("with the explicit nn spelling", () => {
    for (const w of ANSWERS) {
      const romaji = [...w].map((k) => (k === "ん" ? "nn" : KANA_TO_ROMAJI[k])).join("");
      expect(typeThenEnter(romaji), `${w} via ${romaji}`).toBe(w);
    }
  });

  it("with the natural single-n spelling (ninjin, shinbun, hontou…)", () => {
    // Regression: 11 of the 13 ん-words used to get stuck as "n" + consonant.
    let withN = 0;
    for (const w of ANSWERS) {
      const romaji = [...w].map((k) => (k === "ん" ? "n" : KANA_TO_ROMAJI[k])).join("");
      if (w.includes("ん")) withN++;
      expect(typeThenEnter(romaji), `${w} via ${romaji}`).toBe(w);
    }
    expect(withN).toBeGreaterThan(0);
  });

  it("using the word's own Hepburn reading with macrons expanded (otōto → otouto)", () => {
    // The reveal card shows e.g. "kōmori"; a learner will type "koumori". Only
    // the long-o/long-u macron forms occur in this pool.
    for (const w of WORDS) {
      const typed = w.romaji.replace(/ō/g, "ou").replace(/ū/g, "uu");
      expect(typed, `${w.kana} romaji ${w.romaji} still has a macron`).toMatch(/^[a-z]+$/);
      expect(typeThenEnter(typed), `${w.kana} via ${typed}`).toBe(w.kana);
    }
  });
});
