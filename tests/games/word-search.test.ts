import { describe, it, expect } from "vitest";
import {
  GRID_SIZE,
  WORD_COUNT,
  DIRS,
  BANKS,
  buildGrid,
  findPlacements,
  getLineCells,
  cellsToWord,
  checkSelection,
  isWinState,
  readPlacedWord,
} from "~/games/word-search";
import type { Cell, PlacedWord } from "~/games/word-search";
import { makeRng } from "~/utils/rng";
import type { Rng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// BANKS & constants
// ---------------------------------------------------------------------------

describe("BANKS / constants", () => {
  it("GRID_SIZE is 12", () => {
    expect(GRID_SIZE).toBe(12);
  });

  it("WORD_COUNT is 8", () => {
    expect(WORD_COUNT).toBe(8);
  });

  it("DIRS contains exactly 8 entries", () => {
    expect(DIRS).toHaveLength(8);
  });

  it("every DIRS entry is a pair of integers in {-1,0,1}", () => {
    for (const [dr, dc] of DIRS) {
      expect([-1, 0, 1]).toContain(dr);
      expect([-1, 0, 1]).toContain(dc);
    }
  });

  it("DIRS has no duplicate directions", () => {
    const keys = DIRS.map(([r, c]) => `${r},${c}`);
    expect(new Set(keys).size).toBe(DIRS.length);
  });

  it("all four word banks are present", () => {
    expect(Object.keys(BANKS)).toEqual(
      expect.arrayContaining(["ANIMALS", "FRUITS", "SPACE", "COLORS"])
    );
  });

  it("every bank has a label and at least WORD_COUNT words", () => {
    for (const [key, bank] of Object.entries(BANKS)) {
      expect(typeof bank.label, `${key}.label`).toBe("string");
      expect(bank.words.length, `${key} word count`).toBeGreaterThanOrEqual(WORD_COUNT);
    }
  });

  it("all bank words are uppercase ASCII letters only", () => {
    for (const [key, bank] of Object.entries(BANKS)) {
      for (const w of bank.words) {
        expect(/^[A-Z]+$/.test(w), `${key}: '${w}' must be uppercase letters`).toBe(true);
      }
    }
  });

  it("all bank words fit in the grid (length <= GRID_SIZE)", () => {
    for (const [key, bank] of Object.entries(BANKS)) {
      for (const w of bank.words) {
        expect(w.length, `${key}: '${w}' too long`).toBeLessThanOrEqual(GRID_SIZE);
      }
    }
  });

  it("all bank words have at least 2 letters (checkSelection needs >= 2 cells)", () => {
    // A 1-letter word could never be selected: checkSelection rejects
    // selections shorter than 2 cells, so such a word would be unfindable.
    for (const [key, bank] of Object.entries(BANKS)) {
      for (const w of bank.words) {
        expect(w.length, `${key}: '${w}' too short to select`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("no bank contains duplicate words or a word that is another word reversed", () => {
    // checkSelection matches a selection against both the forward and the
    // reversed reading, so two listed words that are reverses of each other
    // (or the same word twice) would compete for one selection.
    for (const [key, bank] of Object.entries(BANKS)) {
      expect(new Set(bank.words).size, `${key} has duplicate words`).toBe(bank.words.length);
      for (const w of bank.words) {
        const rev = w.split("").reverse().join("");
        expect(
          bank.words.filter((o) => o !== w && o === rev),
          `${key}: '${w}' and its reverse are both listed`
        ).toHaveLength(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// buildGrid — structure & determinism
// ---------------------------------------------------------------------------

describe("buildGrid — structure", () => {
  it("returns a GRID_SIZE×GRID_SIZE grid of uppercase letters with no blanks", () => {
    const { grid } = buildGrid(makeRng("struct-test"));
    expect(grid).toHaveLength(GRID_SIZE);
    for (let r = 0; r < GRID_SIZE; r++) {
      expect(grid[r]).toHaveLength(GRID_SIZE);
      for (let c = 0; c < GRID_SIZE; c++) {
        expect(/^[A-Z]$/.test(grid[r][c]), `cell [${r}][${c}]='${grid[r][c]}'`).toBe(true);
      }
    }
  });

  it("returns exactly WORD_COUNT target words", () => {
    const { wordList } = buildGrid(makeRng("words-test"));
    expect(wordList).toHaveLength(WORD_COUNT);
  });

  it("all returned wordList entries are uppercase letters", () => {
    const { wordList } = buildGrid(makeRng("words-fmt"));
    for (const w of wordList) {
      expect(/^[A-Z]+$/.test(w)).toBe(true);
    }
  });

  it("wordList entries come from the chosen bank", () => {
    // Every word in wordList must exist in at least one bank.
    const allWords = new Set(
      Object.values(BANKS).flatMap((b) => b.words)
    );
    const { wordList } = buildGrid(makeRng("bank-check"));
    for (const w of wordList) {
      expect(allWords.has(w), `'${w}' not from any bank`).toBe(true);
    }
  });

  it("returns a bankLabel that matches one of the bank labels", () => {
    const labels = new Set(Object.values(BANKS).map((b) => b.label));
    const { bankLabel } = buildGrid(makeRng("label-check"));
    expect(labels.has(bankLabel)).toBe(true);
  });

  it("wordList is exactly the placed words, in placement order", () => {
    const { wordList, placedWords } = buildGrid(makeRng("place-count"));
    expect(placedWords).toHaveLength(WORD_COUNT);
    expect(wordList).toEqual(placedWords.map((p) => p.word));
  });
});

// ---------------------------------------------------------------------------
// buildGrid — determinism across multiple seeds
// ---------------------------------------------------------------------------

describe("buildGrid — determinism", () => {
  const SEEDS = ["2026-01-01", "hello-world", "42", "seed-xyz", "test-abc"];

  for (const seed of SEEDS) {
    it(`same seed '${seed}' always produces identical grids`, () => {
      const a = buildGrid(makeRng(seed));
      const b = buildGrid(makeRng(seed));
      expect(a.grid).toEqual(b.grid);
      expect(a.wordList).toEqual(b.wordList);
      expect(a.bankLabel).toBe(b.bankLabel);
      expect(a.placedWords).toEqual(b.placedWords);
    });
  }

  it("different seeds produce different grids (statistical near-certainty)", () => {
    const grids = SEEDS.map((s) => JSON.stringify(buildGrid(makeRng(s)).grid));
    const unique = new Set(grids);
    expect(unique.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// buildGrid — placed-word correctness (the core placement invariant)
// ---------------------------------------------------------------------------
//
// For EVERY placed word, reading the grid cells along the recorded
// start+direction must spell the word exactly.  We check this across
// several seeds so a lucky single-seed pass cannot mask a bug.

describe("buildGrid — every placed word spells correctly in the grid", () => {
  const SEEDS_VERIFY = [
    "verify-0",
    "verify-1",
    "verify-2",
    "verify-3",
    "verify-4",
    "2026-06-03",
    "animals-seed",
    "fruits-seed",
  ];

  for (const seed of SEEDS_VERIFY) {
    it(`seed '${seed}': all placed words read back correctly`, () => {
      const { grid, placedWords } = buildGrid(makeRng(seed));
      for (const pw of placedWords) {
        const read = readPlacedWord(pw, grid);
        expect(read, `word '${pw.word}' at [${pw.start.r},${pw.start.c}] dir [${pw.dir}]`).toBe(pw.word);
      }
    });
  }

  it("placed-word cells are within grid bounds", () => {
    const { placedWords } = buildGrid(makeRng("bounds-check"));
    for (const pw of placedWords) {
      for (let i = 0; i < pw.word.length; i++) {
        const r = pw.start.r + pw.dir[0] * i;
        const c = pw.start.c + pw.dir[1] * i;
        expect(r, `row out of bounds for '${pw.word}'`).toBeGreaterThanOrEqual(0);
        expect(r, `row out of bounds for '${pw.word}'`).toBeLessThan(GRID_SIZE);
        expect(c, `col out of bounds for '${pw.word}'`).toBeGreaterThanOrEqual(0);
        expect(c, `col out of bounds for '${pw.word}'`).toBeLessThan(GRID_SIZE);
      }
    }
  });

  it("placed directions are one of the 8 DIRS entries", () => {
    const dirSet = new Set(DIRS.map(([r, c]) => `${r},${c}`));
    const { placedWords } = buildGrid(makeRng("dir-check"));
    for (const pw of placedWords) {
      const key = `${pw.dir[0]},${pw.dir[1]}`;
      expect(dirSet.has(key), `direction [${pw.dir}] not in DIRS`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// findPlacements — exhaustive legal-placement enumeration
// ---------------------------------------------------------------------------

describe("findPlacements", () => {
  const emptyGrid = (n: number): string[][] =>
    Array.from({ length: n }, () => Array(n).fill(""));

  it("on an empty 3×3 grid a 3-letter word has 16 placements (3 rows + 3 cols + 2 diagonals, both ways)", () => {
    const options = findPlacements(emptyGrid(3), "CAT");
    expect(options).toHaveLength(16);
    // Every option is a distinct (start, dir) pair and stays inside the grid.
    const keys = new Set(options.map((o) => `${o.start.r},${o.start.c},${o.dir[0]},${o.dir[1]}`));
    expect(keys.size).toBe(16);
    for (const o of options) {
      expect(o.word).toBe("CAT");
      const er = o.start.r + o.dir[0] * 2;
      const ec = o.start.c + o.dir[1] * 2;
      expect(er).toBeGreaterThanOrEqual(0);
      expect(er).toBeLessThan(3);
      expect(ec).toBeGreaterThanOrEqual(0);
      expect(ec).toBeLessThan(3);
    }
  });

  it("a conflicting letter removes every placement that crosses it", () => {
    const g = emptyGrid(3);
    g[1][1] = "Z";
    // The 8 lines through the centre are blocked; the 8 edge placements remain.
    const options = findPlacements(g, "CAT");
    expect(options).toHaveLength(8);
    for (const o of options) {
      for (let i = 0; i < 3; i++) {
        expect(`${o.start.r + o.dir[0] * i},${o.start.c + o.dir[1] * i}`).not.toBe("1,1");
      }
    }
  });

  it("a matching letter already in the grid may be shared (words can cross)", () => {
    const g = emptyGrid(3);
    g[1][1] = "A";
    // 'A' is the middle letter of CAT, so all 16 placements are still legal.
    expect(findPlacements(g, "CAT")).toHaveLength(16);
  });

  it("returns no placement on a completely filled grid", () => {
    const g = Array.from({ length: 3 }, () => Array(3).fill("X"));
    expect(findPlacements(g, "CAT")).toEqual([]);
  });

  it("returns no placement for a word longer than the grid", () => {
    expect(findPlacements(emptyGrid(3), "BEAR")).toEqual([]);
  });

  it("every returned placement reads back as the word once written", () => {
    const { grid } = buildGrid(makeRng("fp-readback"));
    for (const o of findPlacements(grid, "OWL")) {
      // Only accepted where the letters already match on a full grid.
      expect(readPlacedWord(o, grid)).toBe("OWL");
    }
  });
});

// ---------------------------------------------------------------------------
// getLineCells
// ---------------------------------------------------------------------------

describe("getLineCells", () => {
  it("horizontal right: returns correct cells", () => {
    const cells = getLineCells({ r: 2, c: 1 }, { r: 2, c: 4 });
    expect(cells).toEqual([
      { r: 2, c: 1 },
      { r: 2, c: 2 },
      { r: 2, c: 3 },
      { r: 2, c: 4 },
    ]);
  });

  it("horizontal left: returns cells in drag order (start→end)", () => {
    const cells = getLineCells({ r: 3, c: 5 }, { r: 3, c: 2 });
    expect(cells).toEqual([
      { r: 3, c: 5 },
      { r: 3, c: 4 },
      { r: 3, c: 3 },
      { r: 3, c: 2 },
    ]);
  });

  it("vertical down: correct cells", () => {
    const cells = getLineCells({ r: 0, c: 3 }, { r: 3, c: 3 });
    expect(cells).toEqual([
      { r: 0, c: 3 },
      { r: 1, c: 3 },
      { r: 2, c: 3 },
      { r: 3, c: 3 },
    ]);
  });

  it("diagonal down-right: correct cells", () => {
    const cells = getLineCells({ r: 1, c: 1 }, { r: 3, c: 3 });
    expect(cells).toEqual([
      { r: 1, c: 1 },
      { r: 2, c: 2 },
      { r: 3, c: 3 },
    ]);
  });

  it("diagonal up-left: correct cells", () => {
    const cells = getLineCells({ r: 3, c: 3 }, { r: 1, c: 1 });
    expect(cells).toEqual([
      { r: 3, c: 3 },
      { r: 2, c: 2 },
      { r: 1, c: 1 },
    ]);
  });

  it("single cell (same start and end): returns one cell", () => {
    const cells = getLineCells({ r: 2, c: 2 }, { r: 2, c: 2 });
    expect(cells).toEqual([{ r: 2, c: 2 }]);
  });

  it("non-axis-aligned path returns null", () => {
    // (0,0) → (1,2) is not 8-directional
    expect(getLineCells({ r: 0, c: 0 }, { r: 1, c: 2 })).toBeNull();
    expect(getLineCells({ r: 0, c: 0 }, { r: 2, c: 1 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cellsToWord
// ---------------------------------------------------------------------------

describe("cellsToWord", () => {
  const mockGrid = [
    ["C", "A", "T", "X"],
    ["D", "O", "G", "X"],
    ["X", "X", "X", "X"],
  ];

  it("reads horizontal word correctly", () => {
    const cells = [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }];
    expect(cellsToWord(cells, mockGrid)).toBe("CAT");
  });

  it("reads diagonal word correctly", () => {
    // C(0,0) O(1,1) X(2,2)
    const cells = [{ r: 0, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 2 }];
    expect(cellsToWord(cells, mockGrid)).toBe("COX");
  });

  it("empty cell array returns empty string", () => {
    expect(cellsToWord([], mockGrid)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// checkSelection — found-word detection
// ---------------------------------------------------------------------------

describe("checkSelection — found-word detection", () => {
  // Use a real generated puzzle for the detection tests.
  const SEED = "selection-test";
  const { grid, wordList, placedWords } = buildGrid(makeRng(SEED));

  it("selecting exact cells of a placed word registers it as found", () => {
    const pw = placedWords[0];
    const cells = [];
    for (let i = 0; i < pw.word.length; i++) {
      cells.push({ r: pw.start.r + pw.dir[0] * i, c: pw.start.c + pw.dir[1] * i });
    }
    const result = checkSelection(cells, grid, wordList, new Set());
    expect(result).toBe(pw.word);
  });

  it("selecting exact cells of every placed word registers each one", () => {
    const found = new Set<string>();
    for (const pw of placedWords) {
      const cells = [];
      for (let i = 0; i < pw.word.length; i++) {
        cells.push({ r: pw.start.r + pw.dir[0] * i, c: pw.start.c + pw.dir[1] * i });
      }
      const result = checkSelection(cells, grid, wordList, found);
      expect(result, `should find '${pw.word}'`).toBe(pw.word);
      found.add(pw.word);
    }
  });

  it("selecting a placed word in reverse (end→start) also registers it", () => {
    const pw = placedWords[0];
    // Build forward cells then reverse them.
    const cells = [];
    for (let i = 0; i < pw.word.length; i++) {
      cells.push({ r: pw.start.r + pw.dir[0] * i, c: pw.start.c + pw.dir[1] * i });
    }
    const reversed = [...cells].reverse();
    const result = checkSelection(reversed, grid, wordList, new Set());
    expect(result).toBe(pw.word);
  });

  it("selecting fewer cells than a word length returns null", () => {
    const pw = placedWords[0];
    // Only first cell — too short to be any word (min length 3).
    const result = checkSelection([{ r: pw.start.r, c: pw.start.c }], grid, wordList, new Set());
    expect(result).toBeNull();
  });

  it("selecting random row cells that form no word returns null", () => {
    // Row 0, all cells — this is 12 chars and should not spell any target word.
    const cells = Array.from({ length: GRID_SIZE }, (_, c) => ({ r: 0, c }));
    const result = checkSelection(cells, grid, wordList, new Set());
    expect(result).toBeNull();
  });

  it("a word already in foundSet is not matched again", () => {
    const pw = placedWords[0];
    const cells = [];
    for (let i = 0; i < pw.word.length; i++) {
      cells.push({ r: pw.start.r + pw.dir[0] * i, c: pw.start.c + pw.dir[1] * i });
    }
    // Pre-populate foundSet with the word.
    const alreadyFound = new Set<string>([pw.word]);
    const result = checkSelection(cells, grid, wordList, alreadyFound);
    expect(result).toBeNull();
  });

  it("cross-seed: exact selection finds every placed word across multiple seeds", () => {
    const seeds = ["cs-0", "cs-1", "cs-2", "cs-3", "cs-4"];
    for (const seed of seeds) {
      const { grid: g, wordList: wl, placedWords: pw } = buildGrid(makeRng(seed));
      const found = new Set<string>();
      for (const p of pw) {
        const cells = [];
        for (let i = 0; i < p.word.length; i++) {
          cells.push({ r: p.start.r + p.dir[0] * i, c: p.start.c + p.dir[1] * i });
        }
        const match = checkSelection(cells, g, wl, found);
        expect(match, `seed '${seed}': should find '${p.word}'`).toBe(p.word);
        found.add(p.word);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// isWinState
// ---------------------------------------------------------------------------

describe("isWinState", () => {
  it("false when foundSet is empty", () => {
    expect(isWinState(new Set(), ["BEAR", "CAT"])).toBe(false);
  });

  it("false when only some words are found", () => {
    expect(isWinState(new Set(["BEAR"]), ["BEAR", "CAT"])).toBe(false);
  });

  it("true when all words are found", () => {
    expect(isWinState(new Set(["BEAR", "CAT"]), ["BEAR", "CAT"])).toBe(true);
  });

  it("false when wordList is empty (no puzzle loaded)", () => {
    expect(isWinState(new Set(), [])).toBe(false);
  });

  it("true after finding all words of a real puzzle", () => {
    const { wordList, placedWords } = buildGrid(makeRng("win-test"));
    const found = new Set(placedWords.map((p) => p.word));
    expect(isWinState(found, wordList)).toBe(true);
  });

  it("still false when one word is missing", () => {
    const { wordList, placedWords } = buildGrid(makeRng("win-missing"));
    const found = new Set(placedWords.map((p) => p.word));
    // Remove one word.
    found.delete([...found][0]);
    expect(isWinState(found, wordList)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// readPlacedWord (utility used by tests above, also exported)
// ---------------------------------------------------------------------------

describe("readPlacedWord", () => {
  it("reads every placed word correctly across 10 seeds", () => {
    for (let i = 0; i < 10; i++) {
      const { grid, placedWords } = buildGrid(makeRng(`rp-${i}`));
      for (const pw of placedWords) {
        expect(readPlacedWord(pw, grid)).toBe(pw.word);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// buildGrid — a candidate that fits nowhere is skipped, never listed
// ---------------------------------------------------------------------------
//
// With real banks (words <= 7 letters, WORD_COUNT = 8, 12×12 grid) every word
// always fits somewhere, so the skip path is exercised with a stub RNG whose
// shuffle injects a candidate longer than the grid. The previous version of
// this test asserted the old behaviour (placedWords empty while wordList still
// listed 8 words) — that was precisely the unsolvable-puzzle bug, so the
// expectation is now the opposite: wordList must equal the placed words.

describe("buildGrid — unplaceable candidate is skipped and never listed", () => {
  it("skips a word longer than the grid and fills the list from the next candidates", () => {
    const tooLong = "ABCDEFGHIJKLM"; // 13 letters > GRID_SIZE
    const stubRng: Rng = {
      next: () => 0,
      int: () => 0, // fill letter 'A'
      float: (min) => min,
      bool: () => false,
      pick: <T>(arr: T[]): T => arr[0], // ANIMALS bank; first legal placement
      // Inject the unplaceable candidate first, then the real bank words.
      shuffle: <T>(arr: T[]): T[] => [tooLong as unknown as T, ...arr],
    };

    const { placedWords, wordList, grid, bankLabel } = buildGrid(stubRng);

    expect(bankLabel).toBe(BANKS.ANIMALS.label);
    expect(wordList).not.toContain(tooLong);
    expect(wordList).toHaveLength(WORD_COUNT);
    expect(wordList).toEqual(placedWords.map((p) => p.word));
    // The list is the first WORD_COUNT placeable candidates in order.
    expect(wordList).toEqual(BANKS.ANIMALS.words.slice(0, WORD_COUNT));
    for (const pw of placedWords) {
      expect(readPlacedWord(pw, grid)).toBe(pw.word);
    }
    // Grid is fully filled (no blanks) — the fill phase always runs.
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        expect(/^[A-Z]$/.test(grid[r][c]), `cell [${r}][${c}] must be a letter`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Solvability sweep — independent finder over thousands of seeds
// ---------------------------------------------------------------------------
//
// The finder below deliberately does NOT reuse placedWords, findPlacements or
// readPlacedWord: it scans every cell × every one of the 8 directions for each
// listed word, exactly as a player would have to. For every puzzle we assert:
//   (a) every listed word occurs in the grid in at least one direction;
//   (b) checkSelection accepts that occurrence start→end and end→start;
//   (c) isWinState is false until the last word is found and true afterwards;
//   (d) the grid is full, words are non-empty / fit the grid / are distinct /
//       all belong to the puzzle's bank, and listed === placed === WORD_COUNT.

const FINDER_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

interface Occurrence {
  start: Cell;
  end: Cell;
}

/** Independent scan: first occurrence of `word` in `grid` in any direction. */
function findOccurrence(grid: string[][], word: string): Occurrence | null {
  const n = grid.length;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r][c] !== word[0]) continue;
      for (const [dr, dc] of FINDER_DIRS) {
        const er = r + dr * (word.length - 1);
        const ec = c + dc * (word.length - 1);
        if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
        let ok = true;
        for (let i = 1; i < word.length; i++) {
          if (grid[r + dr * i][c + dc * i] !== word[i]) {
            ok = false;
            break;
          }
        }
        if (ok) return { start: { r, c }, end: { r: er, c: ec } };
      }
    }
  }
  return null;
}

function bankOfLabel(label: string): string[] {
  const bank = Object.values(BANKS).find((b) => b.label === label);
  expect(bank, `unknown bank label '${label}'`).toBeDefined();
  return bank!.words;
}

/** Full solvability check for one seed; throws with a seed-tagged message. */
function assertSolvable(seed: string | number): void {
  const tag = `seed '${seed}'`;
  const { grid, wordList, placedWords, bankLabel } = buildGrid(makeRng(seed));

  // (d) structure
  expect(grid, tag).toHaveLength(GRID_SIZE);
  for (let r = 0; r < GRID_SIZE; r++) {
    expect(grid[r], tag).toHaveLength(GRID_SIZE);
    for (let c = 0; c < GRID_SIZE; c++) {
      expect(/^[A-Z]$/.test(grid[r][c]), `${tag}: cell [${r}][${c}]='${grid[r][c]}'`).toBe(true);
    }
  }
  expect(wordList, tag).toHaveLength(WORD_COUNT);
  expect(placedWords, tag).toHaveLength(WORD_COUNT);
  expect(wordList, tag).toEqual(placedWords.map((p: PlacedWord) => p.word));
  expect(new Set(wordList).size, `${tag}: duplicate listed word`).toBe(WORD_COUNT);
  const bankWords = bankOfLabel(bankLabel);
  for (const w of wordList) {
    expect(w.length, `${tag}: '${w}' length`).toBeGreaterThanOrEqual(2);
    expect(w.length, `${tag}: '${w}' length`).toBeLessThanOrEqual(GRID_SIZE);
    expect(bankWords, `${tag}: '${w}' not in bank ${bankLabel}`).toContain(w);
  }

  // (a) + (b) + (c)
  const found = new Set<string>();
  for (let idx = 0; idx < wordList.length; idx++) {
    const w = wordList[idx];
    const occ = findOccurrence(grid, w);
    expect(occ, `${tag}: listed word '${w}' is not in the grid`).not.toBeNull();
    const forward = getLineCells(occ!.start, occ!.end);
    expect(forward, `${tag}: '${w}' occurrence is not a straight line`).not.toBeNull();
    expect(forward!, tag).toHaveLength(w.length);
    const backward = getLineCells(occ!.end, occ!.start);
    // Both drag directions must be accepted (fresh found-set for each).
    expect(checkSelection(forward!, grid, wordList, new Set(found)), `${tag}: forward '${w}'`).toBe(w);
    expect(checkSelection(backward!, grid, wordList, new Set(found)), `${tag}: backward '${w}'`).toBe(w);
    expect(isWinState(found, wordList), `${tag}: win fired early`).toBe(false);
    found.add(checkSelection(forward!, grid, wordList, found)!);
    // The game's own placement record must agree with the independent finder.
    expect(readPlacedWord(placedWords[idx], grid), tag).toBe(w);
  }
  expect(isWinState(found, wordList), `${tag}: win did not fire`).toBe(true);
}

describe("solvability sweep — every listed word is findable and the win fires", () => {
  it("every Daily Challenge date seed from 2024-01-01 to 2031-12-31", () => {
    let count = 0;
    for (let d = new Date(2024, 0, 1); d.getFullYear() <= 2031; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      assertSolvable(`${y}-${m}-${day}`);
      count++;
    }
    expect(count).toBe(2922);
  });

  it("numeric seeds 1..1000", () => {
    for (let s = 1; s <= 1000; s++) assertSolvable(s);
  });

  it("string seeds seed-0..seed-999", () => {
    for (let s = 0; s < 1000; s++) assertSolvable(`seed-${s}`);
  });

  it("regression seeds that dropped a word under the old 200-random-attempt placement", () => {
    // Under the previous generator these seeds listed JUPITER / ECLIPSE without
    // ever placing them (7-letter SPACE words missed all 200 random tries),
    // producing an unsolvable puzzle — 2021-12-15 was a Daily Challenge date.
    for (const s of [12534, 52920, 105193, 118917, 133820, "seed-36416", "seed-49498", "2021-12-15"]) {
      assertSolvable(s);
    }
  });

  it("every bank is exercised by the sweep seeds", () => {
    const labels = new Set<string>();
    for (let s = 1; s <= 64; s++) labels.add(buildGrid(makeRng(s)).bankLabel);
    expect(labels.size).toBe(Object.keys(BANKS).length);
  });
});
