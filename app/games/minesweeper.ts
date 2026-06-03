/* Minesweeper — framework-free pure game logic.
   Board building, neighbor counting, flood reveal, and win/loss detection are
   all deterministic given a seed, so they can be unit-tested independently of
   the Vue component and its timer / localStorage / animation concerns.         */

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
// Board builder
// ---------------------------------------------------------------------------

/**
 * Build a minesweeper board with exactly `mines` mines, guaranteeing the
 * 3×3 neighborhood around (safeR, safeC) — the "first-click" cell — is
 * mine-free.
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

  // Resolve RNG
  const rng: Rng =
    rngOrSeed !== null &&
    rngOrSeed !== undefined &&
    typeof (rngOrSeed as Rng).next === "function"
      ? (rngOrSeed as Rng)
      : makeRng(rngOrSeed as string | number | null);

  // Initialise cells
  const cells: Cell[] = Array.from({ length: total }, () => ({
    mine: false,
    revealed: false,
    flagged: false,
    count: 0,
  }));

  // Build safe zone: center cell + its 3×3 neighbors (all in-bounds)
  const safeSet = new Set<number>();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = safeR + dr;
      const nc = safeC + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        safeSet.add(nr * cols + nc);
      }
    }
  }

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
