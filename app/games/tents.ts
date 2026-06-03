/* Tents and Trees — framework-free pure game logic.
   Shared by TentsGame.vue and the Vitest test suite.

   Rules:
   - Each tent must be orthogonally adjacent to exactly one tree (1-to-1 matching).
   - No two tents may touch each other (including diagonally).
   - Per-row and per-column tent counts must equal the stored clue numbers.

   Cell values:  0 = empty   1 = tree   2 = tent (solution / player)   3 = grass (player mark)
*/
import type { Rng } from "~/utils/rng";

export type { Rng };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CELL_EMPTY = 0;
export const CELL_TREE  = 1;
export const CELL_TENT  = 2;
export const CELL_GRASS = 3;

// ---------------------------------------------------------------------------
// Shared direction vectors
// ---------------------------------------------------------------------------

export const ORTH:  readonly [number, number][] = [[-1,0],[1,0],[0,-1],[0,1]];
export const DIAG8: readonly [number, number][] = [
  [-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1],
];

// ---------------------------------------------------------------------------
// Low-level grid helpers
// ---------------------------------------------------------------------------

export function cellIdx(r: number, c: number, N: number): number {
  return r * N + c;
}

export function inBounds(r: number, c: number, N: number): boolean {
  return r >= 0 && r < N && c >= 0 && c < N;
}

// ---------------------------------------------------------------------------
// Bipartite matching — augmenting-path (Hungarian DFS)
// Returns true iff there is a perfect matching between tentCells and treeCells
// where each tent is paired with an orthogonally adjacent tree.
// ---------------------------------------------------------------------------

export function bipartiteMatch(
  tentIndices: number[],
  treeIndices: number[],
  N: number,
): boolean {
  if (tentIndices.length === 0 && treeIndices.length === 0) return true;
  if (tentIndices.length !== treeIndices.length) return false;

  const treePos = new Map<number, number>(); // cellIdx -> treeIndex
  treeIndices.forEach((ci, j) => treePos.set(ci, j));

  const T = treeIndices.length;
  const matchTree = new Array<number>(T).fill(-1); // treeJ -> tentI

  // Adjacency: for each tent, which tree-indices are orthogonally adjacent?
  const adj = tentIndices.map(ti => {
    const r = Math.floor(ti / N);
    const c = ti % N;
    const neighbors: number[] = [];
    for (const [dr, dc] of ORTH) {
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc, N)) continue;
      const ni = cellIdx(nr, nc, N);
      if (treePos.has(ni)) neighbors.push(treePos.get(ni)!);
    }
    return neighbors;
  });

  function dfs(tentI: number, visited: boolean[]): boolean {
    for (const treeJ of adj[tentI]) {
      if (visited[treeJ]) continue;
      visited[treeJ] = true;
      if (matchTree[treeJ] === -1 || dfs(matchTree[treeJ], visited)) {
        matchTree[treeJ] = tentI;
        return true;
      }
    }
    return false;
  }

  let matched = 0;
  for (let i = 0; i < tentIndices.length; i++) {
    if (dfs(i, new Array<boolean>(T).fill(false))) matched++;
  }
  return matched === tentIndices.length;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationError {
  kind:
    | "diagonal-tent"    // two tents touch diagonally (or orthogonally)
    | "row-count"        // row tent count != clue
    | "col-count"        // col tent count != clue
    | "no-adjacent-tree" // tent has no orthogonally adjacent tree
    | "count-mismatch"   // number of tents != number of trees
    | "empty-board";     // no tents placed at all
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate a board state against the tents rules.
 *
 * @param board   Flat cell array (length N*N). Values: 0=empty, 1=tree, 2=tent, 3=grass.
 * @param rowClues Per-row expected tent counts (length N).
 * @param colClues Per-col expected tent counts (length N).
 * @param N       Grid dimension.
 */
export function validateBoard(
  board: number[],
  rowClues: number[],
  colClues: number[],
  N: number,
): ValidationResult {
  const errors: ValidationError[] = [];

  const tentCells: number[] = [];
  const treeCells: number[] = [];
  for (let i = 0; i < N * N; i++) {
    if (board[i] === CELL_TENT) tentCells.push(i);
    else if (board[i] === CELL_TREE) treeCells.push(i);
  }

  // Empty board
  if (tentCells.length === 0) {
    errors.push({ kind: "empty-board" });
    return { valid: false, errors };
  }

  // Count mismatch (tents ≠ trees)
  if (tentCells.length !== treeCells.length) {
    errors.push({ kind: "count-mismatch" });
  }

  // Row counts
  for (let r = 0; r < N; r++) {
    let count = 0;
    for (let c = 0; c < N; c++) if (board[cellIdx(r, c, N)] === CELL_TENT) count++;
    if (count !== rowClues[r]) errors.push({ kind: "row-count" });
  }

  // Column counts
  for (let c = 0; c < N; c++) {
    let count = 0;
    for (let r = 0; r < N; r++) if (board[cellIdx(r, c, N)] === CELL_TENT) count++;
    if (count !== colClues[c]) errors.push({ kind: "col-count" });
  }

  // Diagonal (8-directional) tent adjacency
  for (const ti of tentCells) {
    const r = Math.floor(ti / N), c = ti % N;
    for (const [dr, dc] of DIAG8) {
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc, N)) continue;
      if (board[cellIdx(nr, nc, N)] === CELL_TENT) {
        errors.push({ kind: "diagonal-tent" });
        break; // one error per tent is enough
      }
    }
  }

  // Each tent must have at least one orthogonally adjacent tree
  for (const ti of tentCells) {
    const r = Math.floor(ti / N), c = ti % N;
    let hasTree = false;
    for (const [dr, dc] of ORTH) {
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc, N)) continue;
      if (board[cellIdx(nr, nc, N)] === CELL_TREE) { hasTree = true; break; }
    }
    if (!hasTree) errors.push({ kind: "no-adjacent-tree" });
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Win detection
// ---------------------------------------------------------------------------

/**
 * Returns true only when the board is a fully valid, complete solution:
 * all row/col clues satisfied, no touching tents, perfect tent–tree matching.
 */
export function isWin(
  board: number[],
  rowClues: number[],
  colClues: number[],
  N: number,
): boolean {
  const { valid } = validateBoard(board, rowClues, colClues, N);
  if (!valid) return false;

  const tentCells: number[] = [];
  const treeCells: number[] = [];
  for (let i = 0; i < N * N; i++) {
    if (board[i] === CELL_TENT) tentCells.push(i);
    else if (board[i] === CELL_TREE) treeCells.push(i);
  }

  return bipartiteMatch(tentCells, treeCells, N);
}

// ---------------------------------------------------------------------------
// Puzzle generation
// ---------------------------------------------------------------------------

export interface TentsPuzzle {
  /** Player-facing board: trees fixed, tents removed. */
  playerGrid: number[];
  /** Solution board including tent positions (value=2). */
  solutionGrid: number[];
  /** Per-row tent counts derived from the solution. */
  rowClues: number[];
  /** Per-column tent counts derived from the solution. */
  colClues: number[];
  /** Grid dimension. */
  N: number;
}

/**
 * Generate a Tents puzzle deterministically from a seeded RNG.
 *
 * Strategy: repeatedly pick a random empty cell as a tent candidate, verify no
 * 8-directional tent conflicts, then pick one of its empty orthogonal neighbours
 * as the tree. Repeat until the target number of tents is reached or the grid is
 * exhausted. Clues are derived from the completed solution.
 *
 * @param rng  Seeded RNG (from makeRng).
 * @param N    Grid dimension (e.g., 6, 8, 10).
 */
export function buildPuzzle(rng: Rng, N: number): TentsPuzzle {
  // Target: ~20% of cells, minimum 3
  const target = Math.max(3, Math.round(N * N * 0.20));

  const grid = new Array<number>(N * N).fill(CELL_EMPTY);

  let placed = 0;
  const maxAttempts = N * N * 20;

  for (let attempt = 0; attempt < maxAttempts && placed < target; attempt++) {
    // Collect empty cells as tent candidates
    const emptyTent: number[] = [];
    for (let i = 0; i < N * N; i++) if (grid[i] === CELL_EMPTY) emptyTent.push(i);
    // istanbul ignore start
    if (emptyTent.length === 0) break; // dead: target≤20% cells; diagonal constraint prevents exhausting all cells
    // istanbul ignore stop

    const ti = rng.pick(emptyTent);
    const tr = Math.floor(ti / N), tc = ti % N;

    // Check no existing tent in 8-neighbours
    let tentOk = true;
    for (const [dr, dc] of DIAG8) {
      const nr = tr + dr, nc = tc + dc;
      if (!inBounds(nr, nc, N)) continue;
      if (grid[cellIdx(nr, nc, N)] === CELL_TENT) { tentOk = false; break; }
    }
    if (!tentOk) continue;

    // Orthogonal empty neighbours as tree candidates
    const emptyOrth: [number, number][] = [];
    for (const [dr, dc] of ORTH) {
      const nr = tr + dr, nc = tc + dc;
      if (!inBounds(nr, nc, N)) continue;
      if (grid[cellIdx(nr, nc, N)] === CELL_EMPTY) emptyOrth.push([nr, nc]);
    }
    if (emptyOrth.length === 0) continue;

    const [treeR, treeC] = rng.pick(emptyOrth);
    const treeI = cellIdx(treeR, treeC, N);

    grid[ti]    = CELL_TENT;
    grid[treeI] = CELL_TREE;
    placed++;
  }

  // Derive clues from solution
  const rowClues = new Array<number>(N).fill(0);
  const colClues = new Array<number>(N).fill(0);
  for (let i = 0; i < N * N; i++) {
    if (grid[i] === CELL_TENT) {
      rowClues[Math.floor(i / N)]++;
      colClues[i % N]++;
    }
  }

  // Player board: keep trees, erase tents
  const playerGrid = grid.map(v => (v === CELL_TENT ? CELL_EMPTY : v));

  return { playerGrid, solutionGrid: grid, rowClues, colClues, N };
}
