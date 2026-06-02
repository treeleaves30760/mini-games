<script setup>
/* 圈圈叉叉 Tic-Tac-Toe — Player ✕ vs AI ◯ (minimax / random).
   Full win detection, winning-line highlight, running tally in localStorage. */

const accent = "#6aa6ff";
const SAVE_KEY = "playground.tictactoe";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// ---- constants ----
const EMPTY = 0, X = 1, O = 2;
const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8], // rows
  [0,3,6],[1,4,7],[2,5,8], // cols
  [0,4,8],[2,4,6],          // diags
];

// ---- reactive state ----
const board = ref(Array(9).fill(EMPTY));
const currentTurn = ref(X); // X always starts
const gameOver = ref(false);
const winLine = ref(null);       // array of 3 indices or null
const winner = ref(EMPTY);       // EMPTY / X / O
const isDraw = ref(false);
const aiThinking = ref(false);

// mode: "ai" = vs computer, "2p" = two players
const mode = ref("ai");
// difficulty: "easy" = random, "hard" = minimax
const difficulty = ref("hard");

// tally
const tally = reactive({ win: 0, draw: 0, loss: 0 });

// overlay
const overlay = reactive({ open: false, title: "", sub: "" });

// rng (re-created on seed change, used for AI randomness)
let rng = makeRng(props.seed);

// ---- seed watch ----
watch(() => props.seed, () => {
  rng = makeRng(props.seed);
  resetGame();
});

// ---- minimax ----
function checkWinner(b) {
  for (const line of WIN_LINES) {
    const [a, c, d] = line;
    if (b[a] !== EMPTY && b[a] === b[c] && b[c] === b[d]) {
      return { winner: b[a], line };
    }
  }
  return null;
}

function isDraw_(b) {
  return b.every(v => v !== EMPTY) && !checkWinner(b);
}

function minimax(b, depth, isMaximizing, alpha, beta) {
  const result = checkWinner(b);
  if (result) return result.winner === O ? 10 - depth : depth - 10;
  if (b.every(v => v !== EMPTY)) return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i] === EMPTY) {
        b[i] = O;
        best = Math.max(best, minimax(b, depth + 1, false, alpha, beta));
        b[i] = EMPTY;
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i] === EMPTY) {
        b[i] = X;
        best = Math.min(best, minimax(b, depth + 1, true, alpha, beta));
        b[i] = EMPTY;
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
    }
    return best;
  }
}

function getBestMove(b) {
  // easy: random empty cell
  if (difficulty.value === "easy") {
    const empties = b.map((v, i) => v === EMPTY ? i : -1).filter(i => i >= 0);
    return rng.pick(empties);
  }
  // hard: minimax
  let bestScore = -Infinity;
  let bestMoves = [];
  const tmp = [...b];
  for (let i = 0; i < 9; i++) {
    if (tmp[i] === EMPTY) {
      tmp[i] = O;
      const score = minimax(tmp, 0, false, -Infinity, Infinity);
      tmp[i] = EMPTY;
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [i];
      } else if (score === bestScore) {
        bestMoves.push(i);
      }
    }
  }
  // tie-break randomly (seeded)
  return bestMoves.length === 1 ? bestMoves[0] : rng.pick(bestMoves);
}

// ---- game logic ----
function resolveGame(b) {
  const result = checkWinner(b);
  if (result) {
    winLine.value = result.line;
    winner.value = result.winner;
    gameOver.value = true;
    if (mode.value === "ai") {
      if (result.winner === X) {
        tally.win++;
        saveTally();
        emit("solved", {});
        overlay.title = "你贏了！";
        overlay.sub = "漂亮的三連線！";
      } else {
        tally.loss++;
        saveTally();
        overlay.title = "電腦贏了";
        overlay.sub = "再試一次，你可以的！";
      }
    } else {
      overlay.title = result.winner === X ? "✕ 獲勝！" : "◯ 獲勝！";
      overlay.sub = "精彩的對局！";
    }
    overlay.open = true;
    return true;
  }
  if (b.every(v => v !== EMPTY)) {
    isDraw.value = true;
    gameOver.value = true;
    if (mode.value === "ai") { tally.draw++; saveTally(); }
    overlay.title = "平局！";
    overlay.sub = "棋逢對手，不分勝負。";
    overlay.open = true;
    return true;
  }
  return false;
}

function placeMove(idx) {
  if (gameOver.value || aiThinking.value) return;
  if (board.value[idx] !== EMPTY) return;
  const who = currentTurn.value;
  if (mode.value === "ai" && who !== X) return; // player is X only

  const nb = [...board.value];
  nb[idx] = who;
  board.value = nb;

  if (!resolveGame(nb)) {
    currentTurn.value = who === X ? O : X;
    if (mode.value === "ai" && currentTurn.value === O) {
      triggerAI(nb);
    }
  }
}

function triggerAI(b) {
  aiThinking.value = true;
  // small delay for feel
  setTimeout(() => {
    const move = getBestMove(b);
    if (move === undefined || move === null) { aiThinking.value = false; return; }
    const nb = [...b];
    nb[move] = O;
    board.value = nb;
    aiThinking.value = false;
    if (!resolveGame(nb)) {
      currentTurn.value = X;
    }
  }, 280);
}

function resetGame() {
  board.value = Array(9).fill(EMPTY);
  currentTurn.value = X;
  gameOver.value = false;
  winLine.value = null;
  winner.value = EMPTY;
  isDraw.value = false;
  aiThinking.value = false;
  overlay.open = false;
}

// ---- persistence ----
function saveTally() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(tally));
  } catch (_) {}
}

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
    if (saved.win !== undefined) {
      tally.win = saved.win || 0;
      tally.draw = saved.draw || 0;
      tally.loss = saved.loss || 0;
    }
  } catch (_) {}
  rng = makeRng(props.seed);
});

// ---- computed helpers ----
function cellSymbol(v) {
  if (v === X) return "✕";
  if (v === O) return "◯";
  return "";
}

function cellClass(idx) {
  const v = board.value[idx];
  return {
    "is-x": v === X,
    "is-o": v === O,
    "is-win": winLine.value && winLine.value.includes(idx),
    "is-empty": v === EMPTY && !gameOver.value,
  };
}

const statusText = computed(() => {
  if (gameOver.value) {
    if (isDraw.value) return "平局";
    if (mode.value === "ai") return winner.value === X ? "你贏了！" : "電腦贏了";
    return winner.value === X ? "✕ 勝" : "◯ 勝";
  }
  if (mode.value === "ai") {
    return aiThinking.value ? "電腦思考中…" : "你的回合（✕）";
  }
  return currentTurn.value === X ? "✕ 的回合" : "◯ 的回合";
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="圈圈叉叉" title-en="Tic-Tac-Toe">
      <template #actions>
        <button class="btn btn--accent" @click="resetGame">重新開始</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <!-- HUD -->
        <div class="hud">
          <div class="chip">
            <span class="chip__label">勝</span>
            <span class="chip__value is-accent">{{ tally.win }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">和</span>
            <span class="chip__value">{{ tally.draw }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">負</span>
            <span class="chip__value">{{ tally.loss }}</span>
          </div>
        </div>

        <!-- Status -->
        <p class="status-text" :class="{ 'is-thinking': aiThinking }">{{ statusText }}</p>

        <!-- Board -->
        <div class="board-wrap">
          <div class="ttt-board" role="grid" aria-label="圈圈叉叉盤面">
            <button
              v-for="(cell, idx) in board"
              :key="idx"
              class="ttt-cell"
              :class="cellClass(idx)"
              :aria-label="`格子 ${idx + 1}: ${cellSymbol(cell) || '空'}`"
              :disabled="cell !== EMPTY || gameOver || aiThinking"
              @click="placeMove(idx)"
            >
              <span class="ttt-cell__symbol" aria-hidden="true">{{ cellSymbol(cell) }}</span>
            </button>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button class="btn btn--accent" @click="resetGame">再玩一次</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Side Panel -->
      <aside class="panel">
        <div v-if="!daily" class="panel__group">
          <span class="panel__legend">模式</span>
          <div class="seg">
            <button
              :aria-pressed="mode === 'ai'"
              :class="{ 'is-active': mode === 'ai' }"
              @click="mode = 'ai'; resetGame()"
            >對電腦</button>
            <button
              :aria-pressed="mode === '2p'"
              :class="{ 'is-active': mode === '2p' }"
              @click="mode = '2p'; resetGame()"
            >雙人</button>
          </div>
        </div>

        <div v-if="mode === 'ai'" class="panel__group">
          <span class="panel__legend">難度</span>
          <div class="seg">
            <button
              :aria-pressed="difficulty === 'easy'"
              :class="{ 'is-active': difficulty === 'easy' }"
              @click="difficulty = 'easy'; resetGame()"
            >簡單</button>
            <button
              :aria-pressed="difficulty === 'hard'"
              :class="{ 'is-active': difficulty === 'hard' }"
              @click="difficulty = 'hard'; resetGame()"
            >困難</button>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">規則</span>
          <p class="hint">
            3×3 棋盤，率先連成一線（橫、直、斜）的一方獲勝。<br />
            你執 <strong>✕</strong>，電腦執 <strong>◯</strong>。<br />
            困難模式使用 Minimax 演算法，近乎無敵。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">戰績</span>
          <p class="hint">勝 {{ tally.win }} ／ 和 {{ tally.draw }} ／ 負 {{ tally.loss }}</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.status-text {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  min-height: 1.4em;
  transition: color var(--dur-fast) var(--ease);
}
.status-text.is-thinking {
  color: var(--accent);
}

.ttt-board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 8px;
  width: min(86vw, 60vh, 420px);
  height: min(86vw, 60vh, 420px);
  padding: 16px;
  border-radius: var(--r-lg);
  background: radial-gradient(130% 120% at 50% 0%, var(--ink-800), var(--ink-900));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
}

.ttt-cell {
  position: relative;
  border-radius: var(--r-md);
  background: var(--ink-800);
  border: 1px solid var(--line);
  display: grid;
  place-items: center;
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    transform var(--dur-fast) var(--ease);
}
.ttt-cell.is-empty:not(:disabled):hover {
  background: var(--ink-700);
  border-color: var(--line-strong);
  transform: scale(1.04);
  cursor: pointer;
}
.ttt-cell:active:not(:disabled) {
  transform: scale(0.97);
}
.ttt-cell.is-win {
  background: color-mix(in oklab, var(--accent) 18%, var(--ink-800));
  border-color: var(--accent);
  box-shadow: 0 0 12px color-mix(in oklab, var(--accent) 40%, transparent);
}

.ttt-cell__symbol {
  font-family: var(--font-display);
  font-size: clamp(2rem, 7vw, 4.5rem);
  font-weight: 800;
  line-height: 1;
  transition: opacity var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
  animation: popIn 0.15s var(--ease-out) both;
}
.ttt-cell.is-x .ttt-cell__symbol {
  color: var(--accent);
  text-shadow: 0 0 20px color-mix(in oklab, var(--accent) 60%, transparent);
}
.ttt-cell.is-o .ttt-cell__symbol {
  color: var(--text-dim);
}
.ttt-cell.is-win .ttt-cell__symbol {
  color: var(--accent);
  text-shadow: 0 0 24px color-mix(in oklab, var(--accent) 80%, transparent);
}

@keyframes popIn {
  from { opacity: 0; transform: scale(0.5); }
  to   { opacity: 1; transform: scale(1); }
}
</style>
