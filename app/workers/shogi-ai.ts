/* Web Worker entry: runs the shogi search off the main thread.
   Protocol — in:  { id, sfen, difficulty, seed, timeLimitMs }
              out: { id, type: "progress" | "result", info } */

import { chooseShogiAIMove, type ShogiAIMove, type ShogiDifficulty } from "~/games/shogi";
import { makeRng } from "~/utils/rng";

type Request = { id: number; sfen: string; difficulty: ShogiDifficulty; seed: number; timeLimitMs?: number };

const scope = self as unknown as {
  postMessage: (message: unknown) => void;
  onmessage: ((event: MessageEvent<Request>) => void) | null;
};

scope.onmessage = (event) => {
  const { id, sfen, difficulty, seed, timeLimitMs } = event.data;
  const info: ShogiAIMove | null = chooseShogiAIMove(sfen, difficulty, makeRng(seed), {
    timeLimitMs,
    onProgress: (progress) => scope.postMessage({ id, type: "progress", info: progress }),
  });
  scope.postMessage({ id, type: "result", info });
};
