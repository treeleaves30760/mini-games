import { describe, expect, it } from "vitest";
import {
  chooseChessAIMove,
  createChessGame,
  evaluateChess,
  getChessCells,
  getChessLegalMoves,
  toChessMoveInput,
} from "~/games/chess";
import { makeRng } from "~/utils/rng";

describe("chess rules wrapper", () => {
  it("creates the standard 64-square opening board", () => {
    const chess = createChessGame();
    const cells = getChessCells(chess);

    expect(cells).toHaveLength(64);
    expect(cells.find((cell) => cell.square === "e1")?.piece).toEqual({ color: "w", type: "k" });
    expect(cells.find((cell) => cell.square === "d8")?.piece).toEqual({ color: "b", type: "q" });
  });

  it("lists legal opening moves through chess.js", () => {
    const chess = createChessGame();

    expect(getChessLegalMoves(chess)).toHaveLength(20);
    expect(getChessLegalMoves(chess, "e2").map((move) => move.to).sort()).toEqual(["e3", "e4"]);
  });

  it("keeps promotion moves explicit", () => {
    const chess = createChessGame("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    const promotions = getChessLegalMoves(chess, "a7").filter((move) => move.to === "a8");

    expect(promotions.map((move) => move.promotion).sort()).toEqual(["b", "n", "q", "r"]);

    const queenMove = promotions.find((move) => move.promotion === "q");
    expect(queenMove).toBeTruthy();
    chess.move(toChessMoveInput(queenMove!));
    expect(chess.get("a8")).toEqual({ color: "w", type: "q" });
  });

  it("evaluates material from either side", () => {
    const chess = createChessGame("4k3/8/8/8/8/8/8/4KQ2 w - - 0 1");

    expect(evaluateChess(chess, "w")).toBeGreaterThan(850);
    expect(evaluateChess(chess, "b")).toBeLessThan(-850);
  });

  it("chooses a legal AI move", () => {
    const chess = createChessGame();
    const aiMove = chooseChessAIMove(chess.fen(), "w", "easy", makeRng(7));

    expect(aiMove).toBeTruthy();
    const applied = chess.move({
      from: aiMove!.from,
      to: aiMove!.to,
      promotion: aiMove!.promotion || "q",
    });
    expect(applied.color).toBe("w");
    expect(chess.history()).toHaveLength(1);
  });
});
