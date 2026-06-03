/* Snake — framework-free core mechanic, shared by the Vue component and tests.
   All rendering, RAF/interval loop, keyboard/touch input, and reactive state
   remain in the component. Only pure, side-effect-free logic lives here. */
import type { Rng } from "~/utils/rng";

// ---- types ----------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export type Dir = "up" | "down" | "left" | "right";

export interface StepResult {
  /** New snake body (head first). */
  snake: Point[];
  /** Updated food position (null = board full, no food possible). */
  food: Point | null;
  /** True when the snake ate the food this step. */
  ate: boolean;
  /** True when the step caused a game-over collision. */
  dead: boolean;
}

// ---- constants ------------------------------------------------------------

export const DIRS: Record<Dir, Point> = {
  up:    { x:  0, y: -1 },
  down:  { x:  0, y:  1 },
  left:  { x: -1, y:  0 },
  right: { x:  1, y:  0 },
};

export const OPP: Record<Dir, Dir> = {
  up: "down", down: "up", left: "right", right: "left",
};

// ---- pure logic -----------------------------------------------------------

/**
 * Advance the snake one step.
 *
 * @param snake  Current snake body (head = index 0). NOT mutated.
 * @param dir    Current heading.
 * @param food   Current food position (or null).
 * @param grid   Grid side length (cells × cells square).
 * @param wrap   When true walls wrap; when false walls are lethal.
 * @param rng    Seeded RNG used only when food is eaten (to place new food).
 * @returns      A StepResult describing the new state.
 */
export function stepSnake(
  snake: Point[],
  dir: Dir,
  food: Point | null,
  grid: number,
  wrap: boolean,
  rng: Rng,
): StepResult {
  const d = DIRS[dir];
  let nx = snake[0].x + d.x;
  let ny = snake[0].y + d.y;

  if (wrap) {
    nx = (nx + grid) % grid;
    ny = (ny + grid) % grid;
  } else if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) {
    return { snake, food, ate: false, dead: true };
  }

  const ate = food !== null && nx === food.x && ny === food.y;

  // Self-collision: check the cells the snake will occupy after this step.
  // When NOT eating: the tail moves away, so check indices 0..length-2.
  // When eating:     the tail stays (growth), so check all indices 0..length-1.
  const limit = ate ? snake.length : snake.length - 1;
  for (let i = 0; i < limit; i++) {
    if (snake[i].x === nx && snake[i].y === ny) {
      return { snake, food, ate: false, dead: true };
    }
  }

  const newSnake = [{ x: nx, y: ny }, ...snake];
  if (!ate) newSnake.pop();

  const newFood = ate ? placeFood(newSnake, grid, rng) : food;

  return { snake: newSnake, food: newFood, ate, dead: false };
}

/**
 * Place food on a random free cell (not occupied by the snake).
 * Returns null only when the board is completely full.
 */
export function placeFood(snake: Point[], grid: number, rng: Rng): Point | null {
  const occ = new Set(snake.map((s) => s.x + "," + s.y));
  const free: Point[] = [];
  for (let y = 0; y < grid; y++)
    for (let x = 0; x < grid; x++)
      if (!occ.has(x + "," + y)) free.push({ x, y });
  if (!free.length) return null;
  return free[Math.floor(rng.next() * free.length)];
}

/**
 * Resolve the next heading from a direction-change request.
 *
 * Rules:
 *  - A 180° reversal (opposite direction) is silently ignored.
 *  - Otherwise the new direction is accepted.
 *
 * The queue in the component calls this repeatedly; here we expose the single-
 * step version so it is independently testable.
 */
export function resolveDir(current: Dir, requested: Dir): Dir {
  return requested === OPP[current] ? current : requested;
}

/**
 * Check whether a direction change is legal (not a 180° reversal).
 */
export function isLegalDir(current: Dir, requested: Dir): boolean {
  return requested !== OPP[current];
}
