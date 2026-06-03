import { describe, it, expect } from "vitest";
import {
  COLS,
  ROWS,
  WIN_ROW,
  WIN_COL,
  VALID_LAYOUTS,
  blockDims,
  blockCells,
  buildOccupied,
  canMove,
  shiftBlock,
  isWon,
  isValidLayout,
  type Block,
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
