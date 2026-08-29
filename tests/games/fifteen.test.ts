import { describe, it, expect } from "vitest";
import {
  goalState,
  isSolved,
  blankPos,
  legalMoves,
  isMovable,
  applyMove,
  slideRun,
  countInversions,
  isBoardSolvable,
  generateBoard,
  type Direction,
} from "~/games/fifteen";
import { makeRng, todaySeed } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Shared audit helpers
// ---------------------------------------------------------------------------

/** Sizes offered by the FifteenGame.vue size switch (daily mode forces 4×4). */
const UI_SIZES = [3, 4, 5];
/** Everything the module documents as supported (N >= 2), plus one bigger size. */
const ALL_SIZES = [2, 3, 4, 5, 6];

const DIRS: Direction[] = ["up", "down", "left", "right"];
const OPPOSITE: Record<Direction, Direction> = { up: "down", down: "up", left: "right", right: "left" };

/** 0..N*N-1 sorted — what a valid board must contain. */
function identity(n: number): number[] {
  return Array.from({ length: n * n }, (_, i) => i);
}

/**
 * A mixed seed list: plain strings, numbers, and "YYYY-MM-DD" strings in the
 * exact format the Daily Challenge passes as `props.seed` (see todaySeed()).
 * `count` of each kind → 3 * count seeds.
 */
function auditSeeds(count: number): (string | number)[] {
  const seeds: (string | number)[] = [];
  for (let i = 0; i < count; i++) {
    seeds.push(`seed-${i}`, i * 7919 + 1, todaySeed(new Date(2026, 0, 1 + i)));
  }
  return seeds;
}

// ---------------------------------------------------------------------------
// Independent solvability oracles — written from scratch for this audit; they
// deliberately do NOT reuse countInversions / isBoardSolvable from the module.
// ---------------------------------------------------------------------------

/** Inversions among the numbered tiles, reading the board row by row (blank skipped). */
function oracleInversions(board: number[]): number {
  let count = 0;
  for (let i = 0; i < board.length; i++) {
    if (board[i] === 0) continue;
    for (let j = i + 1; j < board.length; j++) {
      if (board[j] !== 0 && board[i] > board[j]) count++;
    }
  }
  return count;
}

/**
 * Classic parity rule.
 *  - odd width:  solvable iff the inversion count is even;
 *  - even width: solvable iff inversions + (blank row, 0-indexed from the top)
 *    is odd — the same statement as "blank on an even row counting from the
 *    bottom (1-indexed) iff inversions odd".
 */
function oracleSolvable(board: number[], n: number): boolean {
  const inv = oracleInversions(board);
  if (n % 2 === 1) return inv % 2 === 0;
  const blankRowFromTop = Math.floor(board.indexOf(0) / n);
  return (inv + blankRowFromTop) % 2 === 1;
}

/**
 * Second, structurally different oracle: treat the blank as tile N*N so the
 * board is a permutation of 1..N*N, and take its sign from the cycle
 * decomposition. Every slide is one transposition and moves the blank one
 * cell, so (permutation parity + blank's taxicab distance from its home cell)
 * is invariant under play and must be even for a solvable board.
 */
function oracleSolvableBySign(board: number[], n: number): boolean {
  const size = n * n;
  const perm = board.map((v) => (v === 0 ? size : v));
  const seen: boolean[] = new Array(size).fill(false);
  let transpositions = 0;
  for (let i = 0; i < size; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = perm[j] - 1) {
      seen[j] = true;
      len++;
    }
    transpositions += len - 1;
  }
  const bi = board.indexOf(0);
  const dist = n - 1 - Math.floor(bi / n) + (n - 1 - (bi % n));
  return (transpositions + dist) % 2 === 0;
}

// ---------------------------------------------------------------------------
// Independent breadth-first solver for the 3×3 puzzle. One reverse BFS from the
// goal visits all 181 440 reachable states; each state remembers the direction
// that brings it one step closer to the goal, so any start yields an optimal
// move sequence — which the tests then replay through the game's own
// applyMove / legalMoves / isSolved.
// ---------------------------------------------------------------------------

const GOAL3 = [1, 2, 3, 4, 5, 6, 7, 8, 0];

/** Base-9 key of a 3×3 board (a bijection on permutations of 0..8). */
function key3(board: number[]): number {
  let k = 0;
  for (let i = board.length - 1; i >= 0; i--) k = k * 9 + board[i];
  return k;
}

/** The solver's own blank mover (independent of applyMove); null when off-board. */
function solverMove(board: number[], dir: Direction): number[] | null {
  const bi = board.indexOf(0);
  let r = Math.floor(bi / 3);
  let c = bi % 3;
  if (dir === "up") r--;
  else if (dir === "down") r++;
  else if (dir === "left") c--;
  else c++;
  if (r < 0 || r > 2 || c < 0 || c > 2) return null;
  const ti = r * 3 + c;
  const next = board.slice();
  next[bi] = next[ti];
  next[ti] = 0;
  return next;
}

interface Solver3 {
  depth: Map<number, number>;
  toward: Map<number, Direction>;
}

let solverCache: Solver3 | null = null;
function solver3(): Solver3 {
  if (solverCache) return solverCache;
  const depth = new Map<number, number>();
  const toward = new Map<number, Direction>();
  const queue: number[][] = [GOAL3];
  depth.set(key3(GOAL3), 0);
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const d = depth.get(key3(cur))!;
    for (const dir of DIRS) {
      const next = solverMove(cur, dir);
      if (!next) continue;
      const k = key3(next);
      if (depth.has(k)) continue;
      depth.set(k, d + 1);
      toward.set(k, OPPOSITE[dir]); // undoing `dir` brings `next` back to `cur`
      queue.push(next);
    }
  }
  solverCache = { depth, toward };
  return solverCache;
}

/** Optimal move sequence (blank directions) from `board` to the goal. */
function solve3(board: number[]): Direction[] {
  const { toward } = solver3();
  const path: Direction[] = [];
  let cur = board;
  for (let k = key3(cur); k !== key3(GOAL3); k = key3(cur)) {
    const dir = toward.get(k);
    if (!dir) throw new Error(`state ${JSON.stringify(board)} is not reachable from the goal`);
    path.push(dir);
    cur = solverMove(cur, dir)!;
  }
  return path;
}

// ---------------------------------------------------------------------------
// goalState
// ---------------------------------------------------------------------------
describe("goalState", () => {
  it("produces 1..N*N-1 then 0 for a 4×4 board", () => {
    const g = goalState(4);
    expect(g).toHaveLength(16);
    for (let i = 0; i < 15; i++) expect(g[i]).toBe(i + 1);
    expect(g[15]).toBe(0);
  });

  it("works for 3×3 and 5×5", () => {
    const g3 = goalState(3);
    expect(g3).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 0]);
    const g5 = goalState(5);
    expect(g5).toHaveLength(25);
    expect(g5[24]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isSolved — win detection
// ---------------------------------------------------------------------------
describe("isSolved", () => {
  it("returns true on the goal arrangement (4×4)", () => {
    expect(isSolved(goalState(4))).toBe(true);
  });

  it("returns true on the goal arrangement (3×3)", () => {
    expect(isSolved(goalState(3))).toBe(true);
  });

  it("returns false when one tile is out of place", () => {
    const g = goalState(4);
    // Swap tiles at index 0 and 1: [2, 1, 3, …]
    [g[0], g[1]] = [g[1], g[0]];
    expect(isSolved(g)).toBe(false);
  });

  it("returns false when blank is not at the last position", () => {
    // Move blank to position 0: [0, 1, 2, ..., 15] — not the goal
    const board = [0, ...Array.from({ length: 15 }, (_, i) => i + 1)];
    expect(isSolved(board)).toBe(false);
  });
});

describe("audit: isSolved rejects near-solved states", () => {
  it("is false for every board one legal move away from the goal (3×3, 4×4, 5×5)", () => {
    for (const n of UI_SIZES) {
      for (const dir of legalMoves(goalState(n), n)) {
        expect(isSolved(applyMove(goalState(n), dir, n)), `${n}×${n} ${dir}`).toBe(false);
      }
    }
  });

  it("is false when the tiles are in order but the blank is not last", () => {
    expect(isSolved([0, 1, 2, 3, 4, 5, 6, 7, 8])).toBe(false);
    expect(isSolved([1, 2, 3, 4, 0, 5, 6, 7, 8])).toBe(false);
  });

  it("is false for the classic 15/14 swap and for every single tile swap of the goal", () => {
    expect(isSolved([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 14, 0])).toBe(false);
    for (let i = 0; i < 15; i++) {
      for (let j = i + 1; j < 15; j++) {
        const g = goalState(4);
        [g[i], g[j]] = [g[j], g[i]];
        expect(isSolved(g), `swap ${i},${j}`).toBe(false);
      }
    }
  });

  it("is false for an empty board", () => {
    expect(isSolved([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// blankPos
// ---------------------------------------------------------------------------
describe("blankPos", () => {
  it("locates the blank correctly in the goal state (bottom-right)", () => {
    const { r, c } = blankPos(goalState(4), 4);
    expect(r).toBe(3);
    expect(c).toBe(3);
  });

  it("locates blank at index 0 (top-left)", () => {
    const board = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const { r, c } = blankPos(board, 3);
    expect(r).toBe(0);
    expect(c).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// legalMoves
// ---------------------------------------------------------------------------
describe("legalMoves", () => {
  it("blank at top-left corner has only down and right", () => {
    // Board where blank (0) is at index 0
    const board = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const moves = legalMoves(board, 3);
    expect(moves.sort()).toEqual(["down", "right"]);
  });

  it("blank at bottom-right corner has only up and left", () => {
    expect(legalMoves(goalState(3), 3).sort()).toEqual(["left", "up"]);
  });

  it("blank at center of 3×3 has all four directions", () => {
    // Center index = 4
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    expect(legalMoves(board, 3).sort()).toEqual(["down", "left", "right", "up"]);
  });
});

// ---------------------------------------------------------------------------
// isMovable — only tiles adjacent to blank are movable
// ---------------------------------------------------------------------------
describe("isMovable", () => {
  it("a tile directly above the blank is movable", () => {
    // Blank at index 4 (center of 3×3); tile at 1 is directly above
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    expect(isMovable(board, 3, 1)).toBe(true);
  });

  it("a tile directly below the blank is movable", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    expect(isMovable(board, 3, 7)).toBe(true);
  });

  it("a tile directly left of the blank is movable", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    expect(isMovable(board, 3, 3)).toBe(true);
  });

  it("a tile directly right of the blank is movable", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    expect(isMovable(board, 3, 5)).toBe(true);
  });

  it("a tile two steps away is NOT movable", () => {
    // index 0 is two steps up from blank at index 6 in a 3×3
    const board = [1, 2, 3, 4, 5, 6, 0, 7, 8];
    expect(isMovable(board, 3, 0)).toBe(false);
  });

  it("a tile diagonally adjacent is NOT movable", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    // Diagonal neighbours of blank (index 4): 0, 2, 6, 8
    expect(isMovable(board, 3, 0)).toBe(false);
    expect(isMovable(board, 3, 2)).toBe(false);
    expect(isMovable(board, 3, 6)).toBe(false);
    expect(isMovable(board, 3, 8)).toBe(false);
  });

  it("the blank itself is not movable", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    expect(isMovable(board, 3, 4)).toBe(false);
  });

  it("row neighbours across a row boundary are NOT movable (no wrap-around)", () => {
    // Blank at index 3 (row 1, col 0); index 2 is the end of row 0
    const board = [1, 2, 3, 0, 4, 5, 6, 7, 8];
    expect(isMovable(board, 3, 2)).toBe(false);
    expect(isMovable(board, 3, 4)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyMove — sliding a movable tile swaps it with blank
// ---------------------------------------------------------------------------
describe("applyMove", () => {
  it("sliding up moves the tile above into the blank", () => {
    // Blank at center (index 4), tile at index 1 (above) slides down into blank
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    const next = applyMove(board, "up", 3);
    expect(next[4]).toBe(2); // tile 2 moved into blank's old spot
    expect(next[1]).toBe(0); // blank moved up
  });

  it("sliding down moves the tile below into the blank", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    const next = applyMove(board, "down", 3);
    expect(next[4]).toBe(7);
    expect(next[7]).toBe(0);
  });

  it("sliding left moves the tile to the left of blank into it", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    const next = applyMove(board, "left", 3);
    expect(next[4]).toBe(4);
    expect(next[3]).toBe(0);
  });

  it("sliding right moves the tile to the right of blank into it", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    const next = applyMove(board, "right", 3);
    expect(next[4]).toBe(5);
    expect(next[5]).toBe(0);
  });

  it("does not mutate the original board", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    const copy = board.slice();
    applyMove(board, "up", 3);
    expect(board).toEqual(copy);
  });

  it("applying a move then its opposite returns the original board", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    const after = applyMove(applyMove(board, "up", 3), "down", 3);
    expect(after).toEqual(board);
  });
});

describe("audit: applyMove rejects illegal moves", () => {
  it("throws for every direction the blank cannot take, from every cell, and never mutates (3×3, 4×4, 5×5)", () => {
    for (const n of UI_SIZES) {
      for (let bi = 0; bi < n * n; bi++) {
        // Tiles in order with the blank inserted at `bi`
        const board = goalState(n).filter((v) => v !== 0);
        board.splice(bi, 0, 0);
        const copy = board.slice();
        const legal = legalMoves(board, n);
        for (const dir of DIRS) {
          if (legal.includes(dir)) {
            const next = applyMove(board, dir, n);
            expect(next.slice().sort((a, b) => a - b)).toEqual(identity(n));
            // The tile that moved was adjacent to the blank; the blank now sits there.
            expect(isMovable(board, n, next.indexOf(0))).toBe(true);
          } else {
            expect(() => applyMove(board, dir, n), `${dir} with blank at ${bi} on ${n}×${n}`).toThrow(/illegal move/i);
          }
        }
        expect(board).toEqual(copy);
      }
    }
  });

  it("never wraps around a row edge: 'left' with the blank in column 0 is rejected", () => {
    // Before the fix this returned [undefined, 1, 2, …] with a stray '-1' key.
    expect(() => applyMove([0, 1, 2, 3, 4, 5, 6, 7, 8], "left", 3)).toThrow(/illegal move/i);
    // …and 'right' with the blank in the last column used to grab the next row's first tile.
    expect(() => applyMove([1, 2, 0, 3, 4, 5, 6, 7, 8], "right", 3)).toThrow(/illegal move/i);
  });

  it("throws for an unknown direction string (the component is plain JS)", () => {
    expect(() => applyMove(goalState(3), "diagonal" as Direction, 3)).toThrow(/illegal move/i);
  });
});

// ---------------------------------------------------------------------------
// slideRun — the whole-run slide the UI performs on click
// ---------------------------------------------------------------------------
describe("slideRun", () => {
  it("returns null for the blank itself, out-of-range indices and tiles not aligned with the blank", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    expect(slideRun(board, 3, 4)).toBeNull();
    expect(slideRun(board, 3, -1)).toBeNull();
    expect(slideRun(board, 3, 9)).toBeNull();
    for (const idx of [0, 2, 6, 8]) expect(slideRun(board, 3, idx), `diagonal ${idx}`).toBeNull();
    expect(board).toEqual([1, 2, 3, 4, 0, 5, 6, 7, 8]);
  });

  it("slides a single adjacent tile exactly like applyMove", () => {
    const board = [1, 2, 3, 4, 0, 5, 6, 7, 8];
    expect(slideRun(board, 3, 1)).toEqual(applyMove(board, "up", 3));
    expect(slideRun(board, 3, 7)).toEqual(applyMove(board, "down", 3));
    expect(slideRun(board, 3, 3)).toEqual(applyMove(board, "left", 3));
    expect(slideRun(board, 3, 5)).toEqual(applyMove(board, "right", 3));
  });

  it("slides a whole row or column run toward the blank (4×4, blank in the corner)", () => {
    const g = goalState(4); // blank at index 15 (row 3, col 3)
    // Click index 12 (row 3, col 0): 13, 14, 15 shift right, blank lands at 12
    expect(slideRun(g, 4, 12)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0, 13, 14, 15]);
    // Click index 3 (row 0, col 3): 4, 8, 12 shift down, blank lands at 3
    expect(slideRun(g, 4, 3)).toEqual([1, 2, 3, 0, 5, 6, 7, 4, 9, 10, 11, 8, 13, 14, 15, 12]);
    // Blank in the middle of a row: runs going both ways
    const mid = [1, 2, 3, 4, 5, 0, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]; // blank at (1, 1)
    expect(slideRun(mid, 4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(slideRun(mid, 4, 13)).toEqual([1, 2, 3, 4, 5, 9, 6, 7, 8, 13, 10, 11, 12, 0, 14, 15]);
    expect(mid).toEqual([1, 2, 3, 4, 5, 0, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("equals the composition of single applyMove steps and preserves solvability (every click, every UI size)", () => {
    for (const n of UI_SIZES) {
      const board = generateBoard(n, makeRng(`run-${n}`));
      const bi = board.indexOf(0);
      const br = Math.floor(bi / n);
      const bc = bi % n;
      for (let idx = 0; idx < n * n; idx++) {
        const result = slideRun(board, n, idx);
        const r = Math.floor(idx / n);
        const c = idx % n;
        if (idx === bi || (r !== br && c !== bc)) {
          expect(result, `${n}×${n} click ${idx}`).toBeNull();
          continue;
        }
        const dir: Direction = r === br ? (c > bc ? "right" : "left") : r > br ? "down" : "up";
        const dist = Math.abs(r - br) + Math.abs(c - bc);
        let stepwise = board;
        for (let s = 0; s < dist; s++) stepwise = applyMove(stepwise, dir, n);
        expect(result, `${n}×${n} click ${idx}`).toEqual(stepwise);
        expect(result!.indexOf(0)).toBe(idx);
        expect(oracleSolvable(result!, n)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// countInversions
// ---------------------------------------------------------------------------
describe("countInversions", () => {
  it("solved board has 0 inversions", () => {
    expect(countInversions(goalState(4))).toBe(0);
  });

  it("counts correctly for a known board", () => {
    // Simple 1×2: [2, 1, 0] — one inversion (2 > 1)
    expect(countInversions([2, 1, 0])).toBe(1);
  });

  it("ignores the blank (0) in inversion count", () => {
    // [1, 0, 2] — no inversion between 1 and 2 (0 is skipped)
    expect(countInversions([1, 0, 2])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isBoardSolvable — known solvable and unsolvable boards
// ---------------------------------------------------------------------------
describe("isBoardSolvable", () => {
  it("solved state is solvable (4×4)", () => {
    expect(isBoardSolvable(goalState(4), 4)).toBe(true);
  });

  it("solved state is solvable (3×3)", () => {
    expect(isBoardSolvable(goalState(3), 3)).toBe(true);
  });

  it("swapping two adjacent tiles of a solved 4×4 board makes it unsolvable", () => {
    const g = goalState(4);
    // Swap tile at index 0 (value 1) and index 1 (value 2)
    [g[0], g[1]] = [g[1], g[0]];
    expect(isBoardSolvable(g, 4)).toBe(false);
  });

  it("swapping two adjacent tiles of a solved 3×3 board makes it unsolvable", () => {
    const g = goalState(3);
    // Swap value 1 (index 0) and value 2 (index 1)
    [g[0], g[1]] = [g[1], g[0]];
    expect(isBoardSolvable(g, 3)).toBe(false);
  });

  it("classic unsolvable 4×4 (last two non-blank tiles swapped): [1..13, 15, 14, 0]", () => {
    // This is the textbook unsolvable starting position
    const board = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 14, 0];
    expect(isBoardSolvable(board, 4)).toBe(false);
  });

  it("a one-move-from-solved board is solvable (4×4)", () => {
    // Slide blank left once from goal state → still solvable
    const board = applyMove(goalState(4), "left", 4);
    expect(isBoardSolvable(board, 4)).toBe(true);
  });
});

describe("audit: solvability oracles agree with each other and with isBoardSolvable", () => {
  it("both independent oracles and isBoardSolvable agree on 1000 random permutations per size (about half unsolvable)", () => {
    for (const n of ALL_SIZES) {
      const rng = makeRng(`perm-${n}`);
      let solvable = 0;
      for (let i = 0; i < 1000; i++) {
        const board = rng.shuffle(identity(n));
        const verdict = oracleSolvable(board, n);
        expect(oracleSolvableBySign(board, n), `${n}×${n} #${i} ${board}`).toBe(verdict);
        expect(isBoardSolvable(board, n), `${n}×${n} #${i} ${board}`).toBe(verdict);
        if (verdict) solvable++;
      }
      expect(solvable, `${n}×${n} solvable share`).toBeGreaterThan(400);
      expect(solvable, `${n}×${n} solvable share`).toBeLessThan(600);
    }
  });

  it("the invariant survives every legal move and flips when two non-blank tiles are swapped", () => {
    for (const n of ALL_SIZES) {
      let board = generateBoard(n, makeRng(`walk-${n}`));
      const rng = makeRng(`walk-moves-${n}`);
      for (let step = 0; step < 200; step++) {
        board = applyMove(board, rng.pick(legalMoves(board, n)), n);
        expect(oracleSolvable(board, n)).toBe(true);
      }
      const nonBlank = board.map((_, i) => i).filter((i) => board[i] !== 0);
      const swapped = board.slice();
      [swapped[nonBlank[0]], swapped[nonBlank[1]]] = [swapped[nonBlank[1]], swapped[nonBlank[0]]];
      expect(oracleSolvable(swapped, n)).toBe(false);
      expect(oracleSolvableBySign(swapped, n)).toBe(false);
      expect(isBoardSolvable(swapped, n)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Independent BFS solver — sanity checks on the solver itself
// ---------------------------------------------------------------------------
describe("audit: independent 3×3 BFS solver", () => {
  it("enumerates exactly half of 9! states (181 440) with a maximum optimal depth of 31", () => {
    const { depth } = solver3();
    expect(depth.size).toBe(181440);
    let max = 0;
    for (const d of depth.values()) if (d > max) max = d;
    expect(max).toBe(31);
  });

  it("returns an empty path for the goal and refuses an unsolvable board", () => {
    expect(solve3(GOAL3)).toEqual([]);
    expect(() => solve3([2, 1, 3, 4, 5, 6, 7, 8, 0])).toThrow(/not reachable/);
  });
});

// ---------------------------------------------------------------------------
// generateBoard — seeded generation produces valid, solvable, non-trivial boards
// ---------------------------------------------------------------------------
describe("generateBoard", () => {
  it("returns an array of length N*N", () => {
    const board = generateBoard(4, makeRng("test-seed"));
    expect(board).toHaveLength(16);
  });

  it("is a valid permutation of 0..N*N-1 (all values present exactly once)", () => {
    for (let seed = 0; seed < 10; seed++) {
      const board = generateBoard(4, makeRng(`seed-${seed}`));
      const sorted = board.slice().sort((a, b) => a - b);
      expect(sorted).toEqual(Array.from({ length: 16 }, (_, i) => i));
    }
  });

  it("is always SOLVABLE for many different seeds (4×4)", () => {
    const seeds = ["alpha", "beta", "gamma", "delta", 1, 2, 3, 42, 100, "2026-06-03"];
    for (const seed of seeds) {
      const board = generateBoard(4, makeRng(seed));
      expect(isBoardSolvable(board, 4), `board for seed "${seed}" should be solvable`).toBe(true);
    }
  });

  it("is always SOLVABLE for 3×3 with various seeds", () => {
    for (let s = 0; s < 10; s++) {
      const board = generateBoard(3, makeRng(`s${s}`));
      expect(isBoardSolvable(board, 3), `seed s${s}`).toBe(true);
    }
  });

  it("is always SOLVABLE for 5×5 with various seeds", () => {
    for (let s = 0; s < 10; s++) {
      const board = generateBoard(5, makeRng(`s${s}`));
      expect(isBoardSolvable(board, 5), `seed s${s}`).toBe(true);
    }
  });

  it("is deterministic: same seed produces same board", () => {
    const b1 = generateBoard(4, makeRng("deterministic"));
    const b2 = generateBoard(4, makeRng("deterministic"));
    expect(b1).toEqual(b2);
  });

  it("keeps the historical output for known seeds (daily boards must not silently change)", () => {
    // Captured from the generator before the audit's edits; the random walk is untouched.
    expect(generateBoard(4, makeRng("2026-06-03"))).toEqual([1, 4, 6, 8, 15, 0, 11, 12, 5, 13, 10, 14, 7, 3, 9, 2]);
    expect(generateBoard(4, makeRng("2026-08-29"))).toEqual([14, 12, 2, 13, 4, 7, 9, 15, 11, 10, 0, 5, 8, 6, 1, 3]);
    expect(generateBoard(3, makeRng("alpha"))).toEqual([6, 7, 3, 2, 5, 1, 0, 8, 4]);
    expect(generateBoard(5, makeRng("s0"))).toEqual([
      23, 3, 17, 2, 8, 14, 4, 9, 7, 10, 16, 1, 6, 11, 0, 19, 21, 24, 12, 22, 13, 18, 5, 15, 20,
    ]);
  });

  it("different seeds generally produce different boards", () => {
    const b1 = generateBoard(4, makeRng("seed-A"));
    const b2 = generateBoard(4, makeRng("seed-B"));
    // It is astronomically unlikely they are the same
    expect(b1).not.toEqual(b2);
  });

  it("is never already solved at start (every seed, every size)", () => {
    // The previous version of this test only required that at least one of 20
    // boards was unsolved, which could not catch a size whose walk cycles back
    // to the goal (the 2×2 walk did exactly that for every seed).
    for (const n of ALL_SIZES) {
      for (let s = 0; s < 20; s++) {
        expect(isSolved(generateBoard(n, makeRng(`s${s}`))), `${n}×${n} seed s${s}`).toBe(false);
      }
    }
  });

  it("throws a RangeError for sizes below 2 or non-integer sizes", () => {
    expect(() => generateBoard(1, makeRng(1))).toThrow(RangeError);
    expect(() => generateBoard(0, makeRng(1))).toThrow(RangeError);
    expect(() => generateBoard(2.5, makeRng(1))).toThrow(RangeError);
  });

  it("2×2: the non-reversing walk is a 12-move cycle (120 steps = 10 laps), yet the board handed out is unsolved and solvable", () => {
    for (let s = 0; s < 50; s++) {
      const board = generateBoard(2, makeRng(`s${s}`));
      expect(board.slice().sort((a, b) => a - b)).toEqual(identity(2));
      expect(isSolved(board), `seed s${s}`).toBe(false);
      expect(oracleSolvable(board, 2), `seed s${s}`).toBe(true);
      expect(oracleSolvableBySign(board, 2), `seed s${s}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Audit sweep: hundreds of seeds × every size
// ---------------------------------------------------------------------------
describe("audit: shuffled boards are always solvable and never pre-solved", () => {
  const seeds = auditSeeds(200); // 600 seeds: strings, numbers and daily-style dates

  for (const n of ALL_SIZES) {
    it(`${n}×${n}: ${seeds.length} seeds give valid, parity-solvable, unsolved boards`, () => {
      const expected = identity(n);
      for (const seed of seeds) {
        const board = generateBoard(n, makeRng(seed));
        expect(board.slice().sort((a, b) => a - b), `permutation for seed ${seed}`).toEqual(expected);
        expect(oracleSolvable(board, n), `parity oracle for seed ${seed}`).toBe(true);
        expect(oracleSolvableBySign(board, n), `sign oracle for seed ${seed}`).toBe(true);
        expect(isSolved(board), `pre-solved board for seed ${seed}`).toBe(false);
        expect(generateBoard(n, makeRng(seed)), `determinism for seed ${seed}`).toEqual(board);
      }
    });
  }

  it("every Daily Challenge date from 2026-01-01 to 2027-12-31 gives a solvable, unsolved 4×4 (daily mode forces 4×4)", () => {
    let count = 0;
    for (let i = 0; ; i++) {
      const d = new Date(2026, 0, 1 + i);
      if (d.getFullYear() > 2027) break;
      const seed = todaySeed(d);
      expect(seed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const board = generateBoard(4, makeRng(seed));
      expect(oracleSolvable(board, 4), `daily ${seed}`).toBe(true);
      expect(isSolved(board), `daily ${seed}`).toBe(false);
      count++;
    }
    expect(count).toBe(730);
  });

  it("3×3: every start of 450 seeds is solved by replaying the independent BFS solution through applyMove, and the win check fires only at the end", () => {
    const seeds = auditSeeds(150);
    let totalDepth = 0;
    for (const seed of seeds) {
      let board = generateBoard(3, makeRng(seed));
      const path = solve3(board);
      expect(path.length, `seed ${seed}`).toBeGreaterThan(0);
      expect(path.length, `seed ${seed}`).toBeLessThanOrEqual(31);
      totalDepth += path.length;
      for (const dir of path) {
        expect(isSolved(board), `win fired early for seed ${seed}`).toBe(false);
        expect(legalMoves(board, 3), `seed ${seed}`).toContain(dir);
        board = applyMove(board, dir, 3);
      }
      expect(isSolved(board), `seed ${seed}`).toBe(true);
      expect(board).toEqual(goalState(3));
    }
    // Scramble depth sanity: uniformly random solvable 3×3 states need ~22 moves on average.
    expect(totalDepth / seeds.length).toBeGreaterThan(15);
  });

  it("3×3: replaying the BFS solution with the UI's run slides (slideRun) also wins", () => {
    for (const seed of auditSeeds(20)) {
      let board = generateBoard(3, makeRng(seed));
      for (const dir of solve3(board)) {
        const bi = board.indexOf(0);
        const idx = dir === "up" ? bi - 3 : dir === "down" ? bi + 3 : dir === "left" ? bi - 1 : bi + 1;
        const next = slideRun(board, 3, idx);
        expect(next, `seed ${seed} ${dir}`).not.toBeNull();
        board = next!;
      }
      expect(isSolved(board), `seed ${seed}`).toBe(true);
    }
  });
});
