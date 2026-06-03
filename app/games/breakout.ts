/* Breakout — framework-free pure game logic.
   Extracted from app/components/games/BreakoutGame.vue so the core mechanics
   are independently unit-testable.

   The component keeps: canvas, requestAnimationFrame loop, reactive HUD state,
   input handling, layoutObjects(), draw(), and all Vue lifecycle hooks.

   This module exposes: the brick data type, brick-grid generation, wall/paddle/brick
   collision helpers, and win/lose predicates. Every function takes explicit
   positions / velocities and returns new values — no mutation of external state. */

import type { Rng } from "~/utils/rng";
import { makeRng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrickData {
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Pixel position/size — filled in by layoutObjects() in the component. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Minimal ball state for pure-logic helpers. */
export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

/** Minimal paddle state for pure-logic helpers. */
export interface PaddleState {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Return value of collideBrick — what happened to the ball velocity. */
export interface BrickCollisionResult {
  /** Whether any brick was hit this frame. */
  hit: boolean;
  /** New vx (unchanged if no hit). */
  vx: number;
  /** New vy (unchanged if no hit). */
  vy: number;
  /** Index of the hit brick in the array, or -1. */
  brickIndex: number;
}

// ---------------------------------------------------------------------------
// Constants (re-exported so both the component and tests share one source)
// ---------------------------------------------------------------------------

export const COLS = 10;
export const BRICK_ROWS = 5;
export const TOTAL_LEVELS = 3;
export const LIVES_START = 3;

// ---------------------------------------------------------------------------
// Brick generation
// ---------------------------------------------------------------------------

/**
 * Build the brick grid data for `lvlNum` using a deterministic RNG derived
 * from `seed`.  Returns an array of BrickData with x/y/w/h all zero — the
 * component calls layoutObjects() to fill pixel positions.
 */
export function buildBricks(seed: string | number | null, lvlNum: number): BrickData[] {
  const r: Rng = makeRng(String(seed ?? "null") + "-" + lvlNum);
  const bricks: BrickData[] = [];
  for (let row = 0; row < BRICK_ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const twoHpChance = 0.1 + (lvlNum - 1) * 0.12 + row * 0.04;
      const hp = r.bool(twoHpChance) ? 2 : 1;
      bricks.push({ col, row, hp, maxHp: hp, alive: true, x: 0, y: 0, w: 0, h: 0 });
    }
  }
  return bricks;
}

// ---------------------------------------------------------------------------
// Wall reflection
// ---------------------------------------------------------------------------

/**
 * Reflect the ball off the left, right, and top walls.
 * Returns the corrected ball position and velocity (vx/vy).
 * The *bottom* edge (lose condition) is handled separately by `isBallLost`.
 */
export function reflectWalls(
  ball: BallState,
  W: number,
): Pick<BallState, "x" | "y" | "vx" | "vy"> {
  let { x, y, vx, vy } = ball;
  const r = ball.r;

  if (x - r < 0) {
    x = r;
    vx = Math.abs(vx); // reflect: always move right
  }
  if (x + r > W) {
    x = W - r;
    vx = -Math.abs(vx); // reflect: always move left
  }
  if (y - r < 0) {
    y = r;
    vy = Math.abs(vy); // reflect: always move down
  }

  return { x, y, vx, vy };
}

// ---------------------------------------------------------------------------
// Paddle collision
// ---------------------------------------------------------------------------

/**
 * Check and resolve a ball-paddle collision.
 * Returns new ball position and velocity if a hit occurred, otherwise returns
 * the original values unchanged.
 *
 * The angle is computed from the relative hit position on the paddle
 * (matching the component's formula: relX * 1.1 − π/2), and vy is clamped
 * to ±1.5 to prevent nearly-horizontal trajectories.
 */
export function reflectPaddle(
  ball: BallState,
  paddle: PaddleState,
): Pick<BallState, "x" | "y" | "vx" | "vy"> {
  let { x, y, vx, vy } = ball;
  const r = ball.r;

  const hit =
    vy > 0 &&
    x > paddle.x &&
    x < paddle.x + paddle.w &&
    y + r > paddle.y &&
    y + r < paddle.y + paddle.h + r;

  if (!hit) return { x, y, vx, vy };

  y = paddle.y - r;
  const relX = (x - (paddle.x + paddle.w / 2)) / (paddle.w / 2); // -1 to 1
  const angle = relX * 1.1 - Math.PI / 2;
  const speed = Math.sqrt(vx * vx + vy * vy);
  vx = Math.cos(angle) * speed;
  vy = Math.sin(angle) * speed;
  // Clamp vy so the ball can't go nearly horizontal.
  // vy after a paddle hit equals sin(relX*1.1 − π/2)*speed; for relX∈[−1,1] the angle stays in [−2.67,−0.47]
  // where sin is always negative — `vy = 1.5` (positive clamp) is structurally unreachable.
  /* v8 ignore start */
  if (Math.abs(vy) < 1.5) vy = vy < 0 ? -1.5 : 1.5;
  /* v8 ignore stop */

  return { x, y, vx, vy };
}

// ---------------------------------------------------------------------------
// Brick collision
// ---------------------------------------------------------------------------

/**
 * Test the ball against the brick array.  On a hit the first encountered
 * brick's hp is decremented (and `alive` set to false when hp reaches 0).
 * Only one brick is processed per call (matching the component's break-on-first
 * behaviour to avoid tunnelling).
 *
 * The axis of reflection is determined by the closest edge (horizontal vs
 * vertical overlap distance), identical to the component's minH/minV logic.
 *
 * Returns a BrickCollisionResult; the `bricks` array is mutated in-place.
 */
export function collideBrick(
  ball: BallState,
  bricks: BrickData[],
): BrickCollisionResult {
  const { x, y, r } = ball;
  let vx = ball.vx;
  let vy = ball.vy;

  for (let i = 0; i < bricks.length; i++) {
    const b = bricks[i];
    if (!b.alive) continue;

    const overlapX = x > b.x - r && x < b.x + b.w + r;
    const overlapY = y > b.y - r && y < b.y + b.h + r;
    if (!overlapX || !overlapY) continue;

    // Determine which axis to reflect on
    const fromLeft  = Math.abs(x - (b.x + b.w));
    const fromRight = Math.abs(x - b.x);
    const fromTop   = Math.abs(y - (b.y + b.h));
    const fromBot   = Math.abs(y - b.y);
    const minH = Math.min(fromLeft, fromRight);
    const minV = Math.min(fromTop, fromBot);

    if (minH < minV) vx = -vx;
    else vy = -vy;

    b.hp--;
    if (b.hp <= 0) b.alive = false;

    return { hit: true, vx, vy, brickIndex: i };
  }

  return { hit: false, vx: ball.vx, vy: ball.vy, brickIndex: -1 };
}

// ---------------------------------------------------------------------------
// Win / lose predicates
// ---------------------------------------------------------------------------

/**
 * Returns true when every brick has been cleared (all `alive === false`).
 * An empty array is considered cleared (win).
 */
export function allBricksCleared(bricks: BrickData[]): boolean {
  return bricks.every((b) => !b.alive);
}

/**
 * Returns true when the ball has passed below the bottom of the canvas —
 * i.e. the player has lost a life / ball is out of play.
 */
export function isBallLost(ball: BallState, H: number): boolean {
  return ball.y - ball.r > H;
}

/**
 * Compute the score awarded when a brick is hit.
 * Matching the component: +10 * lvl for a kill, +5 * lvl for a damage hit.
 */
export function brickHitScore(brick: BrickData, lvl: number): number {
  // After collideBrick has already decremented hp:
  // hp === 0 means just killed (was 1), hp > 0 means damaged (was 2+)
  return brick.hp <= 0 ? 10 * lvl : 5 * lvl;
}
