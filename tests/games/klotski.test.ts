import { describe, it, expect } from "vitest";
import { makeRng, todaySeed } from "~/utils/rng";
import {
  COLS,
  ROWS,
  WIN_ROW,
  WIN_COL,
  VALID_LAYOUTS,
  pickLayout,
  blockDims,
  blockCells,
  buildOccupied,
  canMove,
  shiftBlock,
  isWon,
  isValidLayout,
  type Block,
  type BlockType,
  type Layout,
} from "~/games/klotski";

// ---- helpers ----

/** Deep-clone a block array so tests stay isolated. */
function clone(blks: Block[]): Block[] {
  return blks.map((b) => ({ ...b }));
}

/** Return the block with the given id, throwing if not found. */
function get(blks: Block[], id: number): Block {
  const b = blks.find((x) => x.id === id);
  if (!b) throw new Error(`block ${id} not found`);
  return b;
}

// ---- board constants ----

describe("board constants", () => {
  it("board is 4 columns × 5 rows", () => {
    expect(COLS).toBe(4);
    expect(ROWS).toBe(5);
  });

  it("win position is row 3, col 1", () => {
    expect(WIN_ROW).toBe(3);
    expect(WIN_COL).toBe(1);
  });
});

// ---- blockDims ----

describe("blockDims", () => {
  it("2×2 Cao Cao is 2 wide, 2 tall", () => {
    expect(blockDims("2x2")).toEqual({ w: 2, h: 2 });
  });

  it("1×2h (horizontal) is 2 wide, 1 tall", () => {
    expect(blockDims("1x2h")).toEqual({ w: 2, h: 1 });
  });

  it("2×1v (vertical) is 1 wide, 2 tall", () => {
    expect(blockDims("2x1v")).toEqual({ w: 1, h: 2 });
  });

  it("1×1 soldier is 1 wide, 1 tall", () => {
    expect(blockDims("1x1")).toEqual({ w: 1, h: 1 });
  });
});

// ---- blockCells ----

describe("blockCells", () => {
  it("2×2 at (0,1) covers (0,1),(0,2),(1,1),(1,2)", () => {
    const b: Block = { id: 0, type: "2x2", r: 0, c: 1 };
    const cells = blockCells(b);
    expect(cells).toHaveLength(4);
    expect(cells).toContainEqual({ r: 0, c: 1 });
    expect(cells).toContainEqual({ r: 0, c: 2 });
    expect(cells).toContainEqual({ r: 1, c: 1 });
    expect(cells).toContainEqual({ r: 1, c: 2 });
  });

  it("1×2h at (2,1) covers (2,1),(2,2)", () => {
    const b: Block = { id: 5, type: "1x2h", r: 2, c: 1 };
    const cells = blockCells(b);
    expect(cells).toHaveLength(2);
    expect(cells).toContainEqual({ r: 2, c: 1 });
    expect(cells).toContainEqual({ r: 2, c: 2 });
  });

  it("2×1v at (0,0) covers (0,0),(1,0)", () => {
    const b: Block = { id: 1, type: "2x1v", r: 0, c: 0 };
    const cells = blockCells(b);
    expect(cells).toHaveLength(2);
    expect(cells).toContainEqual({ r: 0, c: 0 });
    expect(cells).toContainEqual({ r: 1, c: 0 });
  });

  it("1×1 at (4,3) covers only (4,3)", () => {
    const b: Block = { id: 9, type: "1x1", r: 4, c: 3 };
    const cells = blockCells(b);
    expect(cells).toHaveLength(1);
    expect(cells).toContainEqual({ r: 4, c: 3 });
  });
});

// ---- buildOccupied ----

describe("buildOccupied", () => {
  it("maps every cell of every block to its id", () => {
    const blks: Block[] = [
      { id: 0, type: "2x2",  r: 0, c: 1 },
      { id: 1, type: "2x1v", r: 0, c: 0 },
    ];
    const occ = buildOccupied(blks);
    // Cao Cao occupies (0,1),(0,2),(1,1),(1,2)
    expect(occ["0,1"]).toBe(0);
    expect(occ["0,2"]).toBe(0);
    expect(occ["1,1"]).toBe(0);
    expect(occ["1,2"]).toBe(0);
    // Vertical general occupies (0,0),(1,0)
    expect(occ["0,0"]).toBe(1);
    expect(occ["1,0"]).toBe(1);
    // Empty cell should be absent
    expect(occ["2,0"]).toBeUndefined();
  });
});

// ---- isValidLayout ----

describe("isValidLayout — known starting layouts", () => {
  for (const layout of VALID_LAYOUTS) {
    it(`"${layout.name}": all blocks fit inside the board`, () => {
      for (const b of layout.blocks) {
        for (const { r, c } of blockCells(b)) {
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThan(ROWS);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThan(COLS);
        }
      }
    });

    it(`"${layout.name}": no two blocks overlap`, () => {
      expect(isValidLayout(layout.blocks)).toBe(true);
    });

    it(`"${layout.name}": has exactly 10 blocks`, () => {
      expect(layout.blocks).toHaveLength(10);
    });

    it(`"${layout.name}": block 0 is the 2×2 Cao Cao`, () => {
      const cao = layout.blocks.find((b) => b.id === 0);
      expect(cao).toBeDefined();
      expect(cao!.type).toBe("2x2");
    });
  }

  it("rejects a layout where two blocks share a cell", () => {
    const blks: Block[] = [
      { id: 0, type: "1x1", r: 0, c: 0 },
      { id: 1, type: "1x1", r: 0, c: 0 }, // same cell
    ];
    expect(isValidLayout(blks)).toBe(false);
  });

  it("rejects a layout where a block extends outside the board", () => {
    const blks: Block[] = [
      { id: 0, type: "2x1v", r: 4, c: 0 }, // r+1 = 5, off board
    ];
    expect(isValidLayout(blks)).toBe(false);
  });
});

// ---- canMove ----

describe("canMove — layout 0 (橫刀立馬) starting position", () => {
  const blks = clone(VALID_LAYOUTS[0].blocks);
  const cao = get(blks, 0); // 2×2 at r=0,c=1

  it("Cao Cao cannot move up (already at top edge)", () => {
    expect(canMove(cao, -1, 0, blks)).toBe(false);
  });

  it("Cao Cao cannot move left (id=1 is there)", () => {
    expect(canMove(cao, 0, -1, blks)).toBe(false);
  });

  it("Cao Cao cannot move right (id=2 is there)", () => {
    expect(canMove(cao, 0, 1, blks)).toBe(false);
  });

  it("Cao Cao cannot move down (id=5 blocks row 2)", () => {
    // id=5 is 1×2h at r=2,c=1 — occupies (2,1) and (2,2), directly below Cao Cao
    expect(canMove(cao, 1, 0, blks)).toBe(false);
  });

  it("soldier (id=8) at (4,0) cannot move down (out of bounds)", () => {
    const s = get(blks, 8); // r=4, c=0
    expect(canMove(s, 1, 0, blks)).toBe(false);
  });

  it("soldier (id=8) at (4,0) cannot move left (out of bounds)", () => {
    const s = get(blks, 8);
    expect(canMove(s, 0, -1, blks)).toBe(false);
  });

  it("soldier (id=9) at (4,3) cannot move right (out of bounds)", () => {
    const s = get(blks, 9);
    expect(canMove(s, 0, 1, blks)).toBe(false);
  });

  it("soldier (id=6) at (3,1) cannot move left: (3,0) is occupied by id=3 (2×1v spans rows 2-3)", () => {
    // id=3 is a 2×1v at r=2,c=0 → occupies (2,0) and (3,0), blocking leftward movement
    const s = get(blks, 6);
    expect(canMove(s, 0, -1, blks)).toBe(false);
  });

  it("soldier (id=7) at (3,2) cannot move right: (3,3) is occupied by id=4 (2×1v spans rows 2-3)", () => {
    // id=4 is a 2×1v at r=2,c=3 → occupies (2,3) and (3,3), blocking rightward movement
    const s = get(blks, 7);
    expect(canMove(s, 0, 1, blks)).toBe(false);
  });
});

describe("canMove — layout 1 (百萬軍中) starting position", () => {
  const blks = clone(VALID_LAYOUTS[1].blocks);

  it("Cao Cao (id=0) at (0,1) cannot move left (id=1 is at col 0)", () => {
    const cao = get(blks, 0);
    expect(canMove(cao, 0, -1, blks)).toBe(false);
  });

  it("Cao Cao (id=0) at (0,1) cannot move up (top edge)", () => {
    const cao = get(blks, 0);
    expect(canMove(cao, -1, 0, blks)).toBe(false);
  });

  it("horizontal block (id=5) at (4,1) cannot move down (bottom edge)", () => {
    const h = get(blks, 5); // 1×2h at r=4, c=1
    expect(canMove(h, 1, 0, blks)).toBe(false);
  });

  it("soldier (id=6) at (2,0) can move down to (3,0)", () => {
    // (3,0) is occupied by id=8 in layout 1 — must NOT be movable
    const s = get(blks, 6);
    // id=8 is at (3,0), so moving down is blocked
    expect(canMove(s, 1, 0, blks)).toBe(false);
  });

  it("soldier (id=8) at (3,0) cannot move right (id=3 is at (2,1) — but (3,1) is empty?)", () => {
    // Let's verify (3,1) occupancy: id=3 is 2x1v at r=2,c=1 → cells (2,1),(3,1)
    // So (3,1) IS occupied by id=3
    const s = get(blks, 8);
    expect(canMove(s, 0, 1, blks)).toBe(false);
  });
});

// ---- shiftBlock ----

describe("shiftBlock", () => {
  it("moves the target block and leaves all others unchanged", () => {
    const blks = clone(VALID_LAYOUTS[0].blocks);
    const orig = clone(blks);

    // Move soldier id=6 from (3,1) one step left to (3,0)
    const after = shiftBlock(blks, 6, 0, -1);

    expect(get(after, 6)).toEqual({ id: 6, type: "1x1", r: 3, c: 0 });

    // All other blocks unchanged
    for (const b of orig) {
      if (b.id === 6) continue;
      expect(get(after, b.id)).toEqual(b);
    }
  });

  it("is pure: the original array is not mutated", () => {
    const blks = clone(VALID_LAYOUTS[0].blocks);
    const before6 = { ...get(blks, 6) };
    shiftBlock(blks, 6, 0, -1);
    expect(get(blks, 6)).toEqual(before6);
  });

  it("returns a new array (not the same reference)", () => {
    const blks = clone(VALID_LAYOUTS[0].blocks);
    const after = shiftBlock(blks, 6, 0, -1);
    expect(after).not.toBe(blks);
  });
});

// ---- move-then-reverse idempotency ----

describe("move then reverse returns to start", () => {
  it("move soldier down then up returns to original position", () => {
    // layout 0: id=6 at (3,1) can move down to (4,1)
    let blks = clone(VALID_LAYOUTS[0].blocks);
    const before = get(blks, 6);

    blks = shiftBlock(blks, 6, 1, 0); // move down
    expect(get(blks, 6).r).toBe(4);

    blks = shiftBlock(blks, 6, -1, 0); // move up (back)
    expect(get(blks, 6)).toEqual(before);
  });

  it("move soldier right then left returns to original position", () => {
    // layout 0: id=8 at (4,0) can move right to (4,1)
    let blks = clone(VALID_LAYOUTS[0].blocks);
    const before = get(blks, 8);

    blks = shiftBlock(blks, 8, 0, 1);  // move right
    expect(get(blks, 8).c).toBe(1);

    blks = shiftBlock(blks, 8, 0, -1); // move left (back)
    expect(get(blks, 8)).toEqual(before);
  });

  it("entire board is still a valid layout after the round-trip", () => {
    let blks = clone(VALID_LAYOUTS[0].blocks);
    blks = shiftBlock(blks, 6, 1, 0);
    blks = shiftBlock(blks, 6, -1, 0);
    expect(isValidLayout(blks)).toBe(true);
  });
});

// ---- isWon ----

describe("isWon", () => {
  it("returns false at the starting layout (Cao Cao not at goal)", () => {
    for (const layout of VALID_LAYOUTS) {
      expect(isWon(clone(layout.blocks))).toBe(false);
    }
  });

  it("returns true when Cao Cao is placed exactly at win position", () => {
    const blks: Block[] = [
      { id: 0, type: "2x2", r: WIN_ROW, c: WIN_COL },
    ];
    expect(isWon(blks)).toBe(true);
  });

  it("returns false when Cao Cao is one row above the goal", () => {
    const blks: Block[] = [
      { id: 0, type: "2x2", r: WIN_ROW - 1, c: WIN_COL },
    ];
    expect(isWon(blks)).toBe(false);
  });

  it("returns false when Cao Cao is one col off the goal", () => {
    const blks: Block[] = [
      { id: 0, type: "2x2", r: WIN_ROW, c: WIN_COL + 1 },
    ];
    expect(isWon(blks)).toBe(false);
  });

  it("returns false when there is no block with id=0", () => {
    const blks: Block[] = [
      { id: 99, type: "2x2", r: WIN_ROW, c: WIN_COL },
    ];
    expect(isWon(blks)).toBe(false);
  });

  it("detects win after manually sliding Cao Cao to the goal", () => {
    // Build a minimal board where Cao Cao can slide straight down
    // from (1,1) to the goal (3,1) in two steps.
    let blks: Block[] = [
      { id: 0, type: "2x2", r: 1, c: 1 },
      // No other blocks — the rest of the board is empty
    ];
    expect(canMove(get(blks, 0), 1, 0, blks)).toBe(true);
    blks = shiftBlock(blks, 0, 1, 0); // r=2
    expect(isWon(blks)).toBe(false);
    blks = shiftBlock(blks, 0, 1, 0); // r=3 → win!
    expect(isWon(blks)).toBe(true);
  });
});

// ---- move legality after a shift ----

describe("canMove reflects the updated board after shiftBlock", () => {
  it("a cell vacated by a shift is now available", () => {
    // layout 0: id=6 at (3,1) can move down to (4,1). After it moves, (3,1) is free.
    let blks = clone(VALID_LAYOUTS[0].blocks);

    // id=7 at (3,2) cannot move left to (3,1) because id=6 occupies it
    expect(canMove(get(blks, 7), 0, -1, blks)).toBe(false);

    // Move id=6 down — vacates (3,1)
    blks = shiftBlock(blks, 6, 1, 0); // id=6 now at (4,1)

    // Now (3,1) is free — id=7 should be able to move left into it
    expect(canMove(get(blks, 7), 0, -1, blks)).toBe(true);
  });

  it("a cell newly occupied after a shift blocks movement into it", () => {
    // layout 0: id=8 at (4,0) moves right to (4,1) — that cell is initially empty
    let blks = clone(VALID_LAYOUTS[0].blocks);

    // id=6 at (3,1) can move down to (4,1) initially
    expect(canMove(get(blks, 6), 1, 0, blks)).toBe(true);

    // Move id=8 right, occupying (4,1)
    blks = shiftBlock(blks, 8, 0, 1); // id=8 now at (4,1)

    // Now id=6 cannot move down — (4,1) is blocked by id=8
    expect(canMove(get(blks, 6), 1, 0, blks)).toBe(false);
  });
});

// ---- out-of-bounds coverage ----

describe("canMove — out-of-bounds edge cases", () => {
  const singleBlock: Block[] = [{ id: 0, type: "1x1", r: 0, c: 0 }];

  it("1×1 at top-left cannot move up", () => {
    expect(canMove(singleBlock[0], -1, 0, singleBlock)).toBe(false);
  });

  it("1×1 at top-left cannot move left", () => {
    expect(canMove(singleBlock[0], 0, -1, singleBlock)).toBe(false);
  });

  it("1×1 at top-left can move right", () => {
    expect(canMove(singleBlock[0], 0, 1, singleBlock)).toBe(true);
  });

  it("1×1 at top-left can move down", () => {
    expect(canMove(singleBlock[0], 1, 0, singleBlock)).toBe(true);
  });

  it("2×2 at (3,2) cannot move right (col 3+1 = 4, out of bounds)", () => {
    const b: Block = { id: 0, type: "2x2", r: 3, c: 2 };
    expect(canMove(b, 0, 1, [b])).toBe(false);
  });

  it("2×2 at (3,1) cannot move down (row 4+1 = 5, out of bounds)", () => {
    const b: Block = { id: 0, type: "2x2", r: 3, c: 1 };
    expect(canMove(b, 1, 0, [b])).toBe(false);
  });
});

// =====================================================================
// Solvability audit — independent BFS solver
//
// The solver below has its own board encoding and legality rule (it does not
// reuse canMove/blockDims), so it independently certifies that every bundled
// layout is solvable under the game's exact movement rules. Every solution it
// finds is then replayed through the game's own canMove/shiftBlock/isWon.
//
// Two move-counting conventions mirror the component's counter:
//   "step"  — one cell per move (keyboard arrows → doMove)
//   "slide" — one straight-line slide of any length per move (drag or
//             click-an-empty-cell → slideBlock). This is the most generous
//             counting, so its optimum is the true lower bound of the counter
//             and is what Layout.minMoves promises.
// =====================================================================

/** Block sizes, written out independently of blockDims so the solver cannot inherit its bugs. */
const SOLVER_DIMS: Record<BlockType, { w: number; h: number }> = {
  "2x2": { w: 2, h: 2 },
  "1x2h": { w: 2, h: 1 },
  "2x1v": { w: 1, h: 2 },
  "1x1": { w: 1, h: 1 },
};

/** One character per block type for the canonical state key. */
const TYPE_CHAR: Record<BlockType, string> = { "2x2": "C", "1x2h": "H", "2x1v": "V", "1x1": "S" };

const DIRS: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** Cell → occupying block id (-1 = empty). Throws if blocks overlap or leave the board. */
function idGrid(blks: Block[]): number[] {
  const g = new Array<number>(ROWS * COLS).fill(-1);
  for (const b of blks) {
    const { w, h } = SOLVER_DIMS[b.type];
    for (let r = b.r; r < b.r + h; r++) {
      for (let c = b.c; c < b.c + w; c++) {
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) throw new Error(`block ${b.id} leaves the board`);
        if (g[r * COLS + c] !== -1) throw new Error(`block ${b.id} overlaps block ${g[r * COLS + c]}`);
        g[r * COLS + c] = b.id;
      }
    }
  }
  return g;
}

/**
 * Canonical state key: one char per cell (block type, or "." when empty).
 * Blocks of the same type are interchangeable, and every maximal run of
 * same-type cells tiles in exactly one way, so the key is a bijection on
 * canonical states — this is what keeps the classic search at ~26k states.
 */
function encode(blks: Block[]): string {
  const cells = new Array<string>(ROWS * COLS).fill(".");
  for (const b of blks) {
    const { w, h } = SOLVER_DIMS[b.type];
    for (let r = b.r; r < b.r + h; r++)
      for (let c = b.c; c < b.c + w; c++) cells[r * COLS + c] = TYPE_CHAR[b.type];
  }
  return cells.join("");
}

/**
 * The solver's own legality rule: block `b` may shift one cell by (dr, dc)
 * when it stays on the board and only enters cells that are empty or its own.
 */
function solverCanStep(b: Block, dr: number, dc: number, g: number[]): boolean {
  const { w, h } = SOLVER_DIMS[b.type];
  for (let r = b.r; r < b.r + h; r++) {
    for (let c = b.c; c < b.c + w; c++) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return false;
      const occupant = g[nr * COLS + nc];
      if (occupant !== -1 && occupant !== b.id) return false;
    }
  }
  return true;
}

/** One solver move: slide block `id` by `steps` cells in direction (dr, dc). */
interface SolverMove {
  id: number;
  dr: number;
  dc: number;
  steps: number;
}

type Convention = "step" | "slide";

interface SearchResult {
  /** A shortest solution, or null when Cao Cao can never reach the exit. */
  moves: SolverMove[] | null;
  /** Canonical keys of every state reachable from the start. */
  keys: Set<string>;
  /** One concrete board (with block ids) per reachable state. */
  boards: Block[][];
  /** How many reachable states have Cao Cao at the exit. */
  goalStates: number;
}

/** Breadth-first search over full board states; explores the whole reachable graph. */
function solve(start: Block[], convention: Convention): SearchResult {
  interface Node {
    blks: Block[];
    parent: Node | null;
    move: SolverMove | null;
  }
  const root: Node = { blks: clone(start), parent: null, move: null };
  const keys = new Set<string>([encode(root.blks)]);
  const boards: Block[][] = [root.blks];
  let frontier: Node[] = [root];
  let goal: Node | null = null;
  let goalStates = 0;

  while (frontier.length) {
    const next: Node[] = [];
    for (const node of frontier) {
      const cao = get(node.blks, 0);
      if (cao.r === WIN_ROW && cao.c === WIN_COL) {
        goalStates++;
        if (!goal) goal = node; // BFS order ⇒ the first goal popped is a shortest one
      }
      const g = idGrid(node.blks);
      for (const b of node.blks) {
        for (const [dr, dc] of DIRS) {
          let moved = b;
          for (let steps = 1; ; steps++) {
            if (!solverCanStep(moved, dr, dc, g)) break;
            moved = { ...moved, r: moved.r + dr, c: moved.c + dc };
            const blks = node.blks.map((x) => (x.id === b.id ? moved : x));
            const key = encode(blks);
            if (!keys.has(key)) {
              keys.add(key);
              boards.push(blks);
              next.push({ blks, parent: node, move: { id: b.id, dr, dc, steps } });
            }
            if (convention === "step") break;
          }
        }
      }
    }
    frontier = next;
  }

  if (!goal) return { moves: null, keys, boards, goalStates };
  const moves: SolverMove[] = [];
  for (let n: Node = goal; n.parent; n = n.parent) moves.unshift(n.move!);
  return { moves, keys, boards, goalStates };
}

/**
 * Replay a solver solution through the game's own primitives, asserting at
 * every single-cell step that canMove allows it, the board stays valid, and
 * the win fires exactly once: after the final cell of the final move.
 * Returns the number of single-cell steps replayed.
 */
function replay(start: Block[], moves: SolverMove[]): number {
  let blks = clone(start);
  let cells = 0;
  for (const m of moves) {
    for (let s = 0; s < m.steps; s++) {
      expect(isWon(blks)).toBe(false);
      expect(canMove(get(blks, m.id), m.dr, m.dc, blks)).toBe(true);
      blks = shiftBlock(blks, m.id, m.dr, m.dc);
      expect(isValidLayout(blks)).toBe(true);
      cells++;
    }
  }
  expect(isWon(blks)).toBe(true);
  return cells;
}

describe("solver self-check", () => {
  it("reports an unsolvable board (no empty cell, so nothing can move)", () => {
    const blks: Block[] = [{ id: 0, type: "2x2", r: 0, c: 1 }];
    let id = 1;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (!(r < 2 && c >= 1 && c <= 2)) blks.push({ id: id++, type: "1x1", r, c });
    expect(blks).toHaveLength(17);
    const res = solve(blks, "slide");
    expect(res.moves).toBeNull();
    expect(res.keys.size).toBe(1);
    expect(res.goalStates).toBe(0);
  });

  it("finds the trivial solution on an otherwise empty board", () => {
    const blks: Block[] = [{ id: 0, type: "2x2", r: 1, c: 1 }];
    expect(solve(blks, "step").moves).toEqual([
      { id: 0, dr: 1, dc: 0, steps: 1 },
      { id: 0, dr: 1, dc: 0, steps: 1 },
    ]);
    expect(solve(blks, "slide").moves).toEqual([{ id: 0, dr: 1, dc: 0, steps: 2 }]);
  });

  it("rejects overlapping or off-board boards", () => {
    expect(() =>
      idGrid([
        { id: 0, type: "1x1", r: 0, c: 0 },
        { id: 1, type: "1x1", r: 0, c: 0 },
      ]),
    ).toThrow(/overlaps/);
    expect(() => idGrid([{ id: 0, type: "2x1v", r: 4, c: 0 }])).toThrow(/leaves/);
  });
});

/** Audit facts for the bundled layouts: BFS optimum under each convention. */
const OPTIMA: Record<string, { step: number; slide: number }> = {
  橫刀立馬: { step: 116, slide: 90 },
  百萬軍中: { step: 90, slide: 67 },
};

/** Expectations for a layout; a layout added without them fails loudly at collection time. */
function optimaFor(name: string): { step: number; slide: number } {
  const o = OPTIMA[name];
  if (!o) throw new Error(`no audit expectations recorded for layout "${name}"`);
  return o;
}

/** The classic piece set's reachable state graph has 25,955 canonical states. */
const CLASSIC_STATES = 25955;

describe("solvability audit — every bundled layout", () => {
  for (const layout of VALID_LAYOUTS) {
    describe(`"${layout.name}"`, () => {
      const step = solve(layout.blocks, "step");
      const slide = solve(layout.blocks, "slide");
      const expected = optimaFor(layout.name);

      it("uses the classic piece set with exactly two empty cells", () => {
        const count = (t: BlockType) => layout.blocks.filter((b) => b.type === t).length;
        expect(count("2x2")).toBe(1);
        expect(count("2x1v")).toBe(4);
        expect(count("1x2h")).toBe(1);
        expect(count("1x1")).toBe(4);
        expect(idGrid(layout.blocks).filter((id) => id === -1)).toHaveLength(2);
      });

      it(`is solvable one cell at a time in ${expected.step} steps (BFS optimum)`, () => {
        expect(step.moves).not.toBeNull();
        expect(step.moves!).toHaveLength(expected.step);
        expect(step.moves!.every((m) => m.steps === 1)).toBe(true);
      });

      it(`is solvable in ${expected.slide} straight-line slides, and minMoves promises exactly that`, () => {
        expect(slide.moves).not.toBeNull();
        expect(slide.moves!).toHaveLength(expected.slide);
        expect(layout.minMoves).toBe(slide.moves!.length);
      });

      it("keyboard play cannot beat minMoves (single-step optimum ≥ slide optimum)", () => {
        expect(step.moves!.length).toBeGreaterThanOrEqual(layout.minMoves);
      });

      it("the single-step solution replays through canMove/shiftBlock and wins only on its last step", () => {
        expect(replay(layout.blocks, step.moves!)).toBe(expected.step);
      });

      it("the slide solution replays through canMove/shiftBlock and wins only on its last cell", () => {
        expect(replay(layout.blocks, slide.moves!)).toBeGreaterThanOrEqual(expected.slide);
      });

      it("explores the whole classic state graph under both conventions", () => {
        expect(step.keys.size).toBe(CLASSIC_STATES);
        expect(slide.keys.size).toBe(CLASSIC_STATES);
        expect(slide.goalStates).toBe(step.goalStates);
      });

      it("every reachable state is a valid board, and isWon fires exactly when Cao Cao is at the exit", () => {
        let invalid = 0;
        let wrongWin = 0;
        let goals = 0;
        for (const blks of step.boards) {
          if (!isValidLayout(blks)) invalid++;
          const cao = get(blks, 0);
          const atExit = cao.r === WIN_ROW && cao.c === WIN_COL;
          if (isWon(blks) !== atExit) wrongWin++;
          if (atExit) goals++;
        }
        expect(invalid).toBe(0);
        expect(wrongWin).toBe(0);
        expect(goals).toBe(step.goalStates);
        expect(goals).toBeGreaterThan(0);
      });
    });
  }

  it("canMove agrees with the solver's rule for all 10 blocks × 4 directions in every reachable state", () => {
    // Both bundled layouts live in the same 25,955-state component (asserted
    // below), so one sweep from any of them covers every state of both.
    const [first] = VALID_LAYOUTS;
    if (!first) throw new Error("no bundled layouts");
    const { keys, boards } = solve(first.blocks, "step");
    for (const layout of VALID_LAYOUTS) expect(keys.has(encode(layout.blocks))).toBe(true);
    let checked = 0;
    let mismatches = 0;
    for (const blks of boards) {
      const g = idGrid(blks);
      for (const b of blks) {
        for (const [dr, dc] of DIRS) {
          checked++;
          if (canMove(b, dr, dc, blks) !== solverCanStep(b, dr, dc, g)) mismatches++;
        }
      }
    }
    expect(checked).toBe(CLASSIC_STATES * 10 * 4);
    expect(mismatches).toBe(0);
  });
});

// ---- pickLayout ----

describe("pickLayout", () => {
  it("is deterministic for a given seed", () => {
    const a = pickLayout(makeRng("2026-08-29"));
    const b = pickLayout(makeRng("2026-08-29"));
    expect(b).toBe(a);
    expect(VALID_LAYOUTS).toContain(a);
  });

  it("returns a bundled (BFS-verified) layout for every daily seed of a year and for numeric seeds, using each layout", () => {
    const picked = new Set<Layout>();
    for (let d = 0; d < 366; d++) {
      const layout = pickLayout(makeRng(todaySeed(new Date(2026, 0, 1 + d))));
      expect(VALID_LAYOUTS).toContain(layout);
      picked.add(layout);
    }
    for (let seed = 1; seed <= 300; seed++) {
      const layout = pickLayout(makeRng(seed));
      expect(VALID_LAYOUTS).toContain(layout);
      picked.add(layout);
    }
    expect(picked.size).toBe(VALID_LAYOUTS.length);
  });

  it("free play (null seed) still yields a bundled layout", () => {
    expect(VALID_LAYOUTS).toContain(pickLayout(makeRng(null)));
  });
});
