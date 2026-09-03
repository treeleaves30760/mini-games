<script setup>
/* 連線 Flow — drag from an endpoint to its partner. Paths move orthogonally and
   never cross; the puzzle is complete when every pair is joined and every cell
   is covered. Pure logic (generation, drag model, win check) lives in
   ~/games/flow.ts; only Vue state and pointer handling stay here. */

import {
  generatePuzzle,
  emptyPaths,
  beginDrag,
  dragTo,
  isConnected,
  connectedCount,
  coveredCount,
  isSolved,
} from "~/games/flow";

const accent = "#4fc3f7";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const DIFFICULTIES = [
  { label: "簡單", size: 5 },
  { label: "普通", size: 7 },
  { label: "困難", size: 9 },
];
const diffIdx = ref(1);
const size = computed(() => (props.daily ? 7 : DIFFICULTIES[diffIdx.value].size));

// Muted, distinguishable colours for up to 12 pairs.
const PALETTE = [
  "#d9645a", // red
  "#e0904e", // orange
  "#d9c04f", // yellow
  "#6fb06a", // green
  "#4fb3a6", // teal
  "#5b8fd6", // blue
  "#9d7fd3", // purple
  "#d786ad", // pink
  "#a98668", // brown
  "#a9c25a", // lime
  "#6fc0e0", // sky
  "#9aa4ad", // grey
];
function colorOf(c) {
  return PALETTE[c % PALETTE.length];
}

const endpoints = ref([]);
const paths = ref([]);
const moves = ref(0);
const won = ref(false);
const overlayOpen = ref(false);
const drag = { active: false, color: -1, before: null };

const connected = computed(() => connectedCount(paths.value, endpoints.value));
const fillPercent = computed(() => {
  const total = size.value * size.value;
  return total ? Math.floor((coveredCount(paths.value) / total) * 100) : 0;
});

function initGame() {
  const puzzle = generatePuzzle(makeRng(props.seed), size.value);
  endpoints.value = puzzle.endpoints;
  paths.value = emptyPaths(puzzle.endpoints);
  moves.value = 0;
  won.value = false;
  overlayOpen.value = false;
  drag.active = false;
}

function newPuzzle() {
  initGame();
}

function clearBoard() {
  if (won.value) return;
  paths.value = emptyPaths(endpoints.value);
  drag.active = false;
}

function setDiff(i) {
  diffIdx.value = i;
  initGame();
}

// ---- pointer drag ----
// The board element captures the pointer; cells are hit-tested with
// elementFromPoint against the transparent hit layer drawn last in the SVG.
const boardEl = ref(null);

function cellFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  const hit = el && el.closest ? el.closest("[data-i]") : null;
  if (!hit) return -1;
  const i = Number(hit.dataset.i);
  return Number.isInteger(i) ? i : -1;
}

function samePaths(a, b) {
  if (!a || a.length !== b.length) return false;
  for (let c = 0; c < a.length; c++) {
    if (a[c].length !== b[c].length) return false;
    for (let k = 0; k < a[c].length; k++) if (a[c][k] !== b[c][k]) return false;
  }
  return true;
}

function onPointerDown(e) {
  if (won.value) return;
  e.preventDefault();
  const i = cellFromPoint(e.clientX, e.clientY);
  if (i < 0) return;
  const res = beginDrag(paths.value, endpoints.value, i);
  if (!res) return;
  drag.active = true;
  drag.color = res.color;
  drag.before = paths.value;
  paths.value = res.paths;
  try { boardEl.value?.setPointerCapture(e.pointerId); } catch (_) {}
}

function onPointerMove(e) {
  if (!drag.active) return;
  const i = cellFromPoint(e.clientX, e.clientY);
  if (i < 0) return;
  const next = dragTo(paths.value, endpoints.value, drag.color, i, size.value);
  if (next !== paths.value) paths.value = next;
}

function onPointerUp(e) {
  if (!drag.active) return;
  drag.active = false;
  try { boardEl.value?.releasePointerCapture(e.pointerId); } catch (_) {}
  if (!samePaths(drag.before, paths.value)) moves.value++;
  drag.before = null;
  if (!won.value && isSolved(paths.value, endpoints.value, size.value)) {
    won.value = true;
    overlayOpen.value = true;
    emit("solved", { moves: moves.value });
  }
}

// ---- SVG helpers (1 unit = 1 cell) ----
function cx(i) {
  return (i % size.value) + 0.5;
}
function cy(i) {
  return Math.floor(i / size.value) + 0.5;
}
function pointsOf(path) {
  return path.map((i) => `${cx(i)},${cy(i)}`).join(" ");
}

watch(() => props.seed, () => { initGame(); });
onMounted(() => { initGame(); });
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="連線" title-en="Flow">
      <template #actions>
        <button class="btn btn--accent" :aria-label="daily ? '重來' : '新題目'" @click="newPuzzle">{{ daily ? "重來" : "新題目" }}</button>
        <button class="btn" aria-label="清除" @click="clearBoard">清除</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">步數</span>
            <span class="chip__value is-accent">{{ moves }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">已連</span>
            <span class="chip__value">{{ connected }} / {{ endpoints.length }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">填滿</span>
            <span class="chip__value">{{ fillPercent }}%</span>
          </div>
        </div>

        <div class="board-wrap">
          <div
            ref="boardEl"
            class="flow-board"
            role="group"
            aria-label="連線盤面"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
          >
            <svg class="flow-svg" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true">
              <g class="flow-grid">
                <template v-for="k in size - 1" :key="'g' + k">
                  <line :x1="k" y1="0" :x2="k" :y2="size" />
                  <line x1="0" :y1="k" :x2="size" :y2="k" />
                </template>
              </g>

              <g class="flow-tint">
                <template v-for="(p, c) in paths" :key="'t' + c">
                  <rect
                    v-for="i in p"
                    :key="i"
                    :x="(i % size) + 0.06"
                    :y="Math.floor(i / size) + 0.06"
                    width="0.88"
                    height="0.88"
                    rx="0.14"
                    :fill="colorOf(c)"
                  />
                </template>
              </g>

              <g class="flow-paths">
                <template v-for="(p, c) in paths" :key="'p' + c">
                  <polyline v-if="p.length > 1" :points="pointsOf(p)" :stroke="colorOf(c)" />
                </template>
              </g>

              <g class="flow-dots">
                <template v-for="ep in endpoints" :key="'e' + ep.color">
                  <circle
                    :cx="cx(ep.a)" :cy="cy(ep.a)" r="0.32"
                    :fill="colorOf(ep.color)"
                    :class="{ 'is-done': isConnected(paths[ep.color] || [], ep) }"
                  />
                  <circle
                    :cx="cx(ep.b)" :cy="cy(ep.b)" r="0.32"
                    :fill="colorOf(ep.color)"
                    :class="{ 'is-done': isConnected(paths[ep.color] || [], ep) }"
                  />
                </template>
              </g>

              <g class="flow-hit">
                <rect
                  v-for="i in size * size"
                  :key="'h' + i"
                  :data-i="i - 1"
                  :x="(i - 1) % size"
                  :y="Math.floor((i - 1) / size)"
                  width="1"
                  height="1"
                />
              </g>
            </svg>
          </div>

          <div class="overlay" :class="{ 'is-open': overlayOpen }">
            <div class="overlay__card">
              <h2 class="overlay__title">完成</h2>
              <p class="overlay__sub">共 {{ moves }} 步。</p>
              <div class="overlay__actions">
                <button v-if="!daily" class="btn btn--accent" aria-label="再玩一次" @click="newPuzzle">再玩一次</button>
                <button class="btn" aria-label="關閉" @click="overlayOpen = false">關閉</button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!daily" class="diff-bar">
          <div class="seg">
            <button
              v-for="(d, i) in DIFFICULTIES"
              :key="i"
              :class="{ 'is-active': diffIdx === i }"
              :aria-pressed="diffIdx === i"
              :aria-label="`${d.label} ${d.size}×${d.size}`"
              @click="setDiff(i)"
            >{{ d.label }}</button>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            從一個圓點拖曳到同色的另一個圓點，畫出一條路線。<br />
            路線只能上下左右走，不能互相交叉。<br />
            所有顏色都連好、格子全部填滿即完成。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">操作</span>
          <p class="hint">
            按住圓點或路線中途開始拖曳。<br />
            拖回原路可縮短，畫過別的路線會截斷它。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.flow-board {
  width: min(86vw, 60vh, 480px);
  aspect-ratio: 1;
  padding: 10px;
  box-sizing: border-box;
  border-radius: var(--r-lg);
  background: var(--ink-900);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  cursor: pointer;
}

.flow-svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.flow-grid line {
  stroke: var(--line);
  stroke-width: 0.03;
}

.flow-tint rect {
  opacity: 0.16;
  pointer-events: none;
}

.flow-paths polyline {
  fill: none;
  stroke-width: 0.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}

.flow-dots circle {
  pointer-events: none;
  stroke: var(--ink-900);
  stroke-width: 0.06;
  transition: stroke-width var(--dur-fast) var(--ease);
}
.flow-dots circle.is-done {
  stroke-width: 0;
}

.flow-hit rect {
  fill: none;
  /* The default 1-unit stroke would let each cell's hit area bleed half a
     cell into its neighbours, so hit-test the interior only. */
  stroke: none;
  stroke-width: 0;
  pointer-events: fill;
}

.diff-bar {
  width: min(86vw, 60vh, 480px);
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}

@media (prefers-reduced-motion: reduce) {
  .flow-dots circle {
    transition: none;
  }
}
</style>
