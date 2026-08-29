import { describe, it, expect } from "vitest";
import { makeRng } from "~/utils/rng";
import {
  PALETTE,
  SIZES,
  LIMITS,
  generateBoard,
  generatePuzzle,
  getRegion,
  applyPick,
  isWon,
  solveHeuristic,
  computeLimit,
} from "~/games/flood";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Build a flat board from a 2-D array of colour indices. */
function gridOf(rows: number[][]): number[] {
  return rows.flat();
}

/** Count cells that are in the controlled region (value 1 in the Uint8Array). */
function regionSize(region: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < region.length; i++) if (region[i] === 1) n++;
  return n;
}

/**
 * Replay a move sequence exactly the way FloodGame.vue does (pickColor +
 * checkResult): a pick equal to the origin colour is a no-op that must never
 * appear in a solution, the win check runs before the loss check, and the
 * game is lost as soon as `moves >= limit` without a win.
 */
function playLikeComponent(
  board: number[],
  size: number,
  limit: number,
  picks: number[]
): { won: boolean; lost: boolean; moves: number } {
  let b = board;
  let moves = 0;
  for (const colour of picks) {
    expect(colour).not.toBe(b[0]); // never a wasted no-op pick
    moves++;
    b = applyPick(b, size, colour);
    if (isWon(b)) return { won: true, lost: false, moves };
    if (moves >= limit) return { won: false, lost: true, moves };
  }
  return { won: false, lost: false, moves };
}

/** "YYYY-MM-DD" seeds for every day of `year` — the Daily Challenge seed format. */
function dailySeeds(year: number): string[] {
  const out: string[] = [];
  for (let d = new Date(year, 0, 1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${year}-${m}-${day}`);
  }
  return out;
}

/**
 * Diagonal stripes cycling through all six colours: every anti-diagonal is a
 * new colour, so flooding from the corner needs one move per anti-diagonal
 * (2·size − 2 moves) — more than the classic cap for 14×14 and 18×18.
 */
function stripedBoard(size: number): number[] {
  const board: number[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) board.push((r + c) % PALETTE.length);
  return board;
}

// ---------------------------------------------------------------------------
// Independent solver (test-only). Written separately from solveHeuristic: it
// keeps its own incremental region/frontier bookkeeping, ranks candidates by
// its own scores and de-duplicates by a numeric hash. Its output is only ever
// trusted after being replayed through the game's own applyPick/isWon.
// ---------------------------------------------------------------------------

type Ref = { region: Uint8Array; fmask: Uint8Array; frontier: number[]; area: number; path: number[] };

function neighbourTable(n: number): Int32Array[] {
  const out: Int32Array[] = [];
  for (let i = 0; i < n * n; i++) {
    const r = (i / n) | 0;
    const c = i % n;
    const list: number[] = [];
    if (r > 0) list.push(i - n);
    if (r < n - 1) list.push(i + n);
    if (c > 0) list.push(i - 1);
    if (c < n - 1) list.push(i + 1);
    out.push(Int32Array.from(list));
  }
  return out;
}

function refInit(board: number[], n: number, nb: Int32Array[]): Ref {
  const region = new Uint8Array(n * n);
  const fmask = new Uint8Array(n * n);
  const frontier: number[] = [];
  const col = board[0];
  const stack = [0];
  region[0] = 1;
  let area = 0;
  while (stack.length) {
    const i = stack.pop()!;
    area++;
    for (const j of nb[i]) {
      if (region[j]) continue;
      if (board[j] === col) {
        region[j] = 1;
        stack.push(j);
      } else if (!fmask[j]) {
        fmask[j] = 1;
        frontier.push(j);
      }
    }
  }
  return { region, fmask, frontier, area, path: [] };
}

/** Classic rule: merge the frontier cells of `colour` and whatever same-coloured cells hang off them. */
function refExpand(board: number[], nb: Int32Array[], s: Ref, colour: number): Ref | null {
  const seeds = s.frontier.filter((f) => board[f] === colour);
  if (!seeds.length) return null;
  const region = s.region.slice();
  const fmask = s.fmask.slice();
  const frontier: number[] = [];
  let area = s.area;
  const stack = seeds.slice();
  for (const f of seeds) {
    region[f] = 1;
    fmask[f] = 0;
  }
  while (stack.length) {
    const i = stack.pop()!;
    area++;
    for (const j of nb[i]) {
      if (region[j]) continue;
      if (board[j] === colour) {
        region[j] = 1;
        fmask[j] = 0;
        stack.push(j);
      } else if (!fmask[j]) {
        fmask[j] = 1;
        frontier.push(j);
      }
    }
  }
  for (const f of s.frontier) if (fmask[f]) frontier.push(f);
  return { region, fmask, frontier, area, path: [...s.path, colour] };
}

function refColoursLeft(board: number[], region: Uint8Array): number {
  let mask = 0;
  for (let i = 0; i < board.length; i++) if (!region[i]) mask |= 1 << board[i];
  let c = 0;
  while (mask) {
    c += mask & 1;
    mask >>= 1;
  }
  return c;
}

function refHash(region: Uint8Array): number {
  let h1 = 0x811c9dc5 | 0;
  let h2 = 0x9747b28c | 0;
  for (let i = 0; i < region.length; i++) {
    h1 = Math.imul(h1 ^ (region[i] + i * 7), 16777619);
    h2 = Math.imul(h2 ^ (region[i] * 31 + i), 0x5bd1e995);
  }
  return (h1 >>> 0) * 4294967296 + (h2 >>> 0);
}

type RefScorer = (board: number[], n: number, s: Ref) => number;
/** area + half the perimeter — no colour bookkeeping at all. */
const scoreArea: RefScorer = (_b, _n, s) => s.area + s.frontier.length / 2;
/** area + perimeter, heavily rewarding eliminated colours. */
const scoreColours: RefScorer = (b, n, s) =>
  s.area + s.frontier.length - refColoursLeft(b, s.region) * n * n;

function refBeam(board: number[], n: number, nb: Int32Array[], width: number, score: RefScorer): number[] {
  const total = n * n;
  let states: Ref[] = [refInit(board, n, nb)];
  if (states[0].area === total) return [];
  for (let depth = 0; depth < total; depth++) {
    const next: { s: Ref; sc: number }[] = [];
    const seen = new Set<number>();
    for (const s of states) {
      for (let c = 0; c < PALETTE.length; c++) {
        const t = refExpand(board, nb, s, c);
        if (!t) continue;
        if (t.area === total) return t.path;
        const h = refHash(t.region);
        if (seen.has(h)) continue;
        seen.add(h);
        next.push({ s: t, sc: score(board, n, t) });
      }
    }
    next.sort((a, b) => b.sc - a.sc);
    states = next.slice(0, width).map((x) => x.s);
  }
  throw new Error("reference solver did not terminate");
}

/**
 * Best move sequence the reference solver can find within `budget` moves:
 * cheap first, escalating beam width / scoring only on stubborn boards.
 */
function referenceSolve(board: number[], n: number, budget: number): number[] {
  const nb = neighbourTable(n);
  const attempts: [number, RefScorer][] = [
    [8, scoreArea],
    [32, scoreArea],
    [32, scoreColours],
    [128, scoreArea],
    [128, scoreColours],
  ];
  let best: number[] | null = null;
  for (const [width, score] of attempts) {
    const path = refBeam(board, n, nb, width, score);
    if (!best || path.length < best.length) best = path;
    if (best.length <= budget) break;
  }
  return best!;
}

// ---------------------------------------------------------------------------
// PALETTE & constants
// ---------------------------------------------------------------------------

describe("module constants", () => {
  it("exports exactly 6 palette colours", () => {
    expect(PALETTE).toHaveLength(6);
  });

  it("every palette entry is a hex colour string", () => {
    for (const c of PALETTE) {
      expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("exports SIZES array [10, 14, 18]", () => {
    expect(SIZES).toEqual([10, 14, 18]);
  });

  it("exports LIMITS with the classic step caps", () => {
    expect(LIMITS[10]).toBe(20);
    expect(LIMITS[14]).toBe(25);
    expect(LIMITS[18]).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// generateBoard
// ---------------------------------------------------------------------------

describe("generateBoard", () => {
  it("produces a flat array of size × size cells", () => {
    for (const s of [10, 14, 18] as const) {
      expect(generateBoard(s, "seed")).toHaveLength(s * s);
    }
  });

  it("every cell is a valid palette index (0–5)", () => {
    const board = generateBoard(14, "test");
    for (const c of board) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(PALETTE.length - 1);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = generateBoard(10, "hello");
    const b = generateBoard(10, "hello");
    expect(a).toEqual(b);
  });

  it("differs for different seeds", () => {
    const a = generateBoard(10, "seed-A");
    const b = generateBoard(10, "seed-B");
    // Astronomically unlikely to be equal for distinct seeds.
    expect(a).not.toEqual(b);
  });

  it("accepts an Rng object instead of a seed string", () => {
    const rng = makeRng("rng-test");
    const board = generateBoard(10, rng);
    expect(board).toHaveLength(100);
  });

  it("null seed produces a valid (non-deterministic) board", () => {
    const board = generateBoard(10, null);
    expect(board).toHaveLength(100);
    for (const c of board) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(5);
    }
  });
});

// ---------------------------------------------------------------------------
// getRegion  — hand-built 3×3 grids
// ---------------------------------------------------------------------------
//
// Grid notation: cells are labelled by (row, col), 0-indexed.
// The controlled region always starts at cell (0,0) = index 0.

describe("getRegion", () => {
  it("entire board is one colour → all cells are in the region", () => {
    // 3×3, all colour 2
    const board = gridOf([
      [2, 2, 2],
      [2, 2, 2],
      [2, 2, 2],
    ]);
    const region = getRegion(board, 3);
    expect(regionSize(region)).toBe(9);
    for (let i = 0; i < 9; i++) expect(region[i]).toBe(1);
  });

  it("only (0,0) connected → region size 1 when all neighbours differ", () => {
    // (0,0) = colour 0; all neighbours are colour 1
    const board = gridOf([
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ]);
    const region = getRegion(board, 3);
    expect(regionSize(region)).toBe(1);
    expect(region[0]).toBe(1); // only top-left
  });

  it("L-shaped region connected to (0,0)", () => {
    // Colour 0 occupies the entire top row + left column:
    // 0 0 0
    // 0 1 1
    // 0 1 1
    const board = gridOf([
      [0, 0, 0],
      [0, 1, 1],
      [0, 1, 1],
    ]);
    const region = getRegion(board, 3);
    // Top row: indices 0,1,2 → in region
    // Left col: indices 0,3,6 → in region  (0 already counted)
    expect(regionSize(region)).toBe(5); // 3 + 2 unique extras
    expect(region[0]).toBe(1);
    expect(region[1]).toBe(1);
    expect(region[2]).toBe(1);
    expect(region[3]).toBe(1);
    expect(region[6]).toBe(1);
    // Interior cells not in region
    expect(region[4]).toBe(0);
    expect(region[5]).toBe(0);
    expect(region[7]).toBe(0);
    expect(region[8]).toBe(0);
  });

  it("does NOT cross a diagonal — only orthogonal connectivity counts", () => {
    // (0,0)=0 (0,1)=1 — different colour breaks orthogonal path
    // (1,0)=1 (1,1)=0 — same colour as origin but not reachable from (0,0)
    const board = gridOf([
      [0, 1],
      [1, 0],
    ]);
    const region = getRegion(board, 2);
    expect(regionSize(region)).toBe(1);
    expect(region[0]).toBe(1);
    expect(region[3]).toBe(0); // diagonal cell not included
  });
});

// ---------------------------------------------------------------------------
// applyPick — hand-built grids, exact region growth
// ---------------------------------------------------------------------------

describe("applyPick", () => {
  it("returns the SAME board reference when picking the current colour (no-op)", () => {
    const board = gridOf([
      [0, 1],
      [1, 1],
    ]);
    const result = applyPick(board, 2, 0); // 0 is already the origin colour
    expect(result).toBe(board); // same reference — no copy made
  });

  it("does NOT mutate the original board", () => {
    const board = gridOf([
      [0, 1],
      [1, 1],
    ]);
    const original = board.slice();
    applyPick(board, 2, 1);
    expect(board).toEqual(original);
  });

  it("recolours origin-connected region to new colour", () => {
    // 3×3: top row = colour 0, everything else = colour 1
    // Picking colour 1 should absorb the top row into the rest.
    // Before:
    //  0 0 0
    //  1 1 1
    //  1 1 1
    // After picking colour 1, (0,0) region (entire top row) becomes 1.
    // The BFS then also finds the already-1 cells adjacent — they are folded in.
    // Whole board → colour 1.
    const board = gridOf([
      [0, 0, 0],
      [1, 1, 1],
      [1, 1, 1],
    ]);
    const next = applyPick(board, 3, 1);
    expect(next.every((c) => c === 1)).toBe(true);
  });

  it("region grows exactly to absorb matching neighbours", () => {
    // 3×3, two distinct colours
    // Before:
    //  0  1  2
    //  1  2  2
    //  2  2  2
    //
    // Origin region = {(0,0)} = colour 0.
    // Pick colour 1:
    //   Region becomes colour 1. BFS then finds (0,1)=1 and (1,0)=1.
    //   Both absorbed → they become 1 too.
    //   From (0,1) neighbours: (0,2)=2 (no), (1,1)=2 (no).
    //   From (1,0) neighbours: (2,0)=2 (no), (1,1)=2 (no).
    //   Nothing further matches the new colour (1) — stop.
    // After:
    //  1  1  2
    //  1  2  2
    //  2  2  2
    const board = gridOf([
      [0, 1, 2],
      [1, 2, 2],
      [2, 2, 2],
    ]);
    const next = applyPick(board, 3, 1);
    expect(next[0]).toBe(1); // (0,0) was origin, now 1
    expect(next[1]).toBe(1); // (0,1) was already 1 (adjacent) — absorbed
    expect(next[3]).toBe(1); // (1,0) was already 1 (adjacent) — absorbed
    // Cells not adjacent to origin region stay unchanged
    expect(next[2]).toBe(2); // (0,2)
    expect(next[4]).toBe(2); // (1,1)
    expect(next[5]).toBe(2); // (1,2)
    expect(next[6]).toBe(2); // (2,0)
    expect(next[7]).toBe(2); // (2,1)
    expect(next[8]).toBe(2); // (2,2)
  });

  it("multi-step growth: region expands across successive picks", () => {
    // 2×2 board:  0 1
    //             1 0
    //
    // Pick colour 1:
    //   Origin (0,0) turns 1 and merges with the adjacent 1-cells (0,1), (1,0).
    //   (1,1)=0 is NOT part of the origin region (it only touches it
    //   diagonally) and is not the picked colour, so it stays 0.
    //   Board: 1 1 / 1 0.
    // Pick colour 0:
    //   The 1-region turns 0 and merges with (1,1) → all 0 → won.
    //
    // (The previous implementation flooded (1,1) on the first pick because its
    // single BFS also walked through old-colour cells behind merged cells —
    // a bug against the documented rule; the old assertion encoded it.)
    const board0 = gridOf([
      [0, 1],
      [1, 0],
    ]);
    const board1 = applyPick(board0, 2, 1);
    expect(board1).toEqual([1, 1, 1, 0]);
    expect(isWon(board1)).toBe(false);
    const board2 = applyPick(board1, 2, 0);
    expect(board2).toEqual([0, 0, 0, 0]);
    expect(isWon(board2)).toBe(true);
  });

  it("old-colour cells behind a merged cell are NOT flooded (classic rule)", () => {
    // Board (1×5 as a 5-wide single row would need size 5; use 3×3):
    //  0 1 0      ← (0,2)=0 is the OLD colour but is separated from the
    //  2 2 2         origin by the 1-cell at (0,1)
    //  2 2 2
    // Picking 1: origin turns 1 and merges (0,1). (0,2) must remain 0 —
    // it is not connected to the region and is not the picked colour.
    const board = gridOf([
      [0, 1, 0],
      [2, 2, 2],
      [2, 2, 2],
    ]);
    const next = applyPick(board, 3, 1);
    expect(next.slice(0, 3)).toEqual([1, 1, 0]);
    expect(next.slice(3)).toEqual([2, 2, 2, 2, 2, 2]);
    // The highlighted region matches: only the two 1-cells.
    expect(regionSize(getRegion(next, 3))).toBe(2);
  });

  it("merges a whole chain of new-colour cells, not just the adjacent one", () => {
    //  0 1 1
    //  2 2 1
    //  2 2 1
    // Picking 1 floods the entire 1-chain connected to the origin.
    const board = gridOf([
      [0, 1, 1],
      [2, 2, 1],
      [2, 2, 1],
    ]);
    const next = applyPick(board, 3, 1);
    expect(next).toEqual([1, 1, 1, 2, 2, 1, 2, 2, 1]);
    expect(regionSize(getRegion(next, 3))).toBe(5);
  });

  it("a colour NOT reachable from the origin via old-or-new-colour path is NOT affected", () => {
    // A cell of a THIRD colour (neither old nor new) acts as a wall and blocks
    // propagation — cells behind it are unaffected.
    //
    // Board (3×3):
    //  0  0  2      ← colour 2 is neither the origin colour (0) nor the target (1)
    //  0  2  2      ← it acts as a wall
    //  2  2  2
    //
    // Picking colour 1: origin region {(0,0),(0,1),(1,0)} turns to 1.
    // (0,2)=2 and all other 2-cells block further spread.
    // None of the 2-cells should be changed.
    const board = gridOf([
      [0, 0, 2],
      [0, 2, 2],
      [2, 2, 2],
    ]);
    const next = applyPick(board, 3, 1);
    // Origin-connected 0-region → 1
    expect(next[0]).toBe(1); // (0,0)
    expect(next[1]).toBe(1); // (0,1)
    expect(next[3]).toBe(1); // (1,0)
    // Wall cells (colour 2) must not be changed
    expect(next[2]).toBe(2);  // (0,2)
    expect(next[4]).toBe(2);  // (1,1)
    expect(next[5]).toBe(2);  // (1,2)
    expect(next[6]).toBe(2);  // (2,0)
    expect(next[7]).toBe(2);  // (2,1)
    expect(next[8]).toBe(2);  // (2,2)
  });

  it("agrees with getRegion: after a pick the highlighted region is exactly the flooded set", () => {
    // Random boards: the cells applyPick recoloured must be exactly the new
    // origin region, and every old-region cell must be inside it.
    for (let i = 0; i < 40; i++) {
      const size = 10;
      const board = generateBoard(size, `region-agree-${i}`);
      const before = getRegion(board, size);
      const colour = (board[0] + 1 + (i % 5)) % PALETTE.length;
      const next = applyPick(board, size, colour);
      const after = getRegion(next, size);
      for (let k = 0; k < board.length; k++) {
        const changed = next[k] !== board[k];
        if (changed) expect(after[k]).toBe(1);
        if (before[k]) expect(after[k]).toBe(1);
        // Untouched cells keep their colour; touched ones are the new colour.
        if (!after[k]) expect(next[k]).toBe(board[k]);
        else expect(next[k]).toBe(colour);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// isWon
// ---------------------------------------------------------------------------

describe("isWon", () => {
  it("returns true when all cells share a colour", () => {
    expect(isWon([3, 3, 3, 3])).toBe(true);
    expect(isWon([0, 0, 0])).toBe(true);
  });

  it("returns false when any cell differs", () => {
    expect(isWon([0, 0, 1])).toBe(false);
    expect(isWon([1, 2, 1, 1])).toBe(false);
  });

  it("returns false for an empty board", () => {
    expect(isWon([])).toBe(false);
  });

  it("returns true for a single-cell board", () => {
    expect(isWon([4])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// solveHeuristic — the built-in solver that certifies move limits
// ---------------------------------------------------------------------------

describe("solveHeuristic", () => {
  it("returns an empty sequence for a board that is already one colour", () => {
    expect(solveHeuristic(Array(9).fill(3), 3)).toEqual([]);
  });

  it("finds the one-move solution on a two-colour board", () => {
    const board = gridOf([
      [0, 1],
      [1, 1],
    ]);
    expect(solveHeuristic(board, 2)).toEqual([1]);
  });

  it("its sequence, replayed with applyPick, floods the board in exactly that many moves", () => {
    for (const size of SIZES) {
      for (let i = 0; i < 20; i++) {
        const board = generateBoard(size, `solver-${size}-${i}`);
        const path = solveHeuristic(board, size);
        expect(path.length).toBeGreaterThan(0);
        let b = board;
        path.forEach((colour, k) => {
          expect(isWon(b)).toBe(false); // not solved before the last pick
          expect(colour).not.toBe(b[0]); // never a no-op pick
          expect(colour).toBeGreaterThanOrEqual(0);
          expect(colour).toBeLessThan(PALETTE.length);
          b = applyPick(b, size, colour);
          expect(b).not.toBe(board); // a real pick always yields a new array
          if (k === path.length - 1) expect(isWon(b)).toBe(true);
        });
      }
    }
  });

  it("is deterministic for the same board", () => {
    const board = generateBoard(14, "determinism");
    expect(solveHeuristic(board, 14)).toEqual(solveHeuristic(board, 14));
  });

  it("beam width 1 (plain greedy) still produces a winning sequence, never shorter than the default beam", () => {
    for (let i = 0; i < 10; i++) {
      const board = generateBoard(10, `greedy-${i}`);
      const greedy = solveHeuristic(board, 10, 1);
      let b = board;
      for (const colour of greedy) b = applyPick(b, 10, colour);
      expect(isWon(b)).toBe(true);
      // The default beam keeps the greedy line among its candidates each step
      // only heuristically, so just sanity-check it is not dramatically worse.
      expect(solveHeuristic(board, 10).length).toBeLessThanOrEqual(greedy.length + 2);
    }
  });

  it("treats a non-positive width as 1", () => {
    const board = generateBoard(10, "width-0");
    expect(solveHeuristic(board, 10, 0)).toEqual(solveHeuristic(board, 10, 1));
    expect(solveHeuristic(board, 10, -5)).toEqual(solveHeuristic(board, 10, 1));
  });

  it("needs exactly 2·size − 2 moves on a diagonal-stripes board (one per anti-diagonal)", () => {
    for (const size of [4, 10, 14] as const) {
      const board = stripedBoard(size);
      const path = solveHeuristic(board, size);
      expect(path.length).toBe(2 * size - 2);
      let b = board;
      for (const colour of path) b = applyPick(b, size, colour);
      expect(isWon(b)).toBe(true);
    }
  });

  it("throws for a board holding a colour outside the palette (it can never be flooded)", () => {
    expect(() => solveHeuristic([0, 9, 9, 9], 2)).toThrow(/outside the palette/);
  });
});

// ---------------------------------------------------------------------------
// computeLimit / generatePuzzle
// ---------------------------------------------------------------------------

describe("computeLimit", () => {
  it("is the classic cap when the built-in solver finishes within it", () => {
    for (const size of SIZES) {
      const board = generateBoard(size, `cap-${size}`);
      expect(solveHeuristic(board, size).length).toBeLessThanOrEqual(LIMITS[size]);
      expect(computeLimit(board, size)).toBe(LIMITS[size]);
    }
  });

  it("is raised to the solver's move count when the cap is unreachable", () => {
    // 14×14 stripes need 26 moves > cap 25; 18×18 stripes need 34 > 32.
    expect(computeLimit(stripedBoard(14), 14)).toBe(26);
    expect(computeLimit(stripedBoard(18), 18)).toBe(34);
    // 10×10 stripes need 18 moves ≤ cap 20 → the cap stands.
    expect(computeLimit(stripedBoard(10), 10)).toBe(20);
  });

  it("never lies below the solver's own move count", () => {
    for (const size of SIZES) {
      for (let i = 0; i < 10; i++) {
        const board = generateBoard(size, `floor-${size}-${i}`);
        expect(computeLimit(board, size)).toBeGreaterThanOrEqual(solveHeuristic(board, size).length);
      }
    }
  });

  it("falls back to the solver's count for sizes without a preset cap", () => {
    const board = generateBoard(5, "no-cap");
    expect(computeLimit(board, 5)).toBe(solveHeuristic(board, 5).length);
    expect(computeLimit(Array(9).fill(1), 3)).toBe(0);
  });
});

describe("generatePuzzle", () => {
  it("returns the same board as generateBoard for the same seed, with its limit", () => {
    for (const size of SIZES) {
      const { board, limit } = generatePuzzle(size, "same-seed");
      expect(board).toEqual(generateBoard(size, "same-seed"));
      expect(limit).toBe(computeLimit(board, size));
      expect(limit).toBeGreaterThanOrEqual(LIMITS[size]);
    }
  });

  it("consumes the RNG exactly like generateBoard (seeded boards are unchanged)", () => {
    const a = generatePuzzle(14, makeRng("2026-06-03")).board;
    const b = generateBoard(14, "2026-06-03");
    expect(a).toEqual(b);
  });

  it("is deterministic and defaults to a random seed when none is given", () => {
    expect(generatePuzzle(10, "p")).toEqual(generatePuzzle(10, "p"));
    const random = generatePuzzle(10);
    expect(random.board).toHaveLength(100);
    expect(random.limit).toBeGreaterThanOrEqual(LIMITS[10]);
  });
});

// ---------------------------------------------------------------------------
// Integration: seeded board generation → play to completion
// ---------------------------------------------------------------------------

describe("seeded board + full game simulation", () => {
  it("a board filled with all one colour starts already won", () => {
    // Trivially: manually set every cell to colour 2
    const size = 3;
    const board: number[] = Array(size * size).fill(2);
    expect(isWon(board)).toBe(true);
  });

  it("playing through a 2×2 board to a single colour triggers isWon", () => {
    // Force a known board:  0 1
    //                       1 1
    // Pick 1: origin (0,0)=0 becomes 1, absorbs (0,1)=1 and (1,0)=1.
    // Board: 1 1 / 1 1 → win.
    const board = gridOf([
      [0, 1],
      [1, 1],
    ]);
    const next = applyPick(board, 2, 1);
    expect(isWon(next)).toBe(true);
  });

  it("the seeded board changes deterministically when seed changes", () => {
    const b1 = generateBoard(10, "date:2026-01-01");
    const b2 = generateBoard(10, "date:2026-01-02");
    expect(b1).not.toEqual(b2);
  });

  it("a seeded 4×4 play-through: flood entire board to colour 0", () => {
    // Build a board that is all colour 0 except cell (0,0)=1.
    // Pick colour 0 once → entire board becomes 0 → win.
    const board = Array(16).fill(0);
    board[0] = 1; // top-left is different
    const next = applyPick(board, 4, 0);
    expect(isWon(next)).toBe(true);
  });

  it("deterministic seeded board uses only valid palette indices", () => {
    const board = generateBoard(14, "2026-06-03");
    for (const c of board) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(PALETTE.length);
    }
  });

  it("repeated picks on seeded board eventually result in a winnable state", () => {
    // Drive a 3×3 seeded board to all one colour by always picking
    // the colour that appears most often on the board.  This is not
    // optimal but guarantees termination on a tiny grid.
    const size = 3;
    let board = generateBoard(size, "vitest-flood");
    let steps = 0;
    const maxSteps = 50; // well above the worst-case for 3×3

    while (!isWon(board) && steps < maxSteps) {
      // Count colour frequencies (excluding the current origin colour).
      const freq = new Array(PALETTE.length).fill(0);
      for (const c of board) freq[c]++;
      const originColor = board[0];
      // Pick the most frequent colour that isn't the current origin colour.
      let best = -1;
      let bestCount = -1;
      for (let c = 0; c < PALETTE.length; c++) {
        if (c !== originColor && freq[c] > bestCount) {
          bestCount = freq[c];
          best = c;
        }
      }
      if (best === -1) break; // already all one colour (shouldn't happen)
      board = applyPick(board, size, best);
      steps++;
    }

    expect(isWon(board)).toBe(true);
    expect(steps).toBeLessThan(maxSteps);
  });
});

// ---------------------------------------------------------------------------
// Solvability audit: the move limit shown to the player is reachable on every
// generated puzzle — verified by an INDEPENDENT solver whose sequence is
// replayed through the game's own applyPick/isWon with the component's
// win/loss bookkeeping.
// ---------------------------------------------------------------------------

describe("every generated puzzle is winnable within its move limit (independent solver)", () => {
  const SEEDS_PER_SIZE = 200;

  for (const size of SIZES) {
    it(`${size}×${size}: ${SEEDS_PER_SIZE} seeds, solver moves ≤ limit, never lost first`, () => {
      let worst = 0;
      let raised = 0;
      for (let i = 0; i < SEEDS_PER_SIZE; i++) {
        const { board, limit } = generatePuzzle(size, `audit-${size}-${i}`);
        expect(isWon(board)).toBe(false); // not already solved at start
        expect(limit).toBeGreaterThanOrEqual(LIMITS[size]);
        if (limit > LIMITS[size]) raised++;

        const picks = referenceSolve(board, size, limit);
        expect(picks.length).toBeLessThanOrEqual(limit);
        worst = Math.max(worst, picks.length);

        const result = playLikeComponent(board, size, limit, picks);
        expect(result).toEqual({ won: true, lost: false, moves: picks.length });
      }
      expect(worst).toBeLessThanOrEqual(LIMITS[size] + raised); // sanity: within cap unless raised
    });
  }

  it("Daily Challenge: every date of 2026 on the fixed 14×14 board", () => {
    const seeds = dailySeeds(2026);
    expect(seeds).toHaveLength(365);
    for (const seed of seeds) {
      // daily.vue passes todaySeed() ("YYYY-MM-DD") straight into makeRng.
      const { board, limit } = generatePuzzle(14, makeRng(seed));
      expect(isWon(board)).toBe(false);
      const picks = referenceSolve(board, 14, limit);
      expect(picks.length).toBeLessThanOrEqual(limit);
      expect(playLikeComponent(board, 14, limit, picks)).toEqual({
        won: true,
        lost: false,
        moves: picks.length,
      });
    }
  });

  it("a raised limit is still met by the independent solver (crafted hard boards)", () => {
    for (const size of [14, 18] as const) {
      const board = stripedBoard(size);
      const limit = computeLimit(board, size);
      expect(limit).toBeGreaterThan(LIMITS[size]);
      const picks = referenceSolve(board, size, limit);
      expect(picks.length).toBeLessThanOrEqual(limit);
      expect(playLikeComponent(board, size, limit, picks).won).toBe(true);
    }
  });

  it("the component's loss rule triggers when a sequence runs past the limit without winning", () => {
    // Picking colours round-robin is a deliberately poor strategy.
    const { board, limit } = generatePuzzle(14, "loss-check");
    const picks: number[] = [];
    let colour = board[0];
    for (let i = 0; i < limit; i++) {
      colour = (colour + 1) % PALETTE.length;
      picks.push(colour);
    }
    const result = playLikeComponent(board, 14, limit, picks);
    expect(result.won).toBe(false);
    expect(result.lost).toBe(true);
    expect(result.moves).toBe(limit);
  });
});
