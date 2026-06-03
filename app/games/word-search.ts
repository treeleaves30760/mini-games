/* Word Search — framework-free pure game logic.
   Grid generation (word placement + fill), placed-word position records,
   selection checking, and win detection are all deterministic given a seed
   so they can be unit-tested independently of the Vue component.           */

import type { Rng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

export const GRID_SIZE = 12;

/** All 8 compass directions: [deltaRow, deltaCol] */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

export interface WordBank {
  label: string;
  words: string[];
}

export const BANKS: Record<string, WordBank> = {
  ANIMALS: {
    label: "動物 Animals",
    words: [
      "CAT", "DOG", "FOX", "OWL", "BEAR", "WOLF", "LION", "DEER",
      "FROG", "FISH", "EAGLE", "HORSE", "TIGER", "SNAKE", "WHALE",
      "SHARK", "PANDA", "ZEBRA",
    ],
  },
  FRUITS: {
    label: "水果 Fruits",
    words: [
      "FIG", "PEAR", "PLUM", "KIWI", "LIME", "MANGO", "GRAPE", "LEMON",
      "PEACH", "APPLE", "MELON", "BERRY", "PAPAYA", "CHERRY", "BANANA",
      "ORANGE", "GUAVA", "LYCHEE",
    ],
  },
  SPACE: {
    label: "宇宙 Space",
    words: [
      "STAR", "MOON", "MARS", "COMET", "ORBIT", "VENUS", "SOLAR", "PLUTO",
      "SATURN", "GALAXY", "PLANET", "NEBULA", "METEOR", "COSMOS", "ROCKET",
      "ECLIPSE", "JUPITER",
    ],
  },
  COLORS: {
    label: "顏色 Colors",
    words: [
      "RED", "TAN", "BLUE", "GOLD", "GREY", "CYAN", "PINK", "JADE",
      "IVORY", "BLACK", "GREEN", "WHITE", "CORAL", "AMBER", "VIOLET",
      "INDIGO", "MAROON", "SCARLET",
    ],
  },
};

/** A single grid cell coordinate. */
export interface Cell {
  r: number;
  c: number;
}

/**
 * A record of one successfully placed word: the canonical spelling, the
 * starting cell, and the direction step used when placing it.
 */
export interface PlacedWord {
  word: string;
  /** Starting cell (row, col). */
  start: Cell;
  /** Direction step: [deltaRow, deltaCol]. */
  dir: readonly [number, number];
}

/**
 * Everything the Vue component needs after a grid is built.
 * `grid`       — 12×12 2-D array of uppercase letters (no blanks)
 * `wordList`   — the 8 chosen target words
 * `bankLabel`  — display label for the selected theme
 * `placedWords`— authoritative position records for every placed word
 */
export interface GridResult {
  grid: string[][];
  wordList: string[];
  bankLabel: string;
  placedWords: PlacedWord[];
}

// ---------------------------------------------------------------------------
// Grid builder
// ---------------------------------------------------------------------------

/**
 * Build a new Word Search puzzle using the given RNG.
 * Deterministic: the same RNG state always produces the same puzzle.
 *
 * The function accepts either:
 *   - an `Rng` object (e.g. `makeRng(seed)`) for direct use, or
 *   - a `seed` string/number/null and will call `makeRng` internally if you
 *     pass it via the overload — but callers should prefer passing an Rng so
 *     they control the stream themselves.
 */
export function buildGrid(rng: Rng): GridResult {
  const bankKey = rng.pick(Object.keys(BANKS));
  const bank = BANKS[bankKey];

  // Pick ~8 words that fit inside the grid.
  const eligible = bank.words.filter((w) => w.length <= GRID_SIZE);
  const shuffled = rng.shuffle([...eligible]);
  const chosen = shuffled.slice(0, 8);

  // Initialise empty grid.
  const g: string[][] = Array.from({ length: GRID_SIZE }, () =>
    Array(GRID_SIZE).fill("")
  );

  const placedWords: PlacedWord[] = [];

  /** Try to place `word` in the grid; return true on success. */
  function placeWord(word: string): boolean {
    const maxR = GRID_SIZE - 1;
    const maxC = GRID_SIZE - 1;
    for (let t = 0; t < 200; t++) {
      const dir = rng.pick(DIRS as Array<readonly [number, number]>);
      const r = rng.int(0, maxR);
      const c = rng.int(0, maxC);
      const endR = r + dir[0] * (word.length - 1);
      const endC = c + dir[1] * (word.length - 1);
      if (endR < 0 || endR > maxR || endC < 0 || endC > maxC) continue;
      // Verify no conflicting letters.
      let ok = true;
      for (let i = 0; i < word.length; i++) {
        const gr = r + dir[0] * i;
        const gc = c + dir[1] * i;
        if (g[gr][gc] !== "" && g[gr][gc] !== word[i]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      // Write the word into the grid.
      for (let i = 0; i < word.length; i++) {
        g[r + dir[0] * i][c + dir[1] * i] = word[i];
      }
      placedWords.push({ word, start: { r, c }, dir });
      return true;
    }
    return false;
  }

  for (const w of chosen) placeWord(w);

  // Fill remaining empty cells with random letters.
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (g[r][c] === "") g[r][c] = letters[rng.int(0, 25)];
    }
  }

  return {
    grid: g,
    wordList: chosen,
    bankLabel: bank.label,
    placedWords,
  };
}

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

/**
 * Given a start and end cell, return the list of cells that form a straight
 * line in one of the 8 compass directions, or `null` if the two cells do not
 * lie on such a line.
 */
export function getLineCells(start: Cell, end: Cell): Cell[] | null {
  const dr = end.r - start.r;
  const dc = end.c - start.c;
  const adR = Math.abs(dr);
  const adC = Math.abs(dc);
  // Must be horizontal, vertical, or exactly 45-degree diagonal.
  if (dr !== 0 && dc !== 0 && adR !== adC) return null;
  const len = Math.max(adR, adC) + 1;
  const stepR = dr === 0 ? 0 : dr / adR;
  const stepC = dc === 0 ? 0 : dc / adC;
  const cells: Cell[] = [];
  for (let i = 0; i < len; i++) {
    cells.push({ r: start.r + stepR * i, c: start.c + stepC * i });
  }
  return cells;
}

/**
 * Read the letters at `cells` from `grid` and return the resulting string.
 */
export function cellsToWord(cells: Cell[], grid: string[][]): string {
  return cells.map(({ r, c }) => grid[r][c]).join("");
}

/**
 * Check whether a player's cell selection matches any un-found target word.
 *
 * Both the forward and reverse readings are checked (words can be placed in
 * any direction, including right-to-left and bottom-to-top).
 *
 * @param cells     — the cells the player dragged over
 * @param grid      — the current grid
 * @param wordList  — all target words for this puzzle
 * @param foundSet  — words already found (will NOT re-match these)
 * @returns the matched word string, or `null` if no match
 */
export function checkSelection(
  cells: Cell[],
  grid: string[][],
  wordList: string[],
  foundSet: Set<string>
): string | null {
  if (cells.length < 2) return null;
  const word = cellsToWord(cells, grid);
  const reversed = word.split("").reverse().join("");
  const match = wordList.find(
    (w) => (w === word || w === reversed) && !foundSet.has(w)
  );
  return match ?? null;
}

/**
 * Returns `true` when every word in `wordList` has been found.
 */
export function isWinState(foundSet: Set<string>, wordList: string[]): boolean {
  return wordList.length > 0 && foundSet.size >= wordList.length;
}

// ---------------------------------------------------------------------------
// Placed-word verification helper (used internally and in tests)
// ---------------------------------------------------------------------------

/**
 * Read the cells of a placed word from the grid and return the resulting string.
 * For a correctly placed word this should equal `pw.word`.
 */
export function readPlacedWord(pw: PlacedWord, grid: string[][]): string {
  const cells: Cell[] = [];
  for (let i = 0; i < pw.word.length; i++) {
    cells.push({
      r: pw.start.r + pw.dir[0] * i,
      c: pw.start.c + pw.dir[1] * i,
    });
  }
  return cellsToWord(cells, grid);
}
