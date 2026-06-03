<script setup>
/* 數織 Nonogram (Picross) — seeded solution generation, row/col clues, drag-paint.
   Left-click fills, right-click (or X-mark toggle) marks definite-empty.
   Pure game logic (clue computation, solution generation, win detection) lives
   in app/games/nonogram.ts and is imported below. */

import {
  computeClues as _computeClues,
  generateSolution as _generateSolution,
  isSolved,
} from "~/games/nonogram";

const accent = "#5ec8d8";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const SIZES = [5, 10, 15];
const sizeIdx = ref(1); // default 10x10
const size = computed(() => SIZES[sizeIdx.value]);

// Board state: 0=empty, 1=filled, 2=marked-X
const board = ref([]);
const solution = ref([]);
const rowClues = ref([]);
const colClues = ref([]);
const gameState = ref("playing"); // playing | won
const markMode = ref(false); // X-mark toggle for touch

const startTime = ref(0);
const elapsed = ref(0);
let timerHandle = null;

// Track drag state
const dragState = reactive({ active: false, value: 0, axis: null, fixedLine: -1, startCell: -1 });

function initGame() {
  stopTimer();
  const N = size.value;
  const sol = _generateSolution(N, props.seed);
  solution.value = sol;
  board.value = new Array(N * N).fill(0);
  const clues = _computeClues(sol, N);
  rowClues.value = clues.rows;
  colClues.value = clues.cols;
  gameState.value = "playing";
  elapsed.value = 0;
  markMode.value = false;
  startTimer();
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

const progress = computed(() => {
  const sol = solution.value;
  const b = board.value;
  if (!sol.length) return 0;
  const total = sol.filter((v) => v === 1).length;
  const correct = sol.filter((v, i) => v === 1 && b[i] === 1).length;
  return total > 0 ? Math.round((correct / total) * 100) : 0;
});

function checkWin() {
  if (!isSolved(board.value, solution.value)) return;
  stopTimer();
  gameState.value = "won";
  emit("solved", { time: elapsed.value });
}

function toggleCell(i) {
  if (gameState.value !== "playing") return;
  const b = [...board.value];
  if (markMode.value) {
    b[i] = b[i] === 2 ? 0 : 2;
  } else {
    b[i] = b[i] === 1 ? 0 : 1;
  }
  board.value = b;
  checkWin();
}

function paintCell(i, value) {
  if (gameState.value !== "playing") return;
  if (board.value[i] === value) return;
  const b = [...board.value];
  b[i] = value;
  board.value = b;
  checkWin();
}

// Pointer events for drag painting
const boardRef = ref(null);

function getCellIndex(e) {
  const el = boardRef.value;
  if (!el) return -1;
  const rect = el.getBoundingClientRect();
  const N = size.value;
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const cellW = rect.width / N;
  const cellH = rect.height / N;
  const c = Math.floor(x / cellW);
  const r = Math.floor(y / cellH);
  if (r < 0 || r >= N || c < 0 || c >= N) return -1;
  return r * N + c;
}

function onBoardPointerDown(e) {
  if (gameState.value !== "playing") return;
  e.preventDefault();
  try { boardRef.value.setPointerCapture(e.pointerId); } catch (_) {}
  const i = getCellIndex(e);
  if (i < 0) return;
  // Determine paint value
  let val;
  if (markMode.value) {
    val = board.value[i] === 2 ? 0 : 2;
  } else {
    val = board.value[i] === 1 ? 0 : 1;
  }
  dragState.active = true;
  dragState.value = val;
  dragState.startCell = i;
  paintCell(i, val);
}

function onBoardPointerMove(e) {
  if (!dragState.active || gameState.value !== "playing") return;
  const i = getCellIndex(e);
  if (i < 0) return;
  paintCell(i, dragState.value);
}

function onBoardPointerUp() {
  dragState.active = false;
}

function onCellRightClick(e, i) {
  e.preventDefault();
  if (gameState.value !== "playing") return;
  const b = [...board.value];
  b[i] = b[i] === 2 ? 0 : 2;
  board.value = b;
  checkWin();
}

function setSize(i) {
  sizeIdx.value = i;
  initGame();
}

// Row completion check for visual feedback
function isRowComplete(r) {
  const N = size.value;
  const sol = solution.value;
  const b = board.value;
  for (let c = 0; c < N; c++) {
    const i = r * N + c;
    if ((sol[i] === 1) !== (b[i] === 1)) return false;
  }
  return true;
}
function isColComplete(c) {
  const N = size.value;
  const sol = solution.value;
  const b = board.value;
  for (let r = 0; r < N; r++) {
    const i = r * N + c;
    if ((sol[i] === 1) !== (b[i] === 1)) return false;
  }
  return true;
}

watch(() => props.seed, () => { initGame(); });

onMounted(() => { initGame(); });
onBeforeUnmount(() => { stopTimer(); });
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="數織" title-en="Nonogram">
      <template #actions>
        <button
          class="btn"
          :class="{ 'btn--accent': markMode }"
          :aria-pressed="markMode"
          @click="markMode = !markMode"
        >✕ 標記</button>
        <button class="btn btn--accent" @click="initGame">新題目</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">進度</span>
            <span class="chip__value is-accent">{{ progress }}%</span>
          </div>
          <div class="chip">
            <span class="chip__label">時間</span>
            <span class="chip__value">{{ elapsed }}s</span>
          </div>
        </div>

        <div class="board-wrap">
          <div class="nono-container" :style="{ '--n': size }">
            <!-- Top-left spacer -->
            <div class="nono-corner"></div>

            <!-- Column clues -->
            <div class="nono-col-clues">
              <div
                v-for="(clue, c) in colClues"
                :key="'cc' + c"
                class="nono-clue nono-col-clue"
                :class="{ 'is-done': isColComplete(c) }"
              >
                <span v-for="(n, j) in clue" :key="j" class="clue-num">{{ n }}</span>
              </div>
            </div>

            <!-- Row clues + board rows -->
            <div class="nono-rows">
              <div
                v-for="(clue, r) in rowClues"
                :key="'rr' + r"
                class="nono-row"
              >
                <div
                  class="nono-clue nono-row-clue"
                  :class="{ 'is-done': isRowComplete(r) }"
                >
                  <span v-for="(n, j) in clue" :key="j" class="clue-num">{{ n }}</span>
                </div>
              </div>
            </div>

            <!-- Board cells -->
            <div
              ref="boardRef"
              class="nono-grid"
              aria-label="數織盤面"
              role="grid"
              @pointerdown="onBoardPointerDown"
              @pointermove="onBoardPointerMove"
              @pointerup="onBoardPointerUp"
              @pointercancel="onBoardPointerUp"
            >
              <button
                v-for="(val, i) in board"
                :key="i"
                class="nono-cell"
                :class="{
                  'is-filled': val === 1,
                  'is-marked': val === 2,
                }"
                :aria-label="`行${Math.floor(i / size) + 1}列${(i % size) + 1}`"
                :aria-pressed="val === 1"
                @contextmenu="onCellRightClick($event, i)"
              ></button>
            </div>
          </div>

          <div class="overlay" :class="{ 'is-open': gameState === 'won' }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ daily ? '完成！' : '🎨 解題成功！' }}</h2>
              <p class="overlay__sub">
                <template v-if="daily">今日數織完成，用時 {{ elapsed }} 秒。</template>
                <template v-else>太棒了！用時 {{ elapsed }} 秒完成圖案。</template>
              </p>
              <div class="overlay__actions">
                <button v-if="!daily" class="btn btn--accent" @click="initGame">下一題</button>
                <button v-else class="btn btn--accent" @click="() => {}">完成</button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!daily" class="diff-bar">
          <div class="seg">
            <button
              v-for="(s, i) in SIZES"
              :key="i"
              :class="{ 'is-active': sizeIdx === i }"
              :aria-pressed="sizeIdx === i"
              @click="setSize(i)"
            >{{ s }}×{{ s }}</button>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            依照左側和上方的數字提示，填滿正確的格子。<br />
            數字代表該行/列連續填色的格數，多組數字代表多段，各段之間至少有一格空白。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">操作</span>
          <p class="hint">
            左鍵點擊或拖曳：填色 / 取消<br />
            右鍵點擊（或開啟「✕ 標記」後點擊）：標記確定為空的格子<br />
            拖曳可連續填色整行/整列。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">提示完成</span>
          <p class="hint">當一行或一列的提示滿足條件時，數字會變暗，表示該行/列已完成。</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.nono-container {
  display: grid;
  grid-template-areas:
    "corner col-clues"
    "rows    grid";
  grid-template-columns: auto 1fr;
  grid-template-rows: auto 1fr;
  width: min(86vw, 60vh, 540px);
  aspect-ratio: 1;
  border-radius: var(--r-lg);
  overflow: hidden;
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  background: var(--ink-900);
  touch-action: none;
}

.nono-corner {
  grid-area: corner;
  background: var(--ink-850, #131419);
}

.nono-col-clues {
  grid-area: col-clues;
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
  background: var(--ink-850, #131419);
  border-bottom: 1px solid var(--line);
}

.nono-col-clue {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 4px 2px;
  gap: 1px;
  border-right: 1px solid color-mix(in oklab, var(--line) 60%, transparent);
}

.nono-rows {
  grid-area: rows;
  display: flex;
  flex-direction: column;
  background: var(--ink-850, #131419);
  border-right: 1px solid var(--line);
}

.nono-row {
  flex: 1;
  display: flex;
  align-items: center;
  border-bottom: 1px solid color-mix(in oklab, var(--line) 60%, transparent);
}

.nono-row-clue {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  padding: 2px 6px;
  width: 100%;
}

.clue-num {
  font-family: var(--font-mono);
  font-size: clamp(0.5rem, 1.4vw, 0.78rem);
  font-weight: 700;
  color: var(--text-dim);
  line-height: 1;
  transition: color var(--dur-fast) var(--ease), opacity var(--dur-fast) var(--ease);
}

.nono-clue.is-done .clue-num {
  color: var(--accent);
  opacity: 0.45;
}

.nono-grid {
  grid-area: grid;
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
  grid-template-rows: repeat(var(--n), 1fr);
  gap: 0;
  touch-action: none;
}

.nono-cell {
  width: 100%;
  height: 100%;
  display: block;
  background: var(--ink-800);
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease);
  user-select: none;
  -webkit-user-select: none;
}

.nono-cell:nth-child(5n) {
  border-right: 1px solid var(--line-strong);
}

/* Every 5th row: stronger horizontal separator */
.nono-grid .nono-cell:nth-child(n + 1) {
  /* handled via grid row borders approach */
}

.nono-cell:hover {
  background: color-mix(in oklab, var(--accent) 20%, var(--ink-700));
}

.nono-cell.is-filled {
  background: var(--accent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 70%, white);
}

.nono-cell.is-marked {
  background: var(--ink-700);
  position: relative;
}
.nono-cell.is-marked::before,
.nono-cell.is-marked::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 55%;
  height: 2px;
  background: color-mix(in oklab, #e74c3c 80%, transparent);
  border-radius: 1px;
}
.nono-cell.is-marked::before { transform: translate(-50%, -50%) rotate(45deg); }
.nono-cell.is-marked::after  { transform: translate(-50%, -50%) rotate(-45deg); }

.diff-bar {
  width: min(86vw, 60vh, 540px);
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}
</style>
