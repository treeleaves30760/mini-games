/* Word Search — framework-free pure game logic.
   Grid generation (word placement + fill), placed-word position records,
   selection checking, and win detection are all deterministic given a seed
   so they can be unit-tested independently of the Vue component.           */

import type { Rng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

export const GRID_SIZE = 12;

/** Number of target words in every puzzle. */
export const WORD_COUNT = 8;

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
 * `wordList`   — the WORD_COUNT target words; always exactly the words that
 *                were placed in the grid, so every listed word is findable
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
 * Enumerate every position at which `word` can be written into the (square)
 * `grid` without conflicting with letters already present: every start cell ×
 * every one of the 8 directions that keeps the whole word inside the grid.
 * A cell that is still empty (`""`) or already holds the required letter is
 * acceptable, so words may cross each other on shared letters.
 *
 * The order is deterministic (DIRS order, then row, then column) so that
 * picking an index with a seeded RNG stays reproducible.
 */
export function findPlacements(grid: string[][], word: string): PlacedWord[] {
  const size = grid.length;
  const options: PlacedWord[] = [];
  for (const dir of DIRS) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const endR = r + dir[0] * (word.length - 1);
        const endC = c + dir[1] * (word.length - 1);
        if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue;
        let ok = true;
        for (let i = 0; i < word.length; i++) {
          const cell = grid[r + dir[0] * i][c + dir[1] * i];
          if (cell !== "" && cell !== word[i]) {
            ok = false;
            break;
          }
        }
        if (ok) options.push({ word, start: { r, c }, dir });
      }
    }
  }
  return options;
}

/**
 * Build a new Word Search puzzle using the given RNG.
 * Deterministic: the same RNG state always produces the same puzzle.
 *
 * Solvability guarantee: for each candidate word every legal placement is
 * enumerated and one is chosen at random, so a word is only ever skipped when
 * it fits nowhere (never because a bounded number of random attempts missed),
 * and `wordList` is derived from the words that were actually placed.
 *
 * Callers pass an `Rng` (e.g. `makeRng(seed)`) so they control the stream.
 */
export function buildGrid(rng: Rng): GridResult {
  const bankKey = rng.pick(Object.keys(BANKS));
  const bank = BANKS[bankKey];

  // Candidate words in a seed-determined order; the first WORD_COUNT that can
  // actually be placed become the puzzle's target words.
  const candidates = rng.shuffle([...bank.words]);

  // Initialise empty grid.
  const g: string[][] = Array.from({ length: GRID_SIZE }, () =>
    Array(GRID_SIZE).fill("")
  );

  const placedWords: PlacedWord[] = [];

  for (const word of candidates) {
    if (placedWords.length >= WORD_COUNT) break;
    const options = findPlacements(g, word);
    // A word that fits nowhere is skipped and the next candidate is tried.
    if (options.length === 0) continue;
    const placement = rng.pick(options);
    for (let i = 0; i < word.length; i++) {
      const r = placement.start.r + placement.dir[0] * i;
      const c = placement.start.c + placement.dir[1] * i;
      g[r][c] = word[i];
    }
    placedWords.push(placement);
  }

  // Fill remaining empty cells with random letters.
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (g[r][c] === "") g[r][c] = letters[rng.int(0, 25)];
    }
  }

  return {
    grid: g,
    // The list shown to the player is exactly what was placed.
    wordList: placedWords.map((p) => p.word),
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
