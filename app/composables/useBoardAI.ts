/* =========================================================================
   useBoardAI — runs a board-game AI search off the main thread.

   The heavy search lives in a Web Worker so the page stays responsive while
   the higher difficulty levels think for a few seconds. The composable owns
   one worker at a time, tags every request with an id so stale replies are
   ignored, and terminates the worker on cancel (there is no other way to
   interrupt a synchronous search). If workers are unavailable or the worker
   fails to load, it falls back to computing on the main thread.

   Usage:
     const ai = useBoardAI({
       createWorker: () => new Worker(new URL("../../workers/shogi-ai.ts", import.meta.url), { type: "module" }),
       compute: (payload, onProgress) => chooseShogiAIMove(...),
     });
     ai.request(payload, { onProgress, onResult });
     ai.cancel();
   ========================================================================= */

export type BoardAIWorkerMessage<TResult> =
  | { id: number; type: "progress"; info: TResult }
  | { id: number; type: "result"; info: TResult | null };

export type BoardAIHandlers<TResult> = {
  onProgress?: (info: TResult) => void;
  onResult: (info: TResult | null) => void;
};

export type BoardAIOptions<TPayload, TResult> = {
  createWorker: () => Worker;
  /** Main-thread fallback — must produce the same answer as the worker. */
  compute: (payload: TPayload, onProgress: (info: TResult) => void) => TResult | null;
};

export function useBoardAI<TPayload extends object, TResult>(options: BoardAIOptions<TPayload, TResult>) {
  let worker: Worker | null = null;
  let workerBroken = false;
  let seq = 0;
  let pending: { id: number; payload: TPayload; handlers: BoardAIHandlers<TResult> } | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  function ensureWorker(): Worker | null {
    if (worker) return worker;
    if (workerBroken || typeof Worker === "undefined") return null;
    try {
      worker = options.createWorker();
      worker.onmessage = (event: MessageEvent<BoardAIWorkerMessage<TResult>>) => {
        const message = event.data;
        if (!pending || message.id !== pending.id) return;
        if (message.type === "progress") {
          pending.handlers.onProgress?.(message.info);
          return;
        }
        const { handlers } = pending;
        pending = null;
        handlers.onResult(message.info);
      };
      worker.onerror = () => {
        // The worker script failed (e.g. blocked or missing): finish the
        // pending request on the main thread and stop using workers.
        workerBroken = true;
        disposeWorker();
        if (pending) runFallback();
      };
    } catch (_) {
      workerBroken = true;
      worker = null;
    }
    return worker;
  }

  function disposeWorker() {
    worker?.terminate();
    worker = null;
  }

  function runFallback() {
    if (fallbackTimer) clearTimeout(fallbackTimer);
    // Yield once so the "thinking" state can paint before the main thread blocks.
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null;
      if (!pending) return;
      const { id, payload, handlers } = pending;
      const info = options.compute(payload, (progress) => {
        if (pending?.id === id) handlers.onProgress?.(progress);
      });
      if (pending?.id !== id) return;
      pending = null;
      handlers.onResult(info);
    }, 16);
  }

  /** Start a search. Any request still running is cancelled first. */
  function request(payload: TPayload, handlers: BoardAIHandlers<TResult>) {
    cancel();
    pending = { id: ++seq, payload, handlers };
    const target = ensureWorker();
    if (target) {
      target.postMessage({ id: pending.id, ...payload });
    } else {
      runFallback();
    }
  }

  /** Drop the running request; its handlers will never be called. */
  function cancel() {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    if (!pending) return;
    pending = null;
    // A worker mid-search cannot be interrupted — replace it.
    disposeWorker();
  }

  onBeforeUnmount(() => {
    cancel();
    disposeWorker();
  });

  return { request, cancel };
}
