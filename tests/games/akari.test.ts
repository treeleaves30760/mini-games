import { describe, it, expect } from "vitest";
import {
  cellIdx,
  cellRc,
  inBounds,
  rayIndices,
  computeLighting,
  wallAdjBulbCount,
  isWallSatisfied,
  checkWin,
  buildBoard,
  buildBoardFromSeed,
  greedySolution,
  type AkariCell,
} from "~/games/akari";
import { makeRng, todaySeed } from "~/utils/rng";

// ---- helpers -----------------------------------------------------------------

/** Build a blank S×S board (all white, no bulbs). */
function blankBoard(size: number): AkariCell[] {
  return Array.from({ length: size * size }, () => ({
    wall: false,
    num: null,
    bulb: false,
  }));
}

/** Quick shorthand: set cell flags by (r, c). */
function setCell(
  board: AkariCell[],
  size: number,
  r: number,
  c: number,
  patch: Partial<AkariCell>,
) {
  Object.assign(board[cellIdx(r, c, size)], patch);
}

// ---- index helpers -----------------------------------------------------------

describe("cellIdx / cellRc", () => {
  it("round-trips (r,c) → i → (r,c) for a 5×5 grid", () => {
    const S = 5;
    for (let r = 0; r < S; r++) {
      for (let c = 0; c < S; c++) {
        const i = cellIdx(r, c, S);
        expect(cellRc(i, S)).toEqual([r, c]);
      }
    }
  });

  it("first cell is index 0, last is S*S-1", () => {
    const S = 4;
    expect(cellIdx(0, 0, S)).toBe(0);
    expect(cellIdx(S - 1, S - 1, S)).toBe(S * S - 1);
  });
});

describe("inBounds", () => {
  it("accepts cells inside the 5×5 grid", () => {
    expect(inBounds(0, 0, 5)).toBe(true);
    expect(inBounds(4, 4, 5)).toBe(true);
    expect(inBounds(2, 3, 5)).toBe(true);
  });

  it("rejects cells outside the grid", () => {
    expect(inBounds(-1, 0, 5)).toBe(false);
    expect(inBounds(0, -1, 5)).toBe(false);
    expect(inBounds(5, 0, 5)).toBe(false);
    expect(inBounds(0, 5, 5)).toBe(false);
  });
});

// ---- rayIndices --------------------------------------------------------------

describe("rayIndices", () => {
  it("in an all-white 5×5 grid, center cell sees all other cells in its cross", () => {
    const S = 5;
    const board = blankBoard(S);
    // Center is (2,2)
    const rays = new Set(rayIndices(2, 2, S, board));
    // Row 2: (2,0),(2,1),(2,3),(2,4) — 4 cells
    // Col 2: (0,2),(1,2),(3,2),(4,2) — 4 cells
    expect(rays.size).toBe(8);
    expect(rays.has(cellIdx(2, 0, S))).toBe(true);
    expect(rays.has(cellIdx(2, 4, S))).toBe(true);
    expect(rays.has(cellIdx(0, 2, S))).toBe(true);
    expect(rays.has(cellIdx(4, 2, S))).toBe(true);
    // Should NOT include the start cell itself
    expect(rays.has(cellIdx(2, 2, S))).toBe(false);
  });

  it("a wall blocks the ray — cells beyond the wall are not returned", () => {
    // 5×5, bulb at (0,0), wall at (0,2) — only (0,1) visible to the right
    const S = 5;
    const board = blankBoard(S);
    setCell(board, S, 0, 2, { wall: true });
    const rays = new Set(rayIndices(0, 0, S, board));
    expect(rays.has(cellIdx(0, 1, S))).toBe(true);   // visible
    expect(rays.has(cellIdx(0, 2, S))).toBe(false);  // wall itself not in ray
    expect(rays.has(cellIdx(0, 3, S))).toBe(false);  // beyond wall
    expect(rays.has(cellIdx(0, 4, S))).toBe(false);  // beyond wall
  });

  it("corner cell (0,0) only sees rightward and downward", () => {
    const S = 4;
    const board = blankBoard(S);
    const rays = new Set(rayIndices(0, 0, S, board));
    // right: (0,1),(0,2),(0,3); down: (1,0),(2,0),(3,0)
    expect(rays.size).toBe(6);
    expect(rays.has(cellIdx(0, 1, S))).toBe(true);
    expect(rays.has(cellIdx(3, 0, S))).toBe(true);
  });
});

// ---- computeLighting ---------------------------------------------------------

describe("computeLighting — illumination", () => {
  it("a single bulb in a 3×3 all-white grid illuminates its full cross", () => {
    // Grid:
    //   . . .
    //   . B .   B = bulb at (1,1)
    //   . . .
    //
    // Lit cells: the bulb itself + 4 arm cells (one step each direction).
    // Corners are NOT on the cross and stay dark.
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 1, 1, { bulb: true });
    const { litSet, conflictSet } = computeLighting(board, S);

    // 5 cells lit: (1,1),(0,1),(2,1),(1,0),(1,2)
    expect(litSet.size).toBe(5);
    expect(litSet.has(cellIdx(1, 1, S))).toBe(true); // bulb itself
    expect(litSet.has(cellIdx(0, 1, S))).toBe(true); // up
    expect(litSet.has(cellIdx(2, 1, S))).toBe(true); // down
    expect(litSet.has(cellIdx(1, 0, S))).toBe(true); // left
    expect(litSet.has(cellIdx(1, 2, S))).toBe(true); // right
    // Corners are dark
    expect(litSet.has(cellIdx(0, 0, S))).toBe(false);
    expect(litSet.has(cellIdx(0, 2, S))).toBe(false);
    expect(litSet.has(cellIdx(2, 0, S))).toBe(false);
    expect(litSet.has(cellIdx(2, 2, S))).toBe(false);
    expect(conflictSet.size).toBe(0);
  });

  it("a wall stops illumination — cells behind the wall are dark", () => {
    // 1×5 row: B . W . .  (wall blocks right side)
    // Simulate with a 5×1 board (single row)
    const S = 5;
    const board = blankBoard(S);
    // Make rows 1-4 walls so we effectively have a 1D row
    for (let r = 1; r < S; r++) {
      for (let c = 0; c < S; c++) {
        setCell(board, S, r, c, { wall: true });
      }
    }
    // Row 0: bulb at (0,0), wall at (0,2)
    setCell(board, S, 0, 0, { bulb: true });
    setCell(board, S, 0, 2, { wall: true });

    const { litSet } = computeLighting(board, S);
    expect(litSet.has(cellIdx(0, 0, S))).toBe(true);  // bulb cell itself
    expect(litSet.has(cellIdx(0, 1, S))).toBe(true);  // visible
    expect(litSet.has(cellIdx(0, 3, S))).toBe(false); // behind wall
    expect(litSet.has(cellIdx(0, 4, S))).toBe(false); // behind wall
  });

  it("two bulbs in the same row with no wall between them are both in conflict", () => {
    // Row 0: B . . B
    const S = 4;
    const board = blankBoard(S);
    setCell(board, S, 0, 0, { bulb: true });
    setCell(board, S, 0, 3, { bulb: true });

    const { conflictSet } = computeLighting(board, S);
    expect(conflictSet.has(cellIdx(0, 0, S))).toBe(true);
    expect(conflictSet.has(cellIdx(0, 3, S))).toBe(true);
  });

  it("two bulbs in the same column with no wall between them are both in conflict", () => {
    const S = 4;
    const board = blankBoard(S);
    setCell(board, S, 0, 2, { bulb: true });
    setCell(board, S, 3, 2, { bulb: true });

    const { conflictSet } = computeLighting(board, S);
    expect(conflictSet.has(cellIdx(0, 2, S))).toBe(true);
    expect(conflictSet.has(cellIdx(3, 2, S))).toBe(true);
  });

  it("a wall between two bulbs in the same row prevents conflict", () => {
    // Row 0: B . W . B — wall separates them
    const S = 5;
    const board = blankBoard(S);
    // Make other rows walls
    for (let r = 1; r < S; r++) {
      for (let c = 0; c < S; c++) setCell(board, S, r, c, { wall: true });
    }
    setCell(board, S, 0, 0, { bulb: true });
    setCell(board, S, 0, 2, { wall: true });
    setCell(board, S, 0, 4, { bulb: true });

    const { conflictSet, litSet } = computeLighting(board, S);
    expect(conflictSet.size).toBe(0);
    // (0,1) is lit by left bulb; (0,3) by right bulb
    expect(litSet.has(cellIdx(0, 1, S))).toBe(true);
    expect(litSet.has(cellIdx(0, 3, S))).toBe(true);
  });

  it("a bulb in a diagonal does not cause a conflict (only row/col matters)", () => {
    // Bulbs at (0,0) and (1,1) — diagonal, no shared row or column
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 0, 0, { bulb: true });
    setCell(board, S, 1, 1, { bulb: true });

    const { conflictSet } = computeLighting(board, S);
    expect(conflictSet.size).toBe(0);
  });

  it("cells lit by two different bulbs are in litSet (union)", () => {
    // 3×3, bulbs at (0,0) and (2,2) — they both light the center area
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 0, 0, { bulb: true });
    setCell(board, S, 2, 2, { bulb: true });

    const { litSet } = computeLighting(board, S);
    // (0,1),(0,2) lit by top-left; (1,2),(0,2) lit by bottom-right; etc.
    expect(litSet.size).toBeGreaterThanOrEqual(5);
    // Centre (1,1) — lit by both via column and row respectively?
    // (0,0) ray down hits (1,0),(2,0); right hits (0,1),(0,2)
    // (2,2) ray up hits (1,2),(0,2); left hits (2,1),(2,0)
    // (1,1) is not reachable from either bulb without crossing the center
    // Specifically: (0,0) down reaches (1,0) and (2,0); right reaches (0,1),(0,2)
    // (2,2) up reaches (1,2),(0,2); left reaches (2,1),(2,0)
    // (1,1) is NOT lit by either
    expect(litSet.has(cellIdx(1, 1, S))).toBe(false);
  });
});

// ---- wallAdjBulbCount -------------------------------------------------------

describe("wallAdjBulbCount", () => {
  it("counts orthogonal neighbours that have bulbs", () => {
    // 3×3: wall at center (1,1), bulbs at (0,1) and (1,0)
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 1, 1, { wall: true, num: 2 });
    setCell(board, S, 0, 1, { bulb: true });
    setCell(board, S, 1, 0, { bulb: true });

    expect(wallAdjBulbCount(cellIdx(1, 1, S), board, S)).toBe(2);
  });

  it("does not count diagonal neighbours", () => {
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 1, 1, { wall: true });
    // Bulbs at all four diagonal corners — none count
    setCell(board, S, 0, 0, { bulb: true });
    setCell(board, S, 0, 2, { bulb: true });
    setCell(board, S, 2, 0, { bulb: true });
    setCell(board, S, 2, 2, { bulb: true });

    expect(wallAdjBulbCount(cellIdx(1, 1, S), board, S)).toBe(0);
  });

  it("counts zero when no adjacent bulbs", () => {
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 1, 1, { wall: true, num: 0 });
    expect(wallAdjBulbCount(cellIdx(1, 1, S), board, S)).toBe(0);
  });

  it("handles edge walls (boundary: not all 4 neighbours exist)", () => {
    // Wall at (0,0), only right and down neighbours exist
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 0, 0, { wall: true });
    setCell(board, S, 0, 1, { bulb: true }); // right
    setCell(board, S, 1, 0, { bulb: true }); // down

    expect(wallAdjBulbCount(cellIdx(0, 0, S), board, S)).toBe(2);
  });
});

// ---- isWallSatisfied --------------------------------------------------------

describe("isWallSatisfied", () => {
  it("satisfied when adjacent bulb count matches num", () => {
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 1, 1, { wall: true, num: 1 });
    setCell(board, S, 0, 1, { bulb: true });

    expect(isWallSatisfied(cellIdx(1, 1, S), board, S)).toBe(true);
  });

  it("not satisfied when count is too low", () => {
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 1, 1, { wall: true, num: 2 });
    setCell(board, S, 0, 1, { bulb: true });

    expect(isWallSatisfied(cellIdx(1, 1, S), board, S)).toBe(false);
  });

  it("not satisfied when count is too high", () => {
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 1, 1, { wall: true, num: 0 });
    setCell(board, S, 0, 1, { bulb: true });

    expect(isWallSatisfied(cellIdx(1, 1, S), board, S)).toBe(false);
  });

  it("unnumbered wall (num === null) is always satisfied", () => {
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 1, 1, { wall: true, num: null });
    // Neighbouring bulbs don't matter
    setCell(board, S, 0, 1, { bulb: true });
    setCell(board, S, 1, 0, { bulb: true });

    expect(isWallSatisfied(cellIdx(1, 1, S), board, S)).toBe(true);
  });

  it("num=0 wall is satisfied only with zero adjacent bulbs", () => {
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 1, 1, { wall: true, num: 0 });

    expect(isWallSatisfied(cellIdx(1, 1, S), board, S)).toBe(true);
  });
});

// ---- checkWin ---------------------------------------------------------------

describe("checkWin — fully-solved minimal board", () => {
  it("wins on a 2×2 board fully lit with no conflicts and no numbered walls", () => {
    // Board: all white, bulb at (0,0) lights right→(0,1) and down→(1,0),
    // but (1,1) is unlit. Add second bulb at (1,1) for full coverage.
    //   B .
    //   . B
    const S = 2;
    const board = blankBoard(S);
    setCell(board, S, 0, 0, { bulb: true });
    setCell(board, S, 1, 1, { bulb: true });

    const lighting = computeLighting(board, S);
    expect(checkWin(board, S, lighting)).toBe(true);
  });

  it("does not win when a white cell is unlit", () => {
    // 2×2, only bulb at (0,0) — (1,1) is unlit (diagonal)
    const S = 2;
    const board = blankBoard(S);
    setCell(board, S, 0, 0, { bulb: true });

    const lighting = computeLighting(board, S);
    expect(checkWin(board, S, lighting)).toBe(false);
  });

  it("does not win when there is a conflict", () => {
    // 1×3 row: B . B — both bulbs see each other
    const S = 3;
    const board = blankBoard(S);
    // Make rows 1-2 walls
    for (let r = 1; r < S; r++) {
      for (let c = 0; c < S; c++) setCell(board, S, r, c, { wall: true });
    }
    setCell(board, S, 0, 0, { bulb: true });
    setCell(board, S, 0, 2, { bulb: true });

    const lighting = computeLighting(board, S);
    expect(checkWin(board, S, lighting)).toBe(false);
  });

  it("does not win when a numbered wall is unsatisfied", () => {
    // 3×3: wall at (1,1) with num=2, only 1 adjacent bulb placed
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 1, 1, { wall: true, num: 2 });
    // Bulbs to cover all white cells
    setCell(board, S, 0, 0, { bulb: true }); // lights (0,0),(0,1),(0,2),(1,0),(2,0)
    setCell(board, S, 2, 2, { bulb: true }); // lights (2,2),(2,1),(1,2)
    // (0,0) is adjacent to wall via col 0 row 1 but not orthogonal to (1,1)
    // Wall (1,1) orthogonal neighbours: (0,1),(2,1),(1,0),(1,2) — none have bulbs

    const lighting = computeLighting(board, S);
    // Check if all white cells are actually lit first
    const totalWhite = board.filter((c) => !c.wall).length;
    const litWhiteCount = [...lighting.litSet].filter((i) => !board[i].wall).length;
    if (litWhiteCount < totalWhite) {
      // Not all lit either, which also means no win — test still valid
      expect(checkWin(board, S, lighting)).toBe(false);
    } else {
      // All lit but numbered wall constraint failed
      expect(checkWin(board, S, lighting)).toBe(false);
    }
  });

  it("wins when a num=0 wall has zero adjacent bulbs", () => {
    // 3×3: wall at center (1,1) with num=0; surrounding cells covered by corner bulbs
    // Bulbs at (0,0) and (2,2) cover: top row, left col, bottom row, right col
    // (1,1) is a wall; (0,2),(1,2) covered by (2,2); (2,0),(1,0) covered by (0,0) etc.
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 1, 1, { wall: true, num: 0 });
    setCell(board, S, 0, 0, { bulb: true }); // lights (0,1),(0,2),(1,0),(2,0)
    setCell(board, S, 2, 2, { bulb: true }); // lights (2,1),(2,0)→already,(1,2),(0,2)→already

    const lighting = computeLighting(board, S);
    // Verify all 8 white cells are lit and no conflicts
    const whiteIndices = board.map((_, i) => i).filter((i) => !board[i].wall);
    const allLit = whiteIndices.every((i) => lighting.litSet.has(i));
    expect(allLit).toBe(true);
    expect(lighting.conflictSet.size).toBe(0);
    expect(checkWin(board, S, lighting)).toBe(true);
  });

  it("wins on an explicitly hand-crafted 3×3 solution", () => {
    // Layout (W=wall, B=bulb, .=white):
    //   B . .
    //   . W .
    //   . . B
    // B(0,0) lights: right→(0,1),(0,2), down→(1,0),(2,0)
    // B(2,2) lights: left→(2,1),(2,0)→already, up→(1,2),(0,2)→already
    // Wall (1,1): no num constraint; no adjacent bulbs needed
    // All 8 white cells covered, no mutual visibility (diagonal bulbs)
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 1, 1, { wall: true });
    setCell(board, S, 0, 0, { bulb: true });
    setCell(board, S, 2, 2, { bulb: true });

    const lighting = computeLighting(board, S);
    expect(lighting.conflictSet.size).toBe(0);
    expect(checkWin(board, S, lighting)).toBe(true);
  });

  it("perturbing the solved board (remove a bulb) causes not-win", () => {
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 1, 1, { wall: true });
    setCell(board, S, 0, 0, { bulb: true });
    setCell(board, S, 2, 2, { bulb: true });

    // Verify it starts solved
    const lighting = computeLighting(board, S);
    expect(checkWin(board, S, lighting)).toBe(true);

    // Remove one bulb
    setCell(board, S, 2, 2, { bulb: false });
    const lighting2 = computeLighting(board, S);
    expect(checkWin(board, S, lighting2)).toBe(false);
  });

  it("adding a conflicting bulb to a solved board causes not-win", () => {
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 1, 1, { wall: true });
    setCell(board, S, 0, 0, { bulb: true });
    setCell(board, S, 2, 2, { bulb: true });

    // Verify it starts solved
    const lighting = computeLighting(board, S);
    expect(checkWin(board, S, lighting)).toBe(true);

    // Place a bulb that sees (0,0) — on (0,2) which is in the same row
    setCell(board, S, 0, 2, { bulb: true });
    const lighting2 = computeLighting(board, S);
    expect(checkWin(board, S, lighting2)).toBe(false);
  });
});

// ---- buildBoard — generator invariants --------------------------------------

describe("buildBoard — seeded generator", () => {
  it("is deterministic: same seed always produces the same board", () => {
    const S = 7;
    const rng1 = makeRng("akari-test-42");
    const rng2 = makeRng("akari-test-42");
    const board1 = buildBoard(rng1, S);
    const board2 = buildBoard(rng2, S);
    expect(board1).toEqual(board2);
  });

  it("different seeds produce different boards (probabilistically)", () => {
    const S = 9;
    const board1 = buildBoard(makeRng("seed-A"), S);
    const board2 = buildBoard(makeRng("seed-B"), S);
    // It is astronomically unlikely that two seeded boards are identical
    const identical = board1.every(
      (cell, i) =>
        cell.wall === board2[i].wall &&
        cell.num === board2[i].num,
    );
    expect(identical).toBe(false);
  });

  it("produces exactly S×S cells for each supported difficulty size", () => {
    for (const S of [7, 9, 11]) {
      const board = buildBoard(makeRng(`size-${S}`), S);
      expect(board).toHaveLength(S * S);
    }
  });

  it("all cells have exactly the expected fields with valid types", () => {
    const board = buildBoard(makeRng("fields-check"), 7);
    for (const cell of board) {
      expect(typeof cell.wall).toBe("boolean");
      expect(cell.num === null || typeof cell.num === "number").toBe(true);
      expect(typeof cell.bulb).toBe("boolean");
    }
  });

  it("returned board has .bulb === false on every cell (solution hidden)", () => {
    const board = buildBoard(makeRng("no-bulbs"), 9);
    expect(board.every((c) => !c.bulb)).toBe(true);
  });

  it("wall fraction is reasonable (between 5% and 35% walls)", () => {
    const S = 9;
    const board = buildBoard(makeRng("wall-fraction"), S);
    const wallCount = board.filter((c) => c.wall).length;
    const fraction = wallCount / (S * S);
    expect(fraction).toBeGreaterThan(0.05);
    expect(fraction).toBeLessThan(0.35);
  });

  it("numbered walls have num ∈ [0, 4] (max 4 orthogonal neighbours)", () => {
    const board = buildBoard(makeRng("num-range"), 9);
    for (const cell of board) {
      if (cell.wall && cell.num !== null) {
        expect(cell.num).toBeGreaterThanOrEqual(0);
        expect(cell.num).toBeLessThanOrEqual(4);
      }
    }
  });

  it("the embedded solution is valid: placing bulbs greedily covers all white cells", () => {
    // Re-run the generator's own greedy logic on the wall layout to verify
    // that every non-wall cell can be covered — i.e. the puzzle is solvable.
    // We verify the generator's invariant by checking that if we replay the
    // greedy placement (on the returned board's wall map), we get full coverage
    // with no conflicts.
    const S = 9;
    const board = buildBoard(makeRng("solvable-check"), S);
    const total = S * S;

    // Replay greedy cover
    const covered = new Array<boolean>(total).fill(false);
    const placed: number[] = [];

    for (let i = 0; i < total; i++) {
      if (board[i].wall || covered[i]) continue;
      // Place bulb here
      placed.push(i);
      covered[i] = true;
      const [r, c] = [Math.floor(i / S), i % S];
      // Cast rays
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr < S && nc >= 0 && nc < S) {
          const ni = nr * S + nc;
          if (board[ni].wall) break;
          covered[ni] = true;
          nr += dr; nc += dc;
        }
      }
    }

    // All non-wall cells must be covered
    for (let i = 0; i < total; i++) {
      if (!board[i].wall) {
        expect(covered[i], `cell ${i} not covered by greedy solution`).toBe(true);
      }
    }

    // Build a test board with the greedy bulbs placed, then check win
    const testBoard: AkariCell[] = board.map((c) => ({ ...c, bulb: false }));
    for (const i of placed) testBoard[i].bulb = true;
    const lighting = computeLighting(testBoard, S);
    expect(lighting.conflictSet.size).toBe(0);
    expect(checkWin(testBoard, S, lighting)).toBe(true);
  });

  it("numbered wall constraints are consistent with the generator's solution", () => {
    // For every numbered wall, the number must equal the adjacent bulb count
    // under the generator's own greedy solution (rebuilt here).
    const S = 9;
    const board = buildBoard(makeRng("num-consistent"), S);
    const total = S * S;

    // Rebuild greedy bulb placement
    const covered = new Array<boolean>(total).fill(false);
    const solutionBulbs = new Set<number>();
    for (let i = 0; i < total; i++) {
      if (board[i].wall || covered[i]) continue;
      solutionBulbs.add(i);
      covered[i] = true;
      const r = Math.floor(i / S), c = i % S;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr < S && nc >= 0 && nc < S) {
          const ni = nr * S + nc;
          if (board[ni].wall) break;
          covered[ni] = true;
          nr += dr; nc += dc;
        }
      }
    }

    // For each numbered wall, verify that its num equals the count of adjacent solution bulbs
    for (let i = 0; i < total; i++) {
      const cell = board[i];
      if (!cell.wall || cell.num === null) continue;
      const r = Math.floor(i / S), c = i % S;
      let adj = 0;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < S && nc >= 0 && nc < S) {
          const ni = nr * S + nc;
          if (solutionBulbs.has(ni)) adj++;
        }
      }
      expect(cell.num, `wall at ${i} has num=${cell.num} but solution has ${adj} adjacent bulbs`).toBe(adj);
    }
  });
});

// ---- buildBoardFromSeed convenience -----------------------------------------

describe("buildBoardFromSeed", () => {
  it("produces the same result as buildBoard(makeRng(seed), size)", () => {
    const seed = "convenience-test";
    const S = 7;
    const a = buildBoard(makeRng(seed), S);
    const b = buildBoardFromSeed(seed, S);
    expect(a).toEqual(b);
  });

  it("accepts null seed (random, produces a valid board)", () => {
    const board = buildBoardFromSeed(null, 7);
    expect(board).toHaveLength(49);
    expect(board.every((c) => !c.bulb)).toBe(true);
  });
});

// =============================================================================
// Solvability audit
//
// Everything in this section is written from the rules as shown to the player
// (see the 規則 panel in AkariGame.vue) and deliberately does NOT reuse the
// module's helpers, so it is an independent check of both the generator and
// the win detection:
//   - every white cell must be lit;
//   - a bulb lights its row and column until a wall;
//   - no bulb may be lit by another bulb;
//   - a numbered wall has exactly that many orthogonally adjacent bulbs;
//   - unnumbered walls are unconstrained.
// =============================================================================

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

/** Sizes offered by the component: DIFFS in AkariGame.vue (7/9/11); the Daily
    Challenge always uses 9. */
const UI_SIZES = [7, 9, 11] as const;
const DAILY_SIZE = 9;

/** Cells a bulb at `i` would light (excluding `i`), stopping at walls. */
function visibleCells(board: readonly AkariCell[], size: number, i: number): number[] {
  const out: number[] = [];
  const r0 = Math.floor(i / size);
  const c0 = i % size;
  for (const [dr, dc] of DIRS) {
    let r = r0 + dr;
    let c = c0 + dc;
    while (r >= 0 && r < size && c >= 0 && c < size) {
      const j = r * size + c;
      if (board[j].wall) break;
      out.push(j);
      r += dr;
      c += dc;
    }
  }
  return out;
}

/** Orthogonal non-wall neighbours of cell `i`. */
function whiteNeighbours(board: readonly AkariCell[], size: number, i: number): number[] {
  const out: number[] = [];
  const r0 = Math.floor(i / size);
  const c0 = i % size;
  for (const [dr, dc] of DIRS) {
    const r = r0 + dr;
    const c = c0 + dc;
    if (r >= 0 && r < size && c >= 0 && c < size) {
      const j = r * size + c;
      if (!board[j].wall) out.push(j);
    }
  }
  return out;
}

/** Independent rule check: is `bulbs` a complete, valid solution of `board`? */
function isValidSolution(board: readonly AkariCell[], size: number, bulbs: ReadonlySet<number>): boolean {
  const total = size * size;
  const lit = new Uint8Array(total);
  for (const b of bulbs) {
    if (board[b].wall) return false;
    lit[b] = 1;
    for (const j of visibleCells(board, size, b)) {
      if (bulbs.has(j)) return false; // two bulbs see each other
      lit[j] = 1;
    }
  }
  for (let i = 0; i < total; i++) if (!board[i].wall && !lit[i]) return false;
  for (let i = 0; i < total; i++) {
    const cell = board[i];
    if (!cell.wall || cell.num === null) continue;
    const adjacent = whiteNeighbours(board, size, i).filter((j) => bulbs.has(j)).length;
    if (adjacent !== cell.num) return false;
  }
  return true;
}

/**
 * Independent backtracking solver. Picks the unlit white cell with the fewest
 * ways to light it (itself or an unlit cell that sees it), branches over those
 * candidates, and prunes with the numbered-wall bounds. Returns ascending bulb
 * indices of one solution, or null when the puzzle has none.
 */
function solveAkari(board: readonly AkariCell[], size: number): number[] | null {
  const total = size * size;
  const whites: number[] = [];
  for (let i = 0; i < total; i++) if (!board[i].wall) whites.push(i);
  const rays: number[][] = new Array(total);
  for (const w of whites) rays[w] = visibleCells(board, size, w);
  const clues: { num: number; nb: number[] }[] = [];
  for (let i = 0; i < total; i++) {
    const cell = board[i];
    if (cell.wall && cell.num !== null) clues.push({ num: cell.num, nb: whiteNeighbours(board, size, i) });
  }

  const lit = new Int32Array(total); // how many bulbs light each cell
  const bulb = new Uint8Array(total);
  const banned = new Uint8Array(total); // candidates already tried on this path
  let result: number[] | null = null;

  // Every numbered wall must still be satisfiable: bulbs so far <= num and
  // bulbs so far + neighbours that could still take a bulb >= num. A bulb can
  // only ever go on a currently unlit, unbanned cell, and the four neighbours
  // of a wall never see each other, so this bound is exact.
  const cluesFeasible = (): boolean => {
    for (const { num, nb } of clues) {
      let have = 0;
      let possible = 0;
      for (const j of nb) {
        if (bulb[j]) have++;
        else if (!lit[j] && !banned[j]) possible++;
      }
      if (have > num || have + possible < num) return false;
    }
    return true;
  };
  const toggle = (i: number, d: 1 | -1) => {
    bulb[i] = d === 1 ? 1 : 0;
    lit[i] += d;
    for (const j of rays[i]) lit[j] += d;
  };
  const search = (): boolean => {
    let best: number[] | null = null;
    for (const w of whites) {
      if (lit[w] > 0) continue;
      const cands: number[] = [];
      if (!banned[w]) cands.push(w);
      for (const j of rays[w]) if (!lit[j] && !banned[j]) cands.push(j);
      if (cands.length === 0) return false; // this cell can never be lit
      if (best === null || cands.length < best.length) {
        best = cands;
        if (cands.length === 1) break;
      }
    }
    if (best === null) {
      // Everything is lit — the bulb set is final, clues must match exactly.
      if (!clues.every(({ num, nb }) => nb.filter((j) => bulb[j]).length === num)) return false;
      result = [];
      for (let i = 0; i < total; i++) if (bulb[i]) result.push(i);
      return true;
    }
    // Partition solutions by the first candidate that carries a bulb: in
    // branch k candidate k has a bulb and candidates 0..k-1 are banned.
    const bannedHere: number[] = [];
    let found = false;
    for (const c of best) {
      toggle(c, 1);
      if (cluesFeasible() && search()) found = true;
      toggle(c, -1);
      if (found) break;
      banned[c] = 1;
      bannedHere.push(c);
    }
    for (const c of bannedHere) banned[c] = 0;
    return found;
  };

  if (!cluesFeasible()) return null;
  search();
  return result;
}

/** Copy of `board` with exactly the given bulbs placed. */
function withBulbs(board: readonly AkariCell[], bulbs: Iterable<number>): AkariCell[] {
  const copy = board.map((c) => ({ ...c, bulb: false }));
  for (const i of bulbs) copy[i].bulb = true;
  return copy;
}

/** Does the module's win check accept this bulb placement on this board? */
function winsWith(board: readonly AkariCell[], size: number, bulbs: Iterable<number>): boolean {
  const b = withBulbs(board, bulbs);
  return checkWin(b, size, computeLighting(b, size));
}

/**
 * Replay the generator's raw wall pass for a seed: one `rng.bool(0.17)` per
 * cell in index order (Step 1 of buildBoard). Lets the guard tests prove what
 * the un-guarded layout looked like for a given seed.
 */
function rawWallLayout(seed: string | number, size: number): boolean[] {
  const rng = makeRng(seed);
  return Array.from({ length: size * size }, () => rng.bool(0.17));
}

/**
 * Replay Step 1 + Step 3's clue rolls (one `rng.bool(0.75)` per wall, in
 * index order) for a seed whose wall layout triggers neither wall guard
 * (asserted here), returning which walls would have revealed a number.
 */
function rawClueRolls(seed: string | number, size: number): boolean[] {
  const rng = makeRng(seed);
  const total = size * size;
  const walls = Array.from({ length: total }, () => rng.bool(0.17));
  const wallCount = walls.filter(Boolean).length;
  expect(wallCount).toBeGreaterThan(0);
  expect(wallCount).toBeLessThan(total);
  return walls.filter(Boolean).map(() => rng.bool(0.75));
}

function countCells(board: readonly AkariCell[]) {
  return {
    white: board.filter((c) => !c.wall).length,
    walls: board.filter((c) => c.wall).length,
    numbered: board.filter((c) => c.wall && c.num !== null).length,
  };
}

// ---- solver self-checks -----------------------------------------------------

describe("audit solver — self-checks on hand-made boards", () => {
  it("solves a 2×2 open grid with a diagonal placement", () => {
    const S = 2;
    const sol = solveAkari(blankBoard(S), S);
    expect(sol).not.toBeNull();
    expect(isValidSolution(blankBoard(S), S, new Set(sol!))).toBe(true);
  });

  it("returns null for an unsatisfiable clue (num=4 on a corner wall)", () => {
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 0, 0, { wall: true, num: 4 });
    expect(solveAkari(board, S)).toBeNull();
  });

  it("returns null when two 0-walls forbid every way to light a cell", () => {
    // Row 0: [0] . [0]  — (0,1) can only be lit by itself (column is walled
    // below), but both neighbours are 0-walls, so no bulb may go there.
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 0, 0, { wall: true, num: 0 });
    setCell(board, S, 0, 2, { wall: true, num: 0 });
    setCell(board, S, 1, 1, { wall: true, num: null });
    expect(solveAkari(board, S)).toBeNull();
  });

  it("respects clues: a num=1 wall gets exactly one adjacent bulb", () => {
    //  . . .
    //  . 1 W   — solvable, e.g. bulbs at (1,0), (0,2), (2,2)
    //  . . .
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 1, 1, { wall: true, num: 1 });
    setCell(board, S, 1, 2, { wall: true });
    const sol = solveAkari(board, S);
    expect(sol).not.toBeNull();
    expect(isValidSolution(board, S, new Set(sol!))).toBe(true);
    const adjacent = whiteNeighbours(board, S, cellIdx(1, 1, S)).filter((j) => sol!.includes(j));
    expect(adjacent).toHaveLength(1);
  });

  it("isValidSolution rejects bulbs on walls, unlit cells, conflicts and bad clues", () => {
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 1, 1, { wall: true, num: 0 });
    // valid: diagonal corners
    expect(isValidSolution(board, S, new Set([0, 8]))).toBe(true);
    // bulb on the wall
    expect(isValidSolution(board, S, new Set([4, 0, 8]))).toBe(false);
    // unlit cell
    expect(isValidSolution(board, S, new Set([0]))).toBe(false);
    // conflict on row 0
    expect(isValidSolution(board, S, new Set([0, 2, 6]))).toBe(false);
    // clue violated (bulb next to the 0-wall)
    expect(isValidSolution(board, S, new Set([1, 6, 5]))).toBe(false);
  });
});

// ---- greedySolution ---------------------------------------------------------

describe("greedySolution — the generator's embedded solution", () => {
  it("is a valid solution for ANY wall layout, with or without clues", () => {
    const rng = makeRng("greedy-any-layout");
    for (let trial = 0; trial < 300; trial++) {
      const S = rng.int(2, 8);
      const density = rng.float(0, 0.6);
      const board = blankBoard(S);
      for (const cell of board) cell.wall = rng.bool(density);
      const sol = greedySolution(board, S);
      expect(sol).toEqual([...sol].sort((a, b) => a - b));
      expect(isValidSolution(board, S, new Set(sol))).toBe(true);
      expect(winsWith(board, S, sol)).toBe(true);
    }
  });

  it("ignores and preserves existing bulb flags on the input board", () => {
    const S = 3;
    const board = blankBoard(S);
    setCell(board, S, 2, 2, { bulb: true });
    const sol = greedySolution(board, S);
    expect(sol).toEqual([0, 4, 8]);
    expect(board[cellIdx(2, 2, S)].bulb).toBe(true);
    expect(board.filter((c) => c.bulb)).toHaveLength(1);
  });

  it("returns no bulbs for an all-wall board", () => {
    const S = 2;
    const board = blankBoard(S);
    for (const cell of board) cell.wall = true;
    expect(greedySolution(board, S)).toEqual([]);
  });
});

// ---- checkWin accepts any valid solution -----------------------------------

describe("checkWin — accepts any valid solution, not just the embedded one", () => {
  it("2×2 open grid: both diagonal placements win", () => {
    const S = 2;
    const board = blankBoard(S);
    expect(greedySolution(board, S)).toEqual([0, 3]);
    expect(winsWith(board, S, [0, 3])).toBe(true);
    expect(winsWith(board, S, [1, 2])).toBe(true); // the other diagonal
    expect(winsWith(board, S, [0, 1])).toBe(false); // conflict on row 0
    expect(winsWith(board, S, [0])).toBe(false); // (1,1) unlit
  });

  it("a generated puzzle: an alternative solution that differs from the embedded one wins", () => {
    // Search a handful of seeds for one where the independent solver's answer
    // is not the greedy placement, then confirm the game accepts both.
    let checked = 0;
    for (let s = 0; s < 20; s++) {
      const S = 7;
      const board = buildBoard(makeRng(`alt-${s}`), S);
      const greedy = greedySolution(board, S);
      const alt = solveAkari(board, S);
      expect(alt).not.toBeNull();
      if (alt!.join() === greedy.join()) continue;
      expect(isValidSolution(board, S, new Set(alt!))).toBe(true);
      expect(winsWith(board, S, alt!)).toBe(true);
      expect(winsWith(board, S, greedy)).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

// ---- buildBoard structural guards ------------------------------------------

describe("buildBoard — structural guards (never empty, never bare, never clue-less)", () => {
  it("rejects sizes that cannot hold both a white cell and a wall", () => {
    expect(() => buildBoard(makeRng(1), 1)).toThrow(RangeError);
    expect(() => buildBoard(makeRng(1), 0)).toThrow(RangeError);
    expect(() => buildBoard(makeRng(1), 2.5)).toThrow(RangeError);
    expect(() => buildBoard(makeRng(1), 2)).not.toThrow();
  });

  it("all-wall raw layout: the centre cell is opened (seed g-180, size 2)", () => {
    const S = 2;
    const seed = "g-180";
    expect(rawWallLayout(seed, S).every(Boolean)).toBe(true);
    const board = buildBoard(makeRng(seed), S);
    const centre = Math.floor((S * S) / 2);
    expect(board[centre].wall).toBe(false);
    expect(countCells(board)).toEqual({ white: 1, walls: 3, numbered: expect.any(Number) });
    expect(countCells(board).numbered).toBeGreaterThan(0);
    expect(solveAkari(board, S)).toEqual([centre]);
    expect(winsWith(board, S, [centre])).toBe(true);
    expect(winsWith(board, S, [])).toBe(false); // not solved before the first click
  });

  it("no-wall raw layout: a wall is forced at the centre (seed nw-5571, size 7)", () => {
    const S = 7;
    const seed = "nw-5571";
    expect(rawWallLayout(seed, S).some(Boolean)).toBe(false);
    const board = buildBoard(makeRng(seed), S);
    const centre = Math.floor((S * S) / 2);
    expect(cellRc(centre, S)).toEqual([3, 3]);
    expect(board[centre].wall).toBe(true);
    expect(countCells(board)).toEqual({ white: 48, walls: 1, numbered: 1 });
    const sol = solveAkari(board, S);
    expect(sol).not.toBeNull();
    expect(winsWith(board, S, sol!)).toBe(true);
    expect(winsWith(board, S, greedySolution(board, S))).toBe(true);
  });

  it("no-wall raw layout at the smallest size (seed g-2, size 2)", () => {
    const S = 2;
    const seed = "g-2";
    expect(rawWallLayout(seed, S).some(Boolean)).toBe(false);
    const board = buildBoard(makeRng(seed), S);
    expect(countCells(board)).toEqual({ white: 3, walls: 1, numbered: 1 });
    expect(board[2].wall).toBe(true);
    const sol = solveAkari(board, S);
    expect(sol).not.toBeNull();
    expect(winsWith(board, S, sol!)).toBe(true);
  });

  it("walls whose clue rolls all fail: exactly one clue is revealed (size 7 seeds)", () => {
    // Before the guard these Easy-size seeds produced a puzzle with walls but
    // no number at all (~1 in 1,250 boards at 7×7).
    const S = 7;
    for (const seed of ["audit-172", "f-5813"]) {
      const rolls = rawClueRolls(seed, S);
      expect(rolls.some(Boolean)).toBe(false);
      const board = buildBoard(makeRng(seed), S);
      const stats = countCells(board);
      expect(stats.walls).toBe(rolls.length);
      expect(stats.numbered).toBe(1);
      // the revealed number is consistent with the embedded solution
      const bulbs = new Set(greedySolution(board, S));
      const i = board.findIndex((c) => c.num !== null);
      expect(board[i].wall).toBe(true);
      expect(board[i].num).toBe(whiteNeighbours(board, S, i).filter((j) => bulbs.has(j)).length);
      const sol = solveAkari(board, S);
      expect(sol).not.toBeNull();
      expect(winsWith(board, S, sol!)).toBe(true);
    }
  });

  it("walls whose clue rolls all fail at the smallest size (seed g-14, size 2)", () => {
    const S = 2;
    const rolls = rawClueRolls("g-14", S);
    expect(rolls).toEqual([false]);
    const board = buildBoard(makeRng("g-14"), S);
    expect(countCells(board)).toEqual({ white: 3, walls: 1, numbered: 1 });
  });

  it("does not alter boards whose raw layout needs no guard", () => {
    // Replay the un-guarded generator (walls, greedy clues at 75%) and compare.
    for (const S of UI_SIZES) {
      for (let s = 0; s < 40; s++) {
        const seed = `unchanged-${s}`;
        const walls = rawWallLayout(seed, S);
        const rolls = rawClueRolls(seed, S);
        if (!rolls.some(Boolean)) continue; // guard case, covered above
        const board = buildBoard(makeRng(seed), S);
        expect(board.map((c) => c.wall)).toEqual(walls);
        const bulbs = new Set(greedySolution(board, S));
        let k = 0;
        for (let i = 0; i < S * S; i++) {
          if (!walls[i]) {
            expect(board[i].num).toBeNull();
            continue;
          }
          const expected = rolls[k++]
            ? whiteNeighbours(board, S, i).filter((j) => bulbs.has(j)).length
            : null;
          expect(board[i].num).toBe(expected);
        }
      }
    }
  });
});

// ---- the audit itself --------------------------------------------------------

describe("solvability audit — every UI size, hundreds of seeds, every Daily date", () => {
  /** Full per-puzzle audit; returns whether the solver's answer differs from the embedded one. */
  function auditPuzzle(board: AkariCell[], size: number, label: string): boolean {
    const total = size * size;
    expect(board, label).toHaveLength(total);
    expect(board.every((c) => !c.bulb), label).toBe(true);

    // (c) never degenerate: something to light, some structure, some clue, not pre-solved
    const stats = countCells(board);
    expect(stats.white, label).toBeGreaterThan(0);
    expect(stats.walls, label).toBeGreaterThan(0);
    expect(stats.numbered, label).toBeGreaterThan(0);
    expect(winsWith(board, size, []), label).toBe(false);
    for (const cell of board) {
      if (cell.num !== null) {
        expect(cell.wall, label).toBe(true);
        expect(cell.num, label).toBeGreaterThanOrEqual(0);
        expect(cell.num, label).toBeLessThanOrEqual(4);
      }
    }

    // (a) independently solvable
    const sol = solveAkari(board, size);
    expect(sol, `${label}: no solution found`).not.toBeNull();
    expect(isValidSolution(board, size, new Set(sol!)), label).toBe(true);

    // (b) win check accepts the independent solution AND the embedded one …
    const embedded = greedySolution(board, size);
    expect(isValidSolution(board, size, new Set(embedded)), label).toBe(true);
    expect(winsWith(board, size, sol!), label).toBe(true);
    expect(winsWith(board, size, embedded), label).toBe(true);

    // … and rejects wrong / incomplete states
    expect(winsWith(board, size, sol!.slice(1)), label).toBe(false); // one bulb missing
    const extra = board.findIndex((c, i) => !c.wall && !sol!.includes(i));
    if (extra !== -1) {
      // an extra bulb on a lit white cell is always a conflict
      expect(winsWith(board, size, [...sol!, extra]), label).toBe(false);
    }

    return sol!.join() !== embedded.join();
  }

  it("string and numeric seeds × sizes 7/9/11", () => {
    const seeds: (string | number)[] = [];
    for (let s = 0; s < 250; s++) seeds.push(`audit-${s}`);
    for (let s = 1; s <= 50; s++) seeds.push(s);
    for (const size of UI_SIZES) {
      let differs = 0;
      for (const seed of seeds) {
        const board = buildBoard(makeRng(seed), size);
        // deterministic: rebuilding from the same seed gives the same puzzle
        expect(buildBoardFromSeed(seed, size)).toEqual(board);
        if (auditPuzzle(board, size, `seed=${seed} size=${size}`)) differs++;
      }
      // Many puzzles admit a solution other than the embedded one — the win
      // check must (and does) accept those too.
      expect(differs).toBeGreaterThan(0);
    }
  });

  it("Daily Challenge date seeds (YYYY-MM-DD, size 9) for 2024-01-01 … 2026-12-31", () => {
    const start = new Date(2024, 0, 1);
    for (let k = 0; ; k++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + k);
      if (d.getFullYear() > 2026) break;
      const seed = todaySeed(d);
      expect(seed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      auditPuzzle(buildBoard(makeRng(seed), DAILY_SIZE), DAILY_SIZE, `daily ${seed}`);
    }
  });
});
