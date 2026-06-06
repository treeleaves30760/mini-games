import { describe, expect, it } from "vitest";
import {
  chooseShogiAIMove,
  createShogiPosition,
  getLegalShogiMoves,
  getShogiCells,
  getShogiHandPieces,
} from "~/games/shogi";
import { makeRng } from "~/utils/rng";
import { Color, InitialPositionType, Piece, PieceType, Position, Square } from "tsshogi";

describe("shogi rules wrapper", () => {
  it("creates the standard 9x9 opening board", () => {
    const position = createShogiPosition();
    const cells = getShogiCells(position);

    expect(cells).toHaveLength(81);
    expect(position.board.at(new Square(5, 9))?.type).toBe(PieceType.KING);
    expect(position.board.at(new Square(5, 1))?.type).toBe(PieceType.KING);
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
    const position = new Position();
    position.reset(InitialPositionType.EMPTY);
    position.board.set(new Square(5, 9), new Piece(Color.BLACK, PieceType.KING));
    position.board.set(new Square(5, 1), new Piece(Color.WHITE, PieceType.KING));
    position.board.set(new Square(8, 8), new Piece(Color.BLACK, PieceType.BISHOP));
    position.setColor(Color.BLACK);

    const moves = getLegalShogiMoves(position).map((move) => move.usi);
    expect(moves).toContain("8h2b");
    expect(moves).toContain("8h2b+");
  });

  it("filters illegal pawn drops on a file that already has an unpromoted pawn", () => {
    const position = new Position();
    position.reset(InitialPositionType.EMPTY);
    position.board.set(new Square(5, 9), new Piece(Color.BLACK, PieceType.KING));
    position.board.set(new Square(5, 1), new Piece(Color.WHITE, PieceType.KING));
    position.board.set(new Square(5, 7), new Piece(Color.BLACK, PieceType.PAWN));
    position.blackHand.set(PieceType.PAWN, 1);
    position.setColor(Color.BLACK);

    const moves = getLegalShogiMoves(position).map((move) => move.usi);
    expect(moves).not.toContain("P*5e");
    expect(moves).toContain("P*4e");
  });

  it("reports hand pieces in display order", () => {
    const position = new Position();
    position.reset(InitialPositionType.EMPTY);
    position.blackHand.set(PieceType.PAWN, 2);
    position.blackHand.set(PieceType.ROOK, 1);

    expect(getShogiHandPieces(position, Color.BLACK)).toEqual([
      { type: PieceType.ROOK, label: "飛", count: 1 },
      { type: PieceType.PAWN, label: "歩", count: 2 },
    ]);
  });

  it("chooses a legal AI move", () => {
    const position = createShogiPosition();
    const aiMove = chooseShogiAIMove(position.sfen, "easy", makeRng(11));

    expect(aiMove).toBeTruthy();
    const move = position.createMoveByUSI(aiMove!.usi);
    expect(move).toBeTruthy();
    expect(position.isValidMove(move!)).toBe(true);
  });
});
