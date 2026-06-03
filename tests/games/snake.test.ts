import { describe, it, expect } from "vitest";
import { makeRng } from "~/utils/rng";
import {
  stepSnake,
  placeFood,
  resolveDir,
  isLegalDir,
  DIRS,
  OPP,
  type Point,
  type Dir,
} from "~/games/snake";

// Helper: deterministic RNG that always returns 0 so food is placed at
// free[0] (top-left-most free cell). Keeps tests fully predictable.
const rng0 = () => makeRng(0);

// Helper: build a snake from an array of [x,y] tuples (head first).
function pts(...coords: [number, number][]): Point[] {
  return coords.map(([x, y]) => ({ x, y }));
}

const GRID = 5; // small grid for fast, readable tests

// ---------------------------------------------------------------------------
// stepSnake – movement
// ---------------------------------------------------------------------------

describe("stepSnake — movement", () => {
  it("moves the head one cell in the current direction", () => {
    const snake = pts([2, 2], [1, 2], [0, 2]);
    const result = stepSnake(snake, "right", null, GRID, false, rng0());
    expect(result.dead).toBe(false);
    expect(result.snake[0]).toEqual({ x: 3, y: 2 });
  });

  it("body follows the head (no growth when no food)", () => {
    const snake = pts([2, 2], [1, 2], [0, 2]);
    const result = stepSnake(snake, "right", null, GRID, false, rng0());
    // After step right: head = {3,2}, body = previous head {2,2}, then {1,2}
    expect(result.snake).toEqual(pts([3, 2], [2, 2], [1, 2]));
    expect(result.snake).toHaveLength(3); // no growth
  });

  it("moves up correctly", () => {
    const snake = pts([2, 2], [2, 3]);
    const result = stepSnake(snake, "up", null, GRID, false, rng0());
    expect(result.snake[0]).toEqual({ x: 2, y: 1 });
  });

  it("moves down correctly", () => {
    const snake = pts([2, 2], [2, 1]);
    const result = stepSnake(snake, "down", null, GRID, false, rng0());
    expect(result.snake[0]).toEqual({ x: 2, y: 3 });
  });

  it("moves left correctly", () => {
    const snake = pts([2, 2], [3, 2]);
    const result = stepSnake(snake, "left", null, GRID, false, rng0());
    expect(result.snake[0]).toEqual({ x: 1, y: 2 });
  });
});

// ---------------------------------------------------------------------------
// stepSnake – eating and growth
// ---------------------------------------------------------------------------

describe("stepSnake — eating food", () => {
  it("grows by one segment when eating food", () => {
    const snake = pts([2, 2], [1, 2], [0, 2]);
    const food: Point = { x: 3, y: 2 };
    const result = stepSnake(snake, "right", food, GRID, false, rng0());
    expect(result.ate).toBe(true);
    expect(result.dead).toBe(false);
    expect(result.snake).toHaveLength(4); // was 3, now 4
  });

  it("new head is on the food cell after eating", () => {
    const snake = pts([2, 2], [1, 2]);
    const food: Point = { x: 3, y: 2 };
    const result = stepSnake(snake, "right", food, GRID, false, rng0());
    expect(result.snake[0]).toEqual({ x: 3, y: 2 });
  });

  it("old body is preserved intact after eating (tail not removed)", () => {
    const snake = pts([2, 2], [1, 2], [0, 2]);
    const food: Point = { x: 3, y: 2 };
    const result = stepSnake(snake, "right", food, GRID, false, rng0());
    // The entire old snake should still be in positions 1-3
    expect(result.snake[1]).toEqual({ x: 2, y: 2 });
    expect(result.snake[2]).toEqual({ x: 1, y: 2 });
    expect(result.snake[3]).toEqual({ x: 0, y: 2 });
  });

  it("spawns new food after eating", () => {
    const snake = pts([2, 2], [1, 2]);
    const food: Point = { x: 3, y: 2 };
    const result = stepSnake(snake, "right", food, GRID, false, rng0());
    // New food must exist and not be on the snake
    expect(result.food).not.toBeNull();
    const snakeSet = new Set(result.snake.map((p) => p.x + "," + p.y));
    expect(snakeSet.has(result.food!.x + "," + result.food!.y)).toBe(false);
  });

  it("does not mark ate=true when head passes a non-food cell", () => {
    const snake = pts([2, 2], [1, 2]);
    const food: Point = { x: 0, y: 0 }; // not in the path
    const result = stepSnake(snake, "right", food, GRID, false, rng0());
    expect(result.ate).toBe(false);
    expect(result.snake).toHaveLength(2); // no growth
  });
});

// ---------------------------------------------------------------------------
// stepSnake – wall collision (no-wrap)
// ---------------------------------------------------------------------------

describe("stepSnake — wall collision (wrap=false)", () => {
  it("dies hitting left wall", () => {
    const snake = pts([0, 2], [1, 2]);
    const result = stepSnake(snake, "left", null, GRID, false, rng0());
    expect(result.dead).toBe(true);
  });

  it("dies hitting right wall", () => {
    const snake = pts([4, 2], [3, 2]);
    const result = stepSnake(snake, "right", null, GRID, false, rng0());
    expect(result.dead).toBe(true);
  });

  it("dies hitting top wall", () => {
    const snake = pts([2, 0], [2, 1]);
    const result = stepSnake(snake, "up", null, GRID, false, rng0());
    expect(result.dead).toBe(true);
  });

  it("dies hitting bottom wall", () => {
    const snake = pts([2, 4], [2, 3]);
    const result = stepSnake(snake, "down", null, GRID, false, rng0());
    expect(result.dead).toBe(true);
  });

  it("one cell from wall does NOT die", () => {
    const snake = pts([1, 2], [2, 2]);
    const result = stepSnake(snake, "left", null, GRID, false, rng0());
    expect(result.dead).toBe(false);
    expect(result.snake[0]).toEqual({ x: 0, y: 2 });
  });
});

// ---------------------------------------------------------------------------
// stepSnake – wrap mode
// ---------------------------------------------------------------------------

describe("stepSnake — wrap mode (wrap=true)", () => {
  it("wraps from right edge to left", () => {
    const snake = pts([4, 2], [3, 2]);
    const result = stepSnake(snake, "right", null, GRID, true, rng0());
    expect(result.dead).toBe(false);
    expect(result.snake[0]).toEqual({ x: 0, y: 2 });
  });

  it("wraps from left edge to right", () => {
    const snake = pts([0, 2], [1, 2]);
    const result = stepSnake(snake, "left", null, GRID, true, rng0());
    expect(result.dead).toBe(false);
    expect(result.snake[0]).toEqual({ x: 4, y: 2 });
  });

  it("wraps from top edge to bottom", () => {
    const snake = pts([2, 0], [2, 1]);
    const result = stepSnake(snake, "up", null, GRID, true, rng0());
    expect(result.dead).toBe(false);
    expect(result.snake[0]).toEqual({ x: 2, y: 4 });
  });

  it("wraps from bottom edge to top", () => {
    const snake = pts([2, 4], [2, 3]);
    const result = stepSnake(snake, "down", null, GRID, true, rng0());
    expect(result.dead).toBe(false);
    expect(result.snake[0]).toEqual({ x: 2, y: 0 });
  });
});

// ---------------------------------------------------------------------------
// stepSnake – self-collision
// ---------------------------------------------------------------------------

describe("stepSnake — self-collision", () => {
  it("dies when head moves into the body", () => {
    // Snake going right then snaking back: head at (2,2), body at (1,2),(1,1),(2,1),(2,2) is not reachable
    // Instead: a U-shape where head would step into the neck from the side
    // Snake: (2,1),(1,1),(0,1),(0,2),(1,2),(2,2) — head at (2,1), going down -> (2,2) which is the tail
    // With length-1 limit (no food), the tail at (2,2) MOVES away, so this is NOT a collision.
    // Use a snake long enough to ensure self-hit on a non-tail segment:
    // Snake going left, body curls below:
    //   head=(2,0), body=(3,0),(4,0),(4,1),(3,1),(2,1) — going "up" from head (2,0) goes to (2,-1) = wall
    // Try: head at (1,1), going up -> (1,0), body includes (1,0)
    const snake = pts([1, 1], [2, 1], [2, 0], [1, 0]);
    // head at (1,1), direction up -> new head (1,0) = snake[3] which is NOT the tail
    // limit = snake.length - 1 = 3, check indices 0,1,2 -> snake[2]={2,0} not hit, but (1,0) matches snake[3]
    // Wait, limit=3 means we check i=0,1,2. snake[3]={1,0} is NOT checked. So this is allowed.
    // Let's use a snake where the target IS within the checked range.
    // Snake: head=(2,1), going up -> (2,0); body: (1,1),(1,0),(2,0) — snake[3]=(2,0) is the tail
    // With no food: limit = 4-1=3, check i=0,1,2. snake[2]={1,0} != {2,0}. snake[1]={1,1} != {2,0}. snake[0]={2,1}!={2,0}. So NOT a collision, tail moves away. Correct.
    // Need: hit a NON-tail segment.
    // Snake going right: head=(0,0), body=(0,1),(1,1),(2,1),(2,0),(1,0) — going right -> (1,0) = snake[5] which IS the tail
    // With limit=5: check i=0..4. snake[4]=(2,0)!=(1,0), snake[3]=(2,1)!=(1,0), snake[2]=(1,1)!=(1,0), snake[1]=(0,1)!=(1,0), snake[0]=(0,0)!=(1,0). No hit. Tail moves away.
    // For a guaranteed self-hit: move head INTO the NECK or middle of the body.
    // Simple: U-shape, head steps into second segment
    // snake = [(1,0),(2,0),(2,1),(1,1),(0,1),(0,0)] going left -> (0,0) = snake[5] = tail. limit=5: check i=0..4. (0,0) not in those. Not a collision (tail moves).
    //
    // Use snake where the SECOND segment (index 1) is hit:
    //   snake = [(1,1),(0,1),(0,0),(1,0),(2,0),(2,1),(2,2),(1,2),(0,2)]
    //   going "up" from (1,1) -> (1,0) = snake[3], limit=8, check i=0..7, snake[3]=(1,0) hit -> DEAD
    const bigSnake = pts([1,1],[0,1],[0,0],[1,0],[2,0],[2,1],[2,2],[1,2],[0,2]);
    const result = stepSnake(bigSnake, "up", null, 10, false, rng0());
    expect(result.dead).toBe(true);
  });

  it("does NOT die when the head only reaches the tail that moves away (no food)", () => {
    // head=(0,1), body=(0,2),(1,2),(1,1),(1,0),(0,0) — going down -> (0,2) = snake[1]
    // limit = 6-1=5, check i=0..4. snake[1]={0,2}, snake[0]={0,1}.
    // Wait, (0,2) = snake[1] and index 1 < limit 5: this IS a hit.
    // Let's use: head=(3,0), body=(2,0),(1,0),(0,0),(0,1),(1,1),(2,1),(3,1),(3,0) — wait, can't reuse head position.
    //
    // Simplest "tail escape": linear snake, head chasing tail from behind.
    //   snake = [(0,0),(1,0),(2,0),(3,0),(4,0)] going left — hits NOTHING, tail was at (4,0) which is at index 4
    //   Actually going left from (0,0) would go to (-1,0) — wall!
    //
    // head=(1,0), body=(0,0) -- only 2 cells, going right -> (2,0): safe obviously
    //
    // The tail-escape scenario: head is about to step onto the cell where the current tail is.
    // The tail at index n-1 will vacate, so it's safe.
    //   snake = [(2,0),(1,0),(0,0),(0,1),(1,1),(2,1)] going down -> (2,1) = snake[5] = TAIL
    //   limit = 6-1 = 5, check i=0..4: none of them are (2,1) since snake[5] is excluded. SAFE.
    const snake = pts([2,0],[1,0],[0,0],[0,1],[1,1],[2,1]);
    const result = stepSnake(snake, "down", null, 10, false, rng0());
    expect(result.dead).toBe(false);
    expect(result.snake[0]).toEqual({ x: 2, y: 1 });
  });

  it("dies stepping into the tail when eating (tail does NOT move away)", () => {
    // When eating, the tail stays (growth), so even the tail cell is lethal.
    //   snake = [(2,0),(1,0),(0,0),(0,1),(1,1),(2,1)] going down, food at (2,1)
    //   Same layout as above, but this time there's food at (2,1) = the tail.
    //   limit = snake.length = 6 (includes tail), snake[5]=(2,1) matches new head -> DEAD.
    const snake = pts([2,0],[1,0],[0,0],[0,1],[1,1],[2,1]);
    const food: Point = { x: 2, y: 1 };
    const result = stepSnake(snake, "down", food, 10, false, rng0());
    expect(result.dead).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveDir / isLegalDir — 180° reversal prevention
// ---------------------------------------------------------------------------

describe("resolveDir — 180° reversal prevention", () => {
  it("accepts a perpendicular direction", () => {
    expect(resolveDir("right", "up")).toBe("up");
    expect(resolveDir("right", "down")).toBe("down");
    expect(resolveDir("up", "left")).toBe("left");
    expect(resolveDir("up", "right")).toBe("right");
  });

  it("accepts the same direction (no-op)", () => {
    expect(resolveDir("right", "right")).toBe("right");
    expect(resolveDir("up", "up")).toBe("up");
  });

  it("blocks a 180° reversal — keeps current direction", () => {
    expect(resolveDir("right", "left")).toBe("right");
    expect(resolveDir("left", "right")).toBe("left");
    expect(resolveDir("up", "down")).toBe("up");
    expect(resolveDir("down", "up")).toBe("down");
  });
});

describe("isLegalDir", () => {
  it("returns false for opposite direction (180° reversal)", () => {
    expect(isLegalDir("right", "left")).toBe(false);
    expect(isLegalDir("up", "down")).toBe(false);
  });

  it("returns true for same or perpendicular direction", () => {
    expect(isLegalDir("right", "right")).toBe(true);
    expect(isLegalDir("right", "up")).toBe(true);
    expect(isLegalDir("right", "down")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// placeFood — seeded placement
// ---------------------------------------------------------------------------

describe("placeFood", () => {
  it("places food not on the snake", () => {
    const snake = pts([2, 2], [1, 2], [0, 2]);
    const food = placeFood(snake, GRID, rng0());
    expect(food).not.toBeNull();
    const snakeSet = new Set(snake.map((p) => p.x + "," + p.y));
    expect(snakeSet.has(food!.x + "," + food!.y)).toBe(false);
  });

  it("returns null when the board is completely full", () => {
    // Fill every cell of a 2×2 grid with the snake
    const snake = pts([0, 0], [1, 0], [0, 1], [1, 1]);
    const food = placeFood(snake, 2, rng0());
    expect(food).toBeNull();
  });

  it("is deterministic for the same RNG seed", () => {
    const snake = pts([2, 2], [1, 2]);
    const f1 = placeFood(snake, GRID, makeRng(42));
    const f2 = placeFood(snake, GRID, makeRng(42));
    expect(f1).toEqual(f2);
  });

  it("food is within grid bounds", () => {
    const snake = pts([2, 2]);
    for (let seed = 0; seed < 20; seed++) {
      const food = placeFood(snake, GRID, makeRng(seed));
      if (food !== null) {
        expect(food.x).toBeGreaterThanOrEqual(0);
        expect(food.x).toBeLessThan(GRID);
        expect(food.y).toBeGreaterThanOrEqual(0);
        expect(food.y).toBeLessThan(GRID);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// OPP and DIRS constants
// ---------------------------------------------------------------------------

describe("DIRS and OPP constants", () => {
  it("every direction has a correct opposite", () => {
    for (const d of ["up", "down", "left", "right"] as Dir[]) {
      expect(OPP[OPP[d]]).toBe(d); // double-opposite is identity
    }
  });

  it("DIRS vectors are unit length and correct", () => {
    expect(DIRS.up).toEqual({ x: 0, y: -1 });
    expect(DIRS.down).toEqual({ x: 0, y: 1 });
    expect(DIRS.left).toEqual({ x: -1, y: 0 });
    expect(DIRS.right).toEqual({ x: 1, y: 0 });
  });

  it("opposite direction vectors cancel out", () => {
    for (const d of ["up", "down", "left", "right"] as Dir[]) {
      const v = DIRS[d];
      const opp = DIRS[OPP[d]];
      expect(v.x + opp.x).toBe(0);
      expect(v.y + opp.y).toBe(0);
    }
  });
});
