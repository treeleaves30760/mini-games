import { describe, it, expect } from "vitest";
import {
  WALL, FLOOR, TARGET,
  RAW_LEVELS,
  LEVELS,
  parseLevel,
  cellAt,
  boxAt,
  isTarget,
  isWon,
  applyMove,
  applyUndo,
  makeLevelState,
} from "~/games/sokoban";
import type { ParsedLevel } from "~/games/sokoban";

// ---------------------------------------------------------------------------
// BFS solver — proves a level is actually winnable (win = every box on a
// target) and hands back the shortest move sequence so the tests can replay it
// through the game's own applyMove(). This is the real "no unwinnable levels"
// invariant; an equal box/target count does NOT imply solvability (a
// corner-locked box can make a perfectly balanced level impossible).
//
// The rules mirror applyMove exactly: 4-directional steps, out-of-bounds is a
// wall (cellAt), a box moves one cell only when the cell beyond it is neither
// wall nor box, and boxes are never pulled.
// ---------------------------------------------------------------------------
type Step = [number, number];
const DIRS: Step[] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

/** Shortest solution as (dx, dy) steps, or null if none is found within `limit` states. */
function solveLevel(lv: ParsedLevel, limit = 5_000_000): Step[] | null {
  const targetKeys = new Set(lv.targets.map((t) => `${t.x},${t.y}`));
  const isWall = (x: number, y: number) => cellAt(lv, x, y) === WALL;
  const won = (bs: string[]) => bs.every((b) => targetKeys.has(b));
  const ser = (p: string, bs: string[]) => p + "|" + bs.join(";");
  const start = { p: `${lv.px},${lv.py}`, bs: lv.boxes.map((b) => `${b.x},${b.y}`).sort() };
  if (won(start.bs)) return [];
  const startKey = ser(start.p, start.bs);
  // parent pointers: state key -> [previous state key, step that led here]
  const parent = new Map<string, [string, Step] | null>([[startKey, null]]);
  const pathTo = (key: string): Step[] => {
    const path: Step[] = [];
    for (let e = parent.get(key); e; e = parent.get(e[0])) path.push(e[1]);
    return path.reverse();
  };
  let frontier = [{ key: startKey, ...start }];
  let states = 0;
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const st of frontier) {
      const [px, py] = st.p.split(",").map(Number);
      for (const step of DIRS) {
        const [dx, dy] = step;
        const nx = px + dx, ny = py + dy;
        if (isWall(nx, ny)) continue;
        const nk = `${nx},${ny}`;
        let bs = st.bs;
        const bi = st.bs.indexOf(nk);
        if (bi !== -1) {
          const bx = nx + dx, by = ny + dy;
          const bk = `${bx},${by}`;
          if (isWall(bx, by) || st.bs.includes(bk)) continue; // box blocked
          bs = st.bs.slice();
          bs[bi] = bk;
          bs.sort();
        }
        const key = ser(nk, bs);
        if (parent.has(key)) continue;
        parent.set(key, [st.key, step]);
        if (won(bs)) return pathTo(key);
        next.push({ key, p: nk, bs });
        if (++states > limit) return null;
      }
    }
    frontier = next;
  }
  return null;
}

/** Shortest solutions of the bundled levels, computed once and shared by the tests below. */
const SOLUTIONS = LEVELS.map((lv) => solveLevel(lv));

// ---------------------------------------------------------------------------
// Helpers: tiny hand-crafted levels for deterministic unit tests
// ---------------------------------------------------------------------------

/**
 * Single-row corridor:  # @ $ . #
 * Player at x=1, box at x=2, target at x=3.
 * Moving right should push the box onto the target → win.
 */
const CORRIDOR_RAW = {
  name: "corridor",
  map: ["#@$.#"],
};
const CORRIDOR = parseLevel(CORRIDOR_RAW);

/**
 * 3×2 room with player, one box, one target:
 *   #####
 *   #@$ #
 *   # . #
 *   #####
 * Player (1,1), box (2,1), target (2,2).
 * Used for plain-move tests. Note the level is deliberately NOT solvable: the
 * box hugs the top wall, so every push sends it into a corner off-target — it
 * doubles as the solver's negative example.
 */
const ROOM_RAW = {
  name: "room",
  map: [
    "#####",
    "#@$ #",
    "# . #",
    "#####",
  ],
};
const ROOM = parseLevel(ROOM_RAW);

/**
 * Two-box level:
 *   ######
 *   #@$$ #
 *   # .. #
 *   ######
 * Player (1,1), boxes at (2,1) and (3,1), targets (2,2) and (3,2).
 * Pushing right is blocked because the two boxes are adjacent and
 * the cell beyond the second box is a wall.
 */
const TWO_BOX_RAW = {
  name: "two-box",
  map: [
    "######",
    "#@$$ #",
    "# .. #",
    "######",
  ],
};
const TWO_BOX = parseLevel(TWO_BOX_RAW);

/**
 * Wall-blocked push:
 *   #####
 *   #@$##
 *   #####
 * Player (1,1), box (2,1), wall at (3,1).
 * Pushing right must be blocked.
 */
const WALL_BLOCKED_RAW = {
  name: "wall-blocked",
  map: [
    "#####",
    "#@$##",
    "#####",
  ],
};
const WALL_BLOCKED = parseLevel(WALL_BLOCKED_RAW);

// ---------------------------------------------------------------------------
// parseLevel
// ---------------------------------------------------------------------------
describe("parseLevel", () => {
  it("locates the player position", () => {
    expect(CORRIDOR.px).toBe(1);
    expect(CORRIDOR.py).toBe(0);
  });

  it("finds all boxes", () => {
    expect(CORRIDOR.boxes).toHaveLength(1);
    expect(CORRIDOR.boxes[0]).toEqual({ x: 2, y: 0 });
  });

  it("finds all targets", () => {
    expect(CORRIDOR.targets).toHaveLength(1);
    expect(CORRIDOR.targets[0]).toEqual({ x: 3, y: 0 });
  });

  it("produces a clean grid (no player/box chars)", () => {
    for (const row of CORRIDOR.grid) {
      for (const cell of row) {
        expect(["#", " ", "."]).toContain(cell);
      }
    }
  });

  it("pads rows to uniform width", () => {
    const uneven = parseLevel({ name: "u", map: ["###", "#@$", "#"] });
    const widths = uneven.grid.map((r) => r.length);
    expect(new Set(widths).size).toBe(1);
  });

  it("recognises player-on-target (+)", () => {
    const lv = parseLevel({ name: "pt", map: ["#####", "#+$.#", "#####"] });
    expect(lv.px).toBe(1);
    expect(lv.py).toBe(1);
    // player-on-target → that cell becomes TARGET in the clean grid
    expect(lv.grid[1][1]).toBe(TARGET);
    expect(lv.targets.some((t) => t.x === 1 && t.y === 1)).toBe(true);
  });

  it("recognises box-on-target (*)", () => {
    const lv = parseLevel({ name: "bt", map: ["#####", "#@*.#", "#####"] });
    // * → box at (2,1), target at (2,1)
    expect(lv.boxes[0]).toEqual({ x: 2, y: 1 });
    expect(lv.targets.some((t) => t.x === 2 && t.y === 1)).toBe(true);
    // clean grid: that cell is TARGET (.)
    expect(lv.grid[1][2]).toBe(TARGET);
  });

  it("two-box level has two boxes and two targets", () => {
    expect(TWO_BOX.boxes).toHaveLength(2);
    expect(TWO_BOX.targets).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// cellAt, boxAt, isTarget
// ---------------------------------------------------------------------------
describe("cellAt", () => {
  it("returns WALL for out-of-bounds coordinates", () => {
    expect(cellAt(CORRIDOR, -1, 0)).toBe(WALL);
    expect(cellAt(CORRIDOR, 100, 0)).toBe(WALL);
    expect(cellAt(CORRIDOR, 0, 100)).toBe(WALL);
  });

  it("returns WALL for wall cells", () => {
    expect(cellAt(CORRIDOR, 0, 0)).toBe(WALL);
    expect(cellAt(CORRIDOR, 4, 0)).toBe(WALL);
  });

  it("returns FLOOR for floor cells", () => {
    expect(cellAt(CORRIDOR, 1, 0)).toBe(FLOOR);
    expect(cellAt(CORRIDOR, 2, 0)).toBe(FLOOR);
  });

  it("returns TARGET for target cells", () => {
    expect(cellAt(CORRIDOR, 3, 0)).toBe(TARGET);
  });
});

describe("boxAt", () => {
  it("returns index when a box is at the position", () => {
    const boxes = [{ x: 2, y: 0 }];
    expect(boxAt(boxes, 2, 0)).toBe(0);
  });

  it("returns -1 when no box is at the position", () => {
    const boxes = [{ x: 2, y: 0 }];
    expect(boxAt(boxes, 1, 0)).toBe(-1);
  });
});

describe("isTarget", () => {
  it("true for a target cell", () => {
    expect(isTarget(CORRIDOR, 3, 0)).toBe(true);
  });

  it("false for a non-target cell", () => {
    expect(isTarget(CORRIDOR, 1, 0)).toBe(false);
    expect(isTarget(CORRIDOR, 0, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isWon
// ---------------------------------------------------------------------------
describe("isWon", () => {
  it("false when no box is on a target", () => {
    const state = makeLevelState(0); // level index 0 = 初探
    expect(isWon(LEVELS[0], state.boxes)).toBe(false);
  });

  it("true when every box is on a target", () => {
    // CORRIDOR: box needs to be at (3,0) which is the target
    expect(isWon(CORRIDOR, [{ x: 3, y: 0 }])).toBe(true);
  });

  it("false when only some boxes are on targets", () => {
    // TWO_BOX: two targets at (2,2) and (3,2); put only one box on target
    expect(isWon(TWO_BOX, [{ x: 2, y: 2 }, { x: 3, y: 1 }])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyMove — basic player movement
// ---------------------------------------------------------------------------
describe("applyMove — plain move (no box)", () => {
  it("moves the player into an empty cell", () => {
    // ROOM: player at (1,1), moving right to (2,1) is occupied by a box —
    // use moving DOWN first: (1,1) → (1,2) is FLOOR in row 2 col 1 = ' '
    const state = makeLevelState(1); // level index 1 = 轉角; use ROOM for clarity
    // Build a custom state for ROOM
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 1, playerY: 1,
      boxes: [{ x: 2, y: 1 }],
      history: [],
      moves: 0, pushes: 0, won: false,
    };
    // Move left: (1,1) → (0,1) is WALL → blocked
    const r1 = applyMove(ROOM, s0, -1, 0);
    expect(r1.kind).toBe("blocked");

    // Move down: (1,1) → (1,2) is FLOOR (no box there) → moved
    const r2 = applyMove(ROOM, s0, 0, 1);
    expect(r2.kind).toBe("moved");
    if (r2.kind === "moved") {
      expect(r2.state.playerX).toBe(1);
      expect(r2.state.playerY).toBe(2);
      expect(r2.state.moves).toBe(1);
      expect(r2.state.pushes).toBe(0);
    }
  });

  it("moving into a wall is blocked and state is unchanged", () => {
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 1, playerY: 0,
      boxes: [],
      history: [],
      moves: 0, pushes: 0, won: false,
    };
    const r = applyMove(CORRIDOR, s0, -1, 0); // move left into wall
    expect(r.kind).toBe("blocked");
  });

  it("does not mutate the original state", () => {
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 1, playerY: 1,
      boxes: [{ x: 3, y: 1 }],
      history: [],
      moves: 0, pushes: 0, won: false,
    };
    const originalX = s0.playerX;
    applyMove(ROOM, s0, 0, 1);
    expect(s0.playerX).toBe(originalX);
  });
});

// ---------------------------------------------------------------------------
// applyMove — box push
// ---------------------------------------------------------------------------
describe("applyMove — box push", () => {
  it("pushes a box one cell when the cell beyond is empty", () => {
    // CORRIDOR: player@1, box@2, target@3 — push right
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 1, playerY: 0,
      boxes: [{ x: 2, y: 0 }],
      history: [],
      moves: 0, pushes: 0, won: false,
    };
    const r = applyMove(CORRIDOR, s0, 1, 0);
    // box lands on target → win
    expect(r.kind).toBe("won");
    if (r.kind === "won") {
      expect(r.state.playerX).toBe(2);
      expect(r.state.boxes[0]).toEqual({ x: 3, y: 0 });
      expect(r.state.pushes).toBe(1);
      expect(r.state.moves).toBe(1);
      expect(r.state.won).toBe(true);
    }
  });

  it("push is blocked when the cell beyond the box is a wall", () => {
    // WALL_BLOCKED: player@1, box@2, wall@3
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 1, playerY: 1,
      boxes: [{ x: 2, y: 1 }],
      history: [],
      moves: 0, pushes: 0, won: false,
    };
    const r = applyMove(WALL_BLOCKED, s0, 1, 0);
    expect(r.kind).toBe("blocked");
  });

  it("push is blocked when the cell beyond is another box", () => {
    // TWO_BOX: player@(1,1), boxes at (2,1) and (3,1)
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 1, playerY: 1,
      boxes: [{ x: 2, y: 1 }, { x: 3, y: 1 }],
      history: [],
      moves: 0, pushes: 0, won: false,
    };
    const r = applyMove(TWO_BOX, s0, 1, 0);
    expect(r.kind).toBe("blocked");
  });

  it("blocked push does not alter player position, box position, or counters", () => {
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 1, playerY: 1,
      boxes: [{ x: 2, y: 1 }],
      history: [],
      moves: 5, pushes: 2, won: false,
    };
    const r = applyMove(WALL_BLOCKED, s0, 1, 0);
    expect(r.kind).toBe("blocked");
    // original untouched
    expect(s0.playerX).toBe(1);
    expect(s0.moves).toBe(5);
    expect(s0.pushes).toBe(2);
  });

  it("pushing box onto target (not final) yields kind=pushed not kind=won", () => {
    // TWO_BOX: push first box onto (2,2) — second box still not on target
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 1, playerY: 1,
      boxes: [{ x: 2, y: 1 }, { x: 3, y: 1 }],
      history: [],
      moves: 0, pushes: 0, won: false,
    };
    // Push the first box downward: player needs to be above it
    const sAbove: import("~/games/sokoban").SokobanState = {
      ...s0,
      playerX: 2, playerY: 0,
    };
    const r = applyMove(TWO_BOX, sAbove, 0, 1);
    // box at (2,1) pushed to (2,2) which is a target; second box still at (3,1) not on target
    expect(r.kind).toBe("pushed");
  });
});

// ---------------------------------------------------------------------------
// Win detection via applyMove
// ---------------------------------------------------------------------------
describe("win condition", () => {
  it("setting the last box on a target returns kind=won with won=true", () => {
    // CORRIDOR: single box at (2,0), target at (3,0)
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 1, playerY: 0,
      boxes: [{ x: 2, y: 0 }],
      history: [],
      moves: 0, pushes: 0, won: false,
    };
    const r = applyMove(CORRIDOR, s0, 1, 0);
    expect(r.kind).toBe("won");
    if (r.kind === "won") {
      expect(r.state.won).toBe(true);
    }
  });

  it("no further moves are accepted once won", () => {
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 2, playerY: 0,
      boxes: [{ x: 3, y: 0 }],
      history: [],
      moves: 1, pushes: 1, won: true,
    };
    const r = applyMove(CORRIDOR, s0, 1, 0);
    expect(r.kind).toBe("blocked");
  });
});

// ---------------------------------------------------------------------------
// applyUndo
// ---------------------------------------------------------------------------
describe("applyUndo", () => {
  it("returns kind=empty when history is empty", () => {
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 1, playerY: 0,
      boxes: [{ x: 2, y: 0 }],
      history: [],
      moves: 0, pushes: 0, won: false,
    };
    expect(applyUndo(s0).kind).toBe("empty");
  });

  it("restores player position from history", () => {
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 1, playerY: 0,
      boxes: [{ x: 3, y: 0 }],
      history: [
        { px: 0, py: 0, boxes: [{ x: 2, y: 0 }] },
      ],
      moves: 1, pushes: 0, won: false,
    };
    const r = applyUndo(s0);
    expect(r.kind).toBe("undone");
    if (r.kind === "undone") {
      expect(r.state.playerX).toBe(0);
      expect(r.state.playerY).toBe(0);
    }
  });

  it("restores box positions from history", () => {
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 2, playerY: 0,
      boxes: [{ x: 3, y: 0 }],
      history: [
        { px: 1, py: 0, boxes: [{ x: 2, y: 0 }] },
      ],
      moves: 1, pushes: 1, won: false,
    };
    const r = applyUndo(s0);
    expect(r.kind).toBe("undone");
    if (r.kind === "undone") {
      expect(r.state.boxes).toEqual([{ x: 2, y: 0 }]);
    }
  });

  it("decrements moves by 1 (minimum 0)", () => {
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 1, playerY: 0,
      boxes: [],
      history: [{ px: 0, py: 0, boxes: [] }],
      moves: 3, pushes: 0, won: false,
    };
    const r = applyUndo(s0);
    if (r.kind === "undone") expect(r.state.moves).toBe(2);

    // Edge: moves is 0 — should not go negative
    const s1 = { ...s0, moves: 0 };
    const r2 = applyUndo(s1);
    if (r2.kind === "undone") expect(r2.state.moves).toBe(0);
  });

  it("clears won flag when undoing a winning move", () => {
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 2, playerY: 0,
      boxes: [{ x: 3, y: 0 }],
      history: [{ px: 1, py: 0, boxes: [{ x: 2, y: 0 }] }],
      moves: 1, pushes: 1, won: true,
    };
    const r = applyUndo(s0);
    expect(r.kind).toBe("undone");
    if (r.kind === "undone") {
      expect(r.state.won).toBe(false);
    }
  });

  it("history stack shrinks by one after undo", () => {
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 2, playerY: 0,
      boxes: [],
      history: [
        { px: 0, py: 0, boxes: [] },
        { px: 1, py: 0, boxes: [] },
      ],
      moves: 2, pushes: 0, won: false,
    };
    const r = applyUndo(s0);
    if (r.kind === "undone") {
      expect(r.state.history).toHaveLength(1);
    }
  });

  it("does not mutate the original state's history array", () => {
    const history = [{ px: 0, py: 0, boxes: [] }];
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 1, playerY: 0,
      boxes: [],
      history,
      moves: 1, pushes: 0, won: false,
    };
    applyUndo(s0);
    expect(s0.history).toHaveLength(1);
  });

  it("refunds the push counter only when the undone move was a push", () => {
    // 轉角: player (1,3), box (2,2), target (2,1) — right (plain move), then up (push → win)
    const lv = LEVELS[1];
    const r1 = applyMove(lv, makeLevelState(1), 1, 0);
    expect(r1.kind).toBe("moved");
    if (r1.kind !== "moved") return;
    const r2 = applyMove(lv, r1.state, 0, -1);
    expect(r2.kind).toBe("won");
    if (r2.kind !== "won") return;
    expect(r2.state.pushes).toBe(1);

    // undo the push: box back to (2,2), pushes 1 → 0, win cleared
    const u1 = applyUndo(r2.state);
    expect(u1.kind).toBe("undone");
    if (u1.kind !== "undone") return;
    expect(u1.state.boxes).toEqual([{ x: 2, y: 2 }]);
    expect(u1.state.pushes).toBe(0);
    expect(u1.state.moves).toBe(1);
    expect(u1.state.won).toBe(false);

    // undo the plain move: boxes unchanged, pushes stay 0
    const u2 = applyUndo(u1.state);
    expect(u2.kind).toBe("undone");
    if (u2.kind !== "undone") return;
    expect(u2.state.boxes).toEqual([{ x: 2, y: 2 }]);
    expect(u2.state.pushes).toBe(0);
    expect(u2.state.moves).toBe(0);
    expect(u2.state.playerX).toBe(lv.px);
    expect(u2.state.playerY).toBe(lv.py);
    expect(applyUndo(u2.state).kind).toBe("empty");
  });
});

// ---------------------------------------------------------------------------
// History recorded by applyMove
// ---------------------------------------------------------------------------
describe("history recording in applyMove", () => {
  it("records the pre-move state in history on a plain move", () => {
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 1, playerY: 0,
      boxes: [],
      history: [],
      moves: 0, pushes: 0, won: false,
    };
    // Move right from (1,0) to (2,0) in CORRIDOR (floor cell)
    const r = applyMove(CORRIDOR, s0, 1, 0);
    if (r.kind === "moved") {
      expect(r.state.history).toHaveLength(1);
      expect(r.state.history[0]).toEqual({ px: 1, py: 0, boxes: [] });
    }
  });

  it("records the pre-push state in history on a box push", () => {
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 1, playerY: 0,
      boxes: [{ x: 2, y: 0 }],
      history: [],
      moves: 0, pushes: 0, won: false,
    };
    const r = applyMove(CORRIDOR, s0, 1, 0);
    // This push puts the box on the target → kind=won
    if (r.kind === "won") {
      expect(r.state.history).toHaveLength(1);
      expect(r.state.history[0].boxes).toEqual([{ x: 2, y: 0 }]);
    }
  });

  it("move + undo returns to original state", () => {
    const s0: import("~/games/sokoban").SokobanState = {
      levelIndex: 0,
      playerX: 1, playerY: 0,
      boxes: [],
      history: [],
      moves: 0, pushes: 0, won: false,
    };
    const moved = applyMove(CORRIDOR, s0, 1, 0);
    expect(moved.kind).toBe("moved");
    if (moved.kind !== "moved") return;

    const undone = applyUndo(moved.state);
    expect(undone.kind).toBe("undone");
    if (undone.kind !== "undone") return;

    expect(undone.state.playerX).toBe(s0.playerX);
    expect(undone.state.playerY).toBe(s0.playerY);
    expect(undone.state.moves).toBe(s0.moves);
  });
});

// ---------------------------------------------------------------------------
// makeLevelState
// ---------------------------------------------------------------------------
describe("makeLevelState", () => {
  it("returns a fresh state for the given level index", () => {
    const s = makeLevelState(0);
    const lv = LEVELS[0];
    expect(s.playerX).toBe(lv.px);
    expect(s.playerY).toBe(lv.py);
    expect(s.boxes).toEqual(lv.boxes);
    expect(s.history).toHaveLength(0);
    expect(s.moves).toBe(0);
    expect(s.pushes).toBe(0);
    expect(s.won).toBe(false);
  });

  it("wraps negative indices with modulo", () => {
    const s = makeLevelState(-1);
    expect(s.levelIndex).toBe(LEVELS.length - 1);
  });

  it("every in-range index (level nav / daily rng pick) yields that level; past-the-end wraps to 0", () => {
    for (let i = 0; i < LEVELS.length; i++) {
      const s = makeLevelState(i);
      expect(s.levelIndex).toBe(i);
      expect(s.boxes).toEqual(LEVELS[i].boxes);
    }
    expect(makeLevelState(LEVELS.length).levelIndex).toBe(0);
  });

  it("does not share box array with the level definition", () => {
    const s1 = makeLevelState(0);
    const s2 = makeLevelState(0);
    s1.boxes[0].x = 999;
    expect(s2.boxes[0].x).not.toBe(999);
    expect(LEVELS[0].boxes[0].x).not.toBe(999);
  });
});

// ---------------------------------------------------------------------------
// Solver sanity — the helper must be able to say "no", otherwise the
// solvability test below would prove nothing.
// ---------------------------------------------------------------------------
describe("BFS solver helper", () => {
  it("returns the shortest step list for a solvable level", () => {
    expect(solveLevel(CORRIDOR)).toEqual([[1, 0]]);
    // 轉角: right (plain move), then up (push onto the target)
    expect(solveLevel(LEVELS[1])).toEqual([[1, 0], [0, -1]]);
  });

  it("returns an empty solution for a level that starts solved", () => {
    const done = parseLevel({ name: "done", map: ["#####", "#@* #", "#####"] });
    expect(solveLevel(done)).toEqual([]);
  });

  it("returns null for a level whose only box can only be pushed into a corner", () => {
    expect(solveLevel(ROOM)).toBeNull();
  });

  it("returns null when the state budget runs out", () => {
    expect(solveLevel(LEVELS[4], 10)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bundled levels: structural invariants
// ---------------------------------------------------------------------------
describe("bundled levels — well-formedness", () => {
  it("every raw map is rectangular (no ragged rows)", () => {
    for (const raw of RAW_LEVELS) {
      const widths = new Set(raw.map.map((row) => row.length));
      expect(widths.size, `${raw.name}: ragged rows`).toBe(1);
    }
  });

  it("every raw map is fully enclosed by walls", () => {
    for (const raw of RAW_LEVELS) {
      const h = raw.map.length;
      raw.map.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const onBorder = y === 0 || y === h - 1 || x === 0 || x === row.length - 1;
          if (onBorder) {
            expect(row[x], `${raw.name}: border cell (${x},${y}) is not a wall`).toBe(WALL);
          }
        }
      });
    }
  });

  it("every raw map has exactly one player marker and only known tile characters", () => {
    for (const raw of RAW_LEVELS) {
      const cells = raw.map.join("").split("");
      const players = cells.filter((c) => c === "@" || c === "+").length;
      expect(players, `${raw.name}: expected exactly one player`).toBe(1);
      for (const c of cells) {
        expect("# .$*@+", `${raw.name}: unknown tile '${c}'`).toContain(c);
      }
    }
  });

  it("every level has at least one box and at least one target", () => {
    for (const lv of LEVELS) {
      expect(lv.boxes.length, `${lv.name}: no boxes`).toBeGreaterThan(0);
      expect(lv.targets.length, `${lv.name}: no targets`).toBeGreaterThan(0);
    }
  });

  it("every level has at least as many targets as boxes", () => {
    for (const lv of LEVELS) {
      expect(
        lv.boxes.length,
        `${lv.name}: more boxes than targets — unwinnable`,
      ).toBeLessThanOrEqual(lv.targets.length);
    }
  });

  it("every bundled level is solvable, and the BFS solution replays to a win through applyMove", () => {
    LEVELS.forEach((lv, i) => {
      const path = SOLUTIONS[i];
      expect(path, `${lv.name} is not solvable`).not.toBeNull();
      if (!path) return;

      let st = makeLevelState(i);
      let lastKind = "";
      for (const [dx, dy] of path) {
        const r = applyMove(lv, st, dx, dy);
        expect(r.kind, `${lv.name}: solver step (${dx},${dy}) rejected by applyMove`).not.toBe("blocked");
        if (r.kind === "blocked") return;
        st = r.state;
        lastKind = r.kind;
      }
      expect(lastKind, `${lv.name}: replay did not end in a win`).toBe("won");
      expect(st.won).toBe(true);
      expect(isWon(lv, st.boxes)).toBe(true);
      expect(st.moves).toBe(path.length);
      // every box rests on its own target
      const occupied = new Set(st.boxes.map((b) => `${b.x},${b.y}`));
      expect(occupied.size).toBe(st.boxes.length);
    });
  });

  it("shortest solutions match the intended difficulty curve (update deliberately when a level changes)", () => {
    expect(SOLUTIONS.map((p) => p!.length)).toEqual([1, 2, 7, 3, 23, 38]);
  });

  it("every level has a valid player start (within bounds, not on a wall)", () => {
    for (const lv of LEVELS) {
      expect(lv.px, `${lv.name}: px out of bounds`).toBeGreaterThanOrEqual(0);
      expect(lv.px, `${lv.name}: px out of bounds`).toBeLessThan(lv.cols);
      expect(lv.py, `${lv.name}: py out of bounds`).toBeGreaterThanOrEqual(0);
      expect(lv.py, `${lv.name}: py out of bounds`).toBeLessThan(lv.rows);
      expect(
        cellAt(lv, lv.px, lv.py),
        `${lv.name}: player starts on wall`
      ).not.toBe("#");
    }
  });

  it("every level has at least 3 rows and 3 cols (real enclosure)", () => {
    for (const lv of LEVELS) {
      expect(lv.rows, `${lv.name}: too few rows`).toBeGreaterThanOrEqual(3);
      expect(lv.cols, `${lv.name}: too few cols`).toBeGreaterThanOrEqual(3);
    }
  });

  it("every box starts on a floor or target cell (not on a wall)", () => {
    for (const lv of LEVELS) {
      for (const b of lv.boxes) {
        const cell = cellAt(lv, b.x, b.y);
        expect(
          [" ", "."],
          `${lv.name}: box at (${b.x},${b.y}) is on '${cell}'`
        ).toContain(cell);
      }
    }
  });

  it("every target is on a floor or target cell (not on a wall)", () => {
    for (const lv of LEVELS) {
      for (const t of lv.targets) {
        // targets array stores original positions; clean grid should show TARGET
        const cell = cellAt(lv, t.x, t.y);
        expect(cell, `${lv.name}: target at (${t.x},${t.y}) maps to '${cell}'`).toBe(".");
      }
    }
  });

  it("RAW_LEVELS and LEVELS arrays have the same length", () => {
    expect(LEVELS.length).toBe(RAW_LEVELS.length);
  });

  it("all 6 bundled levels are present", () => {
    expect(LEVELS.length).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Level 0 (初探) — integration walkthrough: clear push to win
// ---------------------------------------------------------------------------
describe("level 0 (初探) integration", () => {
  // Map: #####  /  #@$.#  /  #####
  // Player at (1,0 within inner row) ... actually row 1 in the 3-row grid.
  it("a single push right solves the level", () => {
    const lv = LEVELS[0];
    const s0 = makeLevelState(0);

    // Player starts at lv.px, lv.py; one box one cell to the right, target beyond
    const r = applyMove(lv, s0, 1, 0); // push right
    expect(r.kind).toBe("won");
    if (r.kind === "won") {
      expect(r.state.moves).toBe(1);
      expect(r.state.pushes).toBe(1);
      expect(r.state.won).toBe(true);
    }
  });

  it("pushing left from start is blocked (wall)", () => {
    const lv = LEVELS[0];
    const s0 = makeLevelState(0);
    const r = applyMove(lv, s0, -1, 0);
    expect(r.kind).toBe("blocked");
  });
});
