<script setup>
/* 五子棋 Gomoku — 15×15, Player black vs AI white.
   Heuristic AI: scores every candidate cell in 4 directions,
   attacks and defends, blocks 4s and open-3s.
   Win = 5+ in a row; winning stones highlighted. Undo (悔棋) + restart. */

// ---- pure game logic (unit-tested in app/games/gomoku.ts) ----
import {
  SIZE,
  EMPTY,
  BLACK,
  WHITE,
  makeBoard,
  isBoardFull,
  findWin,
  analyzeBlack,
  computeForbiddenPoints,
  getCandidates,
  getAIMove,
} from "~/games/gomoku";

const accent = "#d89b6a";
const SAVE_KEY = "playground.gomoku";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// ---- state ----
const board = ref(makeBoard());
const history = ref([]);
const currentTurn = ref(BLACK);
const gameOver = ref(false);
const isDraw = ref(false);
const winStones = ref([]);
const winner = ref(EMPTY);
const aiThinking = ref(false);

// Renju forbidden-move rule (applies to BLACK / 先手 only): no 三三 / 四四 / 長連.
const renjuRule = ref(true);
const forbiddenFlash = ref(null); // {r,c} flashed red when a forbidden move is blocked
const forbiddenMsg = ref("");

const tally = reactive({ win: 0, draw: 0, loss: 0 });
const overlay = reactive({ open: false, title: "", sub: "" });

let rng = makeRng(props.seed);
let reducedMotion = false;
let forbiddenTimer = null;

watch(() => props.seed, () => {
  rng = makeRng(props.seed);
  resetGame();
});

// ---- game flow ----
function resolveGame(b) {
  const win = findWin(b);
  if (win) {
    winStones.value = win.cells;
    winner.value = win.winner;
    gameOver.value = true;
    if (win.winner === BLACK) {
      tally.win++; saveTally();
      emit("solved", {});
      overlay.title = "你贏了！"; overlay.sub = "黑棋五子連線，恭喜！";
    } else {
      tally.loss++; saveTally();
      overlay.title = "電腦贏了"; overlay.sub = "白棋五子連線，再接再厲！";
    }
    overlay.open = true;
    return true;
  }
  if (isBoardFull(b)) {
    isDraw.value = true; gameOver.value = true;
    tally.draw++; saveTally();
    overlay.title = "平局！"; overlay.sub = "棋盤填滿，不分勝負。";
    overlay.open = true;
    return true;
  }
  return false;
}

function placeStone(r, c) {
  if (gameOver.value || aiThinking.value) return;
  if (board.value[r][c] !== EMPTY) return;
  if (currentTurn.value !== BLACK) return;

  if (renjuRule.value) {
    const test = board.value.map(row => [...row]);
    test[r][c] = BLACK;
    const verdict = analyzeBlack(test, r, c);
    if (verdict.result === "forbidden") {
      flashForbidden(r, c, verdict.reason);
      return;
    }
  }

  const nb = board.value.map(row => [...row]);
  nb[r][c] = BLACK;
  history.value = [...history.value, { r, c, color: BLACK }];
  board.value = nb;

  if (!resolveGame(nb)) {
    currentTurn.value = WHITE;
    triggerAI(nb);
  }
}

function triggerAI(b) {
  aiThinking.value = true;
  setTimeout(() => {
    const move = getAIMove(b, rng);
    if (!move) { aiThinking.value = false; return; }
    const nb = b.map(row => [...row]);
    nb[move.r][move.c] = WHITE;
    history.value = [...history.value, { r: move.r, c: move.c, color: WHITE }];
    board.value = nb;
    aiThinking.value = false;
    if (!resolveGame(nb)) {
      currentTurn.value = BLACK;
    }
  }, 250);
}

function undoMove() {
  if (aiThinking.value) return;
  if (history.value.length === 0) return;
  const hist = [...history.value];
  const nb = board.value.map(row => [...row]);
  let undone = 0;
  while (undone < 2 && hist.length > 0) {
    const last = hist.pop();
    nb[last.r][last.c] = EMPTY;
    undone++;
  }
  history.value = hist;
  board.value = nb;
  currentTurn.value = BLACK;
  gameOver.value = false;
  isDraw.value = false;
  winStones.value = [];
  winner.value = EMPTY;
  overlay.open = false;
}

function resetGame() {
  board.value = makeBoard();
  history.value = [];
  currentTurn.value = BLACK;
  gameOver.value = false;
  isDraw.value = false;
  winStones.value = [];
  winner.value = EMPTY;
  aiThinking.value = false;
  overlay.open = false;
}

function saveTally() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(tally)); } catch (_) {}
}

// ---- forbidden-point marking (black's turn) ----
const forbiddenPoints = computed(() => {
  if (!renjuRule.value || gameOver.value || aiThinking.value || currentTurn.value !== BLACK) {
    return new Set();
  }
  const grid = board.value.map((row) => [...row]);
  return computeForbiddenPoints(grid);
});

function isForbidden(r, c) {
  return forbiddenPoints.value.has(r + "," + c);
}

function toggleRenju() {
  renjuRule.value = !renjuRule.value;
}

function flashForbidden(r, c, reason) {
  forbiddenFlash.value = { r, c };
  forbiddenMsg.value = `禁手！黑棋不可下「${reason}」`;
  clearTimeout(forbiddenTimer);
  forbiddenTimer = setTimeout(() => {
    forbiddenFlash.value = null;
    forbiddenMsg.value = "";
  }, 1600);
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
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  rng = makeRng(props.seed);
});

// ---- display ----
const CELL_FRAC = 100 / (SIZE - 1);
// Flat array of all cells for v-for
const CELLS = Array.from({ length: SIZE * SIZE }, (_, i) => ({
  r: Math.floor(i / SIZE),
  c: i % SIZE,
}));

const STAR_POINTS = [[3,3],[3,11],[7,7],[11,3],[11,11]];

function cellState(r, c) {
  return board.value[r][c];
}

function isWinStone(r, c) {
  return winStones.value.some(s => s.r === r && s.c === c);
}

function isLastMove(r, c) {
  if (history.value.length === 0) return false;
  const last = history.value[history.value.length - 1];
  return last.r === r && last.c === c;
}

function cellAriaLabel(r, c) {
  const v = board.value[r][c];
  const stone = v === BLACK ? "黑" : v === WHITE ? "白" : "空";
  return `行${r+1}列${c+1}: ${stone}`;
}

const statusText = computed(() => {
  if (forbiddenMsg.value) return forbiddenMsg.value;
  if (gameOver.value) {
    if (isDraw.value) return "平局";
    return winner.value === BLACK ? "黑棋獲勝！" : "白棋獲勝";
  }
  if (aiThinking.value) return "電腦思考中…";
  return "黑棋落子";
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="五子棋" title-en="Gomoku">
      <template #actions>
        <button
          class="btn"
          :disabled="history.length === 0 || aiThinking"
          @click="undoMove"
        >悔棋</button>
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

        <p class="status-text" :class="{ 'is-thinking': aiThinking }">{{ statusText }}</p>

        <!-- Board -->
        <div class="board-wrap">
          <div class="gomoku-board" aria-label="五子棋盤面">
            <!-- SVG grid -->
            <svg class="gomoku-grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line
                v-for="i in SIZE"
                :key="'v'+i"
                :x1="(i-1)*CELL_FRAC" y1="0"
                :x2="(i-1)*CELL_FRAC" y2="100"
                class="grid-line"
              />
              <line
                v-for="i in SIZE"
                :key="'h'+i"
                x1="0" :y1="(i-1)*CELL_FRAC"
                x2="100" :y2="(i-1)*CELL_FRAC"
                class="grid-line"
              />
              <circle
                v-for="sp in STAR_POINTS"
                :key="'sp'+sp[0]+'-'+sp[1]"
                :cx="sp[0]*CELL_FRAC"
                :cy="sp[1]*CELL_FRAC"
                r="0.9"
                class="star-point"
              />
            </svg>

            <!-- Intersection buttons -->
            <button
              v-for="cell in CELLS"
              :key="`c-${cell.r}-${cell.c}`"
              class="gomoku-cell"
              :class="{
                'has-black': cellState(cell.r, cell.c) === BLACK,
                'has-white': cellState(cell.r, cell.c) === WHITE,
                'is-win': isWinStone(cell.r, cell.c),
                'is-last': isLastMove(cell.r, cell.c),
                'is-hover': cellState(cell.r, cell.c) === EMPTY && !isForbidden(cell.r, cell.c),
                'is-forbidden': isForbidden(cell.r, cell.c),
                'is-forbidden-flash': forbiddenFlash && forbiddenFlash.r === cell.r && forbiddenFlash.c === cell.c,
              }"
              :style="{
                left: `calc(${cell.c * CELL_FRAC}% - var(--stone-half))`,
                top: `calc(${cell.r * CELL_FRAC}% - var(--stone-half))`,
              }"
              :aria-label="cellAriaLabel(cell.r, cell.c) + (isForbidden(cell.r, cell.c) ? '（禁手）' : '')"
              :disabled="cellState(cell.r, cell.c) !== EMPTY || gameOver || aiThinking || currentTurn !== BLACK || isForbidden(cell.r, cell.c)"
              @click="placeStone(cell.r, cell.c)"
            >
              <span v-if="isForbidden(cell.r, cell.c)" class="gomoku-x" aria-hidden="true">✕</span>
            </button>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button class="btn" @click="overlay.open = false">繼續觀看</button>
                <button class="btn btn--accent" @click="resetGame">再玩一次</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Side Panel -->
      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">規則</span>
          <p class="hint">
            15×15 棋盤，你執黑，電腦執白。<br />
            率先連成五子（橫、直、斜）者獲勝。<br />
            點擊交叉點落子。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">禁手規則</span>
          <div class="toggle-row">
            <span>黑棋禁手</span>
            <button
              class="switch"
              role="switch"
              :aria-checked="renjuRule ? 'true' : 'false'"
              aria-label="黑棋禁手規則開關"
              @click="toggleRenju"
            ></button>
          </div>
          <p class="hint">
            開啟後，先手黑棋不得下出
            <strong style="color: var(--text)">三三</strong>、<strong style="color: var(--text)">四四</strong>
            或 <strong style="color: var(--text)">長連</strong>（六子以上），必須改用四三等手段取勝。
            盤面上的 <span style="color:#ff5d6c">✕</span> 即為禁著點。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">功能</span>
          <p class="hint">
            <strong style="color: var(--text)">悔棋</strong>：撤回你和電腦各一步。<br />
            <strong style="color: var(--text)">重新開始</strong>：清空棋盤。
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
}
.status-text.is-thinking { color: var(--accent); }

.gomoku-board {
  position: relative;
  width: min(92vw, 70vh, 560px);
  height: min(92vw, 70vh, 560px);
  border-radius: var(--r-lg);
  background:
    radial-gradient(ellipse at 30% 20%, color-mix(in oklab, var(--accent) 14%, transparent) 0%, transparent 55%),
    linear-gradient(160deg, #2c2016 0%, #1d1510 50%, #130e0a 100%);
  border: 1px solid color-mix(in oklab, var(--accent) 30%, var(--line));
  box-shadow: var(--shadow-2), inset 0 0 50px rgba(0,0,0,0.4);
  touch-action: none;
  overflow: hidden;
  /* Stone sizing: button covers the intersection area.
     board/(SIZE+2) keeps adjacent buttons non-overlapping while leaving a
     small gap; visual stone ::after is 88% of button, centred. */
  --stone-size: calc(min(92vw, 70vh, 560px) / 17);
  --stone-half: calc(var(--stone-size) / 2);
}

.gomoku-grid {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
.grid-line {
  stroke: color-mix(in oklab, var(--accent) 20%, rgba(200,150,80,0.25));
  stroke-width: 0.35;
  vector-effect: non-scaling-stroke;
}
.star-point {
  fill: color-mix(in oklab, var(--accent) 50%, rgba(255,200,100,0.4));
}

/* Each intersection is a positioned button */
.gomoku-cell {
  position: absolute;
  width: var(--stone-size);
  height: var(--stone-size);
  border-radius: 50%;
  background: transparent;
  border: none;
  display: grid;
  place-items: center;
  z-index: 2;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease);
}
.gomoku-cell:disabled {
  cursor: default;
}
/* Renju forbidden point: a red ✕ on an empty intersection black may not play. */
.gomoku-cell.is-forbidden {
  cursor: not-allowed;
}
.gomoku-x {
  font-family: var(--font-mono);
  font-size: calc(var(--stone-size) * 0.66);
  font-weight: 700;
  line-height: 1;
  color: #ff5d6c;
  opacity: 0.8;
  pointer-events: none;
}
.gomoku-cell.is-forbidden:hover .gomoku-x {
  opacity: 1;
}
.gomoku-cell.is-forbidden-flash {
  background: color-mix(in oklab, #ff5d6c 32%, transparent);
  border-radius: 50%;
}
.gomoku-cell.is-hover:not(:disabled):hover {
  background: color-mix(in oklab, var(--accent) 22%, transparent);
}
/* After pseudo-element = the stone */
.gomoku-cell.has-black::after,
.gomoku-cell.has-white::after {
  content: "";
  display: block;
  width: 88%;
  height: 88%;
  border-radius: 50%;
  animation: stonePlace 0.18s cubic-bezier(0.2, 0, 0.35, 1.4) both;
}
.gomoku-cell.has-black::after {
  background: radial-gradient(circle at 35% 30%, #606060, #0d0d0d);
  border: 1px solid rgba(255,255,255,0.18);
  box-shadow: 0 2px 7px rgba(0,0,0,0.75), inset 0 1px 2px rgba(255,255,255,0.14);
}
.gomoku-cell.has-white::after {
  background: radial-gradient(circle at 35% 30%, #ffffff, #d4d4d4);
  border: 1px solid rgba(0,0,0,0.18);
  box-shadow: 0 2px 7px rgba(0,0,0,0.5), inset 0 1px 3px rgba(255,255,255,0.8);
}
/* Last move dot */
.gomoku-cell.is-last::before {
  content: "";
  position: absolute;
  width: 28%;
  height: 28%;
  border-radius: 50%;
  background: color-mix(in oklab, var(--accent) 90%, transparent);
  z-index: 3;
  pointer-events: none;
}
/* Win highlight */
.gomoku-cell.is-win::after {
  box-shadow:
    0 0 0 2px var(--accent),
    0 0 16px 3px color-mix(in oklab, var(--accent) 65%, transparent) !important;
  animation: stonePlace 0.18s cubic-bezier(0.2, 0, 0.35, 1.4) both, winPulse 0.85s var(--ease) infinite 0.2s;
}

@keyframes stonePlace {
  from { transform: scale(0.25); opacity: 0.3; }
  to   { transform: scale(1); opacity: 1; }
}
@keyframes winPulse {
  0%, 100% { filter: brightness(1); }
  50%       { filter: brightness(1.55); }
}

/* focus-visible ring rendered as inset box-shadow on the button so it
   doesn't shift neighbours (absolute-positioned cells are already inert
   to normal flow, but this keeps the ring contained within the button). */
.gomoku-cell:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent);
}

@media (prefers-reduced-motion: reduce) {
  .gomoku-cell.has-black::after,
  .gomoku-cell.has-white::after {
    animation: none;
  }
  .gomoku-cell.is-win::after {
    animation: none;
  }
}
</style>
