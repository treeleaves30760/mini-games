/* Web Worker entry: runs the chess search off the main thread.
   Protocol — in:  { id, fen, aiColor, difficulty, seed, timeLimitMs }
              out: { id, type: "progress" | "result", info } */

import { chooseChessAIMove, type ChessAIMove, type ChessDifficulty, type ChessSide } from "~/games/chess";
import { makeRng } from "~/utils/rng";

type Request = {
  id: number;
  fen: string;
  aiColor: ChessSide;
  difficulty: ChessDifficulty;
  seed: number;
  timeLimitMs?: number;
};

const scope = self as unknown as {
  postMessage: (message: unknown) => void;
  onmessage: ((event: MessageEvent<Request>) => void) | null;
};

scope.onmessage = (event) => {
  const { id, fen, aiColor, difficulty, seed, timeLimitMs } = event.data;
  const info: ChessAIMove | null = chooseChessAIMove(fen, aiColor, difficulty, makeRng(seed), {
    timeLimitMs,
    onProgress: (progress) => scope.postMessage({ id, type: "progress", info: progress }),
  });
  scope.postMessage({ id, type: "result", info });
};
