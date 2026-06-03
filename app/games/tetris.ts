/* Tetris — framework-free game logic.
   Exports tetromino definitions, rotation, collision detection, board
   manipulation, line-clear scoring, and bag/spawn helpers.
   The gravity loop, input handling, canvas rendering, and reactive state
   remain in the Vue component. */

import type { Rng } from "~/utils/rng";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const COLS = 10;
export const ROWS = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** [col-offset, row-offset] relative to piece origin */
export type Cell = [number, number];

/** One rotation state = 4 cells */
export type RotationState = Cell[];

export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

/** Live piece on the playfield */
export interface Piece {
  type: PieceType;
  rot: number;
  x: number;
  y: number;
}

/** Playfield row: array of color strings or null */
export type BoardRow = (string | null)[];

/** Full board: ROWS × COLS */
export type Board = BoardRow[];

/** Result of clearing lines from the board */
export interface ClearResult {
  /** New board after removing full rows and prepending empty ones */
  board: Board;
  /** Number of lines cleared (0–4) */
  linesCleared: number;
  /** Points earned (before multiplying by level) */
  basePoints: number;
}

// ---------------------------------------------------------------------------
// Tetromino definitions
// [rotations][cells] — each cell is [col, row] offset from pivot
// Identical to the component's PIECES table.
// ---------------------------------------------------------------------------

export const PIECES: Record<PieceType, RotationState[]> = {
  I: [
    [[0,1],[1,1],[2,1],[3,1]],
    [[2,0],[2,1],[2,2],[2,3]],
    [[0,2],[1,2],[2,2],[3,2]],
    [[1,0],[1,1],[1,2],[1,3]],
  ],
  O: [
    [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]],
  ],
  T: [
    [[1,0],[0,1],[1,1],[2,1]],
    [[1,0],[1,1],[2,1],[1,2]],
    [[0,1],[1,1],[2,1],[1,2]],
    [[1,0],[0,1],[1,1],[1,2]],
  ],
  S: [
    [[1,0],[2,0],[0,1],[1,1]],
    [[1,0],[1,1],[2,1],[2,2]],
    [[1,1],[2,1],[0,2],[1,2]],
    [[0,0],[0,1],[1,1],[1,2]],
  ],
  Z: [
    [[0,0],[1,0],[1,1],[2,1]],
    [[2,0],[1,1],[2,1],[1,2]],
    [[0,1],[1,1],[1,2],[2,2]],
    [[1,0],[0,1],[1,1],[0,2]],
  ],
  J: [
    [[0,0],[0,1],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[1,2]],
    [[0,1],[1,1],[2,1],[2,2]],
    [[1,0],[1,1],[0,2],[1,2]],
  ],
  L: [
    [[2,0],[0,1],[1,1],[2,1]],
    [[1,0],[1,1],[1,2],[2,2]],
    [[0,1],[1,1],[2,1],[0,2]],
    [[0,0],[1,0],[1,1],[1,2]],
  ],
};

export const PIECE_KEYS: PieceType[] = ["I","O","T","S","Z","J","L"];

export const COLORS: Record<PieceType, string> = {
  I: "#4ea8de", O: "#f0c040", T: "#b04af0", S: "#40c05a",
  Z: "#f05050", J: "#3060d0", L: "#f08030",
};

// ---------------------------------------------------------------------------
// Scoring table  (points[n] = base points for clearing n lines, 1–4)
// ---------------------------------------------------------------------------

const SCORE_TABLE = [0, 100, 300, 500, 800];

/** Base points for clearing `n` lines (1–4). Level multiplier applied outside. */
export function basePointsForLines(n: number): number {
  return SCORE_TABLE[Math.min(n, 4)] ?? 800;
}

// ---------------------------------------------------------------------------
// Board helpers
// ---------------------------------------------------------------------------

/** Create an empty ROWS × COLS board. */
export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<string | null>(COLS).fill(null));
}

// ---------------------------------------------------------------------------
// Piece helpers
// ---------------------------------------------------------------------------

/** Create a new piece at the default spawn position (x=0, y=0). */
export function spawnPiece(type: PieceType): Piece {
  return { type, rot: 0, x: 0, y: 0 };
}

/**
 * Resolve the absolute board cells for a piece (or a hypothetical position).
 * Returns an array of { x, y } in board coordinates.
 */
export function getCells(piece: Piece): { x: number; y: number }[] {
  return PIECES[piece.type][piece.rot].map(([dc, dr]) => ({
    x: piece.x + dc,
    y: piece.y + dr,
  }));
}

// ---------------------------------------------------------------------------
// Collision detection
// ---------------------------------------------------------------------------

/**
 * Returns true if placing `piece` at (piece.x+dx, piece.y+dy) with rotation
 * `rot` would collide with the playfield boundaries or any filled cell on `board`.
 * Cells above the visible area (y < 0) are allowed (spawn zone).
 */
export function collides(
  board: Board,
  piece: Piece,
  dx = 0,
  dy = 0,
  rot = piece.rot
): boolean {
  const cells = PIECES[piece.type][rot];
  for (const [dc, dr] of cells) {
    const nx = piece.x + dc + dx;
    const ny = piece.y + dr + dy;
    if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
    if (ny >= 0 && board[ny][nx]) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

/**
 * Try to rotate `piece` clockwise (cw=true) or counter-clockwise (cw=false)
 * against `board`, applying simple wall-kicks (offsets 0, −1, +1, −2, +2).
 * Returns the rotated piece if a valid position is found, or the original
 * piece unchanged if all kicks fail.
 */
export function tryRotate(board: Board, piece: Piece, cw: boolean): Piece {
  const rots = PIECES[piece.type].length;
  const newRot = (piece.rot + (cw ? 1 : rots - 1)) % rots;
  for (const dx of [0, -1, 1, -2, 2]) {
    if (!collides(board, piece, dx, 0, newRot)) {
      return { ...piece, rot: newRot, x: piece.x + dx };
    }
  }
  return piece; // no kick succeeded — return unchanged
}

// ---------------------------------------------------------------------------
// Locking & line-clear
// ---------------------------------------------------------------------------

/**
 * Lock `piece` into `board` (mutates board in place).
 * Does NOT check for game-over; the caller should check if any locked cell
 * has y < 0 before calling this.
 */
export function lockPiece(board: Board, piece: Piece): void {
  for (const { x, y } of getCells(piece)) {
    if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
      board[y][x] = COLORS[piece.type];
    }
  }
}

/**
 * Scan the board for fully-filled rows, remove them, prepend empty rows,
 * and compute the points earned.
 *
 * Returns a ClearResult describing the new board, lines cleared, and base
 * points (caller multiplies by the current level).
 *
 * Note: `board` is NOT mutated; a new board array is returned.
 */
export function clearLines(board: Board): ClearResult {
  // Collect indices of full rows (bottom-up to match component ordering)
  const fullRows: number[] = [];
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every((c) => c !== null)) fullRows.push(r);
  }

  if (fullRows.length === 0) {
    return { board, linesCleared: 0, basePoints: 0 };
  }

  // Build new board: copy rows that are NOT full
  const fullSet = new Set(fullRows);
  const kept: BoardRow[] = board.filter((_, r) => !fullSet.has(r));
  // Prepend empty rows to restore height
  while (kept.length < ROWS) kept.unshift(Array<string | null>(COLS).fill(null));

  const linesCleared = fullRows.length;
  const basePoints = basePointsForLines(linesCleared);

  return { board: kept, linesCleared, basePoints };
}

// ---------------------------------------------------------------------------
// 7-bag randomizer
// ---------------------------------------------------------------------------

/**
 * Build a freshly shuffled 7-bag using the provided RNG.
 * Returns a mutable copy of PIECE_KEYS in shuffled order.
 */
export function buildBag(rng: Rng): PieceType[] {
  const b: PieceType[] = [...PIECE_KEYS];
  rng.shuffle(b);
  return b;
}

/**
 * Draw the next piece type from `bag`, refilling with a new shuffled bag when
 * empty. Mutates `bag` in place and returns the piece type.
 */
export function nextFromBag(bag: PieceType[], rng: Rng): PieceType {
  if (bag.length === 0) {
    const fresh = buildBag(rng);
    bag.push(...fresh);
  }
  return bag.shift()!;
}
