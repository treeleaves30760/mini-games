<script setup>
/* 停車場 Rush Hour — 6×6 sliding lot. Cars and trucks slide along their own
   axis; free the red car so it can drive out through the exit on the right of
   row 2. Drag a vehicle, or select it and use the arrow keys. Undo + restart. */

// Pure logic (framework-free, unit-tested in app/games/rush-hour.ts)
import {
  SIZE,
  generatePuzzle as _generatePuzzle,
  slideRange as _slideRange,
  canSlide as _canSlide,
  slide as _slide,
  isSolved as _isSolved,
} from "~/games/rush-hour";

const accent = "#ef6b6b";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// ---- difficulty ----
const DIFFICULTIES = [
  { label: "簡單", key: "easy" },
  { label: "普通", key: "normal" },
  { label: "困難", key: "hard" },
];
const diffIdx = ref(1);
const difficulty = computed(() => (props.daily ? "normal" : DIFFICULTIES[diffIdx.value].key));

// ---- state ----
const vehicles = ref([]);
const startVehicles = ref([]); // starting position of the current puzzle, for 重來
const optimal = ref(0);
const moves = ref(0);
const history = ref([]); // undo stack: { vehicles, moves } before each move
const selectedId = ref(null);
const won = ref(false);
const exiting = ref(false); // red car sliding out
const overlayOpen = ref(false);
const drag = ref(null); // { id, horizontal, startX, startY, min, max, px, moved }
let keySeqId = null; // vehicle moved by the current arrow-key sequence (one move)
let winTimer = null;

const gridRef = ref(null);
const boardRef = ref(null);

// ---- game control ----
function newPuzzle() {
  const p = _generatePuzzle(makeRng(props.seed), difficulty.value);
  startVehicles.value = p.vehicles;
  optimal.value = p.optimal;
  restart();
}

function restart() {
  if (winTimer) { clearTimeout(winTimer); winTimer = null; }
  vehicles.value = startVehicles.value.map((v) => ({ ...v }));
  moves.value = 0;
  history.value = [];
  selectedId.value = null;
  keySeqId = null;
  won.value = false;
  exiting.value = false;
  overlayOpen.value = false;
  drag.value = null;
}

function undo() {
  if (!history.value.length || won.value) return;
  const h = history.value.pop();
  vehicles.value = h.vehicles;
  moves.value = h.moves;
  selectedId.value = null;
  keySeqId = null;
}

function setDiff(i) {
  diffIdx.value = i;
  newPuzzle();
}

// Slide vehicle `id` by `delta` cells. A drag is one move; consecutive arrow
// keys on the same vehicle are one move as well (and one undo step).
function commit(id, delta, viaKey = false) {
  if (won.value || !_canSlide(vehicles.value, id, delta)) return false;
  if (!(viaKey && keySeqId === id)) {
    history.value.push({ vehicles: vehicles.value, moves: moves.value });
    moves.value++;
  }
  vehicles.value = _slide(vehicles.value, id, delta);
  keySeqId = viaKey ? id : null;
  if (_isSolved(vehicles.value)) finish();
  return true;
}

function finish() {
  won.value = true;
  selectedId.value = null;
  emit("solved", { moves: moves.value, optimal: optimal.value });
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  exiting.value = true;
  winTimer = setTimeout(() => {
    overlayOpen.value = true;
    winTimer = null;
  }, reduce ? 0 : 520);
}

function toggleSelect(id) {
  selectedId.value = selectedId.value === id ? null : id;
  keySeqId = null;
}

// ---- drag ----
function cellPx() {
  if (!gridRef.value) return 64;
  return gridRef.value.getBoundingClientRect().width / SIZE;
}

function onPointerDown(e, id) {
  if (won.value || drag.value) return;
  e.preventDefault();
  const v = vehicles.value.find((x) => x.id === id);
  const { min, max } = _slideRange(vehicles.value, id);
  drag.value = {
    id,
    horizontal: v.horizontal,
    startX: e.clientX,
    startY: e.clientY,
    min,
    max,
    px: 0,
    moved: false,
  };
  try { boardRef.value.setPointerCapture(e.pointerId); } catch (_) {}
}

function onPointerMove(e) {
  const d = drag.value;
  if (!d) return;
  const cp = cellPx();
  const raw = d.horizontal ? e.clientX - d.startX : e.clientY - d.startY;
  d.px = Math.max(d.min * cp, Math.min(d.max * cp, raw));
  if (Math.abs(raw) > 4) d.moved = true;
}

function onPointerUp() {
  const d = drag.value;
  if (!d) return;
  drag.value = null;
  const cells = Math.max(d.min, Math.min(d.max, Math.round(d.px / cellPx())));
  if (cells !== 0) commit(d.id, cells);
  else if (!d.moved) toggleSelect(d.id);
}

function onPointerCancel() {
  drag.value = null;
}

// Keyboard activation of a vehicle button (Enter / Space) — pointer taps are
// handled in onPointerUp, and their synthetic click carries detail > 0.
function onVehicleClick(e, id) {
  if (e.detail === 0 && !won.value) toggleSelect(id);
}

// ---- keyboard ----
const KEY_DELTA = {
  ArrowUp: { delta: -1, horizontal: false },
  ArrowDown: { delta: 1, horizontal: false },
  ArrowLeft: { delta: -1, horizontal: true },
  ArrowRight: { delta: 1, horizontal: true },
};

function onKey(e) {
  if (e.key === "Escape") { selectedId.value = null; keySeqId = null; return; }
  if (won.value || selectedId.value === null) return;
  const k = KEY_DELTA[e.key];
  if (!k) return;
  const v = vehicles.value.find((x) => x.id === selectedId.value);
  if (!v || v.horizontal !== k.horizontal) return;
  e.preventDefault();
  commit(v.id, k.delta, true);
}

// ---- visual helpers ----
function vehicleStyle(v) {
  const d = drag.value;
  const dragging = d && d.id === v.id;
  return {
    "--r": v.row,
    "--c": v.col,
    "--w": v.horizontal ? v.len : 1,
    "--h": v.horizontal ? 1 : v.len,
    "--dx": `${dragging && v.horizontal ? d.px : 0}px`,
    "--dy": `${dragging && !v.horizontal ? d.px : 0}px`,
  };
}

function vehicleLabel(v) {
  const kind = v.id === 0 ? "紅車" : v.len === 3 ? "卡車" : "汽車";
  const dir = v.horizontal ? "橫向" : "直向";
  const state = selectedId.value === v.id ? "已選取，用方向鍵移動" : "點選後可移動";
  return `${kind}，${dir}，第 ${v.row + 1} 列第 ${v.col + 1} 行，${state}`;
}

const cells = Array.from({ length: SIZE * SIZE }, (_, i) => i);

watch(() => props.seed, () => { newPuzzle(); });

onMounted(() => {
  newPuzzle();
  window.addEventListener("keydown", onKey);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  if (winTimer) clearTimeout(winTimer);
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="停車場" title-en="Rush Hour">
      <template #actions>
        <button class="btn" :disabled="!history.length || won" aria-label="復原上一步" @click="undo">復原</button>
        <button v-if="!daily" class="btn" aria-label="回到起始位置" @click="restart">重來</button>
        <button
          class="btn btn--accent"
          :aria-label="daily ? '回到起始位置' : '產生新題目'"
          @click="daily ? restart() : newPuzzle()"
        >{{ daily ? "重來" : "新題目" }}</button>
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
            <span class="chip__label">最少步數</span>
            <span class="chip__value">{{ optimal }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div
            ref="boardRef"
            class="rh-board"
            role="group"
            aria-label="停車場"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerCancel"
          >
            <div ref="gridRef" class="rh-grid">
              <div class="rh-cells" aria-hidden="true">
                <div v-for="i in cells" :key="i" class="rh-cell" />
              </div>

              <div class="rh-exit" aria-hidden="true" />

              <button
                v-for="v in vehicles"
                :key="v.id"
                class="rh-vehicle"
                :class="{
                  'is-red': v.id === 0,
                  'is-truck': v.len === 3,
                  'is-selected': selectedId === v.id,
                  'is-dragging': drag && drag.id === v.id,
                  'is-exiting': exiting && v.id === 0,
                }"
                :style="vehicleStyle(v)"
                :aria-label="vehicleLabel(v)"
                :aria-pressed="selectedId === v.id"
                :disabled="won"
                @pointerdown="onPointerDown($event, v.id)"
                @click="onVehicleClick($event, v.id)"
              />
            </div>
          </div>

          <div class="overlay" :class="{ 'is-open': overlayOpen }">
            <div class="overlay__card">
              <h2 class="overlay__title">完成</h2>
              <p class="overlay__sub">共 {{ moves }} 步，最少 {{ optimal }} 步。</p>
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
            車輛只能沿著自己的方向滑動，不能穿過其他車。<br />
            把擋路的車移開，讓紅車從右側的出口開出去。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">操作</span>
          <p class="hint">
            拖曳車輛即可滑動。<br />
            也可先點選車輛，再用 <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> 逐格移動，<kbd>Esc</kbd> 取消選取。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.rh-board {
  --board: min(86vw, 60vh, 480px);
  --pad: 10px;
  --gap: 4px;
  --inner: calc(var(--board) - 2 * var(--pad) - 2px);
  --cell: calc((var(--inner) - 5 * var(--gap)) / 6);
  --step: calc(var(--cell) + var(--gap));
  position: relative;
  box-sizing: border-box;
  width: var(--board);
  height: var(--board);
  padding: var(--pad);
  border-radius: var(--r-lg);
  background: var(--ink-900);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  touch-action: none;
  user-select: none;
}

.rh-grid {
  position: relative;
  width: var(--inner);
  height: var(--inner);
}

.rh-cells {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-template-rows: repeat(6, 1fr);
  gap: var(--gap);
}

.rh-cell {
  border-radius: var(--r-sm);
  background: var(--ink-800);
}

/* A gap in the frame at the right end of the exit row. */
.rh-exit {
  position: absolute;
  top: calc(var(--step) * 2);
  right: calc(-1 * var(--pad) - 1px);
  width: calc(var(--pad) + 1px);
  height: var(--cell);
  background: linear-gradient(90deg, color-mix(in oklab, var(--accent) 14%, var(--ink-900)), var(--ink-900));
}

.rh-vehicle {
  position: absolute;
  left: 0;
  top: 0;
  width: calc(var(--w) * var(--step) - var(--gap));
  height: calc(var(--h) * var(--step) - var(--gap));
  transform: translate(
    calc(var(--c) * var(--step) + var(--dx) + var(--exit, 0px)),
    calc(var(--r) * var(--step) + var(--dy))
  );
  padding: 0;
  border-radius: var(--r-md);
  border: 1px solid var(--line-strong);
  background: var(--ink-600);
  cursor: grab;
  touch-action: none;
  transition:
    transform var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease),
    opacity var(--dur-fast) var(--ease);
}

.rh-vehicle.is-truck {
  background: var(--ink-500);
}

.rh-vehicle.is-red {
  background: var(--accent);
  border-color: color-mix(in oklab, var(--accent) 70%, white);
}

.rh-vehicle.is-selected {
  box-shadow:
    0 0 0 2px var(--accent),
    0 0 0 5px color-mix(in oklab, var(--accent) 30%, transparent);
  z-index: 1;
}

.rh-vehicle.is-dragging {
  transition: none;
  cursor: grabbing;
  z-index: 2;
}

.rh-vehicle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.rh-vehicle[disabled] {
  cursor: default;
}

/* Win: the red car drives out through the exit. */
.rh-vehicle.is-exiting {
  --exit: calc(var(--step) * 3);
  opacity: 0;
  transition:
    transform 500ms ease-in,
    opacity 500ms ease-in;
}

@media (prefers-reduced-motion: reduce) {
  .rh-vehicle {
    transition: none;
  }
  .rh-vehicle.is-exiting {
    --exit: 0px;
    opacity: 1;
  }
}

.diff-bar {
  width: min(86vw, 60vh, 480px);
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}

.btn[disabled] {
  opacity: 0.35;
  pointer-events: none;
}
</style>
