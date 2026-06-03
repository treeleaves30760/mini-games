/* Maze 3D — framework-free maze generation and grid logic.
   Shared by Maze3DGame.vue and the Vitest tests.

   Only pure, deterministic functions live here.
   Three.js / rendering / camera code stays in the component. */

import type { Rng } from "~/utils/rng";

// ---------- types ----------

export interface Cell {
  c: number;
  r: number;
  N: boolean;
  E: boolean;
  S: boolean;
  W: boolean;
  vis: boolean;
}

export interface MazeGoal {
  c: number;
  r: number;
}

export interface MazeData {
  cells: Cell[];
  W: number;
  H: number;
}

// ---------- constants ----------

/** Direction vectors for N, E, S, W → [dCol, dRow] */
export const FWD: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Wall key names in direction order N, E, S, W */
export const WALLKEY: ("N" | "E" | "S" | "W")[] = ["N", "E", "S", "W"];

// ---------- maze generation ----------

/**
 * Generate a perfect maze (recursive backtracker) of size w × h.
 * Accepts a seeded Rng so output is deterministic in tests.
 * Returns the flat cell array and dimensions — does NOT mutate external state.
 */
export function genMaze(w: number, h: number, rng: Rng): MazeData {
  const cells: Cell[] = [];
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++)
      cells.push({ c, r, N: true, E: true, S: true, W: true, vis: false });

  const at = (c: number, r: number): Cell | null =>
    c < 0 || c >= w || r < 0 || r >= h ? null : cells[r * w + c];

  const dirs: [keyof Cell, number, number, keyof Cell][] = [
    ["N", 0, -1, "S"],
    ["E", 1, 0, "W"],
    ["S", 0, 1, "N"],
    ["W", -1, 0, "E"],
  ];

  const start = at(0, 0)!;
  start.vis = true;
  const stack: Cell[] = [start];

  while (stack.length) {
    const cur = stack[stack.length - 1];
    const nbs: [keyof Cell, Cell, keyof Cell][] = [];
    for (const [wall, dx, dy, opp] of dirs) {
      const nb = at(cur.c + dx, cur.r + dy);
      if (nb && !nb.vis) nbs.push([wall, nb, opp]);
    }
    if (nbs.length) {
      const idx = Math.floor(rng.next() * nbs.length);
      const [wall, nb, opp] = nbs[idx];
      (cur[wall] as boolean) = false;
      (nb[opp] as boolean) = false;
      nb.vis = true;
      stack.push(nb);
    } else {
      stack.pop();
    }
  }

  return { cells, W: w, H: h };
}

// ---------- goal placement ----------

/**
 * BFS from cell (0,0) to find the farthest reachable cell — placed as the exit.
 * Pure: takes cells/W/H as arguments and returns the goal coordinates.
 */
export function bfsGoal(cells: Cell[], W: number, H: number): MazeGoal {
  const dist = new Array<number>(W * H).fill(-1);
  dist[0] = 0;
  let far = 0;
  const q = [0];
  const dirs: [keyof Cell, number, number][] = [
    ["N", 0, -1],
    ["E", 1, 0],
    ["S", 0, 1],
    ["W", -1, 0],
  ];

  while (q.length) {
    const idx = q.shift()!;
    const c = idx % W;
    const r = (idx / W) | 0;
    for (const [wall, dx, dy] of dirs) {
      if (cells[idx][wall]) continue;
      const nc = c + dx;
      const nr = r + dy;
      if (nc < 0 || nc >= W || nr < 0 || nr >= H) continue;
      const nidx = nr * W + nc;
      if (dist[nidx] < 0) {
        dist[nidx] = dist[idx] + 1;
        if (dist[nidx] > dist[far]) far = nidx;
        q.push(nidx);
      }
    }
  }

  return { c: far % W, r: (far / W) | 0 };
}

// ---------- movement / collision ----------

/**
 * True if the player at (c, r) facing direction f can step forward
 * (i.e., there is no wall in that direction).
 * f: 0=N, 1=E, 2=S, 3=W.
 */
export function canMove(
  cells: Cell[],
  W: number,
  c: number,
  r: number,
  f: number
): boolean {
  return !cells[r * W + c][WALLKEY[f]];
}

// ---------- coordinate helper ----------

/**
 * Convert grid (col, row) to 3-D world x/z coordinates,
 * centred around the origin with cell-spacing CS.
 * Kept here (no Three.js import) because it is pure arithmetic
 * used both in the renderer and in movement logic.
 */
export function worldOf(
  c: number,
  r: number,
  W: number,
  H: number,
  CS: number
): { x: number; z: number } {
  return {
    x: (c - (W - 1) / 2) * CS,
    z: (r - (H - 1) / 2) * CS,
  };
}
