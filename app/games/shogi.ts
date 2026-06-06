/* Japanese shogi — legality powered by tsshogi, AI kept framework-free.
   tsshogi validates the hard rules; this module generates candidates and
   applies a deterministic rule-based alpha-beta evaluator around it. */

import {
  Color,
  InitialPositionType,
  Move,
  MoveType,
  Piece,
  PieceType,
  Position,
  Square,
  directionToDeltaMap,
  formatMove,
  handPieceTypes,
  isPromotable,
  isPromotableRank,
  movableDirections,
  resolveMoveType,
  reverseColor,
} from "tsshogi";
import type { Rng } from "~/utils/rng";

export { Color, PieceType, type Move, type Position, type Square } from "tsshogi";

export type ShogiDifficulty = "easy" | "normal" | "hard";

export type ShogiCell = {
  square: Square;
  usi: string;
  row: number;
  col: number;
  file: number;
  rank: number;
  piece: Piece | null;
};

export type ShogiHandPiece = {
  type: PieceType;
  label: string;
  count: number;
};

export type ShogiAIMove = {
  usi: string;
  score: number;
  nodes: number;
};

const MATE_SCORE = 100_000;

export const SHOGI_HAND_ORDER: PieceType[] = [
  PieceType.ROOK,
  PieceType.BISHOP,
  PieceType.GOLD,
  PieceType.SILVER,
  PieceType.KNIGHT,
  PieceType.LANCE,
  PieceType.PAWN,
];

export const SHOGI_PIECE_LABELS: Record<PieceType, string> = {
  [PieceType.PAWN]: "歩",
  [PieceType.LANCE]: "香",
  [PieceType.KNIGHT]: "桂",
  [PieceType.SILVER]: "銀",
  [PieceType.GOLD]: "金",
  [PieceType.BISHOP]: "角",
  [PieceType.ROOK]: "飛",
  [PieceType.KING]: "玉",
  [PieceType.PROM_PAWN]: "と",
  [PieceType.PROM_LANCE]: "杏",
  [PieceType.PROM_KNIGHT]: "圭",
  [PieceType.PROM_SILVER]: "全",
  [PieceType.HORSE]: "馬",
  [PieceType.DRAGON]: "龍",
};

const SHOGI_VALUES: Record<PieceType, number> = {
  [PieceType.PAWN]: 100,
  [PieceType.LANCE]: 300,
  [PieceType.KNIGHT]: 320,
  [PieceType.SILVER]: 450,
  [PieceType.GOLD]: 560,
  [PieceType.BISHOP]: 820,
  [PieceType.ROOK]: 1_020,
  [PieceType.KING]: 0,
  [PieceType.PROM_PAWN]: 540,
  [PieceType.PROM_LANCE]: 540,
  [PieceType.PROM_KNIGHT]: 540,
  [PieceType.PROM_SILVER]: 540,
  [PieceType.HORSE]: 1_060,
  [PieceType.DRAGON]: 1_260,
};

export function createShogiPosition(sfen?: string): Position {
  if (sfen) {
    const position = Position.newBySFEN(sfen);
    if (position) return position;
  }
  const position = new Position();
  position.reset(InitialPositionType.STANDARD);
  return position;
}

export function oppositeShogiColor(color: Color): Color {
  return reverseColor(color);
}

export function getShogiDifficultyDepth(difficulty: ShogiDifficulty): number {
  if (difficulty === "easy") return 1;
  if (difficulty === "hard") return 3;
  return 2;
}

export function shogiPieceLabel(type: PieceType): string {
  return SHOGI_PIECE_LABELS[type];
}

export function shogiColorName(color: Color): string {
  return color === Color.BLACK ? "先手" : "後手";
}

export function getShogiCells(position: Position, orientation: Color = Color.BLACK): ShogiCell[] {
  const cells: ShogiCell[] = [];
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const x = orientation === Color.BLACK ? col : 8 - col;
      const y = orientation === Color.BLACK ? row : 8 - row;
      const square = Square.newByXY(x, y);
      cells.push({
        square,
        usi: square.usi,
        row,
        col,
        file: square.file,
        rank: square.rank,
        piece: position.board.at(square),
      });
    }
  }
  return cells;
}

export function getShogiHandPieces(position: Position, color: Color): ShogiHandPiece[] {
  const hand = position.hand(color);
  return SHOGI_HAND_ORDER.map((type) => ({
    type,
    label: shogiPieceLabel(type),
    count: hand.count(type),
  })).filter((piece) => piece.count > 0);
}

function canPromoteMove(piece: Piece, from: Square, to: Square): boolean {
  return (
    isPromotable(piece.type) &&
    (isPromotableRank(piece.color, from.rank) || isPromotableRank(piece.color, to.rank))
  );
}

function addLegalMove(position: Position, move: Move | null, seen: Set<string>, moves: Move[]): void {
  if (!move || seen.has(move.usi)) return;
  if (!position.isValidMove(move)) return;
  seen.add(move.usi);
  moves.push(move);
}

export function getLegalShogiMoves(position: Position): Move[] {
  const moves: Move[] = [];
  const seen = new Set<string>();

  for (const from of position.board.listSquaresByColor(position.color)) {
    const piece = position.board.at(from);
    if (!piece) continue;

    for (const direction of movableDirections(piece)) {
      const moveType = resolveMoveType(piece, direction);
      if (!moveType) continue;
      const delta = directionToDeltaMap[direction];
      const maxStep = moveType === MoveType.LONG ? 8 : 1;

      for (let step = 1; step <= maxStep; step++) {
        const to = Square.newByXY(from.x + delta.x * step, from.y + delta.y * step);
        if (!to.valid) break;

        const occupant = position.board.at(to);
        if (occupant?.color === position.color) break;

        const base = position.createMove(from, to);
        addLegalMove(position, base, seen, moves);
        if (base && canPromoteMove(piece, from, to)) {
          addLegalMove(position, base.withPromote(), seen, moves);
        }
        if (occupant) break;
      }
    }
  }

  const hand = position.hand(position.color);
  for (const type of handPieceTypes) {
    if (hand.count(type) <= 0) continue;
    for (const to of Square.all) {
      if (position.board.at(to)) continue;
      addLegalMove(position, position.createMove(type, to), seen, moves);
    }
  }

  return moves;
}

export function formatShogiMove(position: Position, move: Move): string {
  return formatMove(position, move);
}

export function isShogiGameOver(position: Position): boolean {
  return getLegalShogiMoves(position).length === 0;
}

function shogiMoveOrderScore(move: Move): number {
  let score = 0;
  if (move.capturedPieceType) score += 10_000 + SHOGI_VALUES[move.capturedPieceType];
  if (move.promote) score += 900;
  if (!(move.from instanceof Square)) score += 40;
  score += SHOGI_VALUES[move.pieceType] / 100;
  return score;
}

function orderedShogiMoves(position: Position): Move[] {
  return getLegalShogiMoves(position).sort((a, b) => shogiMoveOrderScore(b) - shogiMoveOrderScore(a));
}

function boardProgress(piece: Piece, square: Square): number {
  return piece.color === Color.BLACK ? 8 - square.y : square.y;
}

export function evaluateShogi(position: Position, aiColor: Color): number {
  let score = 0;
  for (const square of position.board.listNonEmptySquares()) {
    const piece = position.board.at(square);
    if (!piece) continue;
    const sign = piece.color === aiColor ? 1 : -1;
    const progress = boardProgress(piece, square);
    const center = 4 - Math.abs(square.x - 4);
    score += sign * (SHOGI_VALUES[piece.type] + progress * 6 + center * 3);
  }

  for (const color of [Color.BLACK, Color.WHITE]) {
    const sign = color === aiColor ? 1 : -1;
    const hand = position.hand(color);
    for (const { type, count } of hand.counts) {
      score += sign * count * Math.round(SHOGI_VALUES[type] * 0.92);
    }
  }

  if (position.checked) {
    score += position.color === aiColor ? -90 : 90;
  }
  return score;
}

type SearchStats = { nodes: number; maxNodes: number };

function alphaBetaShogi(
  position: Position,
  depth: number,
  alpha: number,
  beta: number,
  aiColor: Color,
  stats: SearchStats
): number {
  stats.nodes++;
  const moves = orderedShogiMoves(position);
  if (moves.length === 0) {
    return position.color === aiColor ? -MATE_SCORE + stats.nodes : MATE_SCORE - stats.nodes;
  }
  if (depth <= 0 || stats.nodes >= stats.maxNodes) {
    return evaluateShogi(position, aiColor);
  }

  const maximizing = position.color === aiColor;
  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      if (!position.doMove(move)) continue;
      best = Math.max(best, alphaBetaShogi(position, depth - 1, alpha, beta, aiColor, stats));
      position.undoMove(move);
      alpha = Math.max(alpha, best);
      if (beta <= alpha || stats.nodes >= stats.maxNodes) break;
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    if (!position.doMove(move)) continue;
    best = Math.min(best, alphaBetaShogi(position, depth - 1, alpha, beta, aiColor, stats));
    position.undoMove(move);
    beta = Math.min(beta, best);
    if (beta <= alpha || stats.nodes >= stats.maxNodes) break;
  }
  return best;
}

export function chooseShogiAIMove(
  sfen: string,
  difficulty: ShogiDifficulty = "normal",
  rng?: Rng
): ShogiAIMove | null {
  const position = Position.newBySFEN(sfen);
  if (!position) return null;

  const aiColor = position.color;
  const depth = getShogiDifficultyDepth(difficulty);
  const stats: SearchStats = {
    nodes: 0,
    maxNodes: difficulty === "hard" ? 28_000 : difficulty === "normal" ? 9_000 : 2_500,
  };
  const moves = orderedShogiMoves(position);
  if (moves.length === 0) return null;

  let bestScore = -Infinity;
  let bestMoves: Move[] = [];
  for (const move of moves) {
    if (!position.doMove(move)) continue;
    const score = alphaBetaShogi(position, depth - 1, -Infinity, Infinity, aiColor, stats);
    position.undoMove(move);
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
  return { usi: best.usi, score: bestScore, nodes: stats.nodes };
}
