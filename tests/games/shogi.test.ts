import { describe, expect, it } from "vitest";
import {
  SHOGI_LEVELS,
  chooseShogiAIMove,
  createShogiPosition,
  evaluateShogi,
  formatShogiMove,
  getLegalShogiMoves,
  getShogiCaptureMoves,
  getShogiCells,
  getShogiDifficultyDepth,
  getShogiHandPieces,
  getShogiLevel,
  isShogiGameOver,
  oppositeShogiColor,
  shogiColorName,
} from "~/games/shogi";
import { makeRng } from "~/utils/rng";
import { Color, InitialPositionType, Piece, PieceType, Position, Square } from "tsshogi";

function emptyPosition(color: Color = Color.BLACK): Position {
  const position = new Position();
  position.reset(InitialPositionType.EMPTY);
  position.setColor(color);
  return position;
}

function put(position: Position, file: number, rank: number, color: Color, type: PieceType): void {
  position.board.set(new Square(file, rank), new Piece(color, type));
}

function playUSI(position: Position, moves: string[]): Position {
  for (const usi of moves) {
    const move = position.createMoveByUSI(usi);
    expect(move, usi).toBeTruthy();
    expect(position.doMove(move!), usi).toBe(true);
  }
  return position;
}

/* Black to move, mated: king boxed in the 1i corner by two white golds. */
function matedPosition(): Position {
  const position = emptyPosition();
  put(position, 1, 9, Color.BLACK, PieceType.KING);
  put(position, 2, 8, Color.WHITE, PieceType.GOLD);
  put(position, 2, 7, Color.WHITE, PieceType.GOLD);
  put(position, 5, 1, Color.WHITE, PieceType.KING);
  return position;
}

/* Black to move: G*1b is mate (silver on 2c guards the drop). */
function mateInOnePosition(): Position {
  const position = emptyPosition();
  put(position, 1, 1, Color.WHITE, PieceType.KING);
  put(position, 2, 3, Color.BLACK, PieceType.SILVER);
  put(position, 9, 9, Color.BLACK, PieceType.KING);
  position.blackHand.set(PieceType.GOLD, 1);
  return position;
}

/* Black to move: S2d-2c forces K-2a, then G*2b mates. */
function mateInTwoPosition(): Position {
  const position = emptyPosition();
  put(position, 1, 1, Color.WHITE, PieceType.KING);
  put(position, 2, 4, Color.BLACK, PieceType.SILVER);
  put(position, 9, 9, Color.BLACK, PieceType.KING);
  position.blackHand.set(PieceType.GOLD, 1);
  return position;
}

const MIDGAME = ["7g7f", "3c3d", "2g2f", "8c8d", "2f2e", "8d8e", "6i7h", "4a3b", "2e2d", "2c2d", "2h2d", "8e8f", "8g8f", "8b8f"];

describe("shogi rules wrapper", () => {
  it("creates the standard 9x9 opening board", () => {
    const position = createShogiPosition();
    const cells = getShogiCells(position);

    expect(cells).toHaveLength(81);
    expect(position.board.at(new Square(5, 9))?.type).toBe(PieceType.KING);
    expect(position.board.at(new Square(5, 1))?.type).toBe(PieceType.KING);
  });

  it("accepts a custom SFEN and falls back to the standard opening on garbage", () => {
    const custom = createShogiPosition(mateInOnePosition().sfen);
    expect(custom.board.at(new Square(2, 3))?.type).toBe(PieceType.SILVER);

    const fallback = createShogiPosition("this is not an sfen");
    expect(fallback.sfen).toBe(createShogiPosition().sfen);
  });

  it("orients the board for either player", () => {
    const position = createShogiPosition();
    expect(getShogiCells(position, Color.BLACK)[0].usi).toBe("9a");
    expect(getShogiCells(position, Color.WHITE)[0].usi).toBe("1i");
  });

  it("generates the standard legal opening moves", () => {
    const position = createShogiPosition();
    const moves = getLegalShogiMoves(position).map((move) => move.usi);

    expect(moves).toHaveLength(30);
    expect(moves).toContain("7g7f");
    expect(moves).toContain("2h7h");
  });

  it("applies a legal move and flips the turn", () => {
    const position = createShogiPosition();
    const move = position.createMoveByUSI("7g7f");

    expect(move).toBeTruthy();
    expect(position.doMove(move!)).toBe(true);
    expect(position.color).toBe(Color.WHITE);
    expect(position.board.at(new Square(7, 6))?.type).toBe(PieceType.PAWN);
  });

  it("includes optional promotion variants when legal", () => {
    const position = emptyPosition();
    put(position, 5, 9, Color.BLACK, PieceType.KING);
    put(position, 5, 1, Color.WHITE, PieceType.KING);
    put(position, 8, 8, Color.BLACK, PieceType.BISHOP);

    const moves = getLegalShogiMoves(position).map((move) => move.usi);
    expect(moves).toContain("8h2b");
    expect(moves).toContain("8h2b+");
  });

  it("filters illegal pawn drops on a file that already has an unpromoted pawn", () => {
    const position = emptyPosition();
    put(position, 5, 9, Color.BLACK, PieceType.KING);
    put(position, 5, 1, Color.WHITE, PieceType.KING);
    put(position, 5, 7, Color.BLACK, PieceType.PAWN);
    position.blackHand.set(PieceType.PAWN, 1);

    const moves = getLegalShogiMoves(position).map((move) => move.usi);
    expect(moves).not.toContain("P*5e");
    expect(moves).toContain("P*4e");
  });

  it("lists capture moves only, as a subset of the legal moves", () => {
    expect(getShogiCaptureMoves(createShogiPosition())).toHaveLength(0);

    const position = emptyPosition();
    put(position, 5, 9, Color.BLACK, PieceType.KING);
    put(position, 5, 1, Color.WHITE, PieceType.KING);
    put(position, 5, 5, Color.BLACK, PieceType.ROOK);
    put(position, 5, 3, Color.WHITE, PieceType.PAWN);
    put(position, 3, 5, Color.WHITE, PieceType.PAWN);

    const captures = getShogiCaptureMoves(position);
    expect(captures.map((move) => move.usi).sort()).toEqual(["5e3e", "5e5c", "5e5c+"]);
    expect(captures.every((move) => move.capturedPieceType === PieceType.PAWN)).toBe(true);

    const legal = new Set(getLegalShogiMoves(position).map((move) => move.usi));
    expect(captures.every((move) => legal.has(move.usi))).toBe(true);
  });

  it("reports hand pieces in display order", () => {
    const position = emptyPosition();
    position.blackHand.set(PieceType.PAWN, 2);
    position.blackHand.set(PieceType.ROOK, 1);

    expect(getShogiHandPieces(position, Color.BLACK)).toEqual([
      { type: PieceType.ROOK, label: "飛", count: 1 },
      { type: PieceType.PAWN, label: "歩", count: 2 },
    ]);
  });

  it("formats moves, names sides and detects the end of the game", () => {
    const position = createShogiPosition();
    const move = position.createMoveByUSI("7g7f")!;
    expect(formatShogiMove(position, move)).toContain("歩");

    expect(shogiColorName(Color.BLACK)).toBe("先手");
    expect(shogiColorName(Color.WHITE)).toBe("後手");
    expect(oppositeShogiColor(Color.BLACK)).toBe(Color.WHITE);

    expect(isShogiGameOver(position)).toBe(false);
    expect(isShogiGameOver(matedPosition())).toBe(true);
  });

  it("evaluates material, hands and checks from either side", () => {
    const quiet = emptyPosition();
    put(quiet, 5, 9, Color.BLACK, PieceType.KING);
    put(quiet, 5, 1, Color.WHITE, PieceType.KING);
    put(quiet, 4, 1, Color.WHITE, PieceType.ROOK);
    quiet.blackHand.set(PieceType.GOLD, 2);

    const black = evaluateShogi(quiet, Color.BLACK);
    expect(black).toBe(-evaluateShogi(quiet, Color.WHITE));
    expect(black).toBeGreaterThan(0); // two golds in hand outweigh a rook

    const checked = emptyPosition();
    put(checked, 5, 9, Color.BLACK, PieceType.KING);
    put(checked, 5, 1, Color.WHITE, PieceType.KING);
    put(checked, 5, 2, Color.WHITE, PieceType.ROOK);
    checked.blackHand.set(PieceType.GOLD, 2);
    expect(checked.checked).toBe(true);
    expect(evaluateShogi(checked, Color.BLACK)).toBeLessThan(black);
    expect(evaluateShogi(checked, Color.WHITE)).toBeGreaterThan(-black);
  });
});

describe("shogi AI", () => {
  it("exposes five levels of increasing depth", () => {
    expect(SHOGI_LEVELS.map((level) => level.id)).toEqual(["easy", "normal", "hard", "expert", "master"]);
    expect(SHOGI_LEVELS.map((level) => level.depth)).toEqual([1, 2, 3, 4, 5]);
    expect(getShogiDifficultyDepth("master")).toBe(5);
    expect(getShogiLevel("expert").quiescence).toBeGreaterThan(0);
    expect(SHOGI_LEVELS.every((level) => level.timeLimitMs > 0 && level.maxNodes > 0)).toBe(true);
    expect(getShogiLevel("bogus" as never).id).toBe("normal");
  });

  it("chooses a legal AI move", () => {
    const position = createShogiPosition();
    const aiMove = chooseShogiAIMove(position.sfen, "easy", makeRng(11));

    expect(aiMove).toBeTruthy();
    expect(aiMove!.depth).toBe(1);
    const move = position.createMoveByUSI(aiMove!.usi);
    expect(move).toBeTruthy();
    expect(position.isValidMove(move!)).toBe(true);
  });

  it("returns null for an invalid SFEN or a position with no legal moves", () => {
    expect(chooseShogiAIMove("garbage")).toBeNull();
    expect(chooseShogiAIMove(matedPosition().sfen, "hard")).toBeNull();
  });

  it("finds a mate in one and stops deepening", () => {
    const position = mateInOnePosition();
    const aiMove = chooseShogiAIMove(position.sfen, "hard");
    expect(aiMove!.score).toBeGreaterThan(99_000);
    expect(aiMove!.depth).toBe(1);

    // Both gold drops next to the king mate — assert the mate, not one of them.
    playUSI(position, [aiMove!.usi]);
    expect(isShogiGameOver(position)).toBe(true);
  });

  it("finds a mate in two at depth three", () => {
    const aiMove = chooseShogiAIMove(mateInTwoPosition().sfen, "hard", makeRng(3));
    // Promoting the silver mates just as fast, so only the advance is fixed.
    expect(aiMove!.usi.startsWith("2d2c")).toBe(true);
    expect(aiMove!.score).toBeGreaterThan(99_000);
    expect(aiMove!.depth).toBe(3);

    // Depth two is not enough to see it.
    const shallow = chooseShogiAIMove(mateInTwoPosition().sfen, "normal", makeRng(3));
    expect(shallow!.score).toBeLessThan(99_000);
  });

  it("keeps the first iteration even when the node or time budget is exhausted", () => {
    const sfen = createShogiPosition().sfen;
    const starved = chooseShogiAIMove(sfen, "master", makeRng(1), { maxNodes: 1 });
    expect(starved?.depth).toBe(1);

    const rushed = chooseShogiAIMove(sfen, "master", makeRng(1), { timeLimitMs: 0 });
    expect(rushed?.depth).toBe(1);
  });

  /* Deep in the tree the budget can run out between two child nodes; the
     search then unwinds without letting a half-searched score win. */
  it("unwinds cleanly when the budget runs out mid-iteration", () => {
    const midgame = playUSI(createShogiPosition(), MIDGAME);
    const budgeted = chooseShogiAIMove(midgame.sfen, "master", makeRng(3), { maxNodes: 500 });

    expect(budgeted).toBeTruthy();
    expect(budgeted!.depth).toBeGreaterThanOrEqual(1);
    expect(budgeted!.depth).toBeLessThan(5);
    expect(midgame.isValidMove(midgame.createMoveByUSI(budgeted!.usi)!)).toBe(true);

    // A long capture chain: this budget runs out inside the quiescence search.
    const inQuiescence = chooseShogiAIMove(midgame.sfen, "normal", makeRng(3), {
      quiescence: 8,
      maxNodes: 1_500,
    });
    expect(inQuiescence).toBeTruthy();
    expect(midgame.isValidMove(midgame.createMoveByUSI(inQuiescence!.usi)!)).toBe(true);
  });

  /* Gx2h would be mate (the lance on 2d covers the gold), so the pawn has to
     take the gold first. Every quiet alternative is mated above the horizon. */
  it("parries a mate threat instead of playing a quiet move", () => {
    const position = emptyPosition();
    put(position, 1, 9, Color.BLACK, PieceType.KING);
    put(position, 2, 1, Color.BLACK, PieceType.ROOK);
    put(position, 2, 8, Color.BLACK, PieceType.PAWN);
    put(position, 2, 7, Color.WHITE, PieceType.GOLD);
    put(position, 2, 4, Color.WHITE, PieceType.LANCE);
    put(position, 9, 1, Color.WHITE, PieceType.KING);

    // Confirm the threat is real: after a quiet rook move White mates at once.
    const quiet = createShogiPosition(position.sfen);
    playUSI(quiet, ["2a9a"]);
    expect(chooseShogiAIMove(quiet.sfen, "normal", makeRng(6))!.score).toBeGreaterThan(99_000);

    const aiMove = chooseShogiAIMove(position.sfen, "hard", makeRng(6));
    expect(aiMove!.usi).toBe("2h2g");
    expect(aiMove!.score).toBeGreaterThan(0);
  });

  it("reports progress after every completed depth", () => {
    const seen: number[] = [];
    const aiMove = chooseShogiAIMove(createShogiPosition().sfen, "hard", makeRng(5), {
      onProgress: (info) => seen.push(info.depth),
    });
    expect(seen).toEqual([1, 2, 3]);
    expect(aiMove?.depth).toBe(3);
    expect(aiMove!.nodes).toBeGreaterThan(30);
  });

  it("is deterministic for a seed and varies between seeds", () => {
    const sfen = createShogiPosition().sfen;
    expect(chooseShogiAIMove(sfen, "normal", makeRng(9))?.usi).toBe(chooseShogiAIMove(sfen, "normal", makeRng(9))?.usi);
    expect(chooseShogiAIMove(sfen, "hard")?.usi).toBe(chooseShogiAIMove(sfen, "hard")?.usi);

    const picks = new Set(Array.from({ length: 12 }, (_, seed) => chooseShogiAIMove(sfen, "easy", makeRng(seed + 1))?.usi));
    expect(picks.size).toBeGreaterThan(1);
  });

  // Uncapped so the depth reached is the level's, not the CI machine's speed.
  it("searches the top levels on tactical middlegames", () => {
    const midgame = playUSI(createShogiPosition(), MIDGAME);
    const expert = chooseShogiAIMove(midgame.sfen, "expert", makeRng(2), { timeLimitMs: Infinity });
    expect(expert?.depth).toBe(4);
    expect(midgame.createMoveByUSI(expert!.usi)).toBeTruthy();

    const hands = createShogiPosition("ln1g1g1nl/1r3k1b1/p1pppp1pp/6p2/1p7/2P4P1/PP1PPPP1P/1B3S1R1/LNSGKG1NL b Ps 1");
    const master = chooseShogiAIMove(hands.sfen, "master", makeRng(2), { timeLimitMs: Infinity });
    expect(master?.depth).toBe(5);
    expect(master!.nodes).toBeGreaterThan(expert!.nodes);
    expect(hands.isValidMove(hands.createMoveByUSI(master!.usi)!)).toBe(true);
  }, 60_000);

  /* A hand full of pieces makes every node ~100x more expensive (150+ drops,
     each fully validated), so the node budget alone would let a deep level
     think for many seconds. The clock is what actually stops it — here with a
     short explicit budget standing in for the level's own. */
  it("falls back to a shallower depth when the time budget runs out", () => {
    const dropHeavy = "4k4/9/9/9/9/9/9/9/4K4 b RGSNLP2rb2g2s2n2l2p 1";
    const started = Date.now();
    const aiMove = chooseShogiAIMove(dropHeavy, "master", makeRng(2), { timeLimitMs: 400 });
    const elapsed = Date.now() - started;

    expect(aiMove).toBeTruthy();
    expect(aiMove!.depth).toBeLessThan(getShogiLevel("master").depth);
    expect(aiMove!.nodes).toBeLessThan(getShogiLevel("master").maxNodes); // nodes were not the limiter
    expect(elapsed).toBeLessThan(5_000);
  }, 60_000);

  it("handles checks and mates inside the quiescence search", () => {
    // White's rook can capture on the 1-file with mate unless black frees a
    // flight square first — both outcomes are reached with a 1-ply extension.
    const position = emptyPosition();
    put(position, 1, 9, Color.BLACK, PieceType.KING);
    put(position, 2, 8, Color.BLACK, PieceType.PAWN);
    put(position, 2, 9, Color.BLACK, PieceType.ROOK);
    put(position, 1, 5, Color.BLACK, PieceType.PAWN);
    put(position, 1, 1, Color.WHITE, PieceType.ROOK);
    put(position, 9, 1, Color.WHITE, PieceType.KING);

    const aiMove = chooseShogiAIMove(position.sfen, "easy", undefined, { quiescence: 1 });
    expect(aiMove).toBeTruthy();
    expect(aiMove!.usi).not.toBe("1e1d");
  });
});
