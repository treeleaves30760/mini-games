import type { Rng } from "~/utils/rng";

/* 摩天樓 Skyscrapers — fill an N×N Latin square with building heights 1..N so
   that the clue outside each row/column equals the number of buildings visible
   from that side (a taller building hides every shorter one behind it). */

export interface SkyscrapersClues {
  top: number[];
  bottom: number[];
  left: number[];
  right: number[];
}
export type ClueSide = keyof SkyscrapersClues;
export const CLUE_SIDES: ClueSide[] = ["top", "bottom", "left", "right"];

export interface SkyscrapersPuzzle {
  size: number;
  /** 0 = hidden clue. */
  clues: SkyscrapersClues;
  /** Flat, row-major, values 1..N. */
  solution: number[];
  /** Flat, row-major, 0 = empty; pre-filled cells the player cannot change. */
  givens: number[];
}

export interface SkyscrapersSize {
  label: string;
  size: number;
}

export const SKYSCRAPERS_SIZES: SkyscrapersSize[] = [
  { label: "簡單", size: 4 },
  { label: "普通", size: 5 },
  { label: "困難", size: 6 },
];

/** Buildings visible along a line, nearest first (0 = empty, never visible). */
export function visibleCount(line: number[]): number {
  let seen = 0;
  let max = 0;
  for (const h of line) {
    if (h > max) {
      max = h;
      seen++;
    }
  }
  return seen;
}

/** Flat index of the k-th cell (0 = nearest the clue) of line `i` seen from `side`. */
export function lineIndex(N: number, side: ClueSide, i: number, k: number): number {
  switch (side) {
    case "top":
      return k * N + i;
    case "bottom":
      return (N - 1 - k) * N + i;
    case "left":
      return i * N + k;
    default:
      return i * N + (N - 1 - k);
  }
}

/** The cells of line `i` as seen from `side`, nearest to the clue first. */
export function lineFrom(grid: number[], N: number, side: ClueSide, i: number): number[] {
  return Array.from({ length: N }, (_, k) => grid[lineIndex(N, side, i, k)]);
}

export function cluesFor(grid: number[], N: number): SkyscrapersClues {
  const clues: SkyscrapersClues = { top: [], bottom: [], left: [], right: [] };
  for (const side of CLUE_SIDES) {
    for (let i = 0; i < N; i++) clues[side].push(visibleCount(lineFrom(grid, N, side, i)));
  }
  return clues;
}

/** Uniformly-ish random Latin square by randomised backtracking, row by row. */
export function latinSquare(rng: Rng, N: number): number[] {
  const grid = new Array<number>(N * N).fill(0);
  const colUsed = Array.from({ length: N }, () => new Array<boolean>(N + 1).fill(false));
  const rowUsed = Array.from({ length: N }, () => new Array<boolean>(N + 1).fill(false));
  function fill(idx: number): boolean {
    if (idx === N * N) return true;
    const r = Math.floor(idx / N);
    const c = idx % N;
    const order = rng.shuffle(Array.from({ length: N }, (_, v) => v + 1));
    for (const v of order) {
      if (rowUsed[r][v] || colUsed[c][v]) continue;
      grid[idx] = v;
      rowUsed[r][v] = colUsed[c][v] = true;
      if (fill(idx + 1)) return true;
      rowUsed[r][v] = colUsed[c][v] = false;
    }
    grid[idx] = 0;
    return false;
  }
  fill(0);
  return grid;
}

export interface SolveResult {
  solutions: number[][];
  /** True when the node cap stopped the search before it was exhausted. */
  aborted: boolean;
  nodes: number;
}

/**
 * Backtracking solver (most-constrained cell first). A placement is accepted
 * when every clue of its row and column is still reachable, judged from the
 * contiguous filled run at each end of the line: from the clue's own end,
 * `seen` buildings visible so far with tallest `max` means the finished line
 * shows exactly `seen` if max = N, otherwise between seen+1 and seen+(N-max);
 * from the far end, a filled tail without N is fully hidden behind N
 * (clue <= N - tail), and a tail holding N adds at most its own visible
 * buildings to the cells before it.
 */
export function solveBounded(
  clues: SkyscrapersClues,
  N: number,
  givens: number[] = [],
  limit = 2,
  nodeCap = Infinity,
): SolveResult {
  const grid = new Array<number>(N * N).fill(0);
  const rowUsed = Array.from({ length: N }, () => new Array<boolean>(N + 1).fill(false));
  const colUsed = Array.from({ length: N }, () => new Array<boolean>(N + 1).fill(false));
  const solutions: number[][] = [];
  let nodes = 0;
  let aborted = false;

  function lineFeasible(side: ClueSide, i: number): boolean {
    const clue = clues[side][i];
    if (!clue) return true;
    let seen = 0;
    let max = 0;
    let head = 0;
    for (; head < N; head++) {
      const v = grid[lineIndex(N, side, i, head)];
      if (!v) break;
      if (v > max) {
        max = v;
        seen++;
      }
    }
    if (head === N) return seen === clue;
    if (head > 0) {
      if (max === N) return seen === clue;
      if (clue <= seen || clue > seen + N - max) return false;
    }
    let tail = 0;
    let tailSeen = 0;
    let tailMax = 0;
    for (let k = N - 1; k >= head && grid[lineIndex(N, side, i, k)]; k--) tail++;
    for (let k = N - tail; k < N; k++) {
      const v = grid[lineIndex(N, side, i, k)];
      if (v > tailMax) {
        tailMax = v;
        tailSeen++;
      }
    }
    if (tailMax !== N) return clue <= N - tail;
    return clue >= 2 && clue <= N - tail + tailSeen;
  }

  function fits(r: number, c: number): boolean {
    return (
      lineFeasible("left", r) && lineFeasible("right", r) && lineFeasible("top", c) && lineFeasible("bottom", c)
    );
  }

  for (let i = 0; i < N * N; i++) {
    const v = givens[i];
    if (!v) continue;
    const r = Math.floor(i / N);
    const c = i % N;
    if (rowUsed[r][v] || colUsed[c][v]) return { solutions, aborted, nodes };
    rowUsed[r][v] = colUsed[c][v] = true;
    grid[i] = v;
  }
  for (let i = 0; i < N; i++) {
    if (!fits(i, i)) return { solutions, aborted, nodes };
  }

  function candidates(idx: number): number[] {
    const r = Math.floor(idx / N);
    const c = idx % N;
    const out: number[] = [];
    for (let v = 1; v <= N; v++) {
      if (rowUsed[r][v] || colUsed[c][v]) continue;
      grid[idx] = v;
      if (fits(r, c)) out.push(v);
    }
    grid[idx] = 0;
    return out;
  }

  function search(): void {
    if (++nodes > nodeCap) {
      aborted = true;
      return;
    }
    let best = -1;
    let bestCands: number[] = [];
    for (let i = 0; i < N * N; i++) {
      if (grid[i]) continue;
      const cands = candidates(i);
      if (cands.length === 0) return;
      if (best === -1 || cands.length < bestCands.length) {
        best = i;
        bestCands = cands;
        if (cands.length === 1) break;
      }
    }
    if (best === -1) {
      solutions.push(grid.slice());
      return;
    }
    const r = Math.floor(best / N);
    const c = best % N;
    for (const v of bestCands) {
      grid[best] = v;
      rowUsed[r][v] = colUsed[c][v] = true;
      search();
      rowUsed[r][v] = colUsed[c][v] = false;
      grid[best] = 0;
      if (aborted || solutions.length >= limit) return;
    }
  }

  search();
  return { solutions, aborted, nodes };
}

/** Up to `limit` solutions of the puzzle (pass limit 2 to test uniqueness). */
export function solve(clues: SkyscrapersClues, N: number, givens: number[] = [], limit = 2): number[][] {
  return solveBounded(clues, N, givens, limit).solutions;
}

function proven(result: SolveResult): boolean {
  return !result.aborted && result.solutions.length === 1;
}

/** Given cells to start from: the 6×6 board gets a couple so it stays approachable. */
export function initialGivenCount(N: number): number {
  return N >= 6 ? 2 : 0;
}

/** Clue removal stops here so the boards keep enough clues to read. */
export function minClueCount(N: number): number {
  return 2 * N;
}

/** Random Latin squares tried before falling back to extra given cells. */
const SQUARE_TRIES = 6;

/**
 * Random puzzle with a unique solution. A random Latin square gets all clues
 * plus the initial given cells; if that is not unique after a few squares,
 * givens are added at cells where two solutions differ until it is. Then
 * clues are hidden one by one in random order whenever the puzzle stays
 * unique. A search that hits the node cap does not prove uniqueness, so that
 * clue is kept.
 */
export function generatePuzzle(rng: Rng, N: number, nodeCap = 200000): SkyscrapersPuzzle {
  const cells = Array.from({ length: N * N }, (_, i) => i);
  let solution: number[] = [];
  let clues: SkyscrapersClues = { top: [], bottom: [], left: [], right: [] };
  let givens: number[] = [];
  let result: SolveResult = { solutions: [], aborted: true, nodes: 0 };
  for (let attempt = 0; attempt < SQUARE_TRIES && !proven(result); attempt++) {
    solution = latinSquare(rng, N);
    clues = cluesFor(solution, N);
    givens = new Array<number>(N * N).fill(0);
    for (const cell of rng.shuffle(cells.slice()).slice(0, initialGivenCount(N))) givens[cell] = solution[cell];
    result = solveBounded(clues, N, givens, 2, nodeCap);
  }
  while (!proven(result)) {
    const [a, b] = result.solutions;
    const open = b ? cells.filter((i) => a[i] !== b[i]) : cells.filter((i) => !givens[i]);
    const cell = rng.pick(open);
    givens[cell] = solution[cell];
    result = solveBounded(clues, N, givens, 2, nodeCap);
  }

  const slots: [ClueSide, number][] = [];
  for (const side of CLUE_SIDES) for (let i = 0; i < N; i++) slots.push([side, i]);
  rng.shuffle(slots);
  let remaining = 4 * N;
  for (const [side, i] of slots) {
    if (remaining <= minClueCount(N)) break;
    const keep = clues[side][i];
    clues[side][i] = 0;
    if (proven(solveBounded(clues, N, givens, 2, nodeCap))) remaining--;
    else clues[side][i] = keep;
  }

  return { size: N, clues, solution, givens };
}

/** Per cell: does its (non-empty) value repeat in its row or column. */
export function duplicateCells(grid: number[], N: number): boolean[] {
  const dup = new Array<boolean>(N * N).fill(false);
  for (let i = 0; i < N * N; i++) {
    const v = grid[i];
    if (!v) continue;
    const r = Math.floor(i / N);
    const c = i % N;
    for (let k = 0; k < N; k++) {
      const inRow = r * N + k;
      const inCol = k * N + c;
      if ((inRow !== i && grid[inRow] === v) || (inCol !== i && grid[inCol] === v)) {
        dup[i] = true;
        break;
      }
    }
  }
  return dup;
}

export type ClueState = "pending" | "ok" | "bad";

/** State of every clue: hidden or incomplete lines are "pending". */
export function clueStates(grid: number[], clues: SkyscrapersClues, N: number): Record<ClueSide, ClueState[]> {
  const states = { top: [], bottom: [], left: [], right: [] } as Record<ClueSide, ClueState[]>;
  for (const side of CLUE_SIDES) {
    for (let i = 0; i < N; i++) {
      const clue = clues[side][i];
      const line = lineFrom(grid, N, side, i);
      if (!clue || line.some((v) => !v)) states[side].push("pending");
      else states[side].push(visibleCount(line) === clue ? "ok" : "bad");
    }
  }
  return states;
}

export function isSolved(grid: number[], clues: SkyscrapersClues, N: number): boolean {
  if (grid.length !== N * N || grid.some((v) => v < 1 || v > N)) return false;
  if (duplicateCells(grid, N).some(Boolean)) return false;
  const states = clueStates(grid, clues, N);
  return CLUE_SIDES.every((side) => states[side].every((s) => s !== "bad"));
}
