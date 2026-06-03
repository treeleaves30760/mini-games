<script setup>
/* 黑白棋 Reversi (Othello) — 8×8, Player=BLACK, AI=WHITE.
   Legal-move dots, flip animations, positional heuristic AI (1-ply). */

// ---- pure game logic (unit-tested in app/games/reversi.ts) ----
import {
  EMPTY, BLACK, WHITE,
  initBoard, getLegal, applyMove, countDiscs, aiMove, isGameOver,
} from "~/games/reversi";

const accent = "#57cc99";
const SAVE_KEY = "playground.reversi.stats";

const props = defineProps({
  seed:  { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// ---- reactive state ----
const board      = ref([]);  // flat 64
const turn       = ref(BLACK);
const legalMoves = ref([]);
const animating  = ref(false);
const flipCells  = ref(new Set());
const gameOver   = ref(false);
const winner     = ref(0);
const overlay    = reactive({ open: false, title: "", sub: "" });
const stats      = reactive({ wins: 0, losses: 0, draws: 0 });

// ---- rng (used for tie-break in AI; board start position is fixed) ----
const rng = makeRng(props.seed);

// ---- game flow ----
function computeLegal() {
  legalMoves.value = getLegal(board.value, turn.value);
}

function checkGameOver(b) {
  return isGameOver(b);
}

async function playerPlace(pos) {
  if (animating.value || gameOver.value || turn.value !== BLACK) return;
  if (!legalMoves.value.includes(pos)) return;

  await doPlace(pos, BLACK);

  // Check if game over
  if (checkGameOver(board.value)) { endGame(); return; }

  // White's turn
  const whiteMoves = getLegal(board.value, WHITE);
  if (!whiteMoves.length) {
    // white passes
    turn.value = BLACK;
    computeLegal();
    return;
  }
  turn.value = WHITE;
  computeLegal();

  // AI move after short delay
  setTimeout(async () => {
    const m = aiMove(board.value, rng);
    if (m >= 0) await doPlace(m, WHITE);

    if (checkGameOver(board.value)) { endGame(); return; }

    const blackMoves = getLegal(board.value, BLACK);
    if (!blackMoves.length) {
      // black passes, AI moves again
      turn.value = WHITE;
      computeLegal();
      setTimeout(async () => {
        const m2 = aiMove(board.value, rng);
        if (m2 >= 0) await doPlace(m2, WHITE);
        if (checkGameOver(board.value)) { endGame(); return; }
        turn.value = BLACK;
        computeLegal();
      }, 480);
    } else {
      turn.value = BLACK;
      computeLegal();
    }
  }, 480);
}

async function doPlace(pos, player) {
  animating.value = true;
  const { board: nb, flips } = applyMove(board.value, pos, player);

  // Mark cells to animate
  flipCells.value = new Set([pos, ...flips]);
  board.value = nb;

  await new Promise(r => setTimeout(r, 280));
  flipCells.value = new Set();
  animating.value = false;
}

function endGame() {
  gameOver.value = true;
  const { black, white } = countDiscs(board.value);
  if (black > white) {
    winner.value = BLACK;
    emit("solved", { black, white });
    stats.wins++;
    overlay.title = "黑方獲勝！";
    overlay.sub = `黑 ${black} — 白 ${white}，恭喜你！`;
  } else if (white > black) {
    winner.value = WHITE;
    stats.losses++;
    overlay.title = "白方獲勝";
    overlay.sub = `黑 ${black} — 白 ${white}，再接再厲！`;
  } else {
    winner.value = 0;
    stats.draws++;
    overlay.title = "平局！";
    overlay.sub = `黑 ${black} — 白 ${white}，旗鼓相當。`;
  }
  overlay.open = true;
  saveStats();
}

function restart() {
  board.value = initBoard();
  turn.value = BLACK;
  gameOver.value = false;
  winner.value = 0;
  flipCells.value = new Set();
  animating.value = false;
  overlay.open = false;
  computeLegal();
}

// ---- persistence ----
function saveStats() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(stats)); } catch(_) {}
}
onMounted(() => {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
    if (s.wins != null) { stats.wins = s.wins; stats.losses = s.losses; stats.draws = s.draws; }
  } catch(_) {}
  restart();
});

watch(() => props.seed, restart);

// ---- derived display ----
const discCounts = computed(() => countDiscs(board.value));
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="黑白棋" title-en="Reversi">
      <template #actions>
        <button class="btn btn--accent" @click="restart">重新開始</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">黑</span>
            <span class="chip__value" :class="{ 'is-accent': turn === 1 && !gameOver }">
              {{ discCounts.black }}
            </span>
          </div>
          <div class="chip">
            <span class="chip__label">回合</span>
            <span class="chip__value">
              {{ gameOver ? '結束' : turn === 1 ? '你(黑)' : 'AI(白)' }}
            </span>
          </div>
          <div class="chip">
            <span class="chip__label">白</span>
            <span class="chip__value">{{ discCounts.white }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div class="reversi-board" role="grid" aria-label="黑白棋盤面">
            <button
              v-for="(val, i) in board"
              :key="i"
              class="reversi-cell"
              :class="{
                'is-legal': legalMoves.includes(i) && turn === 1 && !gameOver,
                'is-flip': flipCells.has(i),
              }"
              :aria-label="`第${Math.floor(i/8)+1}行第${i%8+1}列：${val===1?'黑':val===2?'白':'空'}`"
              :disabled="animating || gameOver || turn !== 1 || !legalMoves.includes(i)"
              @click="playerPlace(i)"
            >
              <span
                v-if="val !== 0"
                class="disc"
                :class="val === 1 ? 'disc--black' : 'disc--white'"
              />
              <span
                v-else-if="legalMoves.includes(i) && turn === 1 && !gameOver"
                class="legal-dot"
                aria-hidden="true"
              />
            </button>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions" v-if="!daily">
                <button class="btn btn--accent" @click="restart">再來一局</button>
              </div>
              <div class="overlay__actions" v-else>
                <button class="btn" @click="overlay.open = false">完成！</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">戰績</span>
          <div class="stats-row">
            <div class="stat-item">
              <span class="stat-val" style="color: var(--accent)">{{ stats.wins }}</span>
              <span class="stat-lbl">勝</span>
            </div>
            <div class="stat-item">
              <span class="stat-val">{{ stats.draws }}</span>
              <span class="stat-lbl">平</span>
            </div>
            <div class="stat-item">
              <span class="stat-val" style="color:#f87171">{{ stats.losses }}</span>
              <span class="stat-lbl">敗</span>
            </div>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            你執黑棋先手。點擊標有綠點的格子落子，將夾住的對方棋子全數翻轉。<br/>
            若無合法落點則自動跳過。雙方都無法落子時計算棋數，多者獲勝。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">策略提示</span>
          <p class="hint">
            角落最有價值，搶到角落幾乎無法被翻回。<br/>
            避免讓對手輕易取角，角落旁邊的格子要謹慎。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.reversi-board {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  /* Explicit equal rows — prevents content-driven row height and eliminates
     layout shift when discs or legal-move dots appear/disappear. */
  grid-template-rows: repeat(8, 1fr);
  width: min(86vw, 60vh, 540px);
  height: min(86vw, 60vh, 540px);
  border-radius: var(--r-lg);
  background: #1a4731;
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2), 0 0 40px rgba(87, 204, 153, 0.08);
  overflow: hidden;
  gap: 1px;
  padding: 1px;
}

.reversi-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  /* min-height:0 prevents cells from growing beyond the grid row.
     overflow:hidden clips any accidentally over-sized disc. */
  min-height: 0;
  overflow: hidden;
  background: #1e5438;
  border-radius: 0;
  transition: background var(--dur-fast) var(--ease);
  cursor: default;
  position: relative;
}
.reversi-cell.is-legal {
  cursor: pointer;
  background: #235e41;
}
.reversi-cell.is-legal:hover {
  background: #2a7050;
}
/* :focus-visible ring uses box-shadow (inset) so it never shifts neighbours */
.reversi-cell:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--accent);
}

.disc {
  width: 76%;
  height: 76%;
  border-radius: 50%;
  display: block;
  transition: transform 0.25s var(--ease);
}
.disc--black {
  background: radial-gradient(circle at 35% 30%, #444, #111 70%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.6), inset 0 1px 3px rgba(255,255,255,0.12);
}
.disc--white {
  background: radial-gradient(circle at 35% 30%, #fff, #ccc 70%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 3px rgba(255,255,255,0.8);
}

.reversi-cell.is-flip .disc {
  animation: flipDisc 0.26s ease-in-out;
}
@keyframes flipDisc {
  0%   { transform: scaleX(1); }
  50%  { transform: scaleX(0); }
  100% { transform: scaleX(1); }
}
@media (prefers-reduced-motion: reduce) {
  .reversi-cell.is-flip .disc { animation: none; }
}

.legal-dot {
  width: 28%;
  height: 28%;
  border-radius: 50%;
  background: rgba(87, 204, 153, 0.55);
  display: block;
  pointer-events: none;
  animation: dotPulse 1.8s ease-in-out infinite;
}
@keyframes dotPulse {
  0%, 100% { opacity: 0.5; transform: scale(0.9); }
  50%       { opacity: 1;   transform: scale(1.1); }
}
@media (prefers-reduced-motion: reduce) {
  .legal-dot { animation: none; opacity: 0.7; }
}

.stats-row {
  display: flex;
  gap: 1rem;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
}
.stat-val {
  font-family: var(--font-mono);
  font-size: 1.4rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  min-width: 2ch;
  text-align: center;
}
.stat-lbl {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}
</style>
