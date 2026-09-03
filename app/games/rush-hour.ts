/* Rush Hour (停車場) — framework-free game logic.
   6×6 lot. Cars (length 2) and trucks (length 3) lie horizontally or
   vertically and only slide along their own axis. Vehicle 0 is the red car:
   horizontal, in row 2. It is out when its right end reaches the last column,
   where the exit sits. Shared by the Vue component and the Vitest suite. */

import type { Rng } from "~/utils/rng";

// ---- board constants ----
export const SIZE = 6;
/** The row the red car drives along; the exit is at its right edge. */
export const EXIT_ROW = 2;

// ---- types ----
export interface Vehicle {
  id: number;
  row: number;
  col: number;
  len: 2 | 3;
  horizontal: boolean;
}

export interface Puzzle {
  vehicles: Vehicle[];
  /** Fewest moves that solve it; one move is one vehicle sliding any distance. */
  optimal: number;
}

export type Difficulty = "easy" | "normal" | "hard";

/** Optimal-move bands per difficulty (inclusive). */
export const BANDS: Record<Difficulty, { min: number; max: number }> = {
  easy: { min: 3, max: 7 },
  normal: { min: 8, max: 14 },
  hard: { min: 15, max: Infinity },
};

// ---- geometry ----

/** Every cell a vehicle covers, front to back along its axis. */
export function vehicleCells(v: Vehicle): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = [];
  for (let k = 0; k < v.len; k++)
    cells.push(v.horizontal ? { row: v.row, col: v.col + k } : { row: v.row + k, col: v.col });
  return cells;
}

/** Occupancy grid, row-major, SIZE*SIZE long: vehicle id, or -1 when empty. */
export function buildOccupied(vehicles: Vehicle[]): number[] {
  const occ = new Array<number>(SIZE * SIZE).fill(-1);
  for (const v of vehicles)
    for (const { row, col } of vehicleCells(v)) occ[row * SIZE + col] = v.id;
  return occ;
}

/** True when `v` leaves the board or shares a cell with any vehicle already placed. */
export function overlaps(vehicles: Vehicle[], v: Vehicle): boolean {
  const occ = buildOccupied(vehicles);
  for (const { row, col } of vehicleCells(v)) {
    if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return true;
    if (occ[row * SIZE + col] !== -1) return true;
  }
  return false;
}

// ---- moves ----

function axisPos(v: Vehicle): number {
  return v.horizontal ? v.col : v.row;
}

/** Grid index of the cell `along` steps down the vehicle's axis line. */
function cellIndex(v: Vehicle, along: number): number {
  return v.horizontal ? v.row * SIZE + along : along * SIZE + v.col;
}

/**
 * How far vehicle `id` may slide each way: every delta in [min, max] is legal
 * (min ≤ 0 ≤ max). Returns {0, 0} for an unknown id.
 */
export function slideRange(vehicles: Vehicle[], id: number): { min: number; max: number } {
  const v = vehicles.find((x) => x.id === id);
  if (!v) return { min: 0, max: 0 };
  const occ = buildOccupied(vehicles);
  const pos = axisPos(v);
  let min = 0;
  while (pos + min - 1 >= 0 && occ[cellIndex(v, pos + min - 1)] === -1) min--;
  let max = 0;
  while (pos + v.len + max < SIZE && occ[cellIndex(v, pos + v.len + max)] === -1) max++;
  return { min, max };
}

/**
 * True when vehicle `id` can slide `delta` cells along its axis (negative =
 * up/left) with every cell it passes through free and the board edge respected.
 */
export function canSlide(vehicles: Vehicle[], id: number, delta: number): boolean {
  if (delta === 0) return false;
  const { min, max } = slideRange(vehicles, id);
  return delta >= min && delta <= max;
}

/** New vehicle array with vehicle `id` shifted by `delta` along its axis. Pure. */
export function slide(vehicles: Vehicle[], id: number, delta: number): Vehicle[] {
  return vehicles.map((v) => {
    if (v.id !== id) return { ...v };
    return v.horizontal ? { ...v, col: v.col + delta } : { ...v, row: v.row + delta };
  });
}

/** True when the red car's right end sits at the last column (the exit). */
export function isSolved(vehicles: Vehicle[]): boolean {
  const red = vehicles.find((v) => v.id === 0);
  return red !== undefined && red.col + red.len === SIZE;
}

// ---- solver ----

/** A search state: each vehicle's coordinate along its own axis, in vehicle order. */
type State = number[];

/** Base-6 integer key of a state; exact for up to 20 vehicles. */
function keyOf(pos: State): number {
  let k = 0;
  for (let i = 0; i < pos.length; i++) k = k * SIZE + pos[i]!;
  return k;
}

/** Vehicles repositioned to `pos`. */
function applyState(vehicles: Vehicle[], pos: State): Vehicle[] {
  return vehicles.map((v, i) => (v.horizontal ? { ...v, col: pos[i]! } : { ...v, row: pos[i]! }));
}

/** Grid indices of the six cells on each vehicle's axis line, indexed by axis coordinate. */
function axisLines(vehicles: Vehicle[]): number[][] {
  return vehicles.map((v) => Array.from({ length: SIZE }, (_, along) => cellIndex(v, along)));
}

const OCC = new Int8Array(SIZE * SIZE);

/** Call `visit` with every state exactly one move (one vehicle, any distance) away from `pos`. */
function expand(vehicles: Vehicle[], lines: number[][], pos: State, visit: (child: State) => void): void {
  OCC.fill(-1);
  for (let i = 0; i < vehicles.length; i++) {
    const line = lines[i]!;
    for (let k = 0; k < vehicles[i]!.len; k++) OCC[line[pos[i]! + k]!] = i;
  }
  for (let i = 0; i < vehicles.length; i++) {
    const len = vehicles[i]!.len;
    const line = lines[i]!;
    const p = pos[i]!;
    for (let np = p - 1; np >= 0 && OCC[line[np]!] === -1; np--) {
      const child = pos.slice();
      child[i] = np;
      visit(child);
    }
    for (let np = p + 1; np + len <= SIZE && OCC[line[np + len - 1]!] === -1; np++) {
      const child = pos.slice();
      child[i] = np;
      visit(child);
    }
  }
}

/**
 * Minimum number of moves to free the red car, or null when the board is
 * unsolvable, has no red car, or the search exceeds `maxStates` distinct
 * positions. BFS over states keyed by each vehicle's coordinate along its own
 * axis. One move is a single vehicle sliding any distance in one direction.
 */
export function solve(vehicles: Vehicle[], maxStates = 200000): number | null {
  const redIdx = vehicles.findIndex((v) => v.id === 0);
  if (redIdx === -1) return null;
  const red = vehicles[redIdx]!;
  const lines = axisLines(vehicles);
  const start = vehicles.map(axisPos);
  const seen = new Set<number>([keyOf(start)]);
  let frontier: State[] = [start];
  for (let depth = 0; frontier.length; depth++) {
    const next: State[] = [];
    for (const pos of frontier) {
      if (pos[redIdx]! + red.len === SIZE) return depth;
      expand(vehicles, lines, pos, (child) => {
        const key = keyOf(child);
        if (seen.has(key)) return;
        seen.add(key);
        next.push(child);
      });
      if (seen.size > maxStates) return null;
    }
    frontier = next;
  }
  return null;
}

// ---- generation ----

/** How lots are laid out per difficulty. */
interface LotShape {
  /** Rightmost starting column of the red car. */
  redCol: number;
  /** Vertical vehicles forced across the exit lane, right of the red car. */
  blockers: { min: number; max: number };
  /** Random placement attempts after that. */
  tries: { min: number; max: number };
}

const LOT_SHAPES: Record<Difficulty, LotShape> = {
  easy: { redCol: 3, blockers: { min: 0, max: 1 }, tries: { min: 8, max: 12 } },
  normal: { redCol: 2, blockers: { min: 1, max: 2 }, tries: { min: 12, max: 18 } },
  hard: { redCol: 0, blockers: { min: 2, max: 3 }, tries: { min: 20, max: 30 } },
};

/** Attempts (random lots) per difficulty before settling for the deepest one found. */
const ATTEMPTS: Record<Difficulty, number> = { easy: 20, normal: 40, hard: 100 };

/**
 * A random lot. The red car starts at a random column; vertical blockers may
 * be forced across its lane; then a few random vehicles are added wherever
 * they fit. Horizontal vehicles never share the exit row, since one in front
 * of the red car makes the lot unsolvable.
 */
function randomLot(rng: Rng, shape: LotShape): Vehicle[] {
  const vehicles: Vehicle[] = [
    { id: 0, row: EXIT_ROW, col: rng.int(0, shape.redCol), len: 2, horizontal: true },
  ];
  const lane: number[] = [];
  for (let col = vehicles[0]!.col + 2; col < SIZE; col++) lane.push(col);
  const blockers = rng.int(shape.blockers.min, shape.blockers.max);
  for (const col of rng.shuffle(lane).slice(0, blockers)) {
    const len: 2 | 3 = rng.bool() ? 2 : 3;
    const row = rng.int(EXIT_ROW - len + 1, EXIT_ROW);
    vehicles.push({ id: vehicles.length, row, col, len, horizontal: false });
  }
  const tries = rng.int(shape.tries.min, shape.tries.max);
  for (let t = 0; t < tries; t++) {
    const horizontal = rng.bool();
    const len: 2 | 3 = rng.bool(0.6) ? 2 : 3;
    const along = rng.int(0, SIZE - len);
    const across = rng.int(0, SIZE - 1);
    const v: Vehicle = {
      id: vehicles.length,
      row: horizontal ? across : along,
      col: horizontal ? along : across,
      len,
      horizontal,
    };
    if (horizontal && v.row === EXIT_ROW) continue;
    if (overlaps(vehicles, v)) continue;
    vehicles.push(v);
  }
  return vehicles;
}

/**
 * States of the lot's reachable graph grouped by exact distance (in moves) to
 * the nearest solved state: layers[d] holds every state whose optimal solution
 * is d moves. Moves are reversible, so a multi-source BFS back from the solved
 * states gives that distance; it stops after layer `maxDepth`. Null when no
 * solved state is reachable or the graph exceeds `maxStates`.
 */
function distanceLayers(vehicles: Vehicle[], maxStates: number, maxDepth: number): State[][] | null {
  const red = vehicles[0]!;
  const lines = axisLines(vehicles);
  const start = vehicles.map(axisPos);
  const seen = new Set<number>([keyOf(start)]);
  const goals: State[] = [];
  const queue: State[] = [start];
  for (let i = 0; i < queue.length; i++) {
    const pos = queue[i]!;
    if (pos[0]! + red.len === SIZE) goals.push(pos);
    expand(vehicles, lines, pos, (child) => {
      const key = keyOf(child);
      if (seen.has(key)) return;
      seen.add(key);
      queue.push(child);
    });
    if (seen.size > maxStates) return null;
  }
  if (!goals.length) return null;
  const done = new Set<number>(goals.map(keyOf));
  const layers: State[][] = [goals];
  while (layers.length <= maxDepth) {
    const next: State[] = [];
    for (const pos of layers[layers.length - 1]!) {
      expand(vehicles, lines, pos, (child) => {
        const key = keyOf(child);
        if (done.has(key)) return;
        done.add(key);
        next.push(child);
      });
    }
    if (!next.length) break;
    layers.push(next);
  }
  return layers;
}

/**
 * Generate a solvable puzzle whose optimal move count falls in the difficulty
 * band (easy 3–7, normal 8–14, hard 15+). Each attempt lays out a random lot
 * and maps its state graph by distance to the exit, then draws a target depth
 * in the band and returns a random state at that depth (or the deepest one
 * available, if still in the band). If no attempt reaches the band, the
 * deepest state seen is returned, so the call is bounded and always yields a
 * solvable board. Lots whose graph exceeds `maxStates` are skipped. The same
 * rng stream always produces the same puzzle.
 */
export function generatePuzzle(
  rng: Rng,
  difficulty: Difficulty,
  attempts = ATTEMPTS[difficulty],
  maxStates = 60000,
): Puzzle {
  const band = BANDS[difficulty];
  let best: Puzzle | null = null;
  for (let a = 0; a < attempts; a++) {
    const lot = randomLot(rng, LOT_SHAPES[difficulty]);
    const target = band.min + rng.int(0, Math.min(band.max, band.min + 9) - band.min);
    const layers = distanceLayers(lot, maxStates, target);
    if (!layers) continue;
    const depth = layers.length - 1;
    if (depth >= band.min) {
      const pick = rng.pick(layers[depth]!);
      return { vehicles: applyState(lot, pick), optimal: depth };
    }
    if (!best || depth > best.optimal) {
      best = { vehicles: applyState(lot, layers[depth]![0]!), optimal: depth };
    }
  }
  if (best) return best;
  // Nothing solvable was seen (only possible with attempts = 0): an empty lot.
  const vehicles: Vehicle[] = [{ id: 0, row: EXIT_ROW, col: 0, len: 2, horizontal: true }];
  return { vehicles, optimal: solve(vehicles)! };
}
