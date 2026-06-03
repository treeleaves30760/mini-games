/* Pipes — framework-free game logic extracted from PipesGame.vue.
   Powers both the Vue component and the Vitest test suite.

   Bitmask directions: N=1, E=2, S=4, W=8 (matches the component encoding).
   Rotation CW: N→E→S→W→N.
*/
import type { Rng } from "~/utils/rng";

// ---- Direction constants ----
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export const ALL_DIRS = [N, E, S, W] as const;

/** Row delta for each direction. */
export const DR: Record<number, number> = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 };
/** Column delta for each direction. */
export const DC: Record<number, number> = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 };
/** Opposite direction. */
export const OPP: Record<number, number> = { [N]: S, [E]: W, [S]: N, [W]: E };

/**
 * Rotate a connector bitmask 90° clockwise: N→E, E→S, S→W, W→N.
 * Four applications always return to the original mask.
 */
export function rotateCW(mask: number): number {
  let r = 0;
  if (mask & N) r |= E;
  if (mask & E) r |= S;
  if (mask & S) r |= W;
  if (mask & W) r |= N;
  return r;
}

/**
 * Rotate a bitmask k steps clockwise (0–3).
 * rotateCWK(mask, 0) === mask; rotateCWK(mask, 4) === mask.
 */
export function rotateCWK(mask: number, k: number): number {
  let m = mask;
  for (let i = 0; i < (k & 3); i++) m = rotateCW(m);
  return m;
}

// ---- Grid shape ----
export interface PipesGrid {
  /** Number of rows and columns (always square). */
  size: number;
  /**
   * solved[r][c]: the target bitmask for each cell (the unique solved state).
   * In a solved grid, every connection is mutual: if tile A points toward B,
   * B points back toward A, and the spanning tree reaches every cell from the source.
   */
  solved: number[][];
  /**
   * initial[r][c]: the scrambled starting bitmask presented to the player.
   * Built by applying a random number of CW rotations (0–3) to each solved cell.
   */
  initial: number[][];
  /** Row index of the source cell (centre of the grid). */
  srcR: number;
  /** Column index of the source cell (centre of the grid). */
  srcC: number;
}

/**
 * Generate a solvable Pipes puzzle of size G×G.
 *
 * Algorithm:
 *  1. Randomised DFS from the centre produces a spanning tree — guarantees
 *     every cell is reachable and every connection is mutual (no leaks).
 *  2. Each cell is scrambled by a random 0–3 CW rotation.
 *
 * The function is pure and deterministic for a given `rng`.
 */
export function generateGrid(G: number, rng: Rng): PipesGrid {
  const srcR = Math.floor(G / 2);
  const srcC = Math.floor(G / 2);

  // Build the solved bitmask via randomised DFS.
  const visited: boolean[][] = Array.from({ length: G }, () =>
    new Array<boolean>(G).fill(false)
  );
  const solved: number[][] = Array.from({ length: G }, () =>
    new Array<number>(G).fill(0)
  );

  function dfs(r: number, c: number): void {
    visited[r][c] = true;
    const neighbors: { d: number; nr: number; nc: number }[] = [];
    for (const d of ALL_DIRS) {
      const nr = r + DR[d];
      const nc = c + DC[d];
      if (nr >= 0 && nr < G && nc >= 0 && nc < G && !visited[nr][nc]) {
        neighbors.push({ d, nr, nc });
      }
    }
    rng.shuffle(neighbors);
    for (const { d, nr, nc } of neighbors) {
      if (!visited[nr][nc]) {
        solved[r][c] |= d;
        solved[nr][nc] |= OPP[d];
        dfs(nr, nc);
      }
    }
  }

  dfs(srcR, srcC);

  // Scramble: random rotation per cell.
  const initial: number[][] = Array.from({ length: G }, () =>
    new Array<number>(G).fill(0)
  );
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      const rotations = rng.int(0, 3);
      initial[r][c] = rotateCWK(solved[r][c], rotations);
    }
  }

  return { size: G, solved, initial, srcR, srcC };
}

/**
 * Flood-fill from the source and return a boolean grid of powered cells.
 *
 * A cell is powered if there is a path of mutually-connected tiles from the
 * source to that cell. Both sides of every edge must agree (tile A has bit d,
 * tile B has bit OPP[d]).
 */
export function computePowered(cells: number[][], G: number, srcR: number, srcC: number): boolean[][] {
  const pw: boolean[][] = Array.from({ length: G }, () =>
    new Array<boolean>(G).fill(false)
  );
  const queue: { r: number; c: number }[] = [{ r: srcR, c: srcC }];
  pw[srcR][srcC] = true;

  while (queue.length > 0) {
    const { r, c } = queue.shift()!;
    for (const d of ALL_DIRS) {
      const nr = r + DR[d];
      const nc = c + DC[d];
      if (nr < 0 || nr >= G || nc < 0 || nc >= G) continue;
      if (pw[nr][nc]) continue;
      if ((cells[r][c] & d) && (cells[nr][nc] & OPP[d])) {
        pw[nr][nc] = true;
        queue.push({ r: nr, c: nc });
      }
    }
  }

  return pw;
}

/**
 * Return true iff the current `cells` layout is a solved state:
 *  - No connector points off-grid or at a non-matching neighbour.
 *  - Every cell in the G×G grid is powered from the source.
 */
export function isSolved(
  cells: number[][],
  G: number,
  srcR: number,
  srcC: number
): boolean {
  // Condition A: mutual connections only (no dangling/leaking edges).
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      const m = cells[r][c];
      for (const d of ALL_DIRS) {
        if (!(m & d)) continue;
        const nr = r + DR[d];
        const nc = c + DC[d];
        if (nr < 0 || nr >= G || nc < 0 || nc >= G) return false;
        if (!(cells[nr][nc] & OPP[d])) return false;
      }
    }
  }
  // Condition B: all cells reachable from source.
  const pw = computePowered(cells, G, srcR, srcC);
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      if (!pw[r][c]) return false;
    }
  }
  return true;
}
