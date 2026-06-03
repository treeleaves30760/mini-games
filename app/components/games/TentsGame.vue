<script setup>
/* 帳篷 Tents and Trees — place tents next to trees; no two tents touch (8-dir);
   row/col clue counts must match; perfect tent-tree matching required. */

import {
  cellIdx as idx,
  inBounds,
  ORTH,
  DIAG8,
  bipartiteMatch,
  buildPuzzle,
  isWin as checkIsWin,
  CELL_TREE,
  CELL_TENT,
  CELL_GRASS,
  CELL_EMPTY,
} from "~/games/tents";

const accent = "#5bb368";

const props = defineProps({
  seed:  { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(['solved']);

// ---- Difficulty ----
const DIFFICULTIES = [
  { label: '簡單', size: 6 },
  { label: '普通', size: 8 },
  { label: '困難', size: 10 },
];
const diffIdx = ref(1); // default 普通 8×8

const gridSize = computed(() => {
  if (props.daily) return 8;
  return DIFFICULTIES[diffIdx.value].size;
});

// ---- Game state ----
// Cell values: 0=empty, 1=tree(fixed), 2=tent(player), 3=grass(player mark)
const cells    = ref([]); // flat array, length = N*N
const rowClues = ref([]);
const colClues = ref([]);
const gameWon  = ref(false);
const showOverlay = ref(false);

// ---- Win check ----
function checkWin() {
  if (gameWon.value) return;
  const N = gridSize.value;
  if (!checkIsWin(cells.value, rowClues.value, colClues.value, N)) return;

  // Win!
  gameWon.value = true;
  showOverlay.value = true;
  emit('solved', {});
}

// ---- Cell interaction ----
function onCellPointerDown(e, i) {
  e.preventDefault();
  if (gameWon.value) return;
  const c = cells.value;
  if (c[i] === CELL_TREE) return; // tree, fixed
  // Cycle: 0 → 2(tent) → 3(grass) → 0
  const next = c[i] === CELL_EMPTY ? CELL_TENT : c[i] === CELL_TENT ? CELL_GRASS : CELL_EMPTY;
  const updated = [...c];
  updated[i] = next;
  cells.value = updated;
  checkWin();
}

// ---- Clue status ----
function rowTentCount(r) {
  const N = gridSize.value;
  const c = cells.value;
  let count = 0;
  for (let col = 0; col < N; col++) if (c[idx(r, col, N)] === CELL_TENT) count++;
  return count;
}
function colTentCount(col) {
  const N = gridSize.value;
  const c = cells.value;
  let count = 0;
  for (let r = 0; r < N; r++) if (c[idx(r, col, N)] === CELL_TENT) count++;
  return count;
}

const tentCount = computed(() => {
  return cells.value.filter(v => v === CELL_TENT).length;
});
const treeCount = computed(() => {
  return cells.value.filter(v => v === CELL_TREE).length;
});
const satisfiedLines = computed(() => {
  const N = gridSize.value;
  let s = 0;
  for (let r = 0; r < N; r++) if (rowTentCount(r) === rowClues.value[r]) s++;
  for (let col = 0; col < N; col++) if (colTentCount(col) === colClues.value[col]) s++;
  return s;
});

// ---- Adjacent tent detection for red highlight ----
function isTentConflict(i) {
  const N = gridSize.value;
  const c = cells.value;
  if (c[i] !== CELL_TENT) return false;
  const r = Math.floor(i / N), col = i % N;
  for (const [dr, dc] of DIAG8) {
    const nr = r + dr, nc = col + dc;
    if (!inBounds(nr, nc, N)) continue;
    if (c[idx(nr, nc, N)] === CELL_TENT) return true;
  }
  return false;
}

// ---- Init / regenerate ----
function initGame(seedOverride) {
  const rng = makeRng(seedOverride !== undefined ? seedOverride : props.seed);
  const N = gridSize.value;
  const { playerGrid, rowClues: rClues, colClues: cClues } = buildPuzzle(rng, N);
  cells.value = playerGrid;
  rowClues.value = rClues;
  colClues.value = cClues;
  gameWon.value = false;
  showOverlay.value = false;
}

function newPuzzle() {
  initGame(null); // null = fresh random
}

function clearBoard() {
  const updated = cells.value.map(v => (v === CELL_TREE ? CELL_TREE : CELL_EMPTY));
  cells.value = updated;
  gameWon.value = false;
  showOverlay.value = false;
}

function setDiff(i) {
  diffIdx.value = i;
  initGame(props.seed);
}

watch(() => props.seed, () => initGame());

onMounted(() => { initGame(); });
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="帳篷" title-en="Tents">
      <template #actions>
        <button v-if="!props.daily" class="btn btn--accent" @click="newPuzzle">新題目</button>
        <button class="btn" @click="clearBoard">清除</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <!-- HUD -->
        <div class="hud">
          <div class="chip">
            <span class="chip__label">帳篷</span>
            <span class="chip__value is-accent">{{ tentCount }} / {{ treeCount }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">完成行列</span>
            <span class="chip__value">{{ satisfiedLines }} / {{ gridSize * 2 }}</span>
          </div>
        </div>

        <!-- Board -->
        <div class="board-wrap">
          <div
            class="tents-board"
            :style="{ '--n': gridSize }"
            aria-label="帳篷遊戲格"
          >
            <!-- Top-left corner spacer -->
            <div class="tents-corner"></div>

            <!-- Column clues (top row) -->
            <div
              v-for="(clue, col) in colClues"
              :key="'ch' + col"
              class="tents-col-clue"
              :class="{
                'is-ok':   colTentCount(col) === clue,
                'is-over': colTentCount(col) > clue,
              }"
            >
              {{ clue }}
            </div>

            <!-- Each grid row: row clue + cells -->
            <template v-for="r in gridSize" :key="'row' + r">
              <!-- Row clue -->
              <div
                class="tents-row-clue"
                :class="{
                  'is-ok':   rowTentCount(r - 1) === rowClues[r - 1],
                  'is-over': rowTentCount(r - 1) > rowClues[r - 1],
                }"
              >
                {{ rowClues[r - 1] }}
              </div>

              <!-- Row cells -->
              <div
                v-for="col in gridSize"
                :key="'cell' + r + '-' + col"
                class="tents-cell"
                :class="{
                  'is-tree':     cells[idx(r - 1, col - 1, gridSize)] === 1,
                  'is-tent':     cells[idx(r - 1, col - 1, gridSize)] === 2,
                  'is-grass':    cells[idx(r - 1, col - 1, gridSize)] === 3,
                  'is-conflict': isTentConflict(idx(r - 1, col - 1, gridSize)),
                }"
                :aria-label="`第${r}行第${col}列`"
                @pointerdown="(e) => onCellPointerDown(e, idx(r - 1, col - 1, gridSize))"
              >
                <!-- Tree glyph -->
                <svg
                  v-if="cells[idx(r - 1, col - 1, gridSize)] === 1"
                  class="glyph-tree"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 2 L18 10 H14.5 L19 16 H14 L14 22 H10 L10 16 H5 L9.5 10 H6 Z"/>
                </svg>
                <!-- Tent glyph -->
                <svg
                  v-else-if="cells[idx(r - 1, col - 1, gridSize)] === 2"
                  class="glyph-tent"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 3 L22 19 H2 Z M12 3 L8 19 H16 Z" fill-rule="evenodd"/>
                  <rect x="2" y="19" width="20" height="2" rx="1"/>
                </svg>
                <!-- Grass dot -->
                <span v-else-if="cells[idx(r - 1, col - 1, gridSize)] === 3" class="grass-dot" aria-hidden="true"></span>
              </div>
            </template>
          </div>

          <!-- Win overlay -->
          <div class="overlay" :class="{ 'is-open': showOverlay }">
            <div class="overlay__card">
              <h2 class="overlay__title">紮營完成！</h2>
              <p class="overlay__sub">每棵樹都配好帳篷了！</p>
              <div class="overlay__actions">
                <button v-if="!props.daily" class="btn btn--accent" @click="newPuzzle">再來一局</button>
                <button class="btn" @click="showOverlay = false">關閉</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Difficulty selector (non-daily only) -->
        <div v-if="!props.daily" class="diff-wrap">
          <div class="seg">
            <button
              v-for="(d, i) in DIFFICULTIES"
              :key="i"
              :class="{ 'is-active': diffIdx === i }"
              :aria-pressed="diffIdx === i"
              @click="setDiff(i)"
            >{{ d.label }} {{ d.size }}×{{ d.size }}</button>
          </div>
        </div>
      </div>

      <!-- Side panel -->
      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">規則</span>
          <p class="hint">
            每棵樹旁要紮一頂帳篷（上下左右相鄰）。帳篷彼此不能相鄰（含斜角），
            每行每列的帳篷數要等於邊上的數字。點格子可切換
            帳篷／草地標記。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">圖例</span>
          <div class="legend-list">
            <div class="legend-row">
              <span class="legend-swatch swatch-tree">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true">
                  <path d="M12 2 L18 10 H14.5 L19 16 H14 L14 22 H10 L10 16 H5 L9.5 10 H6 Z"/>
                </svg>
              </span>
              <span class="legend-label">樹（固定）</span>
            </div>
            <div class="legend-row">
              <span class="legend-swatch swatch-tent">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true">
                  <path d="M12 3 L22 19 H2 Z M12 3 L8 19 H16 Z" fill-rule="evenodd"/>
                  <rect x="2" y="19" width="20" height="2" rx="1"/>
                </svg>
              </span>
              <span class="legend-label">帳篷（點選放置）</span>
            </div>
            <div class="legend-row">
              <span class="legend-swatch swatch-grass"><span class="grass-dot"></span></span>
              <span class="legend-label">草地標記（輔助用）</span>
            </div>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">操作</span>
          <p class="hint">
            點擊空格：放置帳篷<br/>
            再次點擊：改為草地標記<br/>
            再次點擊：清除格子
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">統計</span>
          <div class="stats-grid">
            <span class="stat-label">已放帳篷</span>
            <span class="stat-val">{{ tentCount }}</span>
            <span class="stat-label">目標數量</span>
            <span class="stat-val">{{ treeCount }}</span>
            <span class="stat-label">完成行列</span>
            <span class="stat-val">{{ satisfiedLines }} / {{ gridSize * 2 }}</span>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ---- Board layout using CSS Grid ---- */
.tents-board {
  display: grid;
  /* 1 column for row-clue + N columns for cells */
  grid-template-columns: auto repeat(var(--n), 1fr);
  /* 1 row for col-clues + N rows for cells */
  grid-template-rows: auto repeat(var(--n), 1fr);
  width: min(88vw, 80vh, 560px);
  border-radius: var(--r-lg);
  background: var(--ink-900);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  touch-action: none;
  user-select: none;
}

/* Top-left corner (above row-clue column, left of col-clues) */
.tents-corner {
  background: var(--ink-850, #0d0f14);
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  border-radius: var(--r-lg) 0 0 0;
}

/* Column clues */
.tents-col-clue {
  background: var(--ink-850, #0d0f14);
  border-right: 1px solid color-mix(in oklab, var(--line) 70%, transparent);
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: clamp(0.9rem, 2.2vw, 1.15rem);
  font-weight: 700;
  color: var(--text-dim);
  padding: 0.5rem 0.2rem;
  min-width: 0;
  transition: color 0.18s var(--ease);
}
.tents-col-clue.is-ok   { color: var(--accent); }
.tents-col-clue.is-over { color: #ff6b6b; }

/* Row clues */
.tents-row-clue {
  background: var(--ink-850, #0d0f14);
  border-right: 1px solid var(--line);
  border-bottom: 1px solid color-mix(in oklab, var(--line) 70%, transparent);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0.2rem 0.65rem 0.2rem 0.5rem;
  font-family: var(--font-mono);
  font-size: clamp(0.9rem, 2.2vw, 1.15rem);
  font-weight: 700;
  color: var(--text-dim);
  transition: color 0.18s var(--ease);
}
.tents-row-clue.is-ok   { color: var(--accent); }
.tents-row-clue.is-over { color: #ff6b6b; }

/* Grid cells */
.tents-cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ink-800);
  border-right: 1px solid color-mix(in oklab, var(--line) 60%, transparent);
  border-bottom: 1px solid color-mix(in oklab, var(--line) 60%, transparent);
  cursor: pointer;
  transition: background 0.15s var(--ease);
  position: relative;
}
.tents-cell:hover {
  background: color-mix(in oklab, var(--accent) 12%, var(--ink-700));
}
.tents-cell.is-tree {
  background: color-mix(in oklab, #4a7c59 18%, var(--ink-800));
  cursor: default;
}
.tents-cell.is-tree:hover {
  background: color-mix(in oklab, #4a7c59 18%, var(--ink-800));
}
.tents-cell.is-tent {
  background: color-mix(in oklab, var(--accent) 18%, var(--ink-800));
}
.tents-cell.is-tent.is-conflict {
  background: color-mix(in oklab, #ff6b6b 22%, var(--ink-800));
}
.tents-cell.is-grass {
  background: color-mix(in oklab, #6b8f5e 10%, var(--ink-850));
}

/* Tree SVG */
.glyph-tree {
  width: clamp(16px, 3.8vw, 28px);
  height: clamp(16px, 3.8vw, 28px);
  color: #6dba7a;
  pointer-events: none;
}

/* Tent SVG */
.glyph-tent {
  width: clamp(14px, 3.5vw, 26px);
  height: clamp(14px, 3.5vw, 26px);
  color: var(--accent);
  pointer-events: none;
}
.tents-cell.is-conflict .glyph-tent {
  color: #ff6b6b;
}

/* Grass dot */
.grass-dot {
  display: block;
  width: clamp(5px, 1.2vw, 8px);
  height: clamp(5px, 1.2vw, 8px);
  border-radius: 50%;
  background: color-mix(in oklab, #6b8f5e 55%, transparent);
  pointer-events: none;
}

/* Difficulty bar */
.diff-wrap {
  width: min(88vw, 80vh, 560px);
}

/* Panel legend/stats */
.legend-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.legend-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.legend-swatch {
  width: 28px;
  height: 28px;
  border-radius: var(--r-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.swatch-tree {
  background: color-mix(in oklab, #4a7c59 25%, var(--ink-700));
  color: #6dba7a;
}
.swatch-tent {
  background: color-mix(in oklab, var(--accent) 22%, var(--ink-700));
  color: var(--accent);
}
.swatch-grass {
  background: color-mix(in oklab, #6b8f5e 12%, var(--ink-700));
}
.legend-label {
  font-size: 0.88rem;
  color: var(--text-dim);
  line-height: 1.3;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.3rem 0.8rem;
  align-items: center;
}
.stat-label {
  font-size: 0.85rem;
  color: var(--text-dim);
}
.stat-val {
  font-family: var(--font-mono);
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text);
  text-align: right;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .tents-cell,
  .tents-col-clue,
  .tents-row-clue {
    transition: none;
  }
}
</style>
