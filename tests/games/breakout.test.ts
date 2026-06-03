import { describe, it, expect } from "vitest";
import {
  buildBricks,
  reflectWalls,
  reflectPaddle,
  collideBrick,
  allBricksCleared,
  isBallLost,
  brickHitScore,
  COLS,
  BRICK_ROWS,
  LIVES_START,
  TOTAL_LEVELS,
  type BallState,
  type PaddleState,
  type BrickData,
} from "~/games/breakout";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBall(overrides: Partial<BallState> = {}): BallState {
  return { x: 100, y: 100, vx: 2, vy: 3, r: 8, ...overrides };
}

function makePaddle(overrides: Partial<PaddleState> = {}): PaddleState {
  return { x: 60, y: 500, w: 100, h: 12, ...overrides };
}

/** Minimal brick sitting at given position, alive, 1 hp by default. */
function makeBrick(
  overrides: Partial<BrickData & { x: number; y: number; w: number; h: number }> = {},
): BrickData {
  return {
    col: 0, row: 0, hp: 1, maxHp: 1, alive: true,
    x: 80, y: 80, w: 60, h: 20,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildBricks
// ---------------------------------------------------------------------------

describe("buildBricks", () => {
  it("returns COLS * BRICK_ROWS bricks", () => {
    const bricks = buildBricks("test", 1);
    expect(bricks).toHaveLength(COLS * BRICK_ROWS);
  });

  it("all bricks start alive with x/y/w/h = 0 (pixel layout not done yet)", () => {
    const bricks = buildBricks("test", 1);
    expect(bricks.every((b) => b.alive)).toBe(true);
    expect(bricks.every((b) => b.x === 0 && b.y === 0 && b.w === 0 && b.h === 0)).toBe(true);
  });

  it("is deterministic for the same seed+level", () => {
    const a = buildBricks("seed42", 2);
    const b = buildBricks("seed42", 2);
    expect(a.map((x) => x.hp)).toEqual(b.map((x) => x.hp));
  });

  it("different seeds produce different layouts", () => {
    const a = buildBricks("alpha", 1);
    const b = buildBricks("beta", 1);
    // Very unlikely all hp values match; check aggregates differ
    const hpA = a.map((x) => x.hp).join(",");
    const hpB = b.map((x) => x.hp).join(",");
    expect(hpA).not.toBe(hpB);
  });

  it("higher levels have more 2-hp bricks", () => {
    const lvl1 = buildBricks("lvl-test", 1);
    const lvl3 = buildBricks("lvl-test", 3);
    const tough1 = lvl1.filter((b) => b.maxHp === 2).length;
    const tough3 = lvl3.filter((b) => b.maxHp === 2).length;
    expect(tough3).toBeGreaterThan(tough1);
  });

  it("each brick has the correct col and row assigned", () => {
    const bricks = buildBricks("col-row", 1);
    let idx = 0;
    for (let row = 0; row < BRICK_ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        expect(bricks[idx].col).toBe(col);
        expect(bricks[idx].row).toBe(row);
        idx++;
      }
    }
  });

  it("null seed is accepted and returns a valid brick grid", () => {
    // null seed is used when no seed prop is provided
    const bricks = buildBricks(null, 1);
    expect(bricks).toHaveLength(COLS * BRICK_ROWS);
    // Null seed is deterministic (makeRng("null-1"))
    const bricks2 = buildBricks(null, 1);
    expect(bricks.map((b) => b.hp)).toEqual(bricks2.map((b) => b.hp));
  });
});

// ---------------------------------------------------------------------------
// reflectWalls
// ---------------------------------------------------------------------------

describe("reflectWalls — wall reflection", () => {
  const W = 400;

  it("left wall: x flips to positive vx", () => {
    // Ball touching / crossing left wall (x - r < 0)
    const ball = makeBall({ x: 5, y: 200, vx: -3, vy: 2, r: 8 });
    const out = reflectWalls(ball, W);
    expect(out.vx).toBeGreaterThan(0); // always moves right after left-wall hit
    expect(out.x).toBe(8);             // clamped to r
    expect(out.vy).toBe(2);            // vy unchanged
  });

  it("right wall: x flips to negative vx", () => {
    const ball = makeBall({ x: W - 4, y: 200, vx: 3, vy: 2, r: 8 });
    const out = reflectWalls(ball, W);
    expect(out.vx).toBeLessThan(0);    // always moves left after right-wall hit
    expect(out.x).toBe(W - 8);        // clamped to W - r
    expect(out.vy).toBe(2);
  });

  it("top wall: y flips to positive vy", () => {
    const ball = makeBall({ x: 200, y: 5, vx: 2, vy: -3, r: 8 });
    const out = reflectWalls(ball, W);
    expect(out.vy).toBeGreaterThan(0); // always moves down after top-wall hit
    expect(out.y).toBe(8);             // clamped to r
    expect(out.vx).toBe(2);
  });

  it("ball in the middle of the field — nothing changes", () => {
    const ball = makeBall({ x: 200, y: 200, vx: 2, vy: -3, r: 8 });
    const out = reflectWalls(ball, W);
    expect(out).toEqual({ x: 200, y: 200, vx: 2, vy: -3 });
  });

  it("corner hit (left + top simultaneously) reflects both axes", () => {
    const ball = makeBall({ x: 4, y: 4, vx: -2, vy: -2, r: 8 });
    const out = reflectWalls(ball, W);
    expect(out.vx).toBeGreaterThan(0);
    expect(out.vy).toBeGreaterThan(0);
  });

  it("exact edge (x - r == 0) is NOT reflected — ball exactly touching, not crossing", () => {
    // x - r === 0 means x == r, which means x - r < 0 is false → no flip
    const ball = makeBall({ x: 8, y: 200, vx: -2, vy: 1, r: 8 });
    // x - r = 0, condition is strictly <0, so no reflection
    const out = reflectWalls(ball, W);
    expect(out.vx).toBe(-2); // unchanged — boundary case, strictly outside range
  });
});

// ---------------------------------------------------------------------------
// reflectPaddle
// ---------------------------------------------------------------------------

describe("reflectPaddle — paddle reflection", () => {
  it("ball moving downward, directly over paddle centre — bounces back up", () => {
    const paddle = makePaddle({ x: 60, y: 490, w: 100, h: 12 });
    // Ball 1px inside the paddle: y + r = 491 > paddle.y (490)
    const ball = makeBall({ x: 110, y: 483, vx: 0, vy: 4, r: 8 });
    const out = reflectPaddle(ball, paddle);
    expect(out.vy).toBeLessThan(0); // must go upward after paddle hit
    expect(out.y).toBe(paddle.y - ball.r); // clamped to paddle surface
  });

  it("ball moving upward — no paddle reflection (vy <= 0)", () => {
    const paddle = makePaddle({ x: 60, y: 490, w: 100, h: 12 });
    const ball = makeBall({ x: 110, y: 483, vx: 0, vy: -4, r: 8 });
    const out = reflectPaddle(ball, paddle);
    expect(out.vy).toBe(-4); // unchanged
    expect(out.y).toBe(483); // unchanged
  });

  it("ball outside paddle horizontally (left) — no reflection", () => {
    const paddle = makePaddle({ x: 60, y: 490, w: 100, h: 12 });
    // Ball to the left of the paddle (x=50 < paddle.x=60 → outside)
    const ball = makeBall({ x: 50, y: 483, vx: 0, vy: 4, r: 8 });
    const out = reflectPaddle(ball, paddle);
    expect(out.vy).toBe(4); // unchanged
  });

  it("ball outside paddle horizontally (right) — no reflection", () => {
    const paddle = makePaddle({ x: 60, y: 490, w: 100, h: 12 });
    // Ball to the right of the paddle (x=175 > paddle.x+paddle.w=160 → outside)
    const ball = makeBall({ x: 175, y: 483, vx: 0, vy: 4, r: 8 });
    const out = reflectPaddle(ball, paddle);
    expect(out.vy).toBe(4); // unchanged
  });

  it("vy is clamped to at least ±1.5 after paddle hit (prevents near-horizontal bounce)", () => {
    // Hitting the very edge of the paddle gives nearly horizontal angle
    const paddle = makePaddle({ x: 0, y: 490, w: 100, h: 12 });
    // Ball at the far right edge of the paddle: relX ≈ 1
    // y + r = 483 + 8 = 491 > paddle.y (490) → hit condition met
    const ball = makeBall({ x: 99, y: 483, vx: 0, vy: 4, r: 8 });
    const out = reflectPaddle(ball, paddle);
    // After reflection vy must be negative AND have magnitude ≥ 1.5
    expect(out.vy).toBeLessThanOrEqual(-1.5);
  });

  it("clamp engages on a slow edge hit — |vy| would be < 1.5, so it snaps to -1.5", () => {
    // The previous case has enough speed that the post-bounce |vy| (~1.9) already
    // exceeds 1.5, so the clamp body never runs. A slow edge hit makes the natural
    // bounce nearly horizontal (|vy| ≈ 0.47 * speed): with speed 3 that is ~1.42,
    // below the 1.5 floor, so the negative clamp actually fires and forces -1.5.
    const paddle = makePaddle({ x: 0, y: 490, w: 100, h: 12 });
    const ball = makeBall({ x: 99, y: 483, vx: 0, vy: 3, r: 8 });
    const out = reflectPaddle(ball, paddle);
    expect(out.vy).toBe(-1.5); // clamped exactly to the floor, still heading up
  });

  it("paddle hit preserves ball speed (energy conservation)", () => {
    const paddle = makePaddle({ x: 60, y: 490, w: 100, h: 12 });
    // y + r = 483 + 8 = 491 > paddle.y (490) → hit condition met
    const ball = makeBall({ x: 110, y: 483, vx: 2, vy: 4, r: 8 });
    const speedBefore = Math.sqrt(ball.vx ** 2 + ball.vy ** 2);
    const out = reflectPaddle(ball, paddle);
    const speedAfter = Math.sqrt(out.vx ** 2 + out.vy ** 2);
    // Allow ±0.1 tolerance for vy clamping at edges
    expect(speedAfter).toBeGreaterThanOrEqual(speedBefore - 0.1);
  });
});

// ---------------------------------------------------------------------------
// collideBrick — brick collision and removal
// ---------------------------------------------------------------------------

describe("collideBrick — brick collision", () => {
  it("ball directly over a 1-hp brick: hit=true, brick removed, vy flips", () => {
    // Ball approaching from below (vy < 0) hitting a brick above it
    // Position: ball.y just below the brick bottom edge → fromBot small → vertical reflection
    const brick = makeBrick({ x: 80, y: 60, w: 60, h: 20 });
    // Ball centre approaching from below: y = 83 (brick bottom = 80), r = 8
    // overlap: x=110 in [80-8, 80+60+8]=>[72,148] ✓; y=83 in [60-8, 60+20+8]=>[52,88] ✓
    const ball = makeBall({ x: 110, y: 83, vx: 1, vy: -4, r: 8 });
    const bricks = [brick];
    const result = collideBrick(ball, bricks);
    expect(result.hit).toBe(true);
    expect(result.brickIndex).toBe(0);
    expect(bricks[0].alive).toBe(false); // 1-hp brick destroyed
    expect(bricks[0].hp).toBe(0);
  });

  it("hit on 2-hp brick: damages (hp=1) but does NOT remove it", () => {
    const brick = makeBrick({ x: 80, y: 60, w: 60, h: 20, hp: 2, maxHp: 2 });
    const ball = makeBall({ x: 110, y: 83, vx: 1, vy: -4, r: 8 });
    const bricks = [brick];
    collideBrick(ball, bricks);
    expect(bricks[0].alive).toBe(true); // still alive after 1st hit
    expect(bricks[0].hp).toBe(1);
  });

  it("two hits on 2-hp brick: first damages, second destroys", () => {
    const brick = makeBrick({ x: 80, y: 60, w: 60, h: 20, hp: 2, maxHp: 2 });
    const bricks = [brick];
    const ball1 = makeBall({ x: 110, y: 83, vx: 1, vy: -4, r: 8 });
    collideBrick(ball1, bricks);
    expect(bricks[0].alive).toBe(true);
    // Second hit — new ball state (vy now flipped to positive after first hit)
    const ball2 = makeBall({ x: 110, y: 77, vx: 1, vy: 4, r: 8 });
    const result2 = collideBrick(ball2, bricks);
    expect(result2.hit).toBe(true);
    expect(bricks[0].alive).toBe(false);
  });

  it("ball completely outside brick zone — no hit", () => {
    const brick = makeBrick({ x: 80, y: 60, w: 60, h: 20 });
    const ball = makeBall({ x: 300, y: 300, vx: 1, vy: -3, r: 8 });
    const bricks = [brick];
    const result = collideBrick(ball, bricks);
    expect(result.hit).toBe(false);
    expect(result.brickIndex).toBe(-1);
    expect(bricks[0].alive).toBe(true);
  });

  it("dead brick is skipped", () => {
    const brick = makeBrick({ x: 80, y: 60, w: 60, h: 20, hp: 0, alive: false });
    const ball = makeBall({ x: 110, y: 83, vx: 1, vy: -4, r: 8 });
    const bricks = [brick];
    const result = collideBrick(ball, bricks);
    expect(result.hit).toBe(false);
  });

  it("side hit (horizontal penetration) flips vx not vy", () => {
    // Ball coming from the side: approach from the right edge of brick
    // Brick at x=100, w=60 → right edge at x=160
    // Ball at x=162, y at brick vertical centre → fromLeft=abs(162-(100+60))=2, fromRight=abs(162-100)=62
    // minH = min(2,62) = 2; fromTop/fromBot both large (ball at y=70 vs brick 60..80 = midpoint)
    // minH(2) < minV(large) → vx flips
    const brick = makeBrick({ x: 100, y: 60, w: 60, h: 20 });
    const ball = makeBall({ x: 162, y: 70, vx: -5, vy: 1, r: 8 });
    const bricks = [brick];
    const originalVy = ball.vy;
    const result = collideBrick(ball, bricks);
    expect(result.hit).toBe(true);
    expect(result.vx).toBe(-ball.vx); // vx flipped
    expect(result.vy).toBe(originalVy); // vy unchanged
  });

  it("top hit (vertical penetration) flips vy not vx", () => {
    // Ball coming from above the brick — fromBot small
    // Brick at y=100, h=20 → top edge at y=100
    // Ball at y=98, x at brick horizontal centre → fromBot=abs(98-100)=2, fromTop=abs(98-(100+20))=22
    // minV = min(22,2) = 2; minH is large
    // minH(large) >= minV(2) → vy flips
    const brick = makeBrick({ x: 80, y: 100, w: 60, h: 20 });
    const ball = makeBall({ x: 110, y: 98, vx: 1, vy: 4, r: 8 });
    const bricks = [brick];
    const originalVx = ball.vx;
    const result = collideBrick(ball, bricks);
    expect(result.hit).toBe(true);
    expect(result.vy).toBe(-ball.vy); // vy flipped
    expect(result.vx).toBe(originalVx); // vx unchanged
  });

  it("only one brick is processed per call (break-on-first)", () => {
    // Two overlapping bricks — only the first alive one should be hit
    const brick1 = makeBrick({ x: 80, y: 60, w: 60, h: 20 });
    const brick2 = makeBrick({ x: 80, y: 60, w: 60, h: 20 });
    const ball = makeBall({ x: 110, y: 83, vx: 1, vy: -4, r: 8 });
    const bricks = [brick1, brick2];
    const result = collideBrick(ball, bricks);
    expect(result.brickIndex).toBe(0); // only brick 0 hit
    expect(bricks[1].alive).toBe(true); // brick1 still untouched
  });
});

// ---------------------------------------------------------------------------
// allBricksCleared — win condition
// ---------------------------------------------------------------------------

describe("allBricksCleared — win detection", () => {
  it("returns true when all bricks are dead", () => {
    const bricks = [
      makeBrick({ alive: false }),
      makeBrick({ alive: false }),
    ];
    expect(allBricksCleared(bricks)).toBe(true);
  });

  it("returns false when any brick is still alive", () => {
    const bricks = [
      makeBrick({ alive: false }),
      makeBrick({ alive: true }),
    ];
    expect(allBricksCleared(bricks)).toBe(false);
  });

  it("returns true for an empty array (edge case — degenerate win)", () => {
    expect(allBricksCleared([])).toBe(true);
  });

  it("clearing the last brick triggers win", () => {
    const bricks = [
      makeBrick({ x: 80, y: 60, w: 60, h: 20, hp: 1, alive: true }),
    ];
    const ball = makeBall({ x: 110, y: 83, vx: 1, vy: -4, r: 8 });
    collideBrick(ball, bricks); // destroys the last brick
    expect(allBricksCleared(bricks)).toBe(true); // win condition met
  });
});

// ---------------------------------------------------------------------------
// isBallLost — lose condition
// ---------------------------------------------------------------------------

describe("isBallLost — ball below canvas = life lost", () => {
  const H = 600;

  it("returns true when ball.y - ball.r > H", () => {
    const ball = makeBall({ y: 615, r: 8 }); // y - r = 607 > 600
    expect(isBallLost(ball, H)).toBe(true);
  });

  it("returns false when ball is still in play", () => {
    const ball = makeBall({ y: 500, r: 8 });
    expect(isBallLost(ball, H)).toBe(false);
  });

  it("returns false when ball is exactly at the bottom edge (y - r === H)", () => {
    const ball = makeBall({ y: H + 8, r: 8 }); // y - r = H, not > H
    expect(isBallLost(ball, H)).toBe(false);
  });

  it("returns true when ball just barely crosses the bottom", () => {
    const ball = makeBall({ y: H + 9, r: 8 }); // y - r = H + 1 > H
    expect(isBallLost(ball, H)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// brickHitScore
// ---------------------------------------------------------------------------

describe("brickHitScore — scoring", () => {
  it("killed brick (hp === 0 after hit) scores 10 * lvl", () => {
    const brick = makeBrick({ hp: 0, alive: false }); // post-collideBrick state
    expect(brickHitScore(brick, 1)).toBe(10);
    expect(brickHitScore(brick, 2)).toBe(20);
    expect(brickHitScore(brick, 3)).toBe(30);
  });

  it("damaged brick (hp > 0 after hit) scores 5 * lvl", () => {
    const brick = makeBrick({ hp: 1, alive: true }); // 2-hp brick damaged to 1
    expect(brickHitScore(brick, 1)).toBe(5);
    expect(brickHitScore(brick, 2)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

describe("exported constants", () => {
  it("COLS, BRICK_ROWS, LIVES_START, TOTAL_LEVELS match component expectations", () => {
    expect(COLS).toBe(10);
    expect(BRICK_ROWS).toBe(5);
    expect(LIVES_START).toBe(3);
    expect(TOTAL_LEVELS).toBe(3);
  });
});
