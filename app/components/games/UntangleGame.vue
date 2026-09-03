<script setup>
/* 解結 Untangle — dots joined by lines; drag the dots until no two lines cross.
   Puzzle generation and crossing detection live in app/games/untangle.ts. */

import {
  generatePuzzle as _generatePuzzle,
  crossingPairs as _crossingPairs,
} from "~/games/untangle";

const accent = "#8fd3a0";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// ---- Difficulty ----
const DIFFICULTIES = [
  { label: "簡單", nodes: 8 },
  { label: "普通", nodes: 12 },
  { label: "困難", nodes: 18 },
];
const diffIdx = ref(1);
const nodeCount = computed(() => (props.daily ? 12 : DIFFICULTIES[diffIdx.value].nodes));

// ---- State (positions in viewBox units, 0–100) ----
const NODE_R = 2.6;
const HIT_R = 6;
const MIN = 4;
const MAX = 96;
const KEY_STEP = 2;

const edges = ref([]);
const points = ref([]);
let startPoints = [];
const moves = ref(0);
const won = ref(false);
let solvedEmitted = false;

const dragging = ref(-1);
let dragMoved = false;
let keyNode = -1;
const svgEl = ref(null);

const crossings = computed(() => _crossingPairs(points.value, edges.value));
const crossingCount = computed(() => crossings.value.length);
const crossingEdges = computed(() => {
  const s = new Set();
  for (const [i, j] of crossings.value) {
    s.add(i);
    s.add(j);
  }
  return s;
});

function clamp(v) {
  return Math.min(MAX, Math.max(MIN, v));
}

function resetPositions() {
  points.value = startPoints.map((p) => ({ ...p }));
  moves.value = 0;
  won.value = false;
  dragging.value = -1;
  keyNode = -1;
}

function newPuzzle() {
  const puzzle = _generatePuzzle(makeRng(props.seed), nodeCount.value);
  edges.value = puzzle.edges;
  startPoints = puzzle.points.map(({ x, y }) => ({ x: x * 100, y: y * 100 }));
  solvedEmitted = false;
  resetPositions();
}

function restart() {
  resetPositions();
}

function checkWin() {
  if (won.value || crossingCount.value > 0) return;
  won.value = true;
  dragging.value = -1;
  if (!solvedEmitted) {
    solvedEmitted = true;
    emit("solved", { moves: moves.value });
  }
}

// ---- Pointer drag ----
// The SVG captures the pointer, so a fast drag keeps following the node even
// when the cursor leaves the circle. Hit-testing is by distance rather than by
// element, giving fingers a larger target than the drawn dot.
function toBoard(e) {
  const rect = svgEl.value.getBoundingClientRect();
  return {
    x: clamp(((e.clientX - rect.left) / rect.width) * 100),
    y: clamp(((e.clientY - rect.top) / rect.height) * 100),
  };
}

function nearestNode(p) {
  let best = -1;
  let bestD = HIT_R * HIT_R;
  points.value.forEach((q, i) => {
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

function onPointerDown(e) {
  if (won.value) return;
  const i = nearestNode(toBoard(e));
  if (i < 0) return;
  e.preventDefault();
  dragging.value = i;
  dragMoved = false;
  keyNode = -1;
  try { svgEl.value?.setPointerCapture(e.pointerId); } catch (_) {}
}

function onPointerMove(e) {
  const i = dragging.value;
  if (i < 0) return;
  const next = points.value.slice();
  next[i] = toBoard(e);
  points.value = next;
  dragMoved = true;
}

function onPointerUp() {
  if (dragging.value < 0) return;
  dragging.value = -1;
  if (dragMoved) {
    moves.value++;
    checkWin();
  }
}

// ---- Keyboard: Tab to a dot, arrows nudge it. One move per dot per focus. ----
const KEYS = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

function onKeyDown(e, i) {
  const dir = KEYS[e.key];
  if (!dir || won.value) return;
  e.preventDefault();
  const step = e.shiftKey ? KEY_STEP * 4 : KEY_STEP;
  const next = points.value.slice();
  const p = next[i];
  next[i] = { x: clamp(p.x + dir[0] * step), y: clamp(p.y + dir[1] * step) };
  points.value = next;
  if (keyNode !== i) {
    keyNode = i;
    moves.value++;
  }
  checkWin();
}

function onNodeBlur() {
  keyNode = -1;
}

function setDiff(i) {
  diffIdx.value = i;
  newPuzzle();
}

watch(() => props.seed, () => { newPuzzle(); });
onMounted(() => { newPuzzle(); });
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="解結" title-en="Untangle">
      <template #actions>
        <button
          class="btn btn--accent"
          :aria-label="daily ? '回到起始位置' : '產生新題目'"
          @click="daily ? restart() : newPuzzle()"
        >{{ daily ? "重來" : "新題目" }}</button>
        <button v-if="!daily" class="btn" aria-label="回到起始位置" @click="restart">重來</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">交叉</span>
            <span class="chip__value" :class="{ 'is-accent': crossingCount === 0 }">{{ crossingCount }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">移動</span>
            <span class="chip__value">{{ moves }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <svg
            ref="svgEl"
            class="ut-board"
            :class="{ 'is-won': won, 'is-dragging': dragging >= 0 }"
            viewBox="0 0 100 100"
            role="group"
            aria-label="解結盤面"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
          >
            <line
              v-for="(e, i) in edges"
              :key="'e' + i"
              class="ut-edge"
              :class="{ 'is-cross': crossingEdges.has(i) }"
              :x1="points[e[0]].x"
              :y1="points[e[0]].y"
              :x2="points[e[1]].x"
              :y2="points[e[1]].y"
            />
            <circle
              v-for="(p, i) in points"
              :key="'n' + i"
              class="ut-node"
              :class="{ 'is-drag': dragging === i }"
              :cx="p.x"
              :cy="p.y"
              :r="NODE_R"
              tabindex="0"
              role="button"
              :aria-label="`第 ${i + 1} 個點`"
              @keydown="onKeyDown($event, i)"
              @blur="onNodeBlur"
            />
          </svg>

          <div class="overlay" :class="{ 'is-open': won }">
            <div class="overlay__card">
              <h2 class="overlay__title">完成</h2>
              <p class="overlay__sub">共移動 {{ moves }} 次。</p>
              <div class="overlay__actions">
                <button v-if="!daily" class="btn btn--accent" @click="newPuzzle">再玩一次</button>
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
              @click="setDiff(i)"
            >{{ d.label }}</button>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            拖曳圓點，讓所有線段互不交叉。<br />
            交叉中的線段會顯示為紅色。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">操作</span>
          <p class="hint">
            滑鼠或觸控拖曳圓點。<br />
            <kbd>Tab</kbd> 選取圓點，<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> 微調位置，按住 <kbd>Shift</kbd> 移動較大距離。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.ut-board {
  display: block;
  width: min(86vw, 60vh, 480px);
  aspect-ratio: 1;
  background: var(--ink-900);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.ut-board.is-dragging {
  cursor: grabbing;
}

.ut-edge {
  stroke: var(--text-faint);
  stroke-width: 0.8;
  stroke-linecap: round;
  pointer-events: none;
  transition: stroke var(--dur-fast) var(--ease);
}

.ut-edge.is-cross {
  stroke: #e07070;
}

.ut-board.is-won .ut-edge {
  stroke: var(--accent);
}

.ut-node {
  fill: var(--ink-600);
  stroke: var(--ink-900);
  stroke-width: 0.6;
  cursor: grab;
  outline: none;
  transition:
    fill var(--dur-fast) var(--ease),
    stroke var(--dur-fast) var(--ease);
}

.ut-node:hover {
  fill: var(--ink-500);
}

.ut-node:focus-visible {
  stroke: var(--text-dim);
  stroke-width: 0.8;
}

.ut-node.is-drag {
  fill: var(--ink-500);
  stroke: var(--accent);
  stroke-width: 0.9;
  cursor: grabbing;
}

.ut-board.is-won .ut-node {
  cursor: default;
}

.diff-bar {
  width: min(86vw, 60vh, 480px);
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}

@media (prefers-reduced-motion: reduce) {
  .ut-edge,
  .ut-node {
    transition: none;
  }
}
</style>
