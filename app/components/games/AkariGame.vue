<script setup>
/* 照明 Light Up (Akari) — place bulbs on white cells to illuminate every cell.
   Rules: every white cell lit; no two bulbs see each other; numbered walls have
   exactly that many adjacent bulbs. Seeded RNG guarantees a solvable board. */

import {
  buildBoard,
  computeLighting,
  checkWin as akariCheckWin,
  wallAdjBulbCount,
  cellIdx,
  cellRc,
  inBounds as akariInBounds,
} from "~/games/akari";

const accent = "#ffc24b";

const props = defineProps({
  seed:  { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(['solved']);

// ---- difficulty ----
const DIFFS = [
  { label: '簡單', size: 7 },
  { label: '普通', size: 9 },
  { label: '困難', size: 11 },
];
const diffIdx = ref(1); // default 普通

// ---- board state ----
// cell: { wall: bool, num: number|null, bulb: bool }
const cells    = ref([]);
const gridSize = ref(9);
const gameWon  = ref(false);
const bulbCount = ref(0);

// Derived: lighting & violation maps — recomputed after each toggle
// litSet: Set of indices that are lit (by at least one bulb)
// conflictSet: Set of indices that are in a conflict (bulb sees another bulb)
const litSet      = ref(new Set());
const conflictSet = ref(new Set());
const totalWhite  = ref(0);
const litWhite    = ref(0);

// ---- index helpers (local thin wrappers that capture gridSize) ----
function idx(r, c) { return cellIdx(r, c, gridSize.value); }
function rc(i) { return cellRc(i, gridSize.value); }
function inBounds(r, c) { return akariInBounds(r, c, gridSize.value); }

// ---- compute lighting ----
function recomputeLighting() {
  const S = gridSize.value;
  const board = cells.value;
  const total = S * S;

  const { litSet: newLit, conflictSet: newConflict } = computeLighting(board, S);

  litSet.value = newLit;
  conflictSet.value = newConflict;

  // Count white cells
  let tw = 0, lw = 0;
  for (let i = 0; i < total; i++) {
    if (!board[i].wall) {
      tw++;
      if (newLit.has(i)) lw++;
    }
  }
  totalWhite.value = tw;
  litWhite.value = lw;
  bulbCount.value = board.filter(c => !c.wall && c.bulb).length;
}

// ---- win check ----
function checkWin() {
  if (gameWon.value) return;
  const board = cells.value;
  const S = gridSize.value;
  const lighting = { litSet: litSet.value, conflictSet: conflictSet.value };

  if (!akariCheckWin(board, S, lighting)) return;

  // Won!
  gameWon.value = true;
  emit('solved', {});
}

// ---- interaction ----
function onCellPointerDown(e, i) {
  e.preventDefault();
  const cell = cells.value[i];
  if (cell.wall || gameWon.value) return;
  cell.bulb = !cell.bulb;
  recomputeLighting();
  checkWin();
}

// ---- numbered wall helpers ----
function wallAdjBulbs(i) {
  return wallAdjBulbCount(i, cells.value, gridSize.value);
}

// ---- cell class helper ----
function cellClass(i) {
  const board = cells.value;
  const cell = board[i];
  if (!cell) return '';
  if (cell.wall) return 'ak-wall';
  const classes = ['ak-white'];
  if (cell.bulb) {
    classes.push('ak-bulb');
    if (conflictSet.value.has(i)) classes.push('ak-conflict');
  } else if (litSet.value.has(i)) {
    classes.push('ak-lit');
  }
  return classes.join(' ');
}

// ---- regenerate ----
function regenerate(customSeed) {
  const size = props.daily ? 9 : DIFFS[diffIdx.value].size;
  gridSize.value = size;
  const rng = makeRng(customSeed !== undefined ? customSeed : props.seed);
  const board = buildBoard(rng, size);
  cells.value = board;
  gameWon.value = false;
  recomputeLighting();
}

function newPuzzle() {
  regenerate(null);
}

function clearBulbs() {
  cells.value.forEach(cell => { if (!cell.wall) cell.bulb = false; });
  gameWon.value = false;
  recomputeLighting();
}

function setDiff(i) {
  diffIdx.value = i;
  regenerate(props.seed);
}

// ---- wall number color style ----
function wallNumStyle(i) {
  const board = cells.value;
  if (!board[i] || !board[i].wall || board[i].num === null) return {};
  const adj = wallAdjBulbs(i);
  const num = board[i].num;
  if (adj === num) return { color: accent };
  if (adj > num)   return { color: '#ff6b6b' };
  return { color: 'var(--text)' };
}

watch(() => props.seed, () => regenerate());

onMounted(() => { regenerate(); });
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="照明" title-en="Light Up">
      <template #actions>
        <button v-if="!props.daily" class="btn btn--accent" @click="newPuzzle">新題目</button>
        <button class="btn" @click="clearBulbs">清除</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <!-- HUD chips -->
        <div class="hud">
          <div class="chip">
            <span class="chip__label">照亮</span>
            <span class="chip__value is-accent">{{ litWhite }} / {{ totalWhite }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">燈泡</span>
            <span class="chip__value">{{ bulbCount }}</span>
          </div>
        </div>

        <!-- Board -->
        <div class="board-wrap">
          <div
            class="ak-board"
            :style="{ '--grid-size': gridSize }"
            aria-label="照明遊戲格"
            role="grid"
          >
            <div
              v-for="(cell, i) in cells"
              :key="i"
              :class="cellClass(i)"
              :aria-label="cell.wall ? (cell.num !== null ? `數字牆 ${cell.num}` : '牆') : (cell.bulb ? '燈泡' : '空白格')"
              @pointerdown="(e) => onCellPointerDown(e, i)"
            >
              <!-- Numbered wall -->
              <template v-if="cell.wall && cell.num !== null">
                <span class="ak-wall-num" :style="wallNumStyle(i)">{{ cell.num }}</span>
              </template>

              <!-- Bulb glyph -->
              <template v-else-if="!cell.wall && cell.bulb">
                <svg class="ak-bulb-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path
                    d="M9 21h6M12 3a7 7 0 0 1 4 12.7V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-1.3A7 7 0 0 1 12 3z"
                    fill="currentColor"
                  />
                </svg>
              </template>
            </div>
          </div>

          <!-- Win overlay -->
          <div class="overlay" :class="{ 'is-open': gameWon }">
            <div class="overlay__card">
              <h2 class="overlay__title">全部照亮！</h2>
              <p class="overlay__sub">每個角落都亮起來了！</p>
              <div class="overlay__actions">
                <button v-if="!props.daily" class="btn btn--accent" @click="newPuzzle">換一題</button>
                <button class="btn" @click="clearBulbs">關閉</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Difficulty seg (non-daily only) -->
        <div v-if="!props.daily" class="diff-bar">
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

      <!-- Side panel -->
      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">規則</span>
          <p class="hint">
            點一下白格放／收燈泡。燈泡會照亮整行整列直到牆壁，讓全部白格都被照亮；
            任兩顆燈泡不能互相照到，數字牆周圍的燈泡數要剛好等於牆上的數字。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">說明</span>
          <div class="legend-list">
            <div class="legend-row">
              <span class="legend-swatch swatch-wall"></span>
              <span class="hint">深色格 = 牆</span>
            </div>
            <div class="legend-row">
              <span class="legend-swatch swatch-lit"></span>
              <span class="hint">暖色格 = 已照亮</span>
            </div>
            <div class="legend-row">
              <span class="legend-swatch swatch-bulb"></span>
              <span class="hint">燈泡圖示 = 已放燈泡</span>
            </div>
            <div class="legend-row">
              <span class="legend-swatch swatch-conflict"></span>
              <span class="hint">紅色 = 燈泡互相照到（衝突）</span>
            </div>
          </div>
        </div>

        <div v-if="!props.daily" class="panel__group">
          <span class="panel__legend">難度</span>
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
      </aside>
    </div>
  </div>
</template>

<style scoped>
.ak-board {
  display: grid;
  grid-template-columns: repeat(var(--grid-size), 1fr);
  grid-template-rows: repeat(var(--grid-size), 1fr);
  gap: 3px;
  width: min(92vw, 70vh, 560px);
  aspect-ratio: 1 / 1;
  padding: 8px;
  border-radius: var(--r-lg);
  background: var(--ink-900);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  touch-action: none;
  user-select: none;
}

.ak-wall {
  border-radius: 4px;
  background: var(--ink-600);
  border: 1px solid var(--ink-500);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
}

.ak-white {
  border-radius: 4px;
  background: var(--ink-800);
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease);
}

.ak-white:hover {
  background: var(--ink-700);
  border-color: var(--line-strong);
}

.ak-lit {
  background: color-mix(in oklab, var(--accent) 14%, var(--ink-800));
  border-color: color-mix(in oklab, var(--accent) 25%, transparent);
}

.ak-lit:hover {
  background: color-mix(in oklab, var(--accent) 20%, var(--ink-700));
}

.ak-bulb {
  background: color-mix(in oklab, var(--accent) 22%, var(--ink-800));
  border-color: var(--accent);
  box-shadow: 0 0 8px color-mix(in oklab, var(--accent) 55%, transparent),
              inset 0 0 6px color-mix(in oklab, var(--accent) 20%, transparent);
  color: var(--accent);
}

.ak-bulb:hover {
  background: color-mix(in oklab, var(--accent) 30%, var(--ink-800));
}

.ak-conflict {
  background: color-mix(in oklab, #ff6b6b 22%, var(--ink-800)) !important;
  border-color: #ff6b6b !important;
  box-shadow: 0 0 8px color-mix(in oklab, #ff6b6b 50%, transparent) !important;
  color: #ff6b6b !important;
}

.ak-bulb-svg {
  width: 58%;
  height: 58%;
  display: block;
  flex: none;
  filter: drop-shadow(0 0 4px currentColor);
}

.ak-wall-num {
  font-family: var(--font-mono);
  font-size: clamp(0.9rem, 2.2vw, 1.3rem);
  font-weight: 800;
  line-height: 1;
}

.diff-bar {
  width: min(92vw, 70vh, 560px);
}

/* Legend in side panel */
.legend-list {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.legend-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.legend-swatch {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  flex: none;
  border: 1px solid var(--line);
}
.swatch-wall {
  background: var(--ink-600);
  border-color: var(--ink-500);
}
.swatch-lit {
  background: color-mix(in oklab, var(--accent) 14%, var(--ink-800));
  border-color: color-mix(in oklab, var(--accent) 30%, transparent);
}
.swatch-bulb {
  background: color-mix(in oklab, var(--accent) 22%, var(--ink-800));
  border-color: var(--accent);
  box-shadow: 0 0 5px color-mix(in oklab, var(--accent) 50%, transparent);
}
.swatch-conflict {
  background: color-mix(in oklab, #ff6b6b 22%, var(--ink-800));
  border-color: #ff6b6b;
  box-shadow: 0 0 5px color-mix(in oklab, #ff6b6b 40%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .ak-white,
  .ak-bulb,
  .ak-lit {
    transition: none;
  }
  .ak-bulb-svg {
    filter: none;
  }
}
</style>
