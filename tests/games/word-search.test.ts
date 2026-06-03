import { describe, it, expect } from "vitest";
import {
  GRID_SIZE,
  DIRS,
  BANKS,
  buildGrid,
  getLineCells,
  cellsToWord,
  checkSelection,
  isWinState,
  readPlacedWord,
} from "~/games/word-search";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// BANKS & constants
// ---------------------------------------------------------------------------

describe("BANKS / constants", () => {
  it("GRID_SIZE is 12", () => {
    expect(GRID_SIZE).toBe(12);
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

  it("every bank has a label and at least 8 words", () => {
    for (const [key, bank] of Object.entries(BANKS)) {
      expect(typeof bank.label, `${key}.label`).toBe("string");
      expect(bank.words.length, `${key} word count`).toBeGreaterThanOrEqual(8);
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

  it("returns exactly 8 target words", () => {
    const { wordList } = buildGrid(makeRng("words-test"));
    expect(wordList).toHaveLength(8);
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

  it("placedWords length equals wordList length (all words placed)", () => {
    // With GRID_SIZE=12 and words of ≤12 chars, 200 attempts should always succeed.
    const { wordList, placedWords } = buildGrid(makeRng("place-count"));
    expect(placedWords).toHaveLength(wordList.length);
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
    const { grid, placedWords } = buildGrid(makeRng("bounds-check"));
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

  it("true after finding all 8 words of a real puzzle", () => {
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
// placeWord fallback — line 157: return false when all 200 attempts fail
// ---------------------------------------------------------------------------

describe("buildGrid — placeWord returns false when all 200 attempts fail (line 157)", () => {
  it("placedWords is empty when stub RNG forces every attempt out of bounds", () => {
    // A stub RNG that:
    //   pick(BANKS_keys=4-elem array)  → arr[0]  (picks ANIMALS bank)
    //   shuffle(arr)                   → arr     (identity)
    //   pick(DIRS=8-elem array)        → arr[0] = [0,1] (rightward direction)
    //   int(0, 11) for r/c             → 11     (bottom-right start)
    //   int(0, 25) for fill            → 0      (fills 'A')
    //
    // With dir=[0,1], r=11, c=11: endC = 11 + 1*(len-1) = 10+len.
    // All bank words have length >= 3, so endC >= 12 > maxC=11 → bounds fail.
    // Every one of the 200 attempts per word fails → placeWord returns false (line 157).
    const stubRng = {
      next: (): number => 0,
      int: (_min: number, max: number): number => {
        if (max === 25) return 0; // fill cells with 'A' (index 0)
        return max;               // r=11 and c=11 for word placement
      },
      float: (min: number, _max: number): number => min,
      bool: (_p?: number): boolean => false,
      pick: <T>(arr: T[]): T => arr[0], // ANIMALS bank; dir=[0,1]; stable picks
      shuffle: <T>(arr: T[]): T[] => arr, // identity shuffle
    };

    const { placedWords, wordList, grid } = buildGrid(stubRng);

    // No word could be placed — placedWords must be empty.
    expect(placedWords).toHaveLength(0);

    // wordList still has 8 chosen words (slice of shuffled eligible words).
    expect(wordList).toHaveLength(8);

    // Grid is fully filled (no blanks) — the fill phase always runs.
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        expect(/^[A-Z]$/.test(grid[r][c]), `cell [${r}][${c}] must be a letter`).toBe(true);
      }
    }
  });
});
