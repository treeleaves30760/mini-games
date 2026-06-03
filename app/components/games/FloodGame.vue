<script setup>
/* 色彩擴散 Flood It — 14×14 grid, 6 colours, flood-fill from top-left.
   Pick a colour each turn; the connected region absorbs adjacent same-colour
   cells. Goal: fill the entire board within the move limit.

   Pure game logic lives in ~/games/flood.ts. */

import {
  PALETTE,
  SIZES,
  LIMITS,
  generateBoard,
  getRegion as computeRegion,
  applyPick,
  isWon,
} from "~/games/flood";

const accent = "#ff9f43";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// ---- palette names (display-only, not part of pure logic) ----
const PALETTE_NAMES = ["紅", "黃", "綠", "藍", "紫", "橙"];

const SIZE_LABELS = ["10", "14", "18"];

const SAVE_KEY = "playground.flood.best";

// ---- reactive state ----
const sizeIdx = ref(1);
const gridSize = computed(() => props.daily ? 14 : SIZES[sizeIdx.value]);
const moveLimit = computed(() => LIMITS[gridSize.value]);

const board = ref([]);
const moves = ref(0);
const won = ref(false);
const lost = ref(false);
const bestMoves = ref(null);
const overlay = reactive({ open: false, title: "", sub: "" });

let rng = makeRng(props.seed);

// ---- board generation ----
function generate() {
  rng = makeRng(props.seed);
  board.value = generateBoard(gridSize.value, rng);
  moves.value = 0;
  won.value = false;
  lost.value = false;
  overlay.open = false;
}

watch(() => props.seed, generate);
watch(sizeIdx, () => { if (!props.daily) generate(); });

// ---- flood fill action ----
function pickColor(colorIdx) {
  if (won.value || lost.value) return;
  const currentColor = board.value[0];
  if (colorIdx === currentColor) return;

  moves.value++;
  board.value = applyPick(board.value, gridSize.value, colorIdx);
  checkResult();
}

function checkResult() {
  if (isWon(board.value)) {
    won.value = true;
    const m = moves.value;
    if (bestMoves.value === null || m < bestMoves.value) {
      bestMoves.value = m;
      saveBest();
    }
    emit("solved", { moves: m });
    if (props.daily) {
      overlay.title = "完成！";
      overlay.sub = `用了 ${m} 步完成色彩擴散。`;
    } else {
      overlay.title = "完成！";
      overlay.sub = `恭喜！只用 ${m} 步就填滿了。`;
    }
    overlay.open = true;
    return;
  }
  if (moves.value >= moveLimit.value) {
    lost.value = true;
    overlay.title = "步數已達上限";
    overlay.sub = `${moveLimit.value} 步內未能全部同色，再試一次！`;
    overlay.open = true;
  }
}

function retry() {
  generate();
}

function newPuzzle() {
  generate();
}

// ---- persistence ----
function saveBest() {
  try { localStorage.setItem(SAVE_KEY, String(bestMoves.value)); } catch (_) {}
}

onMounted(() => {
  try { bestMoves.value = +localStorage.getItem(SAVE_KEY) || null; } catch (_) {}
  generate();
});

// ---- colour cell style ----
const currentColor = computed(() => (board.value.length ? board.value[0] : 0));
const regionSet = computed(() => {
  if (!board.value.length) return new Uint8Array(0);
  return computeRegion(board.value, gridSize.value);
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="色彩擴散" title-en="Flood It">
      <template #actions>
        <button class="btn btn--accent" @click="retry">重來</button>
        <button v-if="!props.daily" class="btn" @click="newPuzzle">新局</button>
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
            <span class="chip__label">上限</span>
            <span class="chip__value">{{ moveLimit }}</span>
          </div>
          <div v-if="bestMoves" class="chip">
            <span class="chip__label">最佳</span>
            <span class="chip__value">{{ bestMoves }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div
            class="flood-grid"
            :style="{ '--gs': gridSize }"
            role="grid"
            aria-label="色彩擴散盤面"
          >
            <div
              v-for="(colorIdx, i) in board"
              :key="i"
              class="flood-cell"
              :class="{ 'is-region': regionSet[i] === 1 }"
              :style="{ background: PALETTE[colorIdx] }"
              role="gridcell"
            />
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button v-if="!props.daily || lost" class="btn btn--accent" @click="retry">
                  {{ lost ? "再試一次" : "再玩一次" }}
                </button>
                <button v-if="won && props.daily" class="btn" disabled>完成！</button>
              </div>
            </div>
          </div>
        </div>

        <!-- colour picker -->
        <div class="palette-row" role="group" aria-label="選擇顏色">
          <button
            v-for="(col, idx) in PALETTE"
            :key="idx"
            class="palette-btn"
            :class="{ 'is-current': idx === currentColor }"
            :style="{ '--col': col }"
            :aria-label="`選擇顏色 ${PALETTE_NAMES[idx]}`"
            :aria-pressed="idx === currentColor"
            @click="pickColor(idx)"
          />
        </div>
      </div>

      <aside class="panel">
        <div v-if="!props.daily" class="panel__group">
          <span class="panel__legend">格子大小</span>
          <div class="seg">
            <button
              v-for="(label, i) in SIZE_LABELS"
              :key="i"
              :class="{ 'is-active': sizeIdx === i }"
              :aria-pressed="sizeIdx === i"
              @click="sizeIdx = i"
            >{{ label }}</button>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            從左上角的顏色區域開始。每次點擊下方調色盤選一個顏色，連通區域
            會變成該色並向外吸收相鄰同色格。在步數上限內讓整片盤面變成同一色即勝利。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">小提示</span>
          <p class="hint">邊緣亮邊的格子是目前的連通區域。優先選能吸收最多格子的顏色！</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.flood-grid {
  display: grid;
  grid-template-columns: repeat(var(--gs), 1fr);
  grid-template-rows: repeat(var(--gs), 1fr);
  width: min(86vw, 60vh, 540px);
  height: min(86vw, 60vh, 540px);
  border-radius: var(--r-lg);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  overflow: hidden;
  gap: 1px;
  background: var(--ink-900);
}

.flood-cell {
  border-radius: 2px;
  transition: background 0.12s var(--ease), box-shadow 0.12s var(--ease);
}

.flood-cell.is-region {
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.55);
}

@media (prefers-reduced-motion: reduce) {
  .flood-cell { transition: none; }
}

.palette-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 0.4rem;
}

.palette-btn {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--col);
  border: 3px solid transparent;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.12);
  transition: transform 0.14s var(--ease), box-shadow 0.14s var(--ease), border-color 0.14s var(--ease);
  cursor: pointer;
}

.palette-btn:hover {
  transform: scale(1.12);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.3);
}

.palette-btn.is-current {
  border-color: #fff;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.5), 0 0 16px var(--col);
  transform: scale(1.18);
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}
</style>
