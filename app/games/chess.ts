/* International chess — rules powered by chess.js, AI kept framework-free.
   chess.js validates and applies the moves the player sees. The AI runs on
   its own small 0x88 board (chess.js has no way to generate moves without
   building SAN strings, which is ~30× too slow for deep search) and is a
   deterministic rule-based negamax (alpha-beta) with material, piece-square
   and check heuristics: iterative deepening, a Zobrist-keyed transposition
   table, killer/history ordering and a capture/promotion quiescence search.
   The move generator is cross-checked against chess.js by perft tests. */

import { Chess, type Color, type Move, type Piece, type PieceSymbol, type Square } from "chess.js";
import { makeRng, type Rng } from "~/utils/rng";

export type ChessDifficulty = "easy" | "normal" | "hard" | "expert" | "master";
export type ChessSide = Color;

export type ChessLevel = {
  id: ChessDifficulty;
  /** Button label. */
  label: string;
  /** One-character badge. */
  short: string;
  /** Maximum iterative-deepening depth (plies). */
  depth: number;
  /** Maximum quiescence extension (plies); 0 disables it. */
  quiescence: number;
  /** Node budget — iterations after the first are abandoned once exceeded. */
  maxNodes: number;
  /** Wall-clock budget in ms — the real safety net (see CHESS_LEVELS). */
  timeLimitMs: number;
  /** Short description shown under the selector. */
  note: string;
};

export type ChessCell = {
  square: Square;
  row: number;
  col: number;
  boardRow: number;
  boardCol: number;
  light: boolean;
  piece: Piece | null;
};

export type ChessAIMove = {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
  san: string;
  score: number;
  nodes: number;
  /** Deepest fully completed search depth. */
  depth: number;
  timeMs: number;
};

export type ChessSearchOptions = {
  /** Override the level's node budget. */
  maxNodes?: number;
  /** Override the level's quiescence depth. */
  quiescence?: number;
  /** Override the level's wall-clock cap (Infinity to search uncapped). */
  timeLimitMs?: number;
  /** Called after every completed iteration. */
  onProgress?: (info: ChessAIMove) => void;
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const MATE_SCORE = 100_000;
const MATE_BOUND = MATE_SCORE - 1_000;
const MAX_PLY = 64;
const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;

/* Depth is the headline setting; the two budgets are safety nets that cap how
   long a pathological position may think. Whichever runs out first stops the
   search, and the deepest iteration that actually finished is played. */
export const CHESS_LEVELS: readonly ChessLevel[] = [
  { id: "easy", label: "輕量", short: "輕", depth: 1, quiescence: 0, maxNodes: 4_000, timeLimitMs: 2_000, note: "只看一步，適合熟悉規則" },
  { id: "normal", label: "標準", short: "中", depth: 2, quiescence: 0, maxNodes: 12_000, timeLimitMs: 2_000, note: "看到你的回應" },
  { id: "hard", label: "強化", short: "強", depth: 3, quiescence: 0, maxNodes: 40_000, timeLimitMs: 3_000, note: "三層搜尋，反應仍即時" },
  { id: "expert", label: "專家", short: "專", depth: 4, quiescence: 4, maxNodes: 150_000, timeLimitMs: 5_000, note: "四層＋吃子延伸，通常不到 1 秒" },
  { id: "master", label: "大師", short: "師", depth: 5, quiescence: 6, maxNodes: 450_000, timeLimitMs: 9_000, note: "五層＋吃子延伸，複雜局面需要數秒" },
];

export const CHESS_PIECES: Record<Color, Record<PieceSymbol, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 335,
  r: 500,
  q: 900,
  k: 0,
};

/* Indexed from the piece owner's point of view: row 0 is the far side of
   the board (rank 8 for white), row 7 the home rank. */
const PIECE_SQUARES: Record<PieceSymbol, number[]> = {
  p: [
     0,   0,   0,   0,   0,   0,   0,   0,
    50,  55,  55,  40,  40,  55,  55,  50,
    16,  18,  24,  32,  32,  24,  18,  16,
     8,  10,  16,  26,  26,  16,  10,   8,
     2,   4,   8,  22,  22,   8,   4,   2,
     8,  -4, -10,   4,   4, -10,  -4,   8,
     8,  12,  12, -20, -20,  12,  12,   8,
     0,   0,   0,   0,   0,   0,   0,   0,
  ],
  n: [
    -45, -22, -14, -10, -10, -14, -22, -45,
    -18,  -4,   4,  10,  10,   4,  -4, -18,
    -10,   8,  18,  24,  24,  18,   8, -10,
     -6,  12,  24,  30,  30,  24,  12,  -6,
     -6,  10,  22,  28,  28,  22,  10,  -6,
    -12,   6,  14,  20,  20,  14,   6, -12,
    -22, -10,   0,   4,   4,   0, -10, -22,
    -50, -28, -20, -16, -16, -20, -28, -50,
  ],
  b: [
    -22, -12, -10, -10, -10, -10, -12, -22,
    -10,   8,   2,   6,   6,   2,   8, -10,
     -8,  12,  12,  14,  14,  12,  12,  -8,
     -6,   8,  18,  18,  18,  18,   8,  -6,
     -6,  10,  16,  18,  18,  16,  10,  -6,
     -8,   8,  12,  14,  14,  12,   8,  -8,
    -10,   8,   6,   2,   2,   6,   8, -10,
    -22, -12, -10, -10, -10, -10, -12, -22,
  ],
  r: [
     0,   0,   4,   8,   8,   4,   0,   0,
    18,  22,  24,  26,  26,  24,  22,  18,
    -6,   0,   4,   8,   8,   4,   0,  -6,
    -6,   0,   4,   8,   8,   4,   0,  -6,
    -6,   0,   4,   8,   8,   4,   0,  -6,
    -6,   0,   4,   8,   8,   4,   0,  -6,
    -8,   0,   4,   8,   8,   4,   0,  -8,
     0,   0,   4,  12,  12,   4,   0,   0,
  ],
  q: [
    -20, -10, -10,  -2,  -2, -10, -10, -20,
    -10,   4,   8,   8,   8,   8,   4, -10,
    -10,   8,  12,  12,  12,  12,   8, -10,
     -2,   8,  12,  16,  16,  12,   8,  -2,
     -2,   8,  12,  16,  16,  12,   8,  -2,
    -10,   8,  12,  12,  12,  12,   8, -10,
    -10,   4,   8,   8,   8,   8,   4, -10,
    -20, -10, -10,  -2,  -2, -10, -10, -20,
  ],
  k: [
    -30, -35, -35, -45, -45, -35, -35, -30,
    -30, -35, -35, -45, -45, -35, -35, -30,
    -30, -35, -35, -45, -45, -35, -35, -30,
    -30, -35, -35, -45, -45, -35, -35, -30,
    -20, -25, -25, -35, -35, -25, -25, -20,
    -10, -15, -15, -20, -20, -15, -15, -10,
     18,  18,   4,   0,   0,   4,  18,  18,
     28,  34,  18,   0,   0,  18,  34,  28,
  ],
};

export function createChessGame(fen?: string): Chess {
  return new Chess(fen);
}

export function oppositeChessSide(side: Color): Color {
  return side === "w" ? "b" : "w";
}

export function getChessLevel(difficulty: ChessDifficulty): ChessLevel {
  return CHESS_LEVELS.find((level) => level.id === difficulty) ?? CHESS_LEVELS[1];
}

export function getChessDifficultyDepth(difficulty: ChessDifficulty): number {
  return getChessLevel(difficulty).depth;
}

export function squareFromRowCol(row: number, col: number): Square {
  return `${FILES[col]}${8 - row}` as Square;
}

export function getChessCells(chess: Chess, orientation: Color = "w"): ChessCell[] {
  const board = chess.board();
  const cells: ChessCell[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const boardRow = orientation === "w" ? row : 7 - row;
      const boardCol = orientation === "w" ? col : 7 - col;
      const piece = board[boardRow][boardCol];
      cells.push({
        square: squareFromRowCol(boardRow, boardCol),
        row,
        col,
        boardRow,
        boardCol,
        light: (boardRow + boardCol) % 2 === 0,
        piece: piece ? { color: piece.color, type: piece.type } : null,
      });
    }
  }
  return cells;
}

export function getChessLegalMoves(chess: Chess, square?: Square): Move[] {
  if (!square) return chess.moves({ verbose: true });
  return chess.moves({ square, verbose: true });
}

export function isChessPromotionMove(move: Pick<Move, "to" | "piece">): boolean {
  return move.piece === "p" && (move.to.endsWith("8") || move.to.endsWith("1"));
}

export function toChessMoveInput(move: Pick<Move, "from" | "to" | "promotion" | "piece">, promotion?: PieceSymbol) {
  const input: { from: string; to: string; promotion?: string } = {
    from: move.from,
    to: move.to,
  };
  if (promotion || move.promotion || isChessPromotionMove(move)) {
    input.promotion = promotion || move.promotion || "q";
  }
  return input;
}

export function getChessStatus(chess: Chess): string {
  if (chess.isCheckmate()) return chess.turn() === "w" ? "黑方將死白方" : "白方將死黑方";
  if (chess.isStalemate()) return "逼和";
  if (chess.isDraw()) return "和棋";
  if (chess.isCheck()) return chess.turn() === "w" ? "白方被將軍" : "黑方被將軍";
  return chess.turn() === "w" ? "白方回合" : "黑方回合";
}

/* ---------------------------------------------------------------------- */
/* Search board — 0x88 mailbox                                             */
/* ---------------------------------------------------------------------- */

const EMPTY = 0;
const PAWN = 1;
const KNIGHT = 2;
const BISHOP = 3;
const ROOK = 4;
const QUEEN = 5;
const KING = 6;
const WHITE = 0;
const BLACK = 1;

const FLAG_CAPTURE = 1;
const FLAG_DOUBLE = 2;
const FLAG_EP = 4;
const FLAG_KSIDE = 8;
const FLAG_QSIDE = 16;
const FLAG_PROMOTION = 32;

const CASTLE_WK = 1;
const CASTLE_WQ = 2;
const CASTLE_BK = 4;
const CASTLE_BQ = 8;

const KNIGHT_OFFSETS = [-33, -31, -18, -14, 14, 18, 31, 33];
const BISHOP_OFFSETS = [-17, -15, 15, 17];
const ROOK_OFFSETS = [-16, -1, 1, 16];
const KING_OFFSETS = [-17, -16, -15, -1, 1, 15, 16, 17];
const PROMOTION_TYPES = [QUEEN, ROOK, BISHOP, KNIGHT];

const PIECE_CODES: Record<string, number> = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };
const PIECE_LETTERS = ["", "p", "n", "b", "r", "q", "k"] as const;
const ENGINE_VALUES = [0, 100, 320, 335, 500, 900, 0];
const ENGINE_TABLES = [[], PIECE_SQUARES.p, PIECE_SQUARES.n, PIECE_SQUARES.b, PIECE_SQUARES.r, PIECE_SQUARES.q, PIECE_SQUARES.k];

/* Squares whose vacating or capture removes castling rights. */
const CASTLING_MASK = new Uint8Array(128).fill(15);
CASTLING_MASK[0x00] = 15 & ~CASTLE_WQ;
CASTLING_MASK[0x04] = 15 & ~(CASTLE_WK | CASTLE_WQ);
CASTLING_MASK[0x07] = 15 & ~CASTLE_WK;
CASTLING_MASK[0x70] = 15 & ~CASTLE_BQ;
CASTLING_MASK[0x74] = 15 & ~(CASTLE_BK | CASTLE_BQ);
CASTLING_MASK[0x77] = 15 & ~CASTLE_BK;

/* Zobrist keys (two 32-bit halves), deterministic across runs. */
const ZOBRIST_PIECE = 0;
const ZOBRIST_TURN = 16 * 128;
const ZOBRIST_CASTLING = ZOBRIST_TURN + 1;
const ZOBRIST_EP = ZOBRIST_CASTLING + 16;
const ZOBRIST = (() => {
  const rng = makeRng("chess-zobrist");
  const keys = new Uint32Array((ZOBRIST_EP + 8) * 2);
  for (let i = 0; i < keys.length; i++) keys[i] = Math.floor(rng.next() * 0x1_0000_0000);
  return keys;
})();

type EngineBoard = {
  squares: Int8Array;
  turn: number;
  castling: number;
  ep: number;
  halfmove: number;
  kings: number[];
  /** Undo stack: castling, ep, halfmove, captured piece per made move. */
  stack: number[];
};

/* Packed move: from(7) to(7) promotion(3) flags(6) captured type(3) piece type(3). */
function packMove(from: number, to: number, piece: number, captured: number, promotion: number, flags: number): number {
  return from | (to << 7) | (promotion << 14) | (flags << 17) | (captured << 23) | (piece << 26);
}
const moveFrom = (move: number) => move & 0x7f;
const moveTo = (move: number) => (move >> 7) & 0x7f;
const movePromotion = (move: number) => (move >> 14) & 7;
const moveFlags = (move: number) => (move >> 17) & 0x3f;
const moveCaptured = (move: number) => (move >> 23) & 7;
const movePiece = (move: number) => (move >> 26) & 7;

function squareIndex(name: string): number {
  return ((name.charCodeAt(1) - 49) << 4) | (name.charCodeAt(0) - 97);
}

function squareName(index: number): Square {
  return `${FILES[index & 7]}${(index >> 4) + 1}` as Square;
}

function boardFromFen(fen: string): EngineBoard {
  const [placement, turn, castling, ep, halfmove] = fen.split(" ");
  const squares = new Int8Array(128);
  const kings = [0, 0];
  const ranks = placement.split("/");
  for (let row = 0; row < 8; row++) {
    const rank = 7 - row;
    let file = 0;
    for (const char of ranks[row]) {
      const skip = Number(char);
      if (skip) {
        file += skip;
        continue;
      }
      const color = char === char.toLowerCase() ? BLACK : WHITE;
      const type = PIECE_CODES[char.toLowerCase()];
      const square = (rank << 4) | file;
      squares[square] = type | (color << 3);
      if (type === KING) kings[color] = square;
      file++;
    }
  }
  let rights = 0;
  if (castling.includes("K")) rights |= CASTLE_WK;
  if (castling.includes("Q")) rights |= CASTLE_WQ;
  if (castling.includes("k")) rights |= CASTLE_BK;
  if (castling.includes("q")) rights |= CASTLE_BQ;
  return {
    squares,
    turn: turn === "w" ? WHITE : BLACK,
    castling: rights,
    ep: ep === "-" ? -1 : squareIndex(ep),
    halfmove: Number(halfmove) || 0,
    kings,
    stack: [],
  };
}

function isAttacked(board: EngineBoard, square: number, by: number): boolean {
  const squares = board.squares;
  const pawn = PAWN | (by << 3);
  const pawnStep = by === WHITE ? -16 : 16;
  for (const side of [-1, 1]) {
    const from = square + pawnStep + side;
    if (!(from & 0x88) && squares[from] === pawn) return true;
  }
  const knight = KNIGHT | (by << 3);
  for (const offset of KNIGHT_OFFSETS) {
    const from = square + offset;
    if (!(from & 0x88) && squares[from] === knight) return true;
  }
  const king = KING | (by << 3);
  for (const offset of KING_OFFSETS) {
    const from = square + offset;
    if (!(from & 0x88) && squares[from] === king) return true;
  }
  const bishop = BISHOP | (by << 3);
  const rook = ROOK | (by << 3);
  const queen = QUEEN | (by << 3);
  for (const offset of BISHOP_OFFSETS) {
    for (let from = square + offset; !(from & 0x88); from += offset) {
      const piece = squares[from];
      if (piece === EMPTY) continue;
      if (piece === bishop || piece === queen) return true;
      break;
    }
  }
  for (const offset of ROOK_OFFSETS) {
    for (let from = square + offset; !(from & 0x88); from += offset) {
      const piece = squares[from];
      if (piece === EMPTY) continue;
      if (piece === rook || piece === queen) return true;
      break;
    }
  }
  return false;
}

function inCheck(board: EngineBoard): boolean {
  return isAttacked(board, board.kings[board.turn], board.turn ^ 1);
}

function makeMove(board: EngineBoard, move: number): void {
  const from = moveFrom(move);
  const to = moveTo(move);
  const flags = moveFlags(move);
  const us = board.turn;
  const them = us ^ 1;
  const squares = board.squares;
  const piece = squares[from];
  const captured = squares[to];
  board.stack.push(board.castling, board.ep, board.halfmove, captured);

  squares[to] = piece;
  squares[from] = EMPTY;
  if (flags & FLAG_EP) squares[to + (us === WHITE ? -16 : 16)] = EMPTY;
  if (flags & FLAG_PROMOTION) squares[to] = movePromotion(move) | (us << 3);
  if (flags & FLAG_KSIDE) {
    squares[to - 1] = squares[to + 1];
    squares[to + 1] = EMPTY;
  }
  if (flags & FLAG_QSIDE) {
    squares[to + 1] = squares[to - 2];
    squares[to - 2] = EMPTY;
  }
  if ((piece & 7) === KING) board.kings[us] = to;

  board.castling &= CASTLING_MASK[from] & CASTLING_MASK[to];
  board.ep = flags & FLAG_DOUBLE ? (from + to) >> 1 : -1;
  board.halfmove = (piece & 7) === PAWN || captured !== EMPTY ? 0 : board.halfmove + 1;
  board.turn = them;
}

function unmakeMove(board: EngineBoard, move: number): void {
  const from = moveFrom(move);
  const to = moveTo(move);
  const flags = moveFlags(move);
  const squares = board.squares;
  board.turn ^= 1;
  const us = board.turn;
  const them = us ^ 1;
  const captured = board.stack.pop() as number;
  board.halfmove = board.stack.pop() as number;
  board.ep = board.stack.pop() as number;
  board.castling = board.stack.pop() as number;

  const piece = flags & FLAG_PROMOTION ? PAWN | (us << 3) : squares[to];
  squares[from] = piece;
  squares[to] = captured;
  if (flags & FLAG_EP) squares[to + (us === WHITE ? -16 : 16)] = PAWN | (them << 3);
  if (flags & FLAG_KSIDE) {
    squares[to + 1] = squares[to - 1];
    squares[to - 1] = EMPTY;
  }
  if (flags & FLAG_QSIDE) {
    squares[to - 2] = squares[to + 1];
    squares[to + 1] = EMPTY;
  }
  if ((piece & 7) === KING) board.kings[us] = from;
}

function pushPawnMove(moves: number[], from: number, to: number, captured: number, flags: number, promotes: boolean): void {
  if (!promotes) {
    moves.push(packMove(from, to, PAWN, captured, 0, flags));
    return;
  }
  for (const type of PROMOTION_TYPES) {
    moves.push(packMove(from, to, PAWN, captured, type, flags | FLAG_PROMOTION));
  }
}

function canCastle(board: EngineBoard, right: number, rook: number, empties: number[], safe: number[]): boolean {
  if (!(board.castling & right) || board.squares[rook] !== (ROOK | (board.turn << 3))) return false;
  for (const square of empties) if (board.squares[square] !== EMPTY) return false;
  for (const square of safe) if (isAttacked(board, square, board.turn ^ 1)) return false;
  return true;
}

/* Pseudo-legal generation; `tacticalOnly` keeps captures and promotions. */
function generateMoves(board: EngineBoard, tacticalOnly: boolean): number[] {
  const moves: number[] = [];
  const squares = board.squares;
  const us = board.turn;
  const them = us ^ 1;
  const forward = us === WHITE ? 16 : -16;
  const promotionRank = us === WHITE ? 7 : 0;
  const startRank = us === WHITE ? 1 : 6;

  for (let from = 0; from < 128; from++) {
    if (from & 0x88) {
      from += 7;
      continue;
    }
    const piece = squares[from];
    if (piece === EMPTY || piece >> 3 !== us) continue;
    const type = piece & 7;

    if (type === PAWN) {
      const to = from + forward;
      const promotes = to >> 4 === promotionRank;
      if (squares[to] === EMPTY && (promotes || !tacticalOnly)) {
        pushPawnMove(moves, from, to, EMPTY, 0, promotes);
        if (from >> 4 === startRank && squares[to + forward] === EMPTY) {
          moves.push(packMove(from, to + forward, PAWN, EMPTY, 0, FLAG_DOUBLE));
        }
      }
      for (const side of [-1, 1]) {
        const target = to + side;
        if (target & 0x88) continue;
        const occupant = squares[target];
        if (occupant !== EMPTY && occupant >> 3 === them) {
          pushPawnMove(moves, from, target, occupant & 7, FLAG_CAPTURE, promotes);
        } else if (target === board.ep) {
          moves.push(packMove(from, target, PAWN, PAWN, 0, FLAG_CAPTURE | FLAG_EP));
        }
      }
      continue;
    }

    const offsets = type === KNIGHT ? KNIGHT_OFFSETS : type === BISHOP ? BISHOP_OFFSETS : type === ROOK ? ROOK_OFFSETS : KING_OFFSETS;
    const slides = type === BISHOP || type === ROOK || type === QUEEN;
    for (const offset of offsets) {
      for (let to = from + offset; !(to & 0x88); to += offset) {
        const occupant = squares[to];
        if (occupant === EMPTY) {
          if (!tacticalOnly) moves.push(packMove(from, to, type, EMPTY, 0, 0));
        } else {
          if (occupant >> 3 === them) moves.push(packMove(from, to, type, occupant & 7, 0, FLAG_CAPTURE));
          break;
        }
        if (!slides) break;
      }
    }
  }

  if (!tacticalOnly) {
    const king = board.kings[us];
    const rank = us === WHITE ? 0 : 0x70;
    if (canCastle(board, us === WHITE ? CASTLE_WK : CASTLE_BK, rank | 7, [rank | 5, rank | 6], [king, rank | 5])) {
      moves.push(packMove(king, rank | 6, KING, EMPTY, 0, FLAG_KSIDE));
    }
    if (canCastle(board, us === WHITE ? CASTLE_WQ : CASTLE_BQ, rank, [rank | 1, rank | 2, rank | 3], [king, rank | 3])) {
      moves.push(packMove(king, rank | 2, KING, EMPTY, 0, FLAG_QSIDE));
    }
  }
  return moves;
}

function legalMoves(board: EngineBoard, tacticalOnly: boolean): number[] {
  const legal: number[] = [];
  for (const move of generateMoves(board, tacticalOnly)) {
    makeMove(board, move);
    if (!isAttacked(board, board.kings[board.turn ^ 1], board.turn)) legal.push(move);
    unmakeMove(board, move);
  }
  return legal;
}

function perft(board: EngineBoard, depth: number): number {
  if (depth === 0) return 1;
  let count = 0;
  for (const move of legalMoves(board, false)) {
    makeMove(board, move);
    count += perft(board, depth - 1);
    unmakeMove(board, move);
  }
  return count;
}

/** Leaf-node count of the AI's move generator — used to verify it against chess.js. */
export function chessPerft(fen: string, depth: number): number {
  return perft(boardFromFen(fen), depth);
}

function hashBoard(board: EngineBoard): number {
  let high = 0;
  let low = 0;
  for (let square = 0; square < 128; square++) {
    if (square & 0x88) {
      square += 7;
      continue;
    }
    const piece = board.squares[square];
    if (piece === EMPTY) continue;
    const index = (ZOBRIST_PIECE + piece * 128 + square) * 2;
    high ^= ZOBRIST[index];
    low ^= ZOBRIST[index + 1];
  }
  if (board.turn === BLACK) {
    high ^= ZOBRIST[ZOBRIST_TURN * 2];
    low ^= ZOBRIST[ZOBRIST_TURN * 2 + 1];
  }
  high ^= ZOBRIST[(ZOBRIST_CASTLING + board.castling) * 2];
  low ^= ZOBRIST[(ZOBRIST_CASTLING + board.castling) * 2 + 1];
  if (board.ep >= 0) {
    high ^= ZOBRIST[(ZOBRIST_EP + (board.ep & 7)) * 2];
    low ^= ZOBRIST[(ZOBRIST_EP + (board.ep & 7)) * 2 + 1];
  }
  return (high >>> 0) * 0x200000 + (low >>> 11);
}

/** Static evaluation from `color`'s point of view (material, piece-square
    tables and a small penalty for the side in check). Dead draws score 0. */
function evaluateBoard(board: EngineBoard, color: number): number {
  let score = 0;
  let heavy = 0;
  let minors = 0;
  for (let square = 0; square < 128; square++) {
    if (square & 0x88) {
      square += 7;
      continue;
    }
    const piece = board.squares[square];
    if (piece === EMPTY) continue;
    const type = piece & 7;
    const owner = piece >> 3;
    if (type === PAWN || type === ROOK || type === QUEEN) heavy++;
    else if (type !== KING) minors++;
    const tableRow = owner === WHITE ? 7 - (square >> 4) : square >> 4;
    const value = ENGINE_VALUES[type] + ENGINE_TABLES[type][tableRow * 8 + (square & 7)];
    score += owner === color ? value : -value;
  }
  if (heavy === 0 && minors <= 1) return 0;
  if (inCheck(board)) score += board.turn === color ? -35 : 35;
  return score;
}

export function evaluateChess(chess: Chess, color: Color): number {
  return evaluateBoard(boardFromFen(chess.fen()), color === "w" ? WHITE : BLACK);
}

/* ---------------------------------------------------------------------- */
/* Search                                                                  */
/* ---------------------------------------------------------------------- */

type TTEntry = { depth: number; score: number; flag: number; move: number };

type SearchContext = {
  nodes: number;
  maxNodes: number;
  deadline: number;
  iteration: number;
  aborted: boolean;
  qdepth: number;
  killers: number[][];
  history: Int32Array;
  tt: Map<number, TTEntry>;
};

type RootMove = { move: number; score: number };

/* Budget checks never abort the first iteration, so a move always exists. */
function outOfBudget(ctx: SearchContext): boolean {
  if (ctx.iteration <= 1) return false;
  if (ctx.nodes >= ctx.maxNodes || ((ctx.nodes & 255) === 0 && Date.now() >= ctx.deadline)) {
    ctx.aborted = true;
  }
  return ctx.aborted;
}

/* Mate scores are stored relative to the node so they stay valid when the same
   position is reached at a different ply. */
function mateAdjust(score: number, plyDelta: number): number {
  return Math.abs(score) >= MATE_BOUND ? score + Math.sign(score) * plyDelta : score;
}

function recordKiller(killers: number[], move: number): void {
  if (killers[0] === move) return;
  killers[1] = killers[0];
  killers[0] = move;
}

function moveOrderScore(move: number, ttMove: number, killers: number[], history: Int32Array): number {
  if (move === ttMove) return 1_000_000;
  let score = 0;
  const captured = moveCaptured(move);
  if (captured) score += 10_000 + ENGINE_VALUES[captured] * 10 - ENGINE_VALUES[movePiece(move)] / 10;
  const promotion = movePromotion(move);
  if (promotion) score += 900 + ENGINE_VALUES[promotion];
  if (killers[0] === move || killers[1] === move) score += 5_000;
  score += Math.min(history[(moveFrom(move) << 7) | moveTo(move)], 4_000);
  const to = moveTo(move);
  score += 8 - Math.abs((to & 7) - 3.5) - Math.abs((to >> 4) - 3.5);
  return score;
}

function orderMoves(moves: number[], ttMove: number, killers: number[], history: Int32Array): number[] {
  const scored = moves.map((move) => ({ move, key: moveOrderScore(move, ttMove, killers, history) }));
  scored.sort((a, b) => b.key - a.key);
  return scored.map((entry) => entry.move);
}

function quiescence(board: EngineBoard, alpha: number, beta: number, ply: number, qdepth: number, ctx: SearchContext): number {
  if (outOfBudget(ctx)) return 0;
  ctx.nodes++;

  let moves: number[];
  let best: number;
  if (inCheck(board)) {
    // In check: every legal reply is an evasion — no stand-pat allowed.
    moves = legalMoves(board, false);
    if (moves.length === 0) return -MATE_SCORE + ply;
    if (qdepth <= 0) return evaluateBoard(board, board.turn);
    moves = orderMoves(moves, 0, ctx.killers[ply], ctx.history);
    best = -Infinity;
  } else {
    best = evaluateBoard(board, board.turn);
    if (qdepth <= 0 || best >= beta) return best;
    if (best > alpha) alpha = best;
    moves = orderMoves(legalMoves(board, true), 0, ctx.killers[ply], ctx.history);
  }

  for (const move of moves) {
    makeMove(board, move);
    const score = -quiescence(board, -beta, -alpha, ply + 1, qdepth - 1, ctx);
    unmakeMove(board, move);
    if (ctx.aborted) return 0;
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function negamax(board: EngineBoard, depth: number, alpha: number, beta: number, ply: number, ctx: SearchContext): number {
  if (outOfBudget(ctx)) return 0;
  ctx.nodes++;

  if (board.halfmove >= 100) return 0;

  if (depth <= 0) {
    if (ctx.qdepth > 0) return quiescence(board, alpha, beta, ply, ctx.qdepth, ctx);
    if (inCheck(board) && legalMoves(board, false).length === 0) return -MATE_SCORE + ply;
    return evaluateBoard(board, board.turn);
  }

  const key = hashBoard(board);
  const entry = ctx.tt.get(key);
  if (entry && entry.depth >= depth) {
    const score = mateAdjust(entry.score, -ply);
    if (
      entry.flag === TT_EXACT ||
      (entry.flag === TT_LOWER && score >= beta) ||
      (entry.flag === TT_UPPER && score <= alpha)
    ) {
      return score;
    }
  }

  const killers = ctx.killers[ply];
  const moves = orderMoves(legalMoves(board, false), entry?.move ?? 0, killers, ctx.history);
  if (moves.length === 0) return inCheck(board) ? -MATE_SCORE + ply : 0;

  let best = -Infinity;
  let bestMove = 0;
  let flag = TT_UPPER;
  for (const move of moves) {
    makeMove(board, move);
    const score = -negamax(board, depth - 1, -beta, -alpha, ply + 1, ctx);
    unmakeMove(board, move);
    if (ctx.aborted) return 0;

    if (score > best) {
      best = score;
      bestMove = move;
    }
    if (score > alpha) {
      alpha = score;
      flag = TT_EXACT;
    }
    if (alpha >= beta) {
      flag = TT_LOWER;
      if (!moveCaptured(move)) {
        recordKiller(killers, move);
        ctx.history[(moveFrom(move) << 7) | moveTo(move)] += depth * depth;
      }
      break;
    }
  }

  ctx.tt.set(key, { depth, score: mateAdjust(best, ply), flag, move: bestMove });
  return best;
}

/* One iteration at the root. Returns false when the budget ran out midway (the
   caller then keeps the previous iteration's answer). Root moves end up sorted
   best-first, which is also the move ordering for the next iteration. */
function searchRoot(board: EngineBoard, rootMoves: RootMove[], depth: number, ctx: SearchContext): boolean {
  let alpha = -Infinity;
  for (const root of rootMoves) {
    makeMove(board, root.move);
    const score = -negamax(board, depth - 1, -Infinity, -alpha, 1, ctx);
    unmakeMove(board, root.move);
    if (ctx.aborted) return false;
    root.score = score;
    if (score > alpha) alpha = score;
  }
  rootMoves.sort((a, b) => b.score - a.score);
  return true;
}

export function chooseChessAIMove(
  fen: string,
  aiColor: Color,
  difficulty: ChessDifficulty = "normal",
  rng?: Rng,
  options: ChessSearchOptions = {}
): ChessAIMove | null {
  const chess = new Chess(fen);
  if (chess.isGameOver() || chess.turn() !== aiColor) return null;

  const board = boardFromFen(chess.fen());
  const rootMoves: RootMove[] = legalMoves(board, false).map((move) => ({ move, score: 0 }));
  // Shuffling first makes ties between equally good moves land on a random one.
  rng?.shuffle(rootMoves);

  const level = getChessLevel(difficulty);
  const started = Date.now();
  const ctx: SearchContext = {
    nodes: 0,
    maxNodes: options.maxNodes ?? level.maxNodes,
    deadline: started + (options.timeLimitMs ?? level.timeLimitMs),
    iteration: 0,
    aborted: false,
    qdepth: options.quiescence ?? level.quiescence,
    killers: Array.from({ length: MAX_PLY }, () => [0, 0]),
    history: new Int32Array(128 * 128),
    tt: new Map(),
  };

  let result: ChessAIMove | null = null;
  for (let depth = 1; depth <= level.depth; depth++) {
    ctx.iteration = depth;
    // Never start an iteration the clock cannot pay for.
    if (depth > 1 && Date.now() >= ctx.deadline) break;
    if (!searchRoot(board, rootMoves, depth, ctx)) break;
    const best = rootMoves[0];
    const from = squareName(moveFrom(best.move));
    const to = squareName(moveTo(best.move));
    const promotion = movePromotion(best.move) ? PIECE_LETTERS[movePromotion(best.move)] : undefined;
    result = {
      from,
      to,
      promotion,
      san: new Chess(fen).move({ from, to, promotion }).san,
      score: best.score,
      nodes: ctx.nodes,
      depth,
      timeMs: Date.now() - started,
    };
    options.onProgress?.(result);
    if (Math.abs(best.score) >= MATE_BOUND) break;
  }
  return result;
}
