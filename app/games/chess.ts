/* International chess — rules powered by chess.js, AI kept framework-free.
   The AI is a deterministic rule-based alpha-beta search with material,
   piece-square, mobility, capture, promotion, and check heuristics. */

import { Chess, type Color, type Move, type Piece, type PieceSymbol, type Square } from "chess.js";
import type { Rng } from "~/utils/rng";

export type ChessDifficulty = "easy" | "normal" | "hard";
export type ChessSide = Color;

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
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const MATE_SCORE = 100_000;

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

export function getChessDifficultyDepth(difficulty: ChessDifficulty): number {
  if (difficulty === "easy") return 1;
  if (difficulty === "hard") return 3;
  return 2;
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

export function isChessPromotionMove(move: Move): boolean {
  return move.piece === "p" && (move.to.endsWith("8") || move.to.endsWith("1"));
}

export function toChessMoveInput(move: Pick<Move, "from" | "to" | "promotion" | "piece">, promotion?: PieceSymbol) {
  const input: { from: string; to: string; promotion?: string } = {
    from: move.from,
    to: move.to,
  };
  if (promotion || move.promotion || isChessPromotionLike(move)) {
    input.promotion = promotion || move.promotion || "q";
  }
  return input;
}

function isChessPromotionLike(move: Pick<Move, "to" | "piece">): boolean {
  return move.piece === "p" && (move.to.endsWith("8") || move.to.endsWith("1"));
}

export function getChessStatus(chess: Chess): string {
  if (chess.isCheckmate()) return chess.turn() === "w" ? "黑方將死白方" : "白方將死黑方";
  if (chess.isStalemate()) return "逼和";
  if (chess.isDraw()) return "和棋";
  if (chess.isCheck()) return chess.turn() === "w" ? "白方被將軍" : "黑方被將軍";
  return chess.turn() === "w" ? "白方回合" : "黑方回合";
}

function pieceSquareBonus(piece: Piece, row: number, col: number): number {
  const tableRow = piece.color === "w" ? row : 7 - row;
  return PIECE_SQUARES[piece.type][tableRow * 8 + col];
}

export function evaluateChess(chess: Chess, aiColor: Color): number {
  if (chess.isCheckmate()) {
    return chess.turn() === aiColor ? -MATE_SCORE : MATE_SCORE;
  }
  if (chess.isDraw()) return 0;

  let score = 0;
  const board = chess.board();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) continue;
      const sign = piece.color === aiColor ? 1 : -1;
      score += sign * (PIECE_VALUES[piece.type] + pieceSquareBonus(piece, row, col));
    }
  }

  const sideToMoveSign = chess.turn() === aiColor ? 1 : -1;
  score += sideToMoveSign * chess.moves().length * 2;
  if (chess.isCheck()) score -= sideToMoveSign * 35;
  return score;
}

function chessMoveOrderScore(move: Move): number {
  let score = 0;
  if (move.captured) score += 10_000 + PIECE_VALUES[move.captured] - PIECE_VALUES[move.piece] / 10;
  if (move.promotion) score += PIECE_VALUES[move.promotion] + 700;
  if (move.san.includes("+")) score += 80;
  if (move.san.includes("#")) score += 100_000;
  const file = FILES.indexOf(move.to[0] as (typeof FILES)[number]);
  const rank = Number(move.to[1]);
  score += 8 - Math.abs(file - 3.5) - Math.abs(rank - 4.5);
  return score;
}

function orderedChessMoves(chess: Chess): Move[] {
  return chess.moves({ verbose: true }).sort((a, b) => chessMoveOrderScore(b) - chessMoveOrderScore(a));
}

type SearchStats = { nodes: number; maxNodes: number };

function alphaBetaChess(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  aiColor: Color,
  stats: SearchStats
): number {
  stats.nodes++;
  if (depth <= 0 || chess.isGameOver() || stats.nodes >= stats.maxNodes) {
    return evaluateChess(chess, aiColor);
  }

  const maximizing = chess.turn() === aiColor;
  const moves = orderedChessMoves(chess);
  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      chess.move(toChessMoveInput(move));
      best = Math.max(best, alphaBetaChess(chess, depth - 1, alpha, beta, aiColor, stats));
      chess.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha || stats.nodes >= stats.maxNodes) break;
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    chess.move(toChessMoveInput(move));
    best = Math.min(best, alphaBetaChess(chess, depth - 1, alpha, beta, aiColor, stats));
    chess.undo();
    beta = Math.min(beta, best);
    if (beta <= alpha || stats.nodes >= stats.maxNodes) break;
  }
  return best;
}

export function chooseChessAIMove(
  fen: string,
  aiColor: Color,
  difficulty: ChessDifficulty = "normal",
  rng?: Rng
): ChessAIMove | null {
  const chess = new Chess(fen);
  if (chess.isGameOver() || chess.turn() !== aiColor) return null;

  const depth = getChessDifficultyDepth(difficulty);
  const stats: SearchStats = {
    nodes: 0,
    maxNodes: difficulty === "hard" ? 45_000 : difficulty === "normal" ? 18_000 : 4_000,
  };
  const moves = orderedChessMoves(chess);
  let bestScore = -Infinity;
  let bestMoves: Move[] = [];

  for (const move of moves) {
    chess.move(toChessMoveInput(move));
    const score = alphaBetaChess(chess, depth - 1, -Infinity, Infinity, aiColor, stats);
    chess.undo();
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
    if (stats.nodes >= stats.maxNodes) break;
  }

  const best = bestMoves.length > 1 && rng ? rng.pick(bestMoves) : bestMoves[0];
  if (!best) return null;
  return {
    from: best.from,
    to: best.to,
    promotion: best.promotion,
    san: best.san,
    score: bestScore,
    nodes: stats.nodes,
  };
}
