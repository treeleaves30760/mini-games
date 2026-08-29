import { describe, expect, it } from "vitest";
import {
  CHESS_LEVELS,
  chessPerft,
  chooseChessAIMove,
  createChessGame,
  evaluateChess,
  getChessCells,
  getChessDifficultyDepth,
  getChessLegalMoves,
  getChessLevel,
  getChessStatus,
  isChessPromotionMove,
  oppositeChessSide,
  squareFromRowCol,
  toChessMoveInput,
} from "~/games/chess";
import { makeRng } from "~/utils/rng";
import type { Chess } from "chess.js";

function chessJsPerft(chess: Chess, depth: number): number {
  if (depth === 0) return 1;
  let count = 0;
  for (const san of chess.moves()) {
    chess.move(san);
    count += chessJsPerft(chess, depth - 1);
    chess.undo();
  }
  return count;
}

describe("chess rules wrapper", () => {
  it("creates the standard 64-square opening board", () => {
    const chess = createChessGame();
    const cells = getChessCells(chess);

    expect(cells).toHaveLength(64);
    expect(cells.find((cell) => cell.square === "e1")?.piece).toEqual({ color: "w", type: "k" });
    expect(cells.find((cell) => cell.square === "d8")?.piece).toEqual({ color: "b", type: "q" });
  });

  it("orients the board for either player", () => {
    const chess = createChessGame();
    expect(getChessCells(chess, "w")[0].square).toBe("a8");
    expect(getChessCells(chess, "b")[0].square).toBe("h1");
    expect(squareFromRowCol(7, 0)).toBe("a1");
    expect(oppositeChessSide("w")).toBe("b");
    expect(oppositeChessSide("b")).toBe("w");
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

  it("builds chess.js move inputs with sensible promotion defaults", () => {
    expect(isChessPromotionMove({ piece: "p", to: "a8" })).toBe(true);
    expect(isChessPromotionMove({ piece: "p", to: "a1" })).toBe(true);
    expect(isChessPromotionMove({ piece: "n", to: "a8" })).toBe(false);

    expect(toChessMoveInput({ from: "e2", to: "e4", piece: "p" })).toEqual({ from: "e2", to: "e4" });
    expect(toChessMoveInput({ from: "a7", to: "a8", piece: "p" })).toEqual({ from: "a7", to: "a8", promotion: "q" });
    expect(toChessMoveInput({ from: "a7", to: "a8", piece: "p", promotion: "n" })).toEqual({ from: "a7", to: "a8", promotion: "n" });
    expect(toChessMoveInput({ from: "a7", to: "a8", piece: "p" }, "r")).toEqual({ from: "a7", to: "a8", promotion: "r" });
  });

  it("describes the game state in Chinese", () => {
    expect(getChessStatus(createChessGame())).toBe("白方回合");
    expect(getChessStatus(createChessGame("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"))).toBe("黑方回合");
    expect(getChessStatus(createChessGame("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"))).toBe("黑方將死白方");
    expect(getChessStatus(createChessGame("6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1".replace("R5K1", "6K1").replace("6k1", "R5k1")))).toBe("白方將死黑方");
    expect(getChessStatus(createChessGame("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"))).toBe("逼和");
    expect(getChessStatus(createChessGame("4k3/8/8/8/8/8/8/4KB2 w - - 0 1"))).toBe("和棋");
    expect(getChessStatus(createChessGame("4k3/8/8/8/8/8/8/r3K3 w - - 0 1"))).toBe("白方被將軍");
    expect(getChessStatus(createChessGame("4k3/8/8/8/8/8/8/R3K3 b - - 0 1".replace("R3K3", "4K3").replace("4k3", "R3k3")))).toBe("黑方被將軍");
  });

  it("evaluates material from either side", () => {
    const chess = createChessGame("4k3/8/8/8/8/8/8/4KQ2 w - - 0 1");

    expect(evaluateChess(chess, "w")).toBeGreaterThan(850);
    expect(evaluateChess(chess, "b")).toBeLessThan(-850);
  });

  it("scores dead draws as zero and penalises the side in check", () => {
    expect(evaluateChess(createChessGame("4k3/8/8/8/8/8/8/4KB2 w - - 0 1"), "w")).toBe(0);
    expect(evaluateChess(createChessGame("4k3/8/8/8/8/8/8/4KN2 b - - 0 1"), "b")).toBe(0);
    expect(evaluateChess(createChessGame("4k3/8/8/8/8/8/8/4KNN1 w - - 0 1"), "w")).toBeGreaterThan(0);

    // Same material and piece-square values; only the check differs.
    const quiet = createChessGame("4k3/8/8/8/8/8/8/3R2K1 b - - 0 1");
    const checked = createChessGame("4k3/8/8/8/8/8/8/4R1K1 b - - 0 1");
    expect(evaluateChess(checked, "b")).toBeLessThan(evaluateChess(quiet, "b"));
    expect(evaluateChess(checked, "w")).toBeGreaterThan(evaluateChess(quiet, "w"));
  });
});

describe("chess AI move generator", () => {
  it("matches the reference perft counts", () => {
    const cases: [string, number, number][] = [
      ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 3, 8_902],
      ["r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 3, 97_862],
      ["8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 4, 43_238],
      ["r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 3, 9_467],
      ["rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 3, 62_379],
      ["r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", 3, 89_890],
    ];
    for (const [fen, depth, expected] of cases) {
      expect(chessPerft(fen, depth), fen).toBe(expected);
    }
  });

  it("agrees with chess.js on en passant and castling positions", () => {
    const fens = [
      "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3",
      "rnbqkbnr/pppp1ppp/8/8/3Pp3/5N2/PPP1PPPP/RNBQKB1R b KQkq d3 0 3",
      "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
      "r3k2r/8/8/8/8/8/8/R3K2R b Kq - 0 1",
    ];
    for (const fen of fens) {
      expect(chessPerft(fen, 2), fen).toBe(chessJsPerft(createChessGame(fen), 2));
    }
  });

  it("ignores castling rights whose rook is gone", () => {
    expect(chessPerft("4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1", 1)).toBe(5);
  });
});

describe("chess AI", () => {
  it("exposes five levels of increasing depth", () => {
    expect(CHESS_LEVELS.map((level) => level.id)).toEqual(["easy", "normal", "hard", "expert", "master"]);
    expect(CHESS_LEVELS.map((level) => level.depth)).toEqual([1, 2, 3, 4, 5]);
    expect(getChessDifficultyDepth("master")).toBe(5);
    expect(getChessLevel("expert").quiescence).toBeGreaterThan(0);
    expect(CHESS_LEVELS.every((level) => level.timeLimitMs > 0 && level.maxNodes > 0)).toBe(true);
    expect(getChessLevel("bogus" as never).id).toBe("normal");
  });

  it("chooses a legal AI move", () => {
    const chess = createChessGame();
    const aiMove = chooseChessAIMove(chess.fen(), "w", "easy", makeRng(7));

    expect(aiMove).toBeTruthy();
    expect(aiMove!.depth).toBe(1);
    const applied = chess.move({
      from: aiMove!.from,
      to: aiMove!.to,
      promotion: aiMove!.promotion || "q",
    });
    expect(applied.color).toBe("w");
    expect(applied.san).toBe(aiMove!.san);
    expect(chess.history()).toHaveLength(1);
  });

  it("returns null when the game is over or it is not the AI's turn", () => {
    expect(chooseChessAIMove("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3", "w")).toBeNull();
    expect(chooseChessAIMove(createChessGame().fen(), "b")).toBeNull();
  });

  it("finds a back-rank mate in one and stops deepening", () => {
    const aiMove = chooseChessAIMove("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", "w", "hard");
    expect(aiMove?.san).toBe("Ra8#");
    expect(aiMove!.score).toBeGreaterThan(99_000);
    expect(aiMove!.depth).toBe(1);
  });

  it("finds a king-and-queen mate in two at depth three", () => {
    const fen = "7k/8/4K3/8/8/8/8/6Q1 w - - 0 1";
    const aiMove = chooseChessAIMove(fen, "w", "hard", makeRng(4));
    expect(aiMove!.score).toBeGreaterThan(99_000);
    expect(aiMove!.depth).toBe(3);

    const shallow = chooseChessAIMove(fen, "w", "normal", makeRng(4));
    expect(shallow!.score).toBeLessThan(99_000);
  });

  it("promotes to a queen when it can", () => {
    const aiMove = chooseChessAIMove("4k3/P7/8/8/8/8/8/4K3 w - - 0 1", "w", "easy");
    expect(aiMove?.promotion).toBe("q");
    expect(aiMove?.san).toBe("a8=Q+");
  });

  it("avoids stalemating the opponent", () => {
    const aiMove = chooseChessAIMove("7k/8/5Q2/6K1/8/8/8/8 w - - 0 1", "w", "normal", makeRng(1));
    expect(aiMove?.depth).toBe(2);
    expect(aiMove?.san).not.toBe("Qf7");
  });

  it("treats the fifty-move rule as a draw inside the search", () => {
    const aiMove = chooseChessAIMove("4k3/8/8/8/8/8/8/R3K3 w - - 99 60", "w", "normal", makeRng(1));
    expect(aiMove?.depth).toBe(2);
    expect(Math.abs(aiMove!.score)).toBe(0);
  });

  it("keeps the first iteration even when the node or time budget is exhausted", () => {
    const fen = createChessGame().fen();
    const starved = chooseChessAIMove(fen, "w", "master", makeRng(1), { maxNodes: 1 });
    expect(starved?.depth).toBe(1);

    const rushed = chooseChessAIMove(fen, "w", "master", makeRng(1), { timeLimitMs: 0 });
    expect(rushed?.depth).toBe(1);
  });

  /* Deep in the tree the budget can run out between two child nodes; the
     search then unwinds without letting a half-searched score win. */
  it("unwinds cleanly when the budget runs out mid-iteration", () => {
    const midgame = createChessGame();
    for (const san of ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7"]) midgame.move(san);

    const budgeted = chooseChessAIMove(midgame.fen(), "w", "master", makeRng(3), { maxNodes: 500 });
    expect(budgeted).toBeTruthy();
    expect(budgeted!.depth).toBeGreaterThanOrEqual(1);
    expect(budgeted!.depth).toBeLessThan(5);
    expect(midgame.move({ from: budgeted!.from, to: budgeted!.to, promotion: budgeted!.promotion })).toBeTruthy();
  });

  /* Black threatens Rb1#; only making luft for the king survives. Reaching the
     mate needs the search to score a checkmate above its horizon. */
  it("makes luft to escape a back-rank mate", () => {
    const fen = "1r5k/8/8/P7/8/8/r4PPP/6K1 w - - 0 1";
    const aiMove = chooseChessAIMove(fen, "w", "hard", makeRng(6));

    expect(["h3", "h4", "g3", "g4"]).toContain(aiMove!.san);
    expect(aiMove!.score).toBeGreaterThan(-99_000);
  });

  it("reports progress after every completed depth", () => {
    const seen: number[] = [];
    const aiMove = chooseChessAIMove(createChessGame().fen(), "w", "hard", makeRng(5), {
      onProgress: (info) => seen.push(info.depth),
    });
    expect(seen).toEqual([1, 2, 3]);
    expect(aiMove?.depth).toBe(3);
    expect(aiMove!.nodes).toBeGreaterThan(20);
  });

  it("is deterministic for a seed and varies between seeds", () => {
    const fen = createChessGame().fen();
    expect(chooseChessAIMove(fen, "w", "normal", makeRng(9))?.san).toBe(chooseChessAIMove(fen, "w", "normal", makeRng(9))?.san);
    expect(chooseChessAIMove(fen, "w", "hard")?.san).toBe(chooseChessAIMove(fen, "w", "hard")?.san);

    const picks = new Set(Array.from({ length: 12 }, (_, seed) => chooseChessAIMove(fen, "w", "easy", makeRng(seed + 1))?.san));
    expect(picks.size).toBeGreaterThan(1);
  });

  // Uncapped so the depth reached is the level's, not the CI machine's speed.
  it("searches the top levels on tactical middlegames", () => {
    const midgame = createChessGame();
    for (const san of ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7"]) midgame.move(san);
    const expert = chooseChessAIMove(midgame.fen(), "w", "expert", makeRng(2), { timeLimitMs: Infinity });
    expect(expert?.depth).toBe(4);
    expect(midgame.move({ from: expert!.from, to: expert!.to, promotion: expert!.promotion })).toBeTruthy();

    const tactical = createChessGame("r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 5");
    const master = chooseChessAIMove(tactical.fen(), "b", "master", makeRng(2), { timeLimitMs: Infinity });
    expect(master?.depth).toBe(5);
    expect(master!.nodes).toBeGreaterThan(expert!.nodes);
    expect(tactical.move({ from: master!.from, to: master!.to, promotion: master!.promotion })).toBeTruthy();

    const promotionRace = chooseChessAIMove("4k3/P7/8/8/8/8/8/4K3 b - - 0 1", "b", "expert", makeRng(2), { timeLimitMs: Infinity });
    expect(promotionRace?.depth).toBe(4);
  }, 60_000);

  it("handles checks and mates inside the quiescence search", () => {
    // Black's rook takes on e1 with mate unless white's king steps away first.
    const fen = "4r2k/8/8/8/8/8/P4PPP/4N1K1 w - - 0 1";
    const aiMove = chooseChessAIMove(fen, "w", "easy", undefined, { quiescence: 1 });
    expect(aiMove).toBeTruthy();
    expect(aiMove!.san).not.toBe("a3");
    expect(aiMove!.san).not.toBe("a4");
  });
});
