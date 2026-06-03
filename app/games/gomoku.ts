/* Gomoku (五子棋) — framework-free game logic, shared by the Vue component and
   the unit tests.  Pure functions only: no Vue reactivity, no DOM, no timers,
   no localStorage. */

import type { Rng } from "~/utils/rng";

// ── Constants ──────────────────────────────────────────────────────────────────
export const SIZE = 15;
export const EMPTY = 0;
export const BLACK = 1; // human player
export const WHITE = 2; // AI

export type Cell = 0 | 1 | 2;
export type Board = Cell[][];
export type Point = { r: number; c: number };
export type WinResult = { winner: Cell; cells: Point[] };

/** Four scan directions (each covers one axis). */
export const DIRS4: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

// ── Board helpers ──────────────────────────────────────────────────────────────

/** Return a fresh empty SIZE×SIZE board. */
export function makeBoard(): Board {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY) as Cell[]);
}

/** Deep-clone a board (pure, no mutation). */
export function cloneBoard(b: Board): Board {
  return b.map((row) => [...row] as Cell[]);
}

/** True if (r, c) is inside the board. */
export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

/** True when the board has no empty intersections left. */
export function isBoardFull(b: Board): boolean {
  return b.every((row) => row.every((v) => v !== EMPTY));
}

/** True when (r, c) is on-board and currently empty. */
export function isLegalMove(b: Board, r: number, c: number): boolean {
  return inBounds(r, c) && b[r][c] === EMPTY;
}

// ── Win detection ──────────────────────────────────────────────────────────────

/** Count consecutive stones of `color` starting from (r+dr, c+dc). */
export function countDir(
  b: Board,
  r: number,
  c: number,
  dr: number,
  dc: number,
  color: Cell
): number {
  let count = 0;
  let rr = r + dr,
    cc = c + dc;
  while (inBounds(rr, cc) && b[rr][cc] === color) {
    count++;
    rr += dr;
    cc += dc;
  }
  return count;
}

/**
 * Scan the whole board for a line of 5+ same-colour stones.
 * Returns the winner and the winning cells, or null if nobody has won.
 * NOTE: for Renju rules the check is >=5 here; the forbidden-move rules
 * independently handle the overline case for black.
 */
export function findWin(b: Board): WinResult | null {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = b[r][c] as Cell;
      if (v === EMPTY) continue;
      for (const [dr, dc] of DIRS4) {
        const fwd = 1 + countDir(b, r, c, dr, dc, v);
        const bwd = countDir(b, r, c, -dr, -dc, v);
        const total = fwd + bwd;
        if (total >= 5) {
          const cells: Point[] = [];
          let rr = r - bwd * dr,
            cc = c - bwd * dc;
          for (let k = 0; k < total; k++) {
            cells.push({ r: rr, c: cc });
            rr += dr;
            cc += dc;
          }
          return { winner: v, cells };
        }
      }
    }
  }
  return null;
}

// ── Renju forbidden-move rules (BLACK only) ────────────────────────────────────
//
//  A black move is forbidden when it forms:
//    • an overline  — a run of 6 or more (長連)
//    • double-four  — two or more "fours" in different directions (四四)
//    • double-three — two or more "open threes" in different directions (三三)
//  Making exactly five ALWAYS wins and overrides any forbidden shape.
//  White has NO restrictions.

/**
 * Build a small window around (r, c) in direction (dr, dc), radius cells
 * each side.  Values: 1 = BLACK, 0 = EMPTY, -1 = boundary/opponent.
 */
export function dirLine(
  b: Board,
  r: number,
  c: number,
  dr: number,
  dc: number,
  radius: number
): number[] {
  const arr: number[] = [];
  for (let i = -radius; i <= radius; i++) {
    const rr = r + dr * i,
      cc = c + dc * i;
    if (!inBounds(rr, cc)) {
      arr.push(-1);
    } else if (b[rr][cc] === BLACK) {
      arr.push(1);
    } else if (b[rr][cc] === EMPTY) {
      arr.push(0);
    } else {
      arr.push(-1); // opponent or wall
    }
  }
  return arr;
}

/** Length of the contiguous run of 1's passing through index ci. */
export function maxRun(arr: number[], ci: number): number {
  let len = 1;
  for (let i = ci - 1; i >= 0 && arr[i] === 1; i--) len++;
  for (let i = ci + 1; i < arr.length && arr[i] === 1; i++) len++;
  return len;
}

/**
 * True if there exists some empty slot in `arr` that, when filled with 1,
 * produces a run of EXACTLY 5 through ci.  This is the Renju definition of
 * a "four": a single empty cell away from completing exactly-five.
 * Requiring exactly-five avoids counting overline completions (e.g. BBB_BBB).
 */
export function makesFour(arr: number[], ci: number): boolean {
  for (let e = 0; e < arr.length; e++) {
    if (arr[e] !== 0) continue;
    arr[e] = 1;
    const run = maxRun(arr, ci);
    arr[e] = 0;
    if (run === 5) return true;
  }
  return false;
}

/**
 * True if `arr` contains a straight/open four pattern ".1111." and ci is
 * one of the four stones.  An open four ".1111." can win next move with no
 * reply regardless of which end the opponent blocks.
 */
export function hasStraightFour(arr: number[], ci: number): boolean {
  for (let s = 0; s + 5 < arr.length; s++) {
    if (
      arr[s] === 0 &&
      arr[s + 1] === 1 &&
      arr[s + 2] === 1 &&
      arr[s + 3] === 1 &&
      arr[s + 4] === 1 &&
      arr[s + 5] === 0 &&
      ci >= s + 1 &&
      ci <= s + 4
    )
      return true;
  }
  return false;
}

/**
 * True if there exists some empty slot in `arr` that, when filled with 1,
 * turns this line into a straight open four ".1111." including ci.
 * That is the Renju definition of an "open three".
 */
export function makesOpenThree(arr: number[], ci: number): boolean {
  for (let e = 0; e < arr.length; e++) {
    if (arr[e] !== 0) continue;
    arr[e] = 1;
    const ok = hasStraightFour(arr, ci);
    arr[e] = 0;
    if (ok) return true;
  }
  return false;
}

export type DirClass = "overline" | "five" | "four" | "three" | "none";

/**
 * Classify the strongest threat that the black stone at (r, c) makes in
 * direction (dr, dc) on board b (stone already placed).
 */
export function classifyDir(
  b: Board,
  r: number,
  c: number,
  dr: number,
  dc: number
): DirClass {
  const arr = dirLine(b, r, c, dr, dc, 5);
  const ci = 5; // centre index
  const run = maxRun(arr, ci);
  if (run >= 6) return "overline";
  if (run === 5) return "five";
  if (makesFour(arr, ci)) return "four";
  if (makesOpenThree(arr, ci)) return "three";
  return "none";
}

export type AnalysisResult =
  | { result: "win" }
  | { result: "forbidden"; reason: string }
  | { result: "ok" };

/**
 * Analyse a black stone already placed at (r, c) on board b.
 * Returns "win" for an exact five, "forbidden" with reason for a Renju
 * infraction, or "ok" for a normal legal move.
 */
export function analyzeBlack(b: Board, r: number, c: number): AnalysisResult {
  let five = 0,
    overline = 0,
    four = 0,
    three = 0;
  for (const [dr, dc] of DIRS4) {
    const k = classifyDir(b, r, c, dr, dc);
    if (k === "five") five++;
    else if (k === "overline") overline++;
    else if (k === "four") four++;
    else if (k === "three") three++;
  }
  if (five > 0) return { result: "win" }; // exact five wins, overrides 禁手
  if (overline > 0) return { result: "forbidden", reason: "長連" };
  if (four >= 2) return { result: "forbidden", reason: "四四" };
  if (three >= 2) return { result: "forbidden", reason: "三三" };
  return { result: "ok" };
}

/**
 * Return the set of empty intersections (as "r,c" strings) that would be
 * forbidden for BLACK to play on board b (assuming it is black's turn).
 */
export function computeForbiddenPoints(b: Board): Set<string> {
  const set = new Set<string>();
  for (const { r, c } of getCandidates(b)) {
    b[r][c] = BLACK as Cell;
    const a = analyzeBlack(b, r, c);
    b[r][c] = EMPTY as Cell;
    if (a.result === "forbidden") set.add(`${r},${c}`);
  }
  return set;
}

// ── AI heuristic ───────────────────────────────────────────────────────────────

/** Score a pattern for `color` at (r, c) in one direction. */
export function scorePattern(
  b: Board,
  r: number,
  c: number,
  dr: number,
  dc: number,
  color: Cell
): number {
  function scan(dr2: number, dc2: number): { count: number; open: boolean } {
    let count = 0;
    let rr = r + dr2,
      cc = c + dc2;
    while (inBounds(rr, cc)) {
      if (b[rr][cc] === color) {
        count++;
        rr += dr2;
        cc += dc2;
      } else break;
    }
    const open = inBounds(rr, cc) && b[rr][cc] === EMPTY;
    return { count, open };
  }

  const fwd = scan(dr, dc);
  const bwd = scan(-dr, -dc);
  const total = fwd.count + bwd.count + 1;
  const opens = (fwd.open ? 1 : 0) + (bwd.open ? 1 : 0);

  if (total >= 5) return 100000;
  if (total === 4 && opens >= 1) return 10000;
  if (total === 4 && opens === 0) return 500;
  if (total === 3 && opens === 2) return 1000;
  if (total === 3 && opens === 1) return 200;
  if (total === 2 && opens === 2) return 50;
  if (total === 2 && opens === 1) return 10;
  return 0;
}

/** Combined score for `color` at (r, c) across all four directions. */
export function scoreCell(b: Board, r: number, c: number, color: Cell): number {
  let s = 0;
  for (const [dr, dc] of DIRS4) s += scorePattern(b, r, c, dr, dc, color);
  return s;
}

/**
 * Collect candidate cells: all empty intersections within 2 steps of any
 * occupied stone.  If the board is completely empty, return the centre.
 */
export function getCandidates(b: Board): Point[] {
  const cands = new Set<number>();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (b[r][c] === EMPTY) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr,
            nc = c + dc;
          if (inBounds(nr, nc) && b[nr][nc] === EMPTY) {
            cands.add(nr * SIZE + nc);
          }
        }
      }
    }
  }
  if (cands.size === 0) {
    const mid = Math.floor(SIZE / 2);
    cands.add(mid * SIZE + mid);
  }
  return [...cands].map((k) => ({ r: Math.floor(k / SIZE), c: k % SIZE }));
}

/**
 * Choose the best AI (WHITE) move on board b.
 *
 * Strategy: for each candidate cell score it for attack (WHITE) and defence
 * (BLACK), take the higher (defence weighted ×0.95), pick the best.  Ties
 * broken first by Manhattan distance to the board centre (closer preferred),
 * then by the provided `rng` (or deterministically: the first in the sorted
 * list when no rng is given).
 */
export function getAIMove(b: Board, rng?: Rng): Point {
  const cands = getCandidates(b);
  const mid = Math.floor(SIZE / 2);
  let bestScore = -1;
  let bestCells: Point[] = [];

  for (const { r, c } of cands) {
    const attack = scoreCell(b, r, c, WHITE as Cell);
    const defense = scoreCell(b, r, c, BLACK as Cell);
    const score = Math.max(attack, defense * 0.95);
    if (score > bestScore) {
      bestScore = score;
      bestCells = [{ r, c }];
    } else if (score === bestScore) {
      bestCells.push({ r, c });
    }
  }

  if (bestCells.length > 1) {
    bestCells.sort((a, b) => {
      const da = Math.abs(a.r - mid) + Math.abs(a.c - mid);
      const db = Math.abs(b.r - mid) + Math.abs(b.c - mid);
      return da - db;
    });
    const topDist =
      Math.abs(bestCells[0].r - mid) + Math.abs(bestCells[0].c - mid);
    const tied = bestCells.filter(
      (cell) =>
        Math.abs(cell.r - mid) + Math.abs(cell.c - mid) === topDist
    );
    if (tied.length === 1) return tied[0];
    return rng ? rng.pick(tied) : tied[0];
  }
  return bestCells[0];
}
