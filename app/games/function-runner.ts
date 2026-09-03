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
