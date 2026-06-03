<script setup>
/* 踩地雷 Minesweeper — seeded board, safe-center first-click, flood-reveal.
   Left-click reveal, right-click flag, 🚩 toggle button for touch. */

import {
  buildBoard as msBuildBoard,
  floodReveal as msFloodReveal,
  neighbors as msNeighbors,
  isWin as msIsWin,
} from "~/games/minesweeper";

const accent = "#ff6b6b";
const BEST_KEY = "playground.minesweeper.best";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// Difficulty presets
const DIFFS = [
  { label: "初級", rows: 9, cols: 9, mines: 10 },
  { label: "中級", rows: 16, cols: 16, mines: 40 },
  { label: "高級", rows: 16, cols: 30, mines: 99 },
];

const diffIdx = ref(0);
const diff = computed(() => DIFFS[diffIdx.value]);

// Board state
const cells = ref([]); // flat array of { mine, revealed, flagged, count }
const rows = ref(9);
const cols = ref(9);
const mineCount = ref(10);
const gameState = ref("idle"); // idle | playing | won | lost
const flagMode = ref(false);
const startTime = ref(0);
const elapsed = ref(0);
const bestTime = ref(null);
let timerHandle = null;

// Derived
const remaining = computed(() => {
  const flags = cells.value.filter((c) => c.flagged).length;
  return mineCount.value - flags;
});
const progress = computed(() => {
  const total = rows.value * cols.value - mineCount.value;
  const revealed = cells.value.filter((c) => c.revealed && !c.mine).length;
  return total > 0 ? Math.round((revealed / total) * 100) : 0;
});

function idx(r, c) {
  return r * cols.value + c;
}
function rc(i) {
  return [Math.floor(i / cols.value), i % cols.value];
}
function neighbors(r, c) {
  return msNeighbors(rows.value, cols.value, r, c);
}

function buildBoard(safeR, safeC) {
  const board = msBuildBoard(rows.value, cols.value, mineCount.value, safeR, safeC, props.seed);
  cells.value = board.cells;
}

function floodReveal(r, c) {
  // The module mutates board.cells in place; cells.value IS the same array,
  // so reactive updates propagate automatically.
  msFloodReveal({ cells: cells.value, rows: rows.value, cols: cols.value }, r, c);
}

function startTimer() {
  stopTimer();
  startTime.value = Date.now();
  timerHandle = setInterval(() => {
    elapsed.value = Math.floor((Date.now() - startTime.value) / 1000);
  }, 250);
}
function stopTimer() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
}

function checkWin() {
  if (!msIsWin({ cells: cells.value, rows: rows.value, cols: cols.value })) return;
  stopTimer();
  gameState.value = "won";
  // Auto-flag remaining mines
  cells.value.forEach((c) => { if (c.mine) c.flagged = true; });
  // Save best time
  const t = elapsed.value;
  if (bestTime.value === null || t < bestTime.value) {
    bestTime.value = t;
    try { localStorage.setItem(BEST_KEY + "." + diffIdx.value, String(t)); } catch (_) {}
  }
  emit("solved", { time: t });
}

function reveal(r, c) {
  const cell = cells.value[idx(r, c)];
  if (cell.revealed || cell.flagged) return;

  if (gameState.value === "idle") {
    buildBoard(r, c);
    gameState.value = "playing";
    startTimer();
    floodReveal(r, c);
    checkWin();
    return;
  }
  if (gameState.value !== "playing") return;

  if (cell.mine) {
    cell.revealed = true;
    stopTimer();
    gameState.value = "lost";
    // Reveal all mines
    cells.value.forEach((c2) => { if (c2.mine) c2.revealed = true; });
    return;
  }
  floodReveal(r, c);
  checkWin();
}

function flag(r, c) {
  if (gameState.value === "idle") return;
  if (gameState.value !== "playing") return;
  const cell = cells.value[idx(r, c)];
  if (cell.revealed) return;
  cell.flagged = !cell.flagged;
}

function onCellClick(r, c) {
  if (flagMode.value) {
    flag(r, c);
  } else {
    reveal(r, c);
  }
}
function onCellRightClick(e, r, c) {
  e.preventDefault();
  flag(r, c);
}

function initBoard() {
  stopTimer();
  rows.value = diff.value.rows;
  cols.value = diff.value.cols;
  mineCount.value = diff.value.mines;
  gameState.value = "idle";
  elapsed.value = 0;
  flagMode.value = false;
  // Place initial board with center safe
  const safeR = Math.floor(rows.value / 2);
  const safeC = Math.floor(cols.value / 2);
  buildBoard(safeR, safeC);
  // Auto-reveal center
  gameState.value = "playing";
  startTimer();
  floodReveal(safeR, safeC);
  checkWin();
}

function setDiff(i) {
  diffIdx.value = i;
  initBoard();
}

function newGame() {
  initBoard();
}

// Color for number counts
const countColors = ["", "#4fc3f7", "#81c784", "#e57373", "#7986cb", "#ff8a65", "#4dd0e1", "#f06292", "#90a4ae"];

function cellLabel(cell) {
  if (!cell.revealed) return cell.flagged ? "🚩" : "";
  if (cell.mine) return "💣";
  return cell.count > 0 ? String(cell.count) : "";
}

watch(() => props.seed, () => { initBoard(); });

onMounted(() => {
  try {
    bestTime.value = +(localStorage.getItem(BEST_KEY + "." + diffIdx.value) || 0) || null;
  } catch (_) {}
  initBoard();
});

onBeforeUnmount(() => { stopTimer(); });
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="踩地雷" title-en="Minesweeper">
      <template #actions>
        <button
          class="btn"
          :class="{ 'btn--accent': flagMode }"
          :aria-pressed="flagMode"
          @click="flagMode = !flagMode"
        >🚩 標記</button>
        <button class="btn btn--accent" @click="newGame">新遊戲</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">剩餘地雷</span>
            <span class="chip__value is-accent">{{ remaining }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">時間</span>
            <span class="chip__value">{{ elapsed }}s</span>
          </div>
          <div v-if="bestTime !== null" class="chip">
            <span class="chip__label">最佳</span>
            <span class="chip__value">{{ bestTime }}s</span>
          </div>
        </div>

        <div class="board-wrap">
          <div
            class="ms-board"
            :style="{ '--cols': cols, '--rows': rows }"
            aria-label="踩地雷盤面"
            role="grid"
          >
            <button
              v-for="(cell, i) in cells"
              :key="i"
              class="ms-cell"
              :class="{
                'is-revealed': cell.revealed,
                'is-mine': cell.revealed && cell.mine,
                'is-flagged': cell.flagged,
                'is-exploded': cell.revealed && cell.mine && gameState === 'lost',
                [`is-n${cell.count}`]: cell.revealed && !cell.mine && cell.count > 0,
              }"
              :style="cell.revealed && !cell.mine && cell.count > 0 ? { color: countColors[cell.count] } : {}"
              :aria-label="`行${Math.floor(i / cols) + 1}列${(i % cols) + 1} ${cellLabel(cell)}`"
              :disabled="cell.revealed && !cell.mine"
              @click="onCellClick(Math.floor(i / cols), i % cols)"
              @contextmenu="onCellRightClick($event, Math.floor(i / cols), i % cols)"
            >{{ cellLabel(cell) }}</button>
          </div>

          <div class="overlay" :class="{ 'is-open': gameState === 'won' || gameState === 'lost' }">
            <div class="overlay__card">
              <h2 class="overlay__title">
                {{ gameState === 'won' ? (daily ? '完成！' : '🎉 過關！') : '💥 踩到了！' }}
              </h2>
              <p class="overlay__sub">
                <template v-if="gameState === 'won' && daily">
                  今日挑戰完成，用時 {{ elapsed }} 秒。
                </template>
                <template v-else-if="gameState === 'won'">
                  恭喜！用時 {{ elapsed }} 秒，成功排雷。
                </template>
                <template v-else>
                  不小心踩到地雷了，再試一次吧！
                </template>
              </p>
              <div class="overlay__actions">
                <button class="btn btn--accent" @click="newGame">
                  {{ gameState === 'won' && daily ? '返回' : '再玩一次' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!daily" class="diff-bar">
          <div class="seg">
            <button
              v-for="(d, i) in DIFFS"
              :key="i"
              :class="{ 'is-active': diffIdx === i }"
              :aria-pressed="diffIdx === i"
              @click="setDiff(i)"
            >{{ d.label }}</button>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            點擊格子翻開，避開所有地雷。<br />
            右鍵（或點「🚩 標記」後點擊）可在格子上插旗，標記疑似地雷位置。<br />
            翻開所有安全格即過關。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">數字顏色</span>
          <div class="num-legend">
            <span v-for="n in 8" :key="n" :style="{ color: countColors[n] }" class="num-badge">
              {{ n }}
            </span>
          </div>
          <p class="hint">數字代表周圍 8 格中有幾顆地雷。</p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">小提示</span>
          <p class="hint">開局第一次點擊的附近 3×3 格保證安全，放心點下去！</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.ms-board {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  grid-template-rows: repeat(var(--rows), 1fr);
  gap: 2px;
  width: min(86vw, 60vh, 540px);
  aspect-ratio: var(--cols) / var(--rows);
  border-radius: var(--r-lg);
  background: var(--ink-900);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  padding: 6px;
  touch-action: none;
}

.ms-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: clamp(0.55rem, 1.6vw, 0.95rem);
  font-weight: 800;
  border-radius: 3px;
  background: var(--ink-700);
  border: 1px solid var(--line);
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease),
    transform var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
  user-select: none;
  line-height: 1;
}

.ms-cell:not(.is-revealed):hover {
  background: var(--ink-600);
  border-color: var(--line-strong);
  transform: scale(0.93);
}

.ms-cell:active {
  transform: scale(0.88);
}

.ms-cell.is-revealed {
  background: var(--ink-850, #131419);
  border-color: transparent;
  cursor: default;
}

.ms-cell.is-flagged {
  background: color-mix(in oklab, var(--accent) 20%, var(--ink-700));
  border-color: color-mix(in oklab, var(--accent) 60%, transparent);
}

.ms-cell.is-mine {
  background: color-mix(in oklab, #e74c3c 35%, var(--ink-800));
}

.ms-cell.is-exploded {
  background: #e74c3c;
  animation: explode 0.35s var(--ease-out) forwards;
}

@keyframes explode {
  0% { transform: scale(1.4); background: #fff; }
  100% { transform: scale(1); background: #e74c3c; }
}

.diff-bar {
  width: min(86vw, 60vh, 540px);
}

.num-legend {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.num-badge {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 800;
  min-width: 1.4rem;
  text-align: center;
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}
</style>
