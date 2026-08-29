/* Minesweeper — framework-free pure game logic.
   Board building, neighbor counting, flood reveal, win/loss detection and a
   deterministic no-guess solver are all pure functions of a seed, so they can
   be unit-tested independently of the Vue component and its timer /
   localStorage / animation concerns.                                          */

import type { Rng } from "~/utils/rng";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Cell {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  /** Number of mines in the 8 adjacent cells (0–8). Always 0 for a mine cell. */
  count: number;
}

export interface Board {
  cells: Cell[];
  rows: number;
  cols: number;
}

// ---------------------------------------------------------------------------
// Index helpers
// ---------------------------------------------------------------------------

/** Flat index from (row, col). */
export function cellIdx(rows: number, cols: number, r: number, c: number): number {
  void rows; // rows param kept for symmetry / documentation
  return r * cols + c;
}

/** (row, col) from a flat index. */
export function cellRc(cols: number, i: number): [number, number] {
  return [Math.floor(i / cols), i % cols];
}

// ---------------------------------------------------------------------------
// Neighbors
// ---------------------------------------------------------------------------

/**
 * Return the flat indices of all in-bounds 8-directional neighbors of (r, c).
 * Returns 3 cells at a corner, 5 on an edge, 8 in the interior.
 */
export function neighbors(rows: number, cols: number, r: number, c: number): number[] {
  const ns: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        ns.push(nr * cols + nc);
      }
    }
  }
  return ns;
}

// ---------------------------------------------------------------------------
// RNG resolution
// ---------------------------------------------------------------------------

/** Accept either a pre-built Rng or a raw seed (string / number / null). */
function resolveRng(rngOrSeed: Rng | string | number | null | undefined): Rng {
  return rngOrSeed !== null &&
    rngOrSeed !== undefined &&
    typeof (rngOrSeed as Rng).next === "function"
    ? (rngOrSeed as Rng)
    : makeRng(rngOrSeed as string | number | null);
}

// ---------------------------------------------------------------------------
// Board builder
// ---------------------------------------------------------------------------

/**
 * Build a minesweeper board with exactly `mines` mines, guaranteeing the
 * 3×3 neighborhood around (safeR, safeC) — the "first-click" cell — is
 * mine-free. Because every neighbour of the first-click cell is safe, that
 * cell always has count 0 and flood-reveals an opening region.
 *
 * If `mines` exceeds the number of cells outside the safe zone the count is
 * clamped, so the safe zone is never sacrificed to fit mines in.
 *
 * @param rows     Number of rows.
 * @param cols     Number of columns.
 * @param mines    Total number of mines to place.
 * @param safeR    Row of the first-click safe center cell.
 * @param safeC    Column of the first-click safe center cell.
 * @param rngOrSeed  Either a pre-built Rng or a seed value passed to makeRng().
 *                   Pass a fixed seed in tests for deterministic boards.
 */
export function buildBoard(
  rows: number,
  cols: number,
  mines: number,
  safeR: number,
  safeC: number,
  rngOrSeed: Rng | string | number | null | undefined,
): Board {
  const total = rows * cols;
  const rng = resolveRng(rngOrSeed);

  // Initialise cells
  const cells: Cell[] = Array.from({ length: total }, () => ({
    mine: false,
    revealed: false,
    flagged: false,
    count: 0,
  }));

  // Build safe zone: center cell + its 3×3 neighbors (all in-bounds)
  const safeSet = new Set<number>([safeR * cols + safeC, ...neighbors(rows, cols, safeR, safeC)]);

  // Collect candidates outside the safe zone, shuffle, take the first `mines`
  const candidates: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!safeSet.has(i)) candidates.push(i);
  }
  rng.shuffle(candidates);
  const mineCount = Math.min(mines, candidates.length);
  for (let k = 0; k < mineCount; k++) {
    cells[candidates[k]].mine = true;
  }

  // Compute neighbor counts for every non-mine cell
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (cells[i].mine) continue;
      cells[i].count = neighbors(rows, cols, r, c).filter((ni) => cells[ni].mine).length;
    }
  }

  return { cells, rows, cols };
}

// ---------------------------------------------------------------------------
// Flood reveal
// ---------------------------------------------------------------------------

/**
 * Reveal the cell at (r, c) and, if it has no adjacent mines (count === 0),
 * recursively reveal its neighbors — skipping mines and flagged cells.
 * Mutates `board.cells` in place.
 */
export function floodReveal(board: Board, r: number, c: number): void {
  const { cells, rows, cols } = board;
  const startIdx = r * cols + c;
  const stack: number[] = [startIdx];
  const visited = new Set<number>(stack);

  while (stack.length > 0) {
    const i = stack.pop()!;
    const cell = cells[i];
    if (cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    if (cell.count === 0 && !cell.mine) {
      const [cr, cc] = cellRc(cols, i);
      for (const ni of neighbors(rows, cols, cr, cc)) {
        if (!visited.has(ni) && !cells[ni].flagged) {
          visited.add(ni);
          stack.push(ni);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Win / loss detection
// ---------------------------------------------------------------------------

/**
 * Return `true` when every non-mine cell has been revealed — the win condition.
 * Flags are irrelevant: the player never has to mark mines to win.
 */
export function isWin(board: Board): boolean {
  return board.cells.every((c) => c.mine || c.revealed);
}

/**
 * Return `true` when the cell at (r, c) is a mine — the loss condition for a
 * reveal action.
 */
export function isMine(board: Board, r: number, c: number): boolean {
  return board.cells[r * board.cols + c].mine;
}

// ---------------------------------------------------------------------------
// No-guess solver
// ---------------------------------------------------------------------------

/** Solver knowledge about a cell (values of `SolveResult.state`). */
export const SOLVER_UNKNOWN = 0;
export const SOLVER_OPEN = 1;
export const SOLVER_MINE = 2;

export interface SolveResult {
  /** True when every non-mine cell was deduced without guessing. */
  solved: boolean;
  /** Number of safe cells the solver opened. */
  revealed: number;
  /** Total number of safe (non-mine) cells on the board. */
  safeCells: number;
  /** Per-cell knowledge at the end: SOLVER_UNKNOWN / SOLVER_OPEN / SOLVER_MINE. */
  state: Uint8Array;
}

/**
 * Deterministic no-guess solver. Starting from the flood reveal at
 * (startR, startC) it repeatedly applies three human-style deductions until
 * nothing more can be inferred:
 *   1. single point — a number whose remaining mines are 0 (all hidden
 *      neighbours safe) or equal to its hidden neighbours (all mines);
 *   2. subset rule — when the hidden neighbours of number A are a strict
 *      subset of those of number B, the cells in B∖A hold exactly
 *      need(B) − need(A) mines, which is decisive when that is 0 or |B∖A|;
 *   3. global count — the remaining mine total is 0 or equals the number of
 *      hidden cells (the end-game reading of the mine counter).
 * The solver only opens cells it has proven safe, mirroring what a careful
 * player can deduce from the visible numbers. Does not mutate `board`.
 */
export function solveBoard(board: Board, startR: number, startC: number): SolveResult {
  const { cells, rows, cols } = board;
  const total = rows * cols;
  const nbrs: number[][] = [];
  let mineTotal = 0;
  for (let i = 0; i < total; i++) {
    const [r, c] = cellRc(cols, i);
    nbrs.push(neighbors(rows, cols, r, c));
    if (cells[i].mine) mineTotal++;
  }
  const safeCells = total - mineTotal;
  const state = new Uint8Array(total); // all SOLVER_UNKNOWN
  // Opened numbered cells that may still have hidden neighbours.
  const frontier = new Set<number>();
  let revealed = 0;
  let knownMines = 0;

  const hidden = (i: number) => nbrs[i].filter((n) => state[n] === SOLVER_UNKNOWN);
  const need = (i: number) => cells[i].count - nbrs[i].filter((n) => state[n] === SOLVER_MINE).length;
  const mark = (i: number) => {
    state[i] = SOLVER_MINE;
    knownMines++;
  };
  // Open a proven-safe cell, flooding through zeros exactly like floodReveal().
  const open = (start: number) => {
    const stack = [start];
    while (stack.length > 0) {
      const i = stack.pop()!;
      if (state[i] !== SOLVER_UNKNOWN) continue;
      state[i] = SOLVER_OPEN;
      revealed++;
      if (cells[i].count === 0) {
        for (const n of nbrs[i]) if (state[n] === SOLVER_UNKNOWN) stack.push(n);
      } else {
        frontier.add(i);
      }
    }
  };

  // 1. Single point. Returns true when at least one cell was decided.
  const singlePointPass = (): boolean => {
    let progress = false;
    for (const f of Array.from(frontier)) {
      const h = hidden(f);
      if (h.length === 0) {
        frontier.delete(f);
        continue;
      }
      const k = need(f);
      if (k === 0) {
        for (const u of h) open(u);
        progress = true;
      } else if (k === h.length) {
        for (const u of h) mark(u);
        progress = true;
      }
    }
    return progress;
  };

  // 2. Subset rule. Only numbers within Chebyshev distance 2 can share hidden
  //    neighbours. Returns on the first deduction so the cheap single-point
  //    pass can mop up the consequences before the next comparison.
  const subsetPass = (): boolean => {
    for (const a of frontier) {
      const ha = hidden(a);
      const ka = need(a);
      const [ar, ac] = cellRc(cols, a);
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const br = ar + dr;
          const bc = ac + dc;
          if ((dr === 0 && dc === 0) || br < 0 || br >= rows || bc < 0 || bc >= cols) continue;
          const b = br * cols + bc;
          if (!frontier.has(b)) continue;
          const hb = hidden(b);
          if (hb.length <= ha.length || !ha.every((u) => hb.includes(u))) continue;
          const diff = hb.filter((u) => !ha.includes(u));
          const kd = need(b) - ka;
          if (kd === 0) {
            for (const u of diff) open(u);
            return true;
          }
          if (kd === diff.length) {
            for (const u of diff) mark(u);
            return true;
          }
        }
      }
    }
    return false;
  };

  // 3. Global mine count.
  const globalCountPass = (): boolean => {
    const unknown: number[] = [];
    for (let i = 0; i < total; i++) if (state[i] === SOLVER_UNKNOWN) unknown.push(i);
    if (unknown.length === 0) return false;
    const remaining = mineTotal - knownMines;
    if (remaining === 0) {
      for (const u of unknown) open(u);
      return true;
    }
    if (remaining === unknown.length) {
      for (const u of unknown) mark(u);
      return true;
    }
    return false;
  };

  open(startR * cols + startC);
  // Every successful pass decides at least one more cell, so this terminates.
  while (singlePointPass() || subsetPass() || globalCountPass()) {
    /* keep deducing */
  }

  return { solved: revealed === safeCells, revealed, safeCells, state };
}

// ---------------------------------------------------------------------------
// No-guess board builder
// ---------------------------------------------------------------------------

/** Default number of candidate boards buildNoGuessBoard() will try. */
export const NO_GUESS_ATTEMPTS = 200;

/**
 * Build a board that solveBoard() can clear without guessing from the first
 * click at (safeR, safeC). Candidate boards are drawn from the seeded stream
 * until one is fully solvable, so the result is deterministic for a given
 * seed. The search is bounded by `maxAttempts`; if no candidate is fully
 * solvable the one the solver got furthest on is returned, so the caller
 * always receives a valid board with the usual first-click guarantees.
 */
export function buildNoGuessBoard(
  rows: number,
  cols: number,
  mines: number,
  safeR: number,
  safeC: number,
  rngOrSeed: Rng | string | number | null | undefined,
  maxAttempts: number = NO_GUESS_ATTEMPTS,
): Board {
  const rng = resolveRng(rngOrSeed);
  let best = buildBoard(rows, cols, mines, safeR, safeC, rng);
  let bestResult = solveBoard(best, safeR, safeC);
  for (let attempt = 1; attempt < maxAttempts && !bestResult.solved; attempt++) {
    const board = buildBoard(rows, cols, mines, safeR, safeC, rng);
    const result = solveBoard(board, safeR, safeC);
    if (result.revealed > bestResult.revealed) {
      best = board;
      bestResult = result;
    }
  }
  return best;
}
