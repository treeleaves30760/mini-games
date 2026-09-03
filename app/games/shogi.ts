/* Japanese shogi — legality powered by tsshogi, AI kept framework-free.
   tsshogi validates the hard rules; this module generates candidates and
   applies a deterministic rule-based negamax (alpha-beta) evaluator around
   it: iterative deepening, transposition table, killer/history ordering and
   a capture-only quiescence search for the higher difficulty levels. */

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

export type ShogiDifficulty = "easy" | "normal" | "hard" | "expert" | "master";

export type ShogiLevel = {
  id: ShogiDifficulty;
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
  /** Wall-clock budget in ms — the real safety net (see SHOGI_LEVELS). */
  timeLimitMs: number;
  /** Short description shown under the selector. */
  note: string;
};

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
  /** Deepest fully completed search depth. */
  depth: number;
  timeMs: number;
};

export type ShogiSearchOptions = {
  /** Override the level's node budget. */
  maxNodes?: number;
  /** Override the level's quiescence depth. */
  quiescence?: number;
  /** Override the level's wall-clock cap (Infinity to search uncapped). */
  timeLimitMs?: number;
  /** Called after every completed iteration. */
  onProgress?: (info: ShogiAIMove) => void;
};

const MATE_SCORE = 100_000;
const MATE_BOUND = MATE_SCORE - 1_000;
const MAX_PLY = 64;
const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;

/* Depth is the headline setting; the two budgets are safety nets. A node
   budget alone is not enough: a position where both sides hold several pieces
   in hand generates 150+ legal drops per node and each one costs a full
   tsshogi validation, so the same node count can take 100x longer than in the
   opening. The wall-clock limit is what keeps the AI responsive there — it
   returns the deepest iteration that actually finished. */
export const SHOGI_LEVELS: readonly ShogiLevel[] = [
  { id: "easy", label: "輕量", short: "輕", depth: 1, quiescence: 0, maxNodes: 4_000, timeLimitMs: 2_000, note: "只看一手，適合熟悉規則" },
  { id: "normal", label: "標準", short: "中", depth: 2, quiescence: 0, maxNodes: 12_000, timeLimitMs: 2_000, note: "會預想你的下一手" },
  { id: "hard", label: "強化", short: "強", depth: 3, quiescence: 0, maxNodes: 40_000, timeLimitMs: 3_000, note: "三層搜尋，反應仍即時" },
  { id: "expert", label: "專家", short: "專", depth: 4, quiescence: 4, maxNodes: 150_000, timeLimitMs: 5_000, note: "四層＋吃子延伸，約需 1 秒" },
  { id: "master", label: "大師", short: "師", depth: 5, quiescence: 6, maxNodes: 450_000, timeLimitMs: 9_000, note: "五層＋吃子延伸，複雜局面需要數秒" },
];

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

export function getShogiLevel(difficulty: ShogiDifficulty): ShogiLevel {
  return SHOGI_LEVELS.find((level) => level.id === difficulty) ?? SHOGI_LEVELS[1];
}

export function getShogiDifficultyDepth(difficulty: ShogiDifficulty): number {
  return getShogiLevel(difficulty).depth;
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

function addLegalMove(position: Position, move: Move, moves: Move[]): void {
  if (position.isValidMove(move)) moves.push(move);
}

/* Candidate generation walks each piece's movable directions and lets tsshogi
   validate the result (pins, drop rules, pawn-drop mate). With `capturesOnly`
   the walk skips quiet moves and drops entirely — used by quiescence search. */
function generateShogiMoves(position: Position, capturesOnly: boolean): Move[] {
  const moves: Move[] = [];
  const color = position.color;

  for (const from of position.board.listSquaresByColor(color)) {
    const piece = position.board.at(from) as Piece;
    for (const direction of movableDirections(piece)) {
      const delta = directionToDeltaMap[direction];
      const maxStep = resolveMoveType(piece, direction) === MoveType.LONG ? 8 : 1;

      for (let step = 1; step <= maxStep; step++) {
        const to = Square.newByXY(from.x + delta.x * step, from.y + delta.y * step);
        if (!to.valid) break;

        const occupant = position.board.at(to);
        if (occupant?.color === color) break;
        if (occupant || !capturesOnly) {
          const base = position.createMove(from, to) as Move;
          addLegalMove(position, base, moves);
          if (canPromoteMove(piece, from, to)) addLegalMove(position, base.withPromote(), moves);
        }
        if (occupant) break;
      }
    }
  }

  if (capturesOnly) return moves;

  const hand = position.hand(color);
  for (const type of handPieceTypes) {
    if (hand.count(type) <= 0) continue;
    for (const to of Square.all) {
      if (position.board.at(to)) continue;
      addLegalMove(position, position.createMove(type, to) as Move, moves);
    }
  }

  return moves;
}

export function getLegalShogiMoves(position: Position): Move[] {
  return generateShogiMoves(position, false);
}

export function getShogiCaptureMoves(position: Position): Move[] {
  return generateShogiMoves(position, true);
}

export function formatShogiMove(position: Position, move: Move): string {
  return formatMove(position, move);
}

export function isShogiGameOver(position: Position): boolean {
  return getLegalShogiMoves(position).length === 0;
}

function boardProgress(piece: Piece, square: Square): number {
  return piece.color === Color.BLACK ? 8 - square.y : square.y;
}

/** Static evaluation from `color`'s point of view (material, advancement,
    centralisation, pieces in hand and a small check penalty). */
export function evaluateShogi(position: Position, color: Color): number {
  let score = 0;
  for (const square of position.board.listNonEmptySquares()) {
    const piece = position.board.at(square) as Piece;
    const sign = piece.color === color ? 1 : -1;
    const progress = boardProgress(piece, square);
    const center = 4 - Math.abs(square.x - 4);
    score += sign * (SHOGI_VALUES[piece.type] + progress * 6 + center * 3);
  }

  for (const side of [Color.BLACK, Color.WHITE]) {
    const sign = side === color ? 1 : -1;
    for (const { type, count } of position.hand(side).counts) {
      score += sign * count * Math.round(SHOGI_VALUES[type] * 0.92);
    }
  }

  if (position.checked) {
    score += position.color === color ? -90 : 90;
  }
  return score;
}

/* ---------------------------------------------------------------------- */
/* Search                                                                  */
/* ---------------------------------------------------------------------- */

type TTEntry = { depth: number; score: number; flag: number; usi: string };

type SearchContext = {
  nodes: number;
  maxNodes: number;
  deadline: number;
  iteration: number;
  aborted: boolean;
  qdepth: number;
  killers: string[][];
  history: Map<string, number>;
  tt: Map<string, TTEntry>;
};

type RootMove = { move: Move; score: number };

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

function recordKiller(killers: string[], usi: string): void {
  if (killers[0] === usi) return;
  killers[1] = killers[0];
  killers[0] = usi;
}

function shogiMoveOrderScore(
  move: Move,
  ttMove: string | undefined,
  killers: string[],
  history: Map<string, number>
): number {
  if (move.usi === ttMove) return 1_000_000;
  let score = 0;
  if (move.capturedPieceType) {
    score += 10_000 + SHOGI_VALUES[move.capturedPieceType] * 10 - SHOGI_VALUES[move.pieceType] / 10;
  }
  if (move.promote) score += 900;
  if (killers.includes(move.usi)) score += 5_000;
  score += Math.min(history.get(move.usi) ?? 0, 4_000);
  if (typeof move.from === "string") score += 40;
  score += SHOGI_VALUES[move.pieceType] / 100;
  return score;
}

function orderShogiMoves(
  moves: Move[],
  ttMove: string | undefined,
  killers: string[],
  history: Map<string, number>
): Move[] {
  const scored = moves.map((move) => ({ move, key: shogiMoveOrderScore(move, ttMove, killers, history) }));
  scored.sort((a, b) => b.key - a.key);
  return scored.map((entry) => entry.move);
}

function quiescenceShogi(
  position: Position,
  alpha: number,
  beta: number,
  ply: number,
  qdepth: number,
  ctx: SearchContext
): number {
  if (outOfBudget(ctx)) return 0;
  ctx.nodes++;

  let moves: Move[];
  let best: number;
  if (position.checked) {
    // In check: every legal reply is an evasion — no stand-pat allowed.
    moves = getLegalShogiMoves(position);
    if (moves.length === 0) return -MATE_SCORE + ply;
    if (qdepth <= 0) return evaluateShogi(position, position.color);
    moves = orderShogiMoves(moves, undefined, ctx.killers[ply], ctx.history);
    best = -Infinity;
  } else {
    best = evaluateShogi(position, position.color);
    if (qdepth <= 0 || best >= beta) return best;
    if (best > alpha) alpha = best;
    moves = orderShogiMoves(getShogiCaptureMoves(position), undefined, ctx.killers[ply], ctx.history);
  }

  for (const move of moves) {
    position.doMove(move, { ignoreValidation: true });
    const score = -quiescenceShogi(position, -beta, -alpha, ply + 1, qdepth - 1, ctx);
    position.undoMove(move);
    if (ctx.aborted) return 0;
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function negamaxShogi(
  position: Position,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  ctx: SearchContext
): number {
  if (outOfBudget(ctx)) return 0;
  ctx.nodes++;

  if (depth <= 0) {
    if (ctx.qdepth > 0) return quiescenceShogi(position, alpha, beta, ply, ctx.qdepth, ctx);
    if (position.checked && getLegalShogiMoves(position).length === 0) return -MATE_SCORE + ply;
    return evaluateShogi(position, position.color);
  }

  const key = position.sfen;
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
  const moves = orderShogiMoves(getLegalShogiMoves(position), entry?.usi, killers, ctx.history);
  if (moves.length === 0) return -MATE_SCORE + ply;

  let best = -Infinity;
  let bestUsi = "";
  let flag = TT_UPPER;
  for (const move of moves) {
    position.doMove(move, { ignoreValidation: true });
    const score = -negamaxShogi(position, depth - 1, -beta, -alpha, ply + 1, ctx);
    position.undoMove(move);
    if (ctx.aborted) return 0;

    if (score > best) {
      best = score;
      bestUsi = move.usi;
    }
    if (score > alpha) {
      alpha = score;
      flag = TT_EXACT;
    }
    if (alpha >= beta) {
      flag = TT_LOWER;
      if (!move.capturedPieceType) {
        recordKiller(killers, move.usi);
        ctx.history.set(move.usi, (ctx.history.get(move.usi) ?? 0) + depth * depth);
      }
      break;
    }
  }

  ctx.tt.set(key, { depth, score: mateAdjust(best, ply), flag, usi: bestUsi });
  return best;
}

/* One iteration at the root. Returns false when the budget ran out midway (the
   caller then keeps the previous iteration's answer). Root moves end up sorted
   best-first, which is also the move ordering for the next iteration. */
function searchShogiRoot(position: Position, rootMoves: RootMove[], depth: number, ctx: SearchContext): boolean {
  let alpha = -Infinity;
  for (const root of rootMoves) {
    position.doMove(root.move, { ignoreValidation: true });
    const score = -negamaxShogi(position, depth - 1, -Infinity, -alpha, 1, ctx);
    position.undoMove(root.move);
    if (ctx.aborted) return false;
    root.score = score;
    if (score > alpha) alpha = score;
  }
  rootMoves.sort((a, b) => b.score - a.score);
  return true;
}

export function chooseShogiAIMove(
  sfen: string,
  difficulty: ShogiDifficulty = "normal",
  rng?: Rng,
  options: ShogiSearchOptions = {}
): ShogiAIMove | null {
  const position = Position.newBySFEN(sfen);
  if (!position) return null;

  const rootMoves: RootMove[] = getLegalShogiMoves(position).map((move) => ({ move, score: 0 }));
  if (rootMoves.length === 0) return null;
  // Shuffling first makes ties between equally good moves land on a random one.
  rng?.shuffle(rootMoves);

  const level = getShogiLevel(difficulty);
  const started = Date.now();
  const ctx: SearchContext = {
    nodes: 0,
    maxNodes: options.maxNodes ?? level.maxNodes,
    deadline: started + (options.timeLimitMs ?? level.timeLimitMs),
    iteration: 0,
    aborted: false,
    qdepth: options.quiescence ?? level.quiescence,
    killers: Array.from({ length: MAX_PLY }, () => []),
    history: new Map(),
    tt: new Map(),
  };

  let result: ShogiAIMove | null = null;
  for (let depth = 1; depth <= level.depth; depth++) {
    ctx.iteration = depth;
    // Never start an iteration the clock cannot pay for.
    if (depth > 1 && Date.now() >= ctx.deadline) break;
    if (!searchShogiRoot(position, rootMoves, depth, ctx)) break;
    const best = rootMoves[0];
    result = { usi: best.move.usi, score: best.score, nodes: ctx.nodes, depth, timeMs: Date.now() - started };
    options.onProgress?.(result);
    if (Math.abs(best.score) >= MATE_BOUND) break;
  }
  return result;
}
