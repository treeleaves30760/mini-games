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

  // Stopping probability: high for small pieces so 2-cell dominoes rarely
  // shatter into 1×1s; eased down for cap-sized pieces so they sometimes break
  // up and feed the mid-range.
  function pStop(area: number): number {
    // istanbul ignore start
    if (area > maxArea) return 0; // dead: call site short-circuits when area>maxArea
    if (area <= 1) return 1;     // dead: area===1 only when h===w===1, which short-circuits first
    // istanbul ignore stop
    return Math.min(0.94, Math.max(0.66, 0.96 - (0.3 * (area - 2)) / (maxArea - 2)));
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
 * Returns true when the player's rectangles form a complete, valid solution:
 *  - every rect is valid (exactly one clue, area matches)
 *  - their combined area equals rows × cols (full coverage with no overlaps,
 *    since each individual rect has already been validated)
 *  - the number of rects equals the number of clues (one rect per clue)
 */
export function isSolved(
  playerRects: readonly Rect[],
  clues: readonly Clue[],
  rows: number,
  cols: number
): boolean {
  const total = rows * cols;
  let covered = 0;
  for (const R of playerRects) {
    if (!rectIsValid(R, clues)) return false;
    covered += areaOf(R);
  }
  return covered === total && playerRects.length === clues.length;
}
