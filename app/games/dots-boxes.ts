/* Dots & Boxes — framework-free game logic, shared by the Vue component and
   the unit tests.

   Grid: DOTS = (rows+1) × (cols+1), BOXES = rows × cols
   Default 4×4 boxes (5×5 dots), but every function accepts a `cols` parameter
   so the test suite can use smaller grids.

   Edge encoding (for the default 4-col, 4-row-box grid):
     H-edge(r, c): index = r * cols + c          (r in 0..rows, c in 0..cols-1)
     V-edge(r, c): index = hTotal + r * (cols+1) + c
                          (r in 0..rows-1, c in 0..cols)
   where hTotal = (rows+1) * cols

   All functions are pure: they never mutate their inputs.
*/

import type { Rng } from "~/utils/rng";

// ── Grid constants (default 4×4-box game) ────────────────────────────────────

export const DEFAULT_ROWS = 4;   // number of box rows
export const DEFAULT_COLS = 4;   // number of box columns

/** Total horizontal edges for a grid with `rows` box-rows and `cols` box-cols */
export function hEdgeCount(rows = DEFAULT_ROWS, cols = DEFAULT_COLS): number {
  return (rows + 1) * cols;
}

/** Total vertical edges */
export function vEdgeCount(rows = DEFAULT_ROWS, cols = DEFAULT_COLS): number {
  return rows * (cols + 1);
}

/** Total edges */
export function totalEdges(rows = DEFAULT_ROWS, cols = DEFAULT_COLS): number {
  return hEdgeCount(rows, cols) + vEdgeCount(rows, cols);
}

/** Total boxes */
export function totalBoxes(rows = DEFAULT_ROWS, cols = DEFAULT_COLS): number {
  return rows * cols;
}

// ── Edge index helpers ────────────────────────────────────────────────────────

/** Index of the horizontal edge between dot (r, c) and (r, c+1). */
export function hIdx(r: number, c: number, cols = DEFAULT_COLS): number {
  return r * cols + c;
}

/** Index of the vertical edge between dot (r, c) and (r+1, c). */
export function vIdx(
  r: number,
  c: number,
  rows = DEFAULT_ROWS,
  cols = DEFAULT_COLS
): number {
  return hEdgeCount(rows, cols) + r * (cols + 1) + c;
}

// ── Box ↔ edge helpers ────────────────────────────────────────────────────────

/**
 * The four edge indices that bound box bi (row-major, 0-indexed).
 * Order: top, bottom, left, right.
 */
export function edgesOfBox(
  bi: number,
  rows = DEFAULT_ROWS,
  cols = DEFAULT_COLS
): [number, number, number, number] {
  const br = Math.floor(bi / cols);
  const bc = bi % cols;
  return [
    hIdx(br,     bc, cols),   // top
    hIdx(br + 1, bc, cols),   // bottom
    vIdx(br, bc,     rows, cols),   // left
    vIdx(br, bc + 1, rows, cols),   // right
  ];
}

/**
 * How many of a box's 4 edges are already in `edgeSet`.
 */
export function countDrawn(
  bi: number,
  edgeSet: ReadonlySet<number>,
  rows = DEFAULT_ROWS,
  cols = DEFAULT_COLS
): number {
  return edgesOfBox(bi, rows, cols).filter((e) => edgeSet.has(e)).length;
}

/**
 * The box indices (0..rows*cols-1) adjacent to edge `ei`.
 * A horizontal edge can border at most two boxes (above & below).
 * A vertical edge can border at most two boxes (left & right).
 */
export function adjacentBoxes(
  ei: number,
  rows = DEFAULT_ROWS,
  cols = DEFAULT_COLS
): number[] {
  const hTotal = hEdgeCount(rows, cols);
  const adj: number[] = [];

  if (ei < hTotal) {
    // Horizontal edge: row = floor(ei / cols), col = ei % cols
    const r = Math.floor(ei / cols);
    const c = ei % cols;
    if (r > 0)    adj.push((r - 1) * cols + c);  // box above
    if (r < rows) adj.push(r       * cols + c);  // box below
  } else {
    // Vertical edge: row = floor(vi / (cols+1)), col = vi % (cols+1)
    const vi = ei - hTotal;
    const r = Math.floor(vi / (cols + 1));
    const c = vi % (cols + 1);
    if (c > 0)    adj.push(r * cols + (c - 1));  // box to the left
    if (c < cols) adj.push(r * cols + c);        // box to the right
  }

  return adj;
}

// ── Move application ──────────────────────────────────────────────────────────

export interface MoveResult {
  /** New edge set (immutable copy). */
  edges: Set<number>;
  /** New owners array (immutable copy). */
  owners: number[];
  /** Number of boxes just claimed by this move. */
  claimed: number;
  /** True when the same player gets another turn (claimed > 0). */
  keepTurn: boolean;
  /** True when every box has been claimed (game over). */
  gameOver: boolean;
}

/**
 * Apply a move: draw edge `ei` for `player` (1 or 2).
 * Returns a new immutable state — inputs are never mutated.
 */
export function applyMove(
  ei: number,
  player: number,
  edges: ReadonlySet<number>,
  owners: readonly number[],
  rows = DEFAULT_ROWS,
  cols = DEFAULT_COLS
): MoveResult {
  const newEdges = new Set(edges);
  newEdges.add(ei);

  const newOwners = [...owners];
  let claimed = 0;

  const nb = totalBoxes(rows, cols);
  for (let bi = 0; bi < nb; bi++) {
    if (newOwners[bi] === 0 && countDrawn(bi, newEdges, rows, cols) === 4) {
      newOwners[bi] = player;
      claimed++;
    }
  }

  const ne = totalEdges(rows, cols);
  const gameOver = newEdges.size === ne;
  const keepTurn = claimed > 0;

  return { edges: newEdges, owners: newOwners, claimed, keepTurn, gameOver };
}

// ── Game-over / score helpers ─────────────────────────────────────────────────

/** True when all boxes have been claimed. */
export function isGameOver(
  owners: readonly number[],
  rows = DEFAULT_ROWS,
  cols = DEFAULT_COLS
): boolean {
  const nb = totalBoxes(rows, cols);
  for (let i = 0; i < nb; i++) {
    if (owners[i] === 0) return false;
  }
  return true;
}

/** Score for a given player (1 or 2). */
export function scoreOf(owners: readonly number[], player: number): number {
  return owners.filter((o) => o === player).length;
}

/**
 * Winner: 1, 2, or 0 (draw).
 * Call only after the game is over.
 */
export function winner(owners: readonly number[]): 0 | 1 | 2 {
  const p = scoreOf(owners, 1);
  const a = scoreOf(owners, 2);
  if (p > a) return 1;
  if (a > p) return 2;
  return 0;
}

// ── AI move selection ─────────────────────────────────────────────────────────

/**
 * Choose a move for the AI (player 2).
 *
 * Priority:
 *   1. Complete any box (guaranteed extra turn).
 *   2. Play a "safe" edge — one that doesn't give the opponent a 3-sided box.
 *   3. Give away the smallest chain (fewest 3-sided boxes created).
 *
 * Returns -1 if no moves are available.
 * Pass `rng` to break ties randomly (deterministic with a seeded RNG).
 */
export function aiMove(
  edges: ReadonlySet<number>,
  owners: readonly number[],
  rows = DEFAULT_ROWS,
  cols = DEFAULT_COLS,
  rng?: Rng
): number {
  const available: number[] = [];
  const ne = totalEdges(rows, cols);
  for (let i = 0; i < ne; i++) {
    if (!edges.has(i)) available.push(i);
  }
  if (!available.length) return -1;

  // 1) Complete any box
  for (const e of available) {
    const adj = adjacentBoxes(e, rows, cols);
    for (const bi of adj) {
      if (owners[bi] === 0 && countDrawn(bi, edges, rows, cols) === 3) return e;
    }
  }

  // 2) Safe edge: doesn't create a 3-sided box for the opponent
  const safe = available.filter((e) => {
    const adj = adjacentBoxes(e, rows, cols);
    return !adj.some(
      (bi) => owners[bi] === 0 && countDrawn(bi, edges, rows, cols) === 2
    );
  });
  if (safe.length) {
    return rng ? rng.pick(safe) : safe[0];
  }

  // 3) Give away smallest chain (fewest 3-sided boxes created)
  let best = available[0];
  let bestCost = Infinity;
  for (const e of available) {
    const adj = adjacentBoxes(e, rows, cols);
    const cost = adj.filter(
      (bi) => owners[bi] === 0 && countDrawn(bi, edges, rows, cols) === 2
    ).length;
    if (cost < bestCost) {
      bestCost = cost;
      best = e;
    }
  }
  return best;
}
