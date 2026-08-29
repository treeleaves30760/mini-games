/* Shikaku — framework-free game logic.
   The grid is partitioned into axis-aligned rectangles (guillotine splits).
   Each rectangle gets exactly one clue whose value equals the rectangle's area.
   A valid completed puzzle has every cell covered, no overlaps, and every
   player-drawn rectangle contains exactly one clue equal to its area. */

import type { Rng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export interface Clue {
  id: number;
  r: number;
  c: number;
  value: number;
}

export interface GenerateResult {
  clues: Clue[];
  /** Maps clue id → the solution rectangle for that clue. */
  solution: Map<number, Rect>;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Number of cells in rectangle R. */
export function areaOf(R: Rect): number {
  return (R.r1 - R.r0 + 1) * (R.c1 - R.c0 + 1);
}

/** True if point (r, c) is inside rectangle R (inclusive). */
export function containsCell(R: Rect, r: number, c: number): boolean {
  return r >= R.r0 && r <= R.r1 && c >= R.c0 && c <= R.c1;
}

/** True if rectangles A and B share at least one cell. */
export function intersects(A: Rect, B: Rect): boolean {
  return !(A.c1 < B.c0 || A.c0 > B.c1 || A.r1 < B.r0 || A.r0 > B.r1);
}

/** Clues whose cell falls inside rectangle R. */
export function cluesInRect(R: Rect, clues: readonly Clue[]): Clue[] {
  return clues.filter(
    (k) => k.r >= R.r0 && k.r <= R.r1 && k.c >= R.c0 && k.c <= R.c1
  );
}

// ---------------------------------------------------------------------------
// Rectangle validation
// ---------------------------------------------------------------------------

/**
 * A rectangle is valid when it contains exactly one clue and its area equals
 * that clue's value.
 */
export function rectIsValid(R: Rect, clues: readonly Clue[]): boolean {
  const cs = cluesInRect(R, clues);
  return cs.length === 1 && areaOf(R) === cs[0].value;
}

// ---------------------------------------------------------------------------
// Puzzle generation
// ---------------------------------------------------------------------------

/**
 * Generate a Shikaku puzzle of size rows × cols with a maximum rectangle area
 * of maxArea.  Accepts a seeded Rng so results are deterministic in tests.
 *
 * Returns the list of clues (each with a cell position and value = area) and
 * the solution map (clue id → bounding Rect) that the component uses for hints.
 */
export function generateShikaku(
  rows: number,
  cols: number,
  maxArea: number,
  rng: Rng
): GenerateResult {
  const leaves: Rect[] = [];

  // Stopping probability for a piece that already fits under the cap. The call
  // site only asks for 2 <= area <= maxArea (1×1 pieces stop unconditionally,
  // oversized pieces always split), and the clamp keeps the result inside
  // [0.66, 0.94] for any input: high for small pieces so 2-cell dominoes rarely
  // shatter into 1×1s; eased down for cap-sized pieces so they sometimes break
  // up and feed the mid-range. The divisor is floored at 1 so maxArea = 2
  // (a dominoes-only puzzle) cannot divide by zero.
  function pStop(area: number): number {
    const span = Math.max(1, maxArea - 2);
    return Math.min(0.94, Math.max(0.66, 0.96 - (0.3 * (area - 2)) / span));
  }

  // Centre-biased cut (mean of two uniform draws) → balanced pieces, few slivers.
  const cutAt = (len: number): number =>
    1 + Math.floor((rng.int(0, len - 2) + rng.int(0, len - 2)) / 2);

  function split(r0: number, c0: number, r1: number, c1: number): void {
    const h = r1 - r0 + 1;
    const w = c1 - c0 + 1;
    const area = h * w;
    if ((h === 1 && w === 1) || (area <= maxArea && rng.next() < pStop(area))) {
      leaves.push({ r0, c0, r1, c1 });
      return;
    }
    let horiz: boolean;
    if (h === 1) horiz = false;
    else if (w === 1) horiz = true;
    else if (h > w) horiz = rng.next() < 0.72;
    else if (w > h) horiz = rng.next() < 0.28;
    else horiz = rng.bool();

    if (horiz) {
      const k = cutAt(h);
      split(r0, c0, r0 + k - 1, c1);
      split(r0 + k, c0, r1, c1);
    } else {
      const k = cutAt(w);
      split(r0, c0, r1, c0 + k - 1);
      split(r0, c0 + k, r1, c1);
    }
  }

  split(0, 0, rows - 1, cols - 1);

  const clues: Clue[] = [];
  const solution = new Map<number, Rect>();
  let id = 1;

  for (const lf of leaves) {
    const cid = id++;
    const cr = rng.int(lf.r0, lf.r1);
    const cc = rng.int(lf.c0, lf.c1);
    clues.push({ id: cid, r: cr, c: cc, value: areaOf(lf) });
    solution.set(cid, lf);
  }

  return { clues, solution };
}

// ---------------------------------------------------------------------------
// Win detection
// ---------------------------------------------------------------------------

/**
 * Returns true when the player's rectangles form a complete, valid solution.
 * This checks the RULES rather than identity with the generated solution, so
 * any valid partition of the grid is accepted (Shikaku puzzles often admit
 * more than one):
 *  - every rect lies inside the grid and is well-formed (r0 <= r1, c0 <= c1)
 *  - every rect is valid (exactly one clue, area equals that clue)
 *  - the rects form an exact cover: every cell is claimed by exactly one rect
 *    (no overlaps, no gaps)
 * Summing rect areas is not enough on its own — two valid rects that overlap
 * can add up to rows × cols while leaving a cell uncovered — so coverage is
 * tracked per cell. An exact cover by single-clue rects also forces one rect
 * per clue, so no separate count check is needed.
 */
export function isSolved(
  playerRects: readonly Rect[],
  clues: readonly Clue[],
  rows: number,
  cols: number
): boolean {
  const covered = new Uint8Array(rows * cols);
  for (const R of playerRects) {
    if (R.r0 < 0 || R.c0 < 0 || R.r1 >= rows || R.c1 >= cols || R.r0 > R.r1 || R.c0 > R.c1) {
      return false;
    }
    if (!rectIsValid(R, clues)) return false;
    for (let r = R.r0; r <= R.r1; r++) {
      for (let c = R.c0; c <= R.c1; c++) {
        const i = r * cols + c;
        if (covered[i]) return false; // overlap
        covered[i] = 1;
      }
    }
  }
  for (let i = 0; i < covered.length; i++) {
    if (!covered[i]) return false; // gap
  }
  return true;
}
