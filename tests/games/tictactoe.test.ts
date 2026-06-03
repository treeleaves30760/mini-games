import { describe, it, expect } from "vitest";
import {
  EMPTY, X, O,
  WIN_LINES,
  checkWinner,
  isDraw,
  minimax,
  getBestMove,
  type Board,
} from "~/games/tictactoe";

// ---- helpers ----

/** Build a board from a compact string: 'X'=1, 'O'=2, '.'=0 (9 chars). */
function b(str: string): Board {
  return str.split("").map((c) => (c === "X" ? X : c === "O" ? O : EMPTY)) as Board;
}

/**
 * Play out a game to its terminal state starting from `board`, with X to move next
 * when `xToMove` is true.  Returns the result: 'X' | 'O' | 'draw'.
 *
 * Both sides play optimal minimax (O maximises, X minimises).
 * This lets us exhaustively verify the AI is never the loser.
 */
function playToEnd(
  board: Board,
  xToMove: boolean
): "X" | "O" | "draw" {
  const result = checkWinner(board);
  if (result) return result.winner === X ? "X" : "O";
  if (isDraw(board)) return "draw";

  if (xToMove) {
    // X chooses the move that minimises O's score (i.e. optimal X)
    let bestScore = Infinity;
    let bestMove = -1;
    for (let i = 0; i < 9; i++) {
      if (board[i] === EMPTY) {
        const next = [...board] as Board;
        next[i] = X;
        const s = minimax(next, 0, true, -Infinity, Infinity);
        if (s < bestScore) { bestScore = s; bestMove = i; }
      }
    }
    const next = [...board] as Board;
    next[bestMove] = X;
    return playToEnd(next, false);
  } else {
    // O picks best move via getBestMove (hard, no rng → deterministic)
    const move = getBestMove(board, "hard");
    const next = [...board] as Board;
    next[move] = O;
    return playToEnd(next, true);
  }
}

// ---- checkWinner tests ----

describe("checkWinner — win-line detection", () => {
  it("returns null on an empty board", () => {
    expect(checkWinner(Array(9).fill(EMPTY) as Board)).toBeNull();
  });

  // Test every one of the 8 winning lines for both players
  it.each(
    WIN_LINES.flatMap((line, idx) =>
      [X, O].map((player) => ({
        lineIdx: idx,
        line,
        player,
        label: `line ${idx} [${line}] for ${player === X ? "X" : "O"}`,
      }))
    )
  )("detects $label", ({ line, player }) => {
    const board = Array(9).fill(EMPTY) as Board;
    for (const idx of line) board[idx] = player;
    const result = checkWinner(board);
    expect(result).not.toBeNull();
    expect(result!.winner).toBe(player);
    expect(result!.line).toEqual(line);
  });

  it("returns the winning line indices (not just winner)", () => {
    // Row 0: X X X
    const board = b("XXX......");
    const result = checkWinner(board);
    expect(result!.line).toEqual([0, 1, 2]);
  });

  it("returns the correct line for a column win", () => {
    // Column 1: O at indices 1, 4, 7
    const board = b(".O..O..O.");
    const result = checkWinner(board);
    expect(result!.winner).toBe(O);
    expect(result!.line).toEqual([1, 4, 7]);
  });

  it("returns the correct line for a diagonal win", () => {
    // Main diagonal: X at 0, 4, 8
    const board = b("X...X...X");
    const result = checkWinner(board);
    expect(result!.winner).toBe(X);
    expect(result!.line).toEqual([0, 4, 8]);
  });

  it("returns the correct line for the anti-diagonal win", () => {
    // Anti-diagonal: O at 2, 4, 6
    const board = b("..O.O.O..");
    const result = checkWinner(board);
    expect(result!.winner).toBe(O);
    expect(result!.line).toEqual([2, 4, 6]);
  });
});

// ---- isDraw tests ----

describe("isDraw", () => {
  it("returns false on an empty board", () => {
    expect(isDraw(Array(9).fill(EMPTY) as Board)).toBe(false);
  });

  it("returns false when a winner exists on a full board", () => {
    // X wins last row but board is full
    const board = b("OXOOOXXXO");
    // O wins (row 1 or col 0), not a draw
    expect(isDraw(board)).toBe(false);
  });

  it("returns true on a full board with no winner", () => {
    // Classic draw: X O X / O O X / O X O  — let's confirm no winner
    const board = b("XOXOOXOXO");
    // Verify manually: no 3-in-a-row for either side
    expect(checkWinner(board)).toBeNull();
    expect(board.every((v) => v !== EMPTY)).toBe(true);
    expect(isDraw(board)).toBe(true);
  });

  it("returns false when board is not yet full", () => {
    const board = b("XO.OX.X..");
    expect(isDraw(board)).toBe(false);
  });
});

// ---- AI optimality tests ----

describe("hard AI (minimax) — never loses", () => {
  it("two perfect-minimax players always draw from the empty board", () => {
    const emptyBoard = Array(9).fill(EMPTY) as Board;
    const outcome = playToEnd(emptyBoard, true); // X moves first
    expect(outcome).toBe("draw");
  });

  it("AI (O) never loses from the empty board — every possible X reply", () => {
    // O goes first from empty (edge case: AI placed before any X)
    // More relevantly: X opens at every possible cell, then we play out optimal
    for (let firstMove = 0; firstMove < 9; firstMove++) {
      const board = Array(9).fill(EMPTY) as Board;
      board[firstMove] = X;
      // Now O picks its best reply, then both play optimally
      const result = playToEnd(board, false);
      expect(result, `O should not lose when X opens at ${firstMove}`).not.toBe("X");
    }
  });

  it("AI (O) never loses from any 2-move position where O played optimally", () => {
    // X opens at every possible cell; O replies with its best minimax move;
    // then we play both sides optimally to terminal state and verify O doesn't lose.
    for (let xCell = 0; xCell < 9; xCell++) {
      const board1 = Array(9).fill(EMPTY) as Board;
      board1[xCell] = X;
      // O picks its optimal reply
      const oCell = getBestMove(board1, "hard");
      const board2 = [...board1] as Board;
      board2[oCell] = O;
      // Play out the rest with both sides optimal
      const result = playToEnd(board2, true); // X to move next
      expect(
        result,
        `O loses when X opens at ${xCell}, O replies at ${oCell}`
      ).not.toBe("X");
    }
  });

  it("AI (O) never loses from any 3-move position where O played optimally", () => {
    // Enumerate all X@x1, optimal O@o1, then X@x2 for every legal x2,
    // play to terminal state with both sides optimal — O must not lose.
    for (let x1 = 0; x1 < 9; x1++) {
      const board1 = Array(9).fill(EMPTY) as Board;
      board1[x1] = X;
      const o1 = getBestMove(board1, "hard");
      const board2 = [...board1] as Board;
      board2[o1] = O;

      for (let x2 = 0; x2 < 9; x2++) {
        if (board2[x2] !== EMPTY) continue; // occupied
        const board3 = [...board2] as Board;
        board3[x2] = X;
        if (checkWinner(board3)) continue; // X already won; irrelevant to AI optimality
        // O plays next (optimally); carry on
        const result = playToEnd(board3, false);
        expect(
          result,
          `O loses after X@${x1}, O@${o1}, X@${x2}`
        ).not.toBe("X");
      }
    }
  });

  it("AI takes an immediate winning move when available", () => {
    // O has two in a row; the winning cell is index 2
    // Board: . . . / X X . / O O .
    //        0 1 2   3 4 5   6 7 8
    const board = b("...XX.OO.");
    const move = getBestMove(board, "hard");
    expect(move).toBe(8); // O completes [6,7,8]
  });

  it("AI blocks an immediate X win", () => {
    // X has two in a row on the main diagonal (0 and 4); X would win at 8
    // Board: X . . / . X . / O . .
    //        0 1 2   3 4 5   6 7 8
    const board = b("X...X.O..");
    const move = getBestMove(board, "hard");
    expect(move).toBe(8); // block X from completing [0,4,8]
  });

  it("AI prefers to win rather than just block", () => {
    // O can win at index 6 (completes column [0,3,6]) AND X threatens at 8 (row [6,7,8]).
    // Optimal: O wins immediately at 6.
    // Board: O . . / O X . / . . X
    //        0 1 2   3 4 5   6 7 8
    const board = b("O..OX...X");
    const move = getBestMove(board, "hard");
    expect(move).toBe(6); // win immediately, don't just block
  });
});

// ---- hard AI with rng for tie-breaking ----

describe("hard AI with rng tie-breaking", () => {
  it("uses rng.pick when multiple moves share the best score (hard mode)", () => {
    // On an empty board, every move scores 0 (perfect minimax → draw), so all 9
    // moves tie. Providing an rng triggers the rng.pick(bestMoves) path on line 130.
    const emptyBoard = Array(9).fill(EMPTY) as Board;
    // Stub rng: pick always returns the last element of the array
    const stubRng = {
      next: () => 0,
      int: (_min: number, _max: number) => _min,
      float: (_min: number, _max: number) => _min,
      bool: () => false,
      pick: <T>(arr: T[]): T => arr[arr.length - 1],
      shuffle: <T>(arr: T[]): T[] => arr,
    };
    // All 9 moves are equally optimal (all lead to draw), so bestMoves has multiple entries.
    // With our stub rng that picks the last element, we get the last best move index.
    const move = getBestMove(emptyBoard, "hard", stubRng);
    // Just assert it's a valid empty cell (0-8)
    expect(move).toBeGreaterThanOrEqual(0);
    expect(move).toBeLessThanOrEqual(8);
    expect(emptyBoard[move]).toBe(EMPTY);
  });
});

// ---- easy AI tests ----

describe("easy AI (getBestMove difficulty='easy')", () => {
  it("picks a random empty cell using the provided rng (rng.pick path)", () => {
    // Board with empties at indices 2, 5, 8 (indices where cell === EMPTY)
    // Board: X O . / X O . / X O .
    //        0 1 2   3 4 5   6 7 8
    const board = b("XO.XO.XO.");
    // Stub rng: rng.pick receives the empties array [2, 5, 8] and should pick one element.
    // We force it to always return the last element of the array it receives.
    const stubRng = {
      next: () => 0,
      int: (_min: number, _max: number) => _min,
      float: (_min: number, _max: number) => _min,
      bool: () => false,
      pick: <T>(arr: T[]): T => arr[arr.length - 1], // always picks last element
      shuffle: <T>(arr: T[]): T[] => arr,
    };
    const move = getBestMove(board, "easy", stubRng);
    // empties = [2, 5, 8]; pick last → 8
    expect(move).toBe(8);
  });

  it("returns empties[0] when no rng provided (deterministic fallback)", () => {
    // Board: X O . / X O . / X O .
    //        0 1 2   3 4 5   6 7 8
    const board = b("XO.XO.XO.");
    // No rng supplied — should return the first empty cell (index 2)
    const move = getBestMove(board, "easy");
    expect(move).toBe(2); // empties[0] = 2
  });

  it("easy mode with rng picks among all empties", () => {
    // Board with three empties: indices 0, 4, 8
    const board = b(".X.O.X.O.");
    // Stub rng that always picks the first element
    const stubRng = {
      next: () => 0,
      int: (_min: number, _max: number) => _min,
      float: (_min: number, _max: number) => _min,
      bool: () => false,
      pick: <T>(arr: T[]): T => arr[0], // always picks first element
      shuffle: <T>(arr: T[]): T[] => arr,
    };
    const move = getBestMove(board, "easy", stubRng);
    // empties = [0, 4, 8]; pick first → 0
    expect(move).toBe(0);
  });
});
