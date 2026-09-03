/* 連線 Flow — framework-free game logic, shared by the Vue component and the
   unit tests. Pure and deterministic: puzzle generation (a partition of the
   grid into simple paths), the drag model (extend / backtrack / cut another
   colour's path) and win detection. Vue state and DOM stay in the component. */

import type { Rng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One colour's pair of endpoints as flat row-major cell indices. */
export interface Endpoint {
  color: number;
  a: number;
  b: number;
}

export interface Puzzle {
  size: number;
  endpoints: Endpoint[];
  /** solution[i] = colour id covering cell i in the generator's partition. */
  solution: number[];
}

/**
 * Player state: paths[color] is the ordered list of cells drawn for that
 * colour, starting at one of its endpoints. An empty array means "not drawn".
 * Every helper below treats this as immutable and returns a fresh array when
 * something changed — and the very same object when nothing did.
 */
export type Paths = number[][];

/** Board sizes offered by the component: 簡單 / 普通 / 困難. */
export const SIZES = [5, 7, 9];

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

/** Orthogonal neighbours of flat cell i on an N×N grid. */
export function neighbors(i: number, N: number): number[] {
  const r = Math.floor(i / N);
  const c = i % N;
  const out: number[] = [];
  if (r > 0) out.push(i - N);
  if (r < N - 1) out.push(i + N);
  if (c > 0) out.push(i - 1);
  if (c < N - 1) out.push(i + 1);
  return out;
}

/** True when cells a and b share an edge. */
export function isAdjacent(a: number, b: number, N: number): boolean {
  const dr = Math.abs(Math.floor(a / N) - Math.floor(b / N));
  const dc = Math.abs((a % N) - (b % N));
  return dr + dc === 1;
}

/**
 * A path is valid when it is non-empty, stays inside the grid, never repeats
 * a cell, and every step is orthogonal.
 */
export function isPathValid(path: number[], N: number): boolean {
  if (path.length === 0) return false;
  const seen = new Set<number>();
  for (let k = 0; k < path.length; k++) {
    const cell = path[k]!;
    if (!Number.isInteger(cell) || cell < 0 || cell >= N * N) return false;
    if (seen.has(cell)) return false;
    seen.add(cell);
    if (k > 0 && !isAdjacent(path[k - 1]!, cell, N)) return false;
  }
  return true;
}

/** Colour id whose endpoint sits on `cell`, or -1. */
export function endpointColor(endpoints: Endpoint[], cell: number): number {
  for (const ep of endpoints) {
    if (ep.a === cell || ep.b === cell) return ep.color;
  }
  return -1;
}

/** Inclusive [min, max] number of colours for an N×N puzzle. */
export function colorRange(N: number): [number, number] {
  if (N === 5) return [4, 6];
  if (N === 7) return [6, 9];
  if (N === 9) return [8, 12];
  return [Math.max(1, Math.round(N * 0.85)), Math.max(1, Math.round(N * 1.3))];
}

// ---------------------------------------------------------------------------
// Generation — partition the grid into simple, non-self-touching paths
// ---------------------------------------------------------------------------

/** Number of uncovered orthogonal neighbours of cell i. */
function freeDegree(owner: Int16Array, i: number, N: number): number {
  let d = 0;
  for (const n of neighbors(i, N)) if (owner[n] === -1) d++;
  return d;
}

/** True when `cell` touches a cell of `body` other than `except`. */
function touchesBody(
  owner: Int16Array,
  cell: number,
  color: number,
  body: number[],
  except: number,
  N: number,
): boolean {
  for (const m of neighbors(cell, N)) {
    if (m !== except && owner[m] === color && body.includes(m)) return true;
  }
  return false;
}

/**
 * Fold a stuck short path (1–2 cells) into its neighbours. A cell is first
 * appended or prepended to a path whose end it touches; failing that, a path
 * whose body it touches is split there so the cell can cap one of the two
 * halves. Either way no path may touch itself and every piece keeps at
 * least 3 cells. Returns false when a cell has nowhere to go.
 */
function absorb(
  owner: Int16Array,
  paths: number[][],
  cells: number[],
  N: number,
): boolean {
  for (const cell of cells) owner[cell] = -1;
  for (const cell of cells) {
    if (attachToEnd(owner, paths, cell, N)) continue;
    if (!splitAndAttach(owner, paths, cell, N)) return false;
  }
  return true;
}

function attachToEnd(owner: Int16Array, paths: number[][], cell: number, N: number): boolean {
  for (let c = 0; c < paths.length; c++) {
    const path = paths[c]!;
    const head = path[path.length - 1]!;
    const tail = path[0]!;
    for (const end of [head, tail]) {
      if (!isAdjacent(cell, end, N)) continue;
      if (touchesBody(owner, cell, c, path, end, N)) continue;
      if (end === head) path.push(cell);
      else path.unshift(cell);
      owner[cell] = c;
      return true;
    }
  }
  return false;
}

function splitAndAttach(owner: Int16Array, paths: number[][], cell: number, N: number): boolean {
  for (let c = 0; c < paths.length; c++) {
    const path = paths[c]!;
    const len = path.length;
    for (let k = 0; k < len; k++) {
      if (!isAdjacent(cell, path[k]!, N)) continue;
      // Cap the prefix [0..k] with the cell; the suffix becomes a new path.
      if (k >= 1 && k <= len - 4) {
        const prefix = path.slice(0, k + 1);
        if (!touchesBody(owner, cell, c, prefix, path[k]!, N)) {
          const suffix = path.slice(k + 1);
          paths[c] = [...prefix, cell];
          owner[cell] = c;
          for (const x of suffix) owner[x] = paths.length;
          paths.push(suffix);
          return true;
        }
      }
      // Cap the suffix [k..] with the cell; the prefix becomes a new path.
      if (k >= 3 && k <= len - 2) {
        const suffix = path.slice(k);
        if (!touchesBody(owner, cell, c, suffix, path[k]!, N)) {
          const prefix = path.slice(0, k);
          paths[c] = [cell, ...suffix];
          owner[cell] = c;
          for (const x of prefix) owner[x] = paths.length;
          paths.push(prefix);
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * One attempt at growing a partition. Returns the list of paths (each an
 * ordered list of cells) or null when the attempt has to be rejected:
 * a stray pocket that no path can absorb, or a colour count outside
 * [minColors, maxColors].
 *
 * Paths are grown by a random walk that may never step next to its own body
 * (except the head it is leaving), so no path touches itself and its shape
 * is fully determined by its cells. Starts are chosen in the tightest pocket
 * first, steps avoid stranding a lone cell and lean towards the most
 * constrained neighbour, and a walk that still ends up 1–2 cells long is
 * folded into a neighbouring path.
 */
export function tryPartition(
  rng: Rng,
  N: number,
  minColors: number,
  maxColors: number,
  maxLen: number,
): number[][] | null {
  const total = N * N;
  const owner = new Int16Array(total).fill(-1);
  const paths: number[][] = [];
  let uncovered = total;

  while (uncovered > 0) {
    if (paths.length >= maxColors) return null;
    const color = paths.length;

    // Start in the tightest pocket (fewest free neighbours), random tie-break.
    let best = 5;
    let starts: number[] = [];
    for (let i = 0; i < total; i++) {
      if (owner[i] !== -1) continue;
      const d = freeDegree(owner, i, N);
      if (d < best) {
        best = d;
        starts = [i];
      } else if (d === best) {
        starts.push(i);
      }
    }
    const start = rng.pick(starts);
    const path = [start];
    owner[start] = color;
    const target = rng.int(3, maxLen);

    while (path.length < target) {
      const head = path[path.length - 1]!;
      const cands: number[] = [];
      const safe: number[] = [];
      for (const n of neighbors(head, N)) {
        if (owner[n] !== -1) continue;
        // Reject a cell that would touch the path's own body.
        let touches = false;
        for (const m of neighbors(n, N)) {
          if (m !== head && owner[m] === color) {
            touches = true;
            break;
          }
        }
        if (touches) continue;
        cands.push(n);
        // Prefer steps that do not strand an uncovered cell with no exit.
        let strands = false;
        for (const m of neighbors(n, N)) {
          if (owner[m] === -1 && freeDegree(owner, m, N) === 1) {
            strands = true;
            break;
          }
        }
        if (!strands) safe.push(n);
      }
      if (cands.length === 0) break;
      const pool = safe.length > 0 ? safe : cands;

      let next: number;
      if (rng.bool(0.6)) {
        // Warnsdorff-style: prefer the most constrained candidate.
        let bd = 5;
        let bestCands: number[] = [];
        for (const n of pool) {
          const d = freeDegree(owner, n, N);
          if (d < bd) {
            bd = d;
            bestCands = [n];
          } else if (d === bd) {
            bestCands.push(n);
          }
        }
        next = rng.pick(bestCands);
      } else {
        next = rng.pick(pool);
      }
      path.push(next);
      owner[next] = color;
    }

    if (path.length < 3) {
      if (!absorb(owner, paths, path, N)) return null;
    } else {
      paths.push(path);
    }
    uncovered -= path.length;
  }

  if (paths.length < minColors || paths.length > maxColors) return null;
  return paths;
}

/** Plain fallback partition: every row is one path. Always valid for N ≥ 3. */
function rowPartition(N: number): number[][] {
  const paths: number[][] = [];
  for (let r = 0; r < N; r++) {
    const row: number[] = [];
    for (let c = 0; c < N; c++) row.push(r * N + c);
    paths.push(row);
  }
  return paths;
}

/**
 * Generate an N×N puzzle. Retries the random partition up to `maxAttempts`
 * times and falls back to a row partition so it can never loop forever.
 */
export function generatePuzzle(rng: Rng, N: number, maxAttempts = 400): Puzzle {
  const [minColors, maxColors] = colorRange(N);
  // Walk length cap: long enough that the colour count lands in range.
  const maxLen = Math.max(3, Math.ceil((3 * N * N) / minColors));

  let paths: number[][] | null = null;
  for (let attempt = 0; attempt < maxAttempts && paths === null; attempt++) {
    paths = tryPartition(rng, N, minColors, maxColors, maxLen);
  }
  if (paths === null) paths = rowPartition(N);

  // Shuffle colour ids so the first-grown path is not always colour 0.
  const ids = rng.shuffle(paths.map((_, i) => i));
  const endpoints: Endpoint[] = new Array(paths.length);
  const solution: number[] = new Array(N * N).fill(-1);
  paths.forEach((path, k) => {
    const color = ids[k]!;
    endpoints[color] = { color, a: path[0]!, b: path[path.length - 1]! };
    for (const cell of path) solution[cell] = color;
  });

  return { size: N, endpoints, solution };
}

// ---------------------------------------------------------------------------
// Drag model
// ---------------------------------------------------------------------------

/** Fresh, empty player state for a puzzle. */
export function emptyPaths(endpoints: Endpoint[]): Paths {
  return endpoints.map(() => []);
}

/** Cell the given colour's path must finish on, given where it started. */
function partnerOf(ep: Endpoint, start: number): number {
  return start === ep.a ? ep.b : ep.a;
}

/** True when the colour's path runs from one of its endpoints to the other. */
export function isConnected(path: number[], ep: Endpoint): boolean {
  if (path.length < 2) return false;
  const s = path[0]!;
  const e = path[path.length - 1]!;
  return (s === ep.a && e === ep.b) || (s === ep.b && e === ep.a);
}

/**
 * Pointer-down on `cell`. On an endpoint, that colour restarts from there.
 * On a cell of an existing path, the path is cut back to that cell and the
 * drag continues from it. Anywhere else there is nothing to drag.
 */
export function beginDrag(
  paths: Paths,
  endpoints: Endpoint[],
  cell: number,
): { color: number; paths: Paths } | null {
  const epColor = endpointColor(endpoints, cell);
  if (epColor >= 0) {
    const next = paths.slice();
    next[epColor] = [cell];
    return { color: epColor, paths: next };
  }
  for (let c = 0; c < paths.length; c++) {
    const k = paths[c]!.indexOf(cell);
    if (k >= 0) {
      const next = paths.slice();
      next[c] = paths[c]!.slice(0, k + 1);
      return { color: c, paths: next };
    }
  }
  return null;
}

/**
 * Move the head of `color` one step onto `cell`. Steps that are not
 * orthogonal, run into another colour's endpoint, or continue past a
 * finished path are ignored. Stepping back onto the path's own body cuts it
 * there; stepping onto another colour's path cuts that path at the cell.
 */
export function extendPath(
  paths: Paths,
  endpoints: Endpoint[],
  color: number,
  cell: number,
  N: number,
): Paths {
  const path = paths[color];
  if (!path || path.length === 0) return paths;
  const head = path[path.length - 1]!;
  if (cell === head) return paths;
  if (head === partnerOf(endpoints[color]!, path[0]!)) return paths;
  if (!isAdjacent(head, cell, N)) return paths;

  const k = path.indexOf(cell);
  if (k >= 0) {
    const next = paths.slice();
    next[color] = path.slice(0, k + 1);
    return next;
  }

  const epColor = endpointColor(endpoints, cell);
  if (epColor >= 0 && epColor !== color) return paths;

  const next = paths.slice();
  if (epColor < 0) {
    for (let c = 0; c < next.length; c++) {
      if (c === color) continue;
      const j = next[c]!.indexOf(cell);
      if (j >= 0) next[c] = next[c]!.slice(0, j);
    }
  }
  next[color] = [...path, cell];
  return next;
}

/**
 * Drag the head of `color` towards `cell`, walking cell by cell when the
 * target shares a row or column with the head (fast pointer moves skip
 * cells). Stops at the first step that is refused. Diagonal targets are
 * ignored.
 */
export function dragTo(
  paths: Paths,
  endpoints: Endpoint[],
  color: number,
  cell: number,
  N: number,
): Paths {
  const path = paths[color];
  if (!path || path.length === 0) return paths;
  const head = path[path.length - 1]!;
  const hr = Math.floor(head / N);
  const hc = head % N;
  const r = Math.floor(cell / N);
  const c = cell % N;
  if (hr !== r && hc !== c) return paths;
  const step = Math.sign(r - hr) * N + Math.sign(c - hc);

  let cur = paths;
  let pos = head;
  while (pos !== cell) {
    pos += step;
    const next = extendPath(cur, endpoints, color, pos, N);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

// ---------------------------------------------------------------------------
// Progress and win detection
// ---------------------------------------------------------------------------

/** Number of colours whose path joins both endpoints. */
export function connectedCount(paths: Paths, endpoints: Endpoint[]): number {
  let n = 0;
  for (const ep of endpoints) {
    if (isConnected(paths[ep.color] ?? [], ep)) n++;
  }
  return n;
}

/** Number of cells covered by any path. */
export function coveredCount(paths: Paths): number {
  let n = 0;
  for (const p of paths) n += p.length;
  return n;
}

/**
 * Solved when every colour's path is valid and joins its two endpoints, and
 * the paths together cover every cell exactly once.
 */
export function isSolved(paths: Paths, endpoints: Endpoint[], N: number): boolean {
  const seen = new Uint8Array(N * N);
  let count = 0;
  for (const ep of endpoints) {
    const path = paths[ep.color];
    if (!path || !isPathValid(path, N) || !isConnected(path, ep)) return false;
    for (const cell of path) {
      if (seen[cell]) return false;
      seen[cell] = 1;
      count++;
    }
  }
  return count === N * N;
}
