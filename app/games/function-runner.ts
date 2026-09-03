/* =========================================================================
   Function Runner (座標射擊) — pure game logic.

   The player types f(x). The shot is the curve y = y0 + f(t) − f(0) traced
   from the shooter (x0, y0) in direction `dir` (t ≥ 0): it destroys every
   target it passes within TARGET_RADIUS of, keeps going, and stops at the
   first obstacle cell it enters, blasting a crater of CRATER_RADIUS around
   the impact point. Solo puzzles are generated from hidden solution curves
   so every round is solvable within its shot budget; the hot-seat PVP mode
   reuses the same simulation with two sides of units.

   Obstacles live on a grid of CELL-sized squares indexed row * cols + col.
   ========================================================================= */

import type { Rng } from "~/utils/rng";
import { compileExpression } from "~/utils/expression";

export interface Point {
  x: number;
  y: number;
}

export interface Board {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cell: number;
}

export interface Shooter extends Point {
  dir: 1 | -1;
}

export interface Target extends Point {
  id: string;
}

export type ObstacleShape =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "rect"; cx: number; cy: number; w: number; h: number };

export const CELL = 0.5;
export const SOLO_BOARD: Board = { minX: 0, maxX: 20, minY: -8, maxY: 8, cell: CELL };
export const PVP_BOARD: Board = { minX: -10, maxX: 10, minY: -8, maxY: 8, cell: CELL };
export const SOLO_SHOOTER: Shooter = { x: 0, y: 0, dir: 1 };
export const TARGET_RADIUS = 0.4;
export const CRATER_RADIUS = 1.1;
export const SHOT_STEP = 0.02;
/** Sub-sampling distance for obstacle checks along one path segment: a quarter cell. */
const COLLISION_STEP = CELL / 4;

/* ---------------------------------------------------------------------------
   Cells
   --------------------------------------------------------------------------- */

export function boardCols(board: Board): number {
  return Math.round((board.maxX - board.minX) / board.cell);
}

export function boardRows(board: Board): number {
  return Math.round((board.maxY - board.minY) / board.cell);
}

/** Index of the cell containing (x, y), or -1 outside the board. */
export function cellIndexAt(board: Board, x: number, y: number): number {
  const col = Math.floor((x - board.minX) / board.cell);
  const row = Math.floor((y - board.minY) / board.cell);
  if (col < 0 || row < 0 || col >= boardCols(board) || row >= boardRows(board)) return -1;
  return row * boardCols(board) + col;
}

export function cellCenter(board: Board, index: number): Point {
  const cols = boardCols(board);
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: board.minX + (col + 0.5) * board.cell, y: board.minY + (row + 0.5) * board.cell };
}

/** Visit every on-board cell whose centre could lie within `radius` of the box [x0, x1] × [y0, y1]. */
function forCellsNear(board: Board, x0: number, x1: number, y0: number, y1: number, radius: number, visit: (index: number, center: Point) => void): void {
  const cols = boardCols(board);
  const rows = boardRows(board);
  const colFrom = Math.max(0, Math.floor((x0 - radius - board.minX) / board.cell));
  const colTo = Math.min(cols - 1, Math.floor((x1 + radius - board.minX) / board.cell));
  const rowFrom = Math.max(0, Math.floor((y0 - radius - board.minY) / board.cell));
  const rowTo = Math.min(rows - 1, Math.floor((y1 + radius - board.minY) / board.cell));
  for (let row = rowFrom; row <= rowTo; row++) {
    for (let col = colFrom; col <= colTo; col++) {
      const index = row * cols + col;
      visit(index, cellCenter(board, index));
    }
  }
}

/** Cells whose centre lies inside the shape (on-board only), ascending. */
export function rasterize(board: Board, shape: ObstacleShape): number[] {
  const halfW = shape.kind === "circle" ? shape.r : shape.w / 2;
  const halfH = shape.kind === "circle" ? shape.r : shape.h / 2;
  const cells: number[] = [];
  forCellsNear(board, shape.cx, shape.cx, shape.cy, shape.cy, Math.max(halfW, halfH), (index, c) => {
    const inside =
      shape.kind === "circle"
        ? Math.hypot(c.x - shape.cx, c.y - shape.cy) <= shape.r
        : Math.abs(c.x - shape.cx) <= shape.w / 2 && Math.abs(c.y - shape.cy) <= shape.h / 2;
    if (inside) cells.push(index);
  });
  return cells;
}

/* ---------------------------------------------------------------------------
   Geometry
   --------------------------------------------------------------------------- */

export function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/* ---------------------------------------------------------------------------
   Shot simulation
   --------------------------------------------------------------------------- */

export type ShotEnd = "edge" | "top" | "bottom" | "obstacle" | "undefined";

export interface ShotResult {
  /** The drawn polyline, starting at the shooter (absolute coordinates). */
  path: Point[];
  /** Ids of the targets destroyed, in the order they were passed. */
  hits: string[];
  /** Where the shot hit an obstacle, if it did. */
  impact: Point | null;
  /** Obstacle cells removed by the crater, ascending. */
  cleared: number[];
  end: ShotEnd;
}

/** First point along a → b (excluding a) that lies inside an obstacle cell. */
function firstObstacleAlong(board: Board, obstacles: ReadonlySet<number>, a: Point, b: Point): Point | null {
  const samples = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / COLLISION_STEP));
  for (let k = 1; k <= samples; k++) {
    const p = { x: a.x + ((b.x - a.x) * k) / samples, y: a.y + ((b.y - a.y) * k) / samples };
    const index = cellIndexAt(board, p.x, p.y);
    if (index >= 0 && obstacles.has(index)) return p;
  }
  return null;
}

/** Obstacle cells within CRATER_RADIUS of the impact point, ascending. */
export function craterCells(board: Board, obstacles: ReadonlySet<number>, impact: Point): number[] {
  const cells: number[] = [];
  forCellsNear(board, impact.x, impact.x, impact.y, impact.y, CRATER_RADIUS, (index, c) => {
    if (obstacles.has(index) && Math.hypot(c.x - impact.x, c.y - impact.y) <= CRATER_RADIUS) cells.push(index);
  });
  return cells;
}

/**
 * Trace one shot. Pure: returns what happened and which cells the crater
 * would remove, without touching `obstacles` or `targets`.
 */
export function simulateShot(
  board: Board,
  obstacles: ReadonlySet<number>,
  targets: readonly Target[],
  shooter: Shooter,
  f: (x: number) => number,
): ShotResult {
  const start: Point = { x: shooter.x, y: shooter.y };
  const result: ShotResult = { path: [start], hits: [], impact: null, cleared: [], end: "edge" };
  const f0 = f(0);
  if (!Number.isFinite(f0)) {
    result.end = "undefined";
    return result;
  }
  const reach = shooter.dir > 0 ? board.maxX - shooter.x : shooter.x - board.minX;
  const steps = Math.round(reach / SHOT_STEP);
  const hit = new Set<string>();
  let prev = start;
  for (let i = 1; i <= steps; i++) {
    const t = i * SHOT_STEP;
    const y = shooter.y + f(t) - f0;
    if (!Number.isFinite(y)) {
      result.end = "undefined";
      break;
    }
    let next: Point = { x: shooter.x + shooter.dir * t, y };
    let last = false;
    if (y > board.maxY || y < board.minY) {
      const bound = y > board.maxY ? board.maxY : board.minY;
      const ratio = (bound - prev.y) / (y - prev.y);
      next = { x: prev.x + (next.x - prev.x) * ratio, y: bound };
      result.end = bound === board.maxY ? "top" : "bottom";
      last = true;
    }
    const impact = firstObstacleAlong(board, obstacles, prev, next);
    if (impact) {
      next = impact;
      result.impact = impact;
      result.cleared = craterCells(board, obstacles, impact);
      result.end = "obstacle";
      last = true;
    }
    for (const target of targets) {
      if (!hit.has(target.id) && distancePointToSegment(target, prev, next) <= TARGET_RADIUS) {
        hit.add(target.id);
        result.hits.push(target.id);
      }
    }
    result.path.push(next);
    prev = next;
    if (last) break;
  }
  return result;
}

/* ---------------------------------------------------------------------------
   Solo puzzles and game state
   --------------------------------------------------------------------------- */

export type FunctionRunnerDifficultyKey = "easy" | "normal" | "hard" | "expert";

export interface FunctionRunnerPuzzle {
  difficulty: FunctionRunnerDifficultyKey;
  board: Board;
  shooter: Shooter;
  shots: number;
  targets: Target[];
  /** The obstacle shapes the generator drew (for tests and debugging). */
  shapes: ObstacleShape[];
  /** Obstacle cells, ascending. */
  obstacles: number[];
  /** One hidden curve per target group; firing them in order clears the board. */
  solution: string[];
}

export interface SoloGame {
  puzzle: FunctionRunnerPuzzle;
  alive: Set<string>;
  obstacles: Set<number>;
  shots: ShotResult[];
}

export interface SoloStatus {
  remaining: number;
  shotsLeft: number;
  won: boolean;
  lost: boolean;
}

export type FireError = { ok: false; error: string; position: number | null };
export type SoloFire = { ok: true; game: SoloGame; result: ShotResult } | FireError;

export const F0_UNDEFINED_ERROR = "f(0) 沒有定義，曲線無法從出發點畫起";

export function createSoloGame(puzzle: FunctionRunnerPuzzle): SoloGame {
  return { puzzle, alive: new Set(puzzle.targets.map((t) => t.id)), obstacles: new Set(puzzle.obstacles), shots: [] };
}

export function soloStatus(game: SoloGame): SoloStatus {
  const remaining = game.alive.size;
  const shotsLeft = game.puzzle.shots - game.shots.length;
  return { remaining, shotsLeft, won: remaining === 0, lost: remaining > 0 && shotsLeft <= 0 };
}

/** Parse the expression and make sure the curve can start at the shooter. */
function prepareShot(expression: string): { ok: true; f: (x: number) => number } | FireError {
  const compiled = compileExpression(expression);
  if (!compiled.ok) return { ok: false, error: compiled.error, position: compiled.position };
  if (!Number.isFinite(compiled.f(0))) return { ok: false, error: F0_UNDEFINED_ERROR, position: null };
  return { ok: true, f: compiled.f };
}

function without<T>(set: ReadonlySet<T>, removed: readonly T[]): Set<T> {
  const next = new Set(set);
  for (const item of removed) next.delete(item);
  return next;
}

export function fireSolo(game: SoloGame, expression: string): SoloFire {
  const status = soloStatus(game);
  if (status.won) return { ok: false, error: "目標已經全部命中", position: null };
  if (status.lost) return { ok: false, error: "射擊次數已用完", position: null };
  const prepared = prepareShot(expression);
  if (!prepared.ok) return prepared;
  const targets = game.puzzle.targets.filter((t) => game.alive.has(t.id));
  const result = simulateShot(game.puzzle.board, game.obstacles, targets, game.puzzle.shooter, prepared.f);
  const next: SoloGame = {
    puzzle: game.puzzle,
    alive: without(game.alive, result.hits),
    obstacles: without(game.obstacles, result.cleared),
    shots: [...game.shots, result],
  };
  return { ok: true, game: next, result };
}

/* ---------------------------------------------------------------------------
   Difficulties and the generator
   --------------------------------------------------------------------------- */

export interface FunctionRunnerDifficulty {
  key: FunctionRunnerDifficultyKey;
  label: string;
  targets: number;
  shots: number;
  obstacles: number;
  /** Targets per hidden curve, largest group first. */
  groups: number[];
}

export const FUNCTION_RUNNER_DIFFICULTIES: FunctionRunnerDifficulty[] = [
  { key: "easy", label: "簡單", targets: 3, shots: 3, obstacles: 0, groups: [1, 1, 1] },
  { key: "normal", label: "普通", targets: 5, shots: 4, obstacles: 2, groups: [2, 2, 1] },
  { key: "hard", label: "困難", targets: 7, shots: 4, obstacles: 4, groups: [3, 2, 2] },
  { key: "expert", label: "專家", targets: 10, shots: 5, obstacles: 6, groups: [3, 3, 2, 2] },
];

export function getFunctionRunnerDifficulty(key: string): FunctionRunnerDifficulty {
  return FUNCTION_RUNNER_DIFFICULTIES.find((d) => d.key === key) ?? FUNCTION_RUNNER_DIFFICULTIES[1];
}

const TARGET_MIN_X = 2;
const TARGET_MAX_X = 19;
const TARGET_MAX_Y = 7;
const TARGET_SPACING = 1.5;
/** Every hidden curve must carry a target at least this far out, so shots cross the board and obstacles matter. */
const GROUP_MIN_REACH = 6;
/** A multi-target group spreads over at least this many columns instead of stacking next to the shooter. */
const GROUP_MIN_SPAN = 3;
/** A hidden curve must stay this close to the middle until its last target, or the shot would leave the board early. */
const PATH_Y_LIMIT = 7.5;
const PATH_STEP = 0.05;
const OBSTACLE_PATH_MARGIN = 0.75;
const OBSTACLE_TARGET_MARGIN = 1;
const SHOOTER_CLEARANCE = 2;
const GROUP_ATTEMPTS = 200;
const OBSTACLE_ATTEMPTS = 200;
const PUZZLE_ATTEMPTS = 50;

type Family = (rng: Rng) => string;

function linearTerm(b: number): string {
  if (b === 0) return "";
  const size = Math.abs(b) === 1 ? "x" : `${Math.abs(b)}x`;
  return ` ${b < 0 ? "-" : "+"} ${size}`;
}

/** m·x with m = p/q, |m| ≤ 2: "2x", "-x/2", "2x/3". */
const lineFamily: Family = (rng) => {
  const q = rng.pick([1, 2, 3]);
  const p = rng.pick([-3, -2, -1, 1, 2, 3].filter((v) => Math.abs(v / q) <= 2));
  const head = p === 1 ? "x" : p === -1 ? "-x" : `${p}x`;
  return q === 1 ? head : `${head}/${q}`;
};

/** a·x² + b·x with a ∈ {±¼, ±½, ±1}, b ∈ [−3, 3]: "x^2/4 - 3x", "-x^2 + 2x". */
const quadraticFamily: Family = (rng) => {
  const den = rng.pick([1, 2, 4]);
  const head = `${rng.bool() ? "-" : ""}${den === 1 ? "x^2" : `x^2/${den}`}`;
  return head + linearTerm(rng.int(-3, 3));
};

/** A·sin(2πx/p) with p ∈ {4, 8, 12}: "3sin(pi x/2)", "4sin(pi x/4)", "2sin(pi x/6)". */
const sineFamily: Family = (rng) => `${rng.int(2, 6)}sin(pi x/${rng.pick([2, 4, 6])})`;

/** a·|x − c| with a ∈ {±½, ±1}, c ∈ [3, 10]: "abs(x-5)", "-abs(x-6)/2". */
const absFamily: Family = (rng) => `${rng.bool() ? "-" : ""}abs(x-${rng.int(3, 10)})${rng.bool() ? "/2" : ""}`;

const FAMILIES_BY_GROUP_SIZE: Record<number, Family[]> = {
  1: [lineFamily],
  2: [lineFamily, quadraticFamily],
  3: [lineFamily, quadraticFamily, sineFamily, absFamily],
};

interface HiddenCurve {
  expression: string;
  targets: Point[];
  /** The curve as the shot will draw it, from the shooter to the last target. */
  path: Point[];
}

/** The curve as drawn: y = f(x) − f(0). Our own strings always compile. */
function shiftedCurve(expression: string): (x: number) => number {
  const compiled = compileExpression(expression);
  if (!compiled.ok) throw new Error(`function runner: bad hidden curve ${expression}: ${compiled.error}`);
  const f0 = compiled.f(0);
  return (x) => compiled.f(x) - f0;
}

function farEnough(p: Point, others: readonly Point[], spacing: number): boolean {
  return others.every((o) => Math.hypot(p.x - o.x, p.y - o.y) >= spacing);
}

function drawHiddenCurve(rng: Rng, size: number, placed: readonly Point[]): HiddenCurve | null {
  for (let attempt = 0; attempt < GROUP_ATTEMPTS; attempt++) {
    const expression = rng.pick(FAMILIES_BY_GROUP_SIZE[size])(rng);
    const g = shiftedCurve(expression);
    const eligible: Point[] = [];
    for (let x = TARGET_MIN_X; x <= TARGET_MAX_X; x++) {
      const y = g(x);
      const rounded = Math.round(y);
      if (Math.abs(y - rounded) < 1e-9 && Math.abs(rounded) <= TARGET_MAX_Y) eligible.push({ x, y: rounded });
    }
    if (eligible.length < size) continue;
    const targets = rng.shuffle(eligible).slice(0, size).sort((a, b) => a.x - b.x);
    const xMax = targets[targets.length - 1].x;
    if (xMax < GROUP_MIN_REACH || (size > 1 && xMax - targets[0].x < GROUP_MIN_SPAN)) continue;
    if (!targets.every((t, i) => farEnough(t, [...placed, ...targets.slice(0, i)], TARGET_SPACING))) continue;
    const path: Point[] = [];
    for (let i = 0, n = Math.round(xMax / PATH_STEP); i <= n; i++) path.push({ x: i * PATH_STEP, y: g(i * PATH_STEP) });
    if (path.some((p) => Math.abs(p.y) > PATH_Y_LIMIT)) continue;
    return { expression, targets, path };
  }
  return null;
}

/** Mark every cell whose centre is closer than `radius` to the segment a–b (a point when a = b). */
function markWithin(board: Board, blocked: Set<number>, a: Point, b: Point, radius: number): void {
  forCellsNear(board, Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y), radius, (index, c) => {
    if (distancePointToSegment(c, a, b) < radius) blocked.add(index);
  });
}

function randomShape(rng: Rng, xMin: number, xMax: number): ObstacleShape {
  const cx = rng.float(xMin, xMax);
  const cy = rng.float(-7, 7);
  return rng.bool() ? { kind: "circle", cx, cy, r: rng.float(0.8, 1.5) } : { kind: "rect", cx, cy, w: 1, h: rng.float(2, 4) };
}

/** Drop `count` shapes whose cells avoid `blocked` and each other; null when one cannot be placed. */
function placeObstacles(rng: Rng, board: Board, count: number, blocked: ReadonlySet<number>, xMin: number, xMax: number): { shapes: ObstacleShape[]; cells: number[] } | null {
  const shapes: ObstacleShape[] = [];
  const occupied = new Set<number>();
  for (let n = 0; n < count; n++) {
    let placed = false;
    for (let attempt = 0; attempt < OBSTACLE_ATTEMPTS && !placed; attempt++) {
      const shape = randomShape(rng, xMin, xMax);
      const cells = rasterize(board, shape);
      if (cells.length === 0 || cells.some((c) => occupied.has(c) || blocked.has(c))) continue;
      shapes.push(shape);
      for (const c of cells) occupied.add(c);
      placed = true;
    }
    if (!placed) return null;
  }
  return { shapes, cells: [...occupied].sort((a, b) => a - b) };
}

function tryGeneratePuzzle(rng: Rng, difficulty: FunctionRunnerDifficulty): FunctionRunnerPuzzle | null {
  const board = SOLO_BOARD;
  const shooter = SOLO_SHOOTER;
  const curves: HiddenCurve[] = [];
  const placed: Point[] = [];
  for (const size of difficulty.groups) {
    const curve = drawHiddenCurve(rng, size, placed);
    if (!curve) return null;
    curves.push(curve);
    placed.push(...curve.targets);
  }
  const targets: Target[] = placed.map((p, i) => ({ id: `t${i + 1}`, x: p.x, y: p.y }));
  const blocked = new Set<number>();
  markWithin(board, blocked, shooter, shooter, SHOOTER_CLEARANCE);
  for (const t of targets) markWithin(board, blocked, t, t, OBSTACLE_TARGET_MARGIN);
  for (const curve of curves) {
    for (let i = 1; i < curve.path.length; i++) markWithin(board, blocked, curve.path[i - 1], curve.path[i], OBSTACLE_PATH_MARGIN);
  }
  const obstacles = placeObstacles(rng, board, difficulty.obstacles, blocked, 3, 18);
  if (!obstacles) return null;
  return {
    difficulty: difficulty.key,
    board,
    shooter,
    shots: difficulty.shots,
    targets,
    shapes: obstacles.shapes,
    obstacles: obstacles.cells,
    solution: curves.map((c) => c.expression),
  };
}

/**
 * Build a round from its answer: draw one hidden curve per target group, put
 * the targets on it, then keep obstacles clear of every curve up to its last
 * target. Firing the curves in order therefore always clears the board.
 */
export function generateFunctionRunnerPuzzle(rng: Rng, difficultyKey = "normal"): FunctionRunnerPuzzle {
  const difficulty = getFunctionRunnerDifficulty(difficultyKey);
  for (let attempt = 0; attempt < PUZZLE_ATTEMPTS; attempt++) {
    const puzzle = tryGeneratePuzzle(rng, difficulty);
    if (puzzle) return puzzle;
  }
  throw new Error(`function runner: no ${difficulty.key} puzzle after ${PUZZLE_ATTEMPTS} attempts`);
}

/* ---------------------------------------------------------------------------
   Hot-seat PVP
   --------------------------------------------------------------------------- */

export interface PvpUnit extends Point {
  id: string;
  owner: 1 | 2;
  alive: boolean;
}

export interface PvpShot {
  player: 1 | 2;
  unitId: string;
  result: ShotResult;
}

export interface PvpMatch {
  board: Board;
  units: PvpUnit[];
  shapes: ObstacleShape[];
  obstacles: Set<number>;
  turn: 1 | 2;
  winner: 0 | 1 | 2;
  shots: PvpShot[];
}

export type PvpFire = { ok: true; match: PvpMatch; result: ShotResult } | FireError;

export const PVP_UNITS_PER_SIDE = 3;
export const PVP_OBSTACLES = 5;
const PVP_ZONES: Record<1 | 2, [number, number]> = { 1: [-9, -6], 2: [6, 9] };
const PVP_UNIT_Y = 6;
const PVP_UNIT_SPACING = 2;
const PVP_UNIT_CLEARANCE = 1.5;
const PVP_OBSTACLE_X = 4;
const UNIT_ATTEMPTS = 200;

/** Player one shoots to the right, player two to the left: "+x" always points at the opponent. */
export function pvpDirection(owner: 1 | 2): 1 | -1 {
  return owner === 1 ? 1 : -1;
}

export function pvpAlive(match: PvpMatch, owner: 1 | 2): PvpUnit[] {
  return match.units.filter((u) => u.owner === owner && u.alive);
}

/** The owner's next living unit after `afterId` in list order (wrapping), or null when none is left. */
export function nextPvpUnit(match: PvpMatch, owner: 1 | 2, afterId: string | null): PvpUnit | null {
  const own = match.units.filter((u) => u.owner === owner);
  const start = afterId ? own.findIndex((u) => u.id === afterId) : -1;
  for (let k = 1; k <= own.length; k++) {
    const unit = own[(start + k) % own.length];
    if (unit.alive) return unit;
  }
  return null;
}

export function generatePvpMatch(rng: Rng): PvpMatch {
  const board = PVP_BOARD;
  for (let attempt = 0; attempt < PUZZLE_ATTEMPTS; attempt++) {
    const units: PvpUnit[] = [];
    for (const owner of [1, 2] as const) {
      for (let n = 1; n <= PVP_UNITS_PER_SIDE; n++) {
        let unit: PvpUnit | null = null;
        for (let tries = 0; tries < UNIT_ATTEMPTS && !unit; tries++) {
          const candidate: PvpUnit = { id: `p${owner}-${n}`, owner, x: rng.int(PVP_ZONES[owner][0], PVP_ZONES[owner][1]), y: rng.int(-PVP_UNIT_Y, PVP_UNIT_Y), alive: true };
          if (farEnough(candidate, units, PVP_UNIT_SPACING)) unit = candidate;
        }
        if (unit) units.push(unit);
      }
    }
    if (units.length !== 2 * PVP_UNITS_PER_SIDE) continue;
    const blocked = new Set<number>();
    for (const u of units) markWithin(board, blocked, u, u, PVP_UNIT_CLEARANCE);
    const obstacles = placeObstacles(rng, board, PVP_OBSTACLES, blocked, -PVP_OBSTACLE_X, PVP_OBSTACLE_X);
    if (!obstacles) continue;
    return { board, units, shapes: obstacles.shapes, obstacles: new Set(obstacles.cells), turn: 1, winner: 0, shots: [] };
  }
  throw new Error(`function runner: no PVP map after ${PUZZLE_ATTEMPTS} attempts`);
}

export function firePvp(match: PvpMatch, unitId: string, expression: string): PvpFire {
  if (match.winner) return { ok: false, error: "對局已經結束", position: null };
  const unit = match.units.find((u) => u.id === unitId);
  if (!unit || unit.owner !== match.turn) return { ok: false, error: "請選自己的單位當出發點", position: null };
  if (!unit.alive) return { ok: false, error: "這個單位已經被消滅", position: null };
  const prepared = prepareShot(expression);
  if (!prepared.ok) return prepared;
  const enemy: 1 | 2 = match.turn === 1 ? 2 : 1;
  const targets: Target[] = pvpAlive(match, enemy).map((u) => ({ id: u.id, x: u.x, y: u.y }));
  const result = simulateShot(match.board, match.obstacles, targets, { x: unit.x, y: unit.y, dir: pvpDirection(unit.owner) }, prepared.f);
  const units = match.units.map((u) => (result.hits.includes(u.id) ? { ...u, alive: false } : u));
  const enemyLeft = units.some((u) => u.owner === enemy && u.alive);
  const next: PvpMatch = {
    ...match,
    units,
    obstacles: without(match.obstacles, result.cleared),
    turn: enemy,
    winner: enemyLeft ? 0 : match.turn,
    shots: [...match.shots, { player: match.turn, unitId, result }],
  };
  return { ok: true, match: next, result };
}
