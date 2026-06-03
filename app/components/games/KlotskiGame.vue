<script setup>
/* 華容道 Klotski — classic 4-wide × 5-tall sliding-block puzzle.
   Two embedded classic layouts (picked via rng).
   Drag or select-then-click-empty to move blocks.
   Undo + reset. Win: 2×2 Cao Cao reaches rows 3-4, cols 1-2. */

// ---- pure logic (shared, unit-tested in app/games/klotski.ts) ----
import {
  COLS,
  ROWS,
  VALID_LAYOUTS,
  blockDims,
  blockCells,
  buildOccupied,
  canMove,
  shiftBlock,
  isWon,
} from "~/games/klotski";

const accent = "#f4a261";
const SAVE_KEY = "playground.klotski.best";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// ---- state ----
const blocks = ref([]);
const moveCount = ref(0);
const won = ref(false);
const overlayOpen = ref(false);
const bestMoves = ref(0);
const isRecord = ref(false);
const history = ref([]); // undo stack: each entry is a blocks snapshot
const layoutName = ref("");
const selectedId = ref(null); // currently selected block id

const boardRef = ref(null);

// ---- persistence ----
function loadBest() {
  try {
    bestMoves.value = Number(localStorage.getItem(SAVE_KEY) || 0);
  } catch (_) {
    bestMoves.value = 0;
  }
}

function saveBest() {
  try {
    const prev = Number(localStorage.getItem(SAVE_KEY) || 0);
    if (!prev || moveCount.value < prev) {
      localStorage.setItem(SAVE_KEY, String(moveCount.value));
      bestMoves.value = moveCount.value;
      isRecord.value = true;
    }
  } catch (_) {}
}

// ---- game control ----
function snapshot() {
  return blocks.value.map((b) => ({ ...b }));
}

function newGame() {
  const rng = makeRng(props.seed);
  const li = rng.int(0, VALID_LAYOUTS.length - 1);
  const layout = VALID_LAYOUTS[li];
  layoutName.value = layout.name;
  blocks.value = layout.blocks.map((b) => ({ ...b }));
  moveCount.value = 0;
  won.value = false;
  overlayOpen.value = false;
  isRecord.value = false;
  selectedId.value = null;
  history.value = [];
  loadBest();
}

watch(() => props.seed, newGame);

function undo() {
  if (!history.value.length || won.value) return;
  blocks.value = history.value.pop();
  moveCount.value = Math.max(0, moveCount.value - 1);
  selectedId.value = null;
}

function reset() {
  newGame();
}

// ---- move logic ----
// Slide block `id` by (dr,dc) one step; push undo snapshot; count move; check win.
function doMove(id, dr, dc) {
  if (won.value) return false;
  const b = blocks.value.find((x) => x.id === id);
  if (!b || !canMove(b, dr, dc, blocks.value)) return false;
  history.value.push(snapshot());
  blocks.value = shiftBlock(blocks.value, id, dr, dc);
  moveCount.value++;
  selectedId.value = null;
  if (isWon(blocks.value)) {
    won.value = true;
    saveBest();
    overlayOpen.value = true;
    emit("solved", { moves: moveCount.value });
  }
  return true;
}

// Slide block `id` in direction (dr,dc) as many steps as possible up to `maxSteps`
// Bundles the whole slide as a single undo entry and a single move count increment.
function slideBlock(id, dr, dc, maxSteps) {
  if (won.value) return 0;
  let cur = blocks.value;
  const b = cur.find((x) => x.id === id);
  if (!b) return 0;
  const snap = snapshot();
  let steps = 0;
  for (let s = 0; s < maxSteps; s++) {
    const bNow = cur.find((x) => x.id === id);
    if (!canMove(bNow, dr, dc, cur)) break;
    cur = shiftBlock(cur, id, dr, dc);
    steps++;
  }
  if (steps === 0) return 0;
  history.value.push(snap);
  blocks.value = cur;
  moveCount.value++;
  selectedId.value = null;
  if (isWon(blocks.value)) {
    won.value = true;
    saveBest();
    overlayOpen.value = true;
    emit("solved", { moves: moveCount.value });
  }
  return steps;
}

// ---- drag ----
let dragId = null;
let pointerStartX = 0;
let pointerStartY = 0;

function cellPx() {
  if (!boardRef.value) return 64;
  return boardRef.value.getBoundingClientRect().width / COLS;
}

function blockAtCell(r, c) {
  const occ = buildOccupied(blocks.value);
  const v = occ[`${r},${c}`];
  return v !== undefined ? v : null;
}

function onPointerDownBlock(e, id) {
  if (won.value) return;
  e.preventDefault();
  dragId = id;
  pointerStartX = e.clientX;
  pointerStartY = e.clientY;
  try { boardRef.value.setPointerCapture(e.pointerId); } catch (_) {}
}

function onPointerUp(e) {
  if (dragId === null) return;
  const id = dragId;
  dragId = null;

  const dx = e.clientX - pointerStartX;
  const dy = e.clientY - pointerStartY;
  const cp = cellPx();
  const threshold = cp * 0.25;

  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
    // Treat as click/tap: toggle selection
    selectedId.value = selectedId.value === id ? null : id;
    return;
  }

  let dr = 0, dc = 0;
  if (Math.abs(dy) >= Math.abs(dx)) {
    dr = dy > 0 ? 1 : -1;
  } else {
    dc = dx > 0 ? 1 : -1;
  }
  // Slide as far as the drag distance implies (up to 4 cells)
  const dist = Math.max(Math.abs(dr * dy), Math.abs(dc * dx));
  const maxSteps = Math.max(1, Math.round(dist / cp));
  slideBlock(id, dr, dc, maxSteps);
}

// Click on an empty cell when a block is selected
function onEmptyCellClick(r, c) {
  if (won.value || selectedId.value === null) return;
  const id = selectedId.value;
  const b = blocks.value.find((x) => x.id === id);
  if (!b) return;

  const dr = r - b.r;
  const dc = c - b.c;

  if (dr !== 0 && dc !== 0) { selectedId.value = null; return; }
  if (dr === 0 && dc === 0) { selectedId.value = null; return; }

  const stepR = dr === 0 ? 0 : dr > 0 ? 1 : -1;
  const stepC = dc === 0 ? 0 : dc > 0 ? 1 : -1;
  const steps = Math.max(Math.abs(dr), Math.abs(dc));

  slideBlock(id, stepR, stepC, steps);
}

// ---- keyboard ----
const KEY_DIRS = {
  ArrowUp:    [-1,  0],
  ArrowDown:  [ 1,  0],
  ArrowLeft:  [ 0, -1],
  ArrowRight: [ 0,  1],
};

function onKey(e) {
  if (won.value || selectedId.value === null) return;
  const d = KEY_DIRS[e.key];
  if (!d) return;
  e.preventDefault();
  doMove(selectedId.value, d[0], d[1]);
}

// ---- visual helpers ----
function blockStyle(b) {
  const { w, h } = blockDims(b.type);
  return {
    gridRow: `${b.r + 1} / span ${h}`,
    gridColumn: `${b.c + 1} / span ${w}`,
  };
}

function blockLabel(b) {
  if (b.id === 0) return "曹操";
  if (b.type === "2x1v") return "將";
  if (b.type === "1x2h") return "關羽";
  return "兵";
}

const emptyCells = computed(() => {
  const occ = buildOccupied(blocks.value);
  const cells = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (occ[`${r},${c}`] === undefined) cells.push({ r, c });
  return cells;
});

onMounted(() => {
  newGame();
  window.addEventListener("keydown", onKey);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="華容道" title-en="Klotski">
      <template #actions>
        <button class="btn" :disabled="!history.length || won" @click="undo">上一步</button>
        <button class="btn" @click="reset">重設</button>
        <button class="btn btn--accent" @click="newGame">新局</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">步數</span>
            <span class="chip__value is-accent">{{ moveCount }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">最佳</span>
            <span class="chip__value">{{ bestMoves || "—" }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">佈局</span>
            <span class="chip__value" style="font-size:0.78rem;letter-spacing:0">{{ layoutName }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div
            ref="boardRef"
            class="kboard"
            role="grid"
            aria-label="華容道棋盤"
            @pointerup="onPointerUp"
            @pointercancel="dragId = null"
          >
            <!-- Empty cell targets -->
            <div
              v-for="ec in emptyCells"
              :key="`ec-${ec.r}-${ec.c}`"
              class="kcell-empty"
              :style="{ gridRow: ec.r + 1, gridColumn: ec.c + 1 }"
              role="gridcell"
              :aria-label="`空格 行${ec.r + 1} 列${ec.c + 1}`"
              @click="onEmptyCellClick(ec.r, ec.c)"
            />

            <!-- Blocks -->
            <button
              v-for="b in blocks"
              :key="b.id"
              class="kblock"
              :class="{
                [`btype-${b.type}`]: true,
                'is-cao': b.id === 0,
                'is-selected': selectedId === b.id,
                'is-won': won && b.id === 0,
              }"
              :style="blockStyle(b)"
              :aria-label="`${blockLabel(b)}，${selectedId === b.id ? '已選中，用方向鍵移動' : '點擊選中'}`"
              :aria-pressed="selectedId === b.id"
              @pointerdown="onPointerDownBlock($event, b.id)"
            >
              <span class="kblock__label">{{ blockLabel(b) }}</span>
              <span v-if="b.id === 0" class="kblock__hint" aria-hidden="true">↓</span>
            </button>

            <!-- Exit indicator at bottom centre (rows 4-5, cols 2-3) -->
            <div class="kexit" aria-hidden="true" />
          </div>

          <div class="overlay" :class="{ 'is-open': overlayOpen }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ isRecord ? "新紀錄！" : "曹操逃脫了！" }}</h2>
              <p class="overlay__sub">
                {{ layoutName }} · {{ moveCount }} 步{{ isRecord ? "（最佳）" : (bestMoves ? ` · 最佳 ${bestMoves}` : "") }}
              </p>
              <div class="overlay__actions">
                <button v-if="!daily" class="btn btn--accent" @click="newGame">再玩一局</button>
                <span v-else class="hint">今日挑戰完成！</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">目標</span>
          <p class="hint">
            把<strong>曹操</strong>（大方塊）移到棋盤底部中央出口處（發亮的虛線格）逃出。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">操作</span>
          <p class="hint">
            <strong>拖曳</strong>方塊可直接滑動。<br />
            也可先<strong>點選</strong>方塊（邊框發光），再點擊目標空格，方塊自動滑過去。<br />
            選中方塊後可用 <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> 方向鍵逐格移動。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">提示</span>
          <p class="hint">
            標準解需要 81 步以上，請耐心規劃路線。<br />
            <strong>上一步</strong>可以撤銷，<strong>重設</strong>回到初始狀態。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.kboard {
  --cell: clamp(54px, calc(min(88vw, 62vh, 530px) / 4), 114px);
  display: grid;
  grid-template-columns: repeat(4, var(--cell));
  grid-template-rows: repeat(5, var(--cell));
  /* explicit row sizing prevents height changing when blocks move */
  gap: 5px;
  padding: 5px;
  border-radius: var(--r-lg);
  background: linear-gradient(180deg, var(--ink-850), var(--ink-900));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  position: relative;
  touch-action: none;
  user-select: none;
  /* fixed intrinsic size so board never reflows */
  width: calc(4 * var(--cell) + 3 * 5px + 10px);
  height: calc(5 * var(--cell) + 4 * 5px + 10px);
}

.kcell-empty {
  border-radius: var(--r-xs);
  background: color-mix(in oklab, var(--ink-900) 55%, transparent);
  border: 1px dashed rgba(255,255,255,0.06);
  cursor: default;
  transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
  z-index: 0;
}

/* When a block is selected, empty cells show as move targets */
.kboard:has(.is-selected) .kcell-empty {
  cursor: pointer;
  border-color: color-mix(in oklab, var(--accent) 28%, transparent);
  background: color-mix(in oklab, var(--accent) 5%, transparent);
}
.kboard:has(.is-selected) .kcell-empty:hover {
  background: color-mix(in oklab, var(--accent) 12%, transparent);
  border-color: color-mix(in oklab, var(--accent) 55%, transparent);
}

.kblock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-radius: var(--r-sm);
  border: 1.5px solid var(--line-strong);
  background: linear-gradient(140deg, var(--ink-600), var(--ink-700));
  font-family: var(--font-display);
  font-weight: 800;
  color: var(--text);
  cursor: grab;
  touch-action: none;
  z-index: 1;
  transition: border-color var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease),
    background var(--dur-fast) var(--ease),
    transform var(--dur-fast) var(--ease);
}

.kblock:active {
  cursor: grabbing;
}

/* Cao Cao — accent tint */
.kblock.btype-2x2 {
  background: linear-gradient(135deg,
    color-mix(in oklab, var(--accent) 30%, var(--ink-600)),
    color-mix(in oklab, var(--accent) 15%, var(--ink-700)));
  border-color: color-mix(in oklab, var(--accent) 65%, transparent);
  box-shadow: 0 6px 28px -12px var(--accent);
}

/* Vertical generals — blue tint */
.kblock.btype-2x1v {
  background: linear-gradient(160deg,
    color-mix(in oklab, #6aa6ff 22%, var(--ink-600)),
    var(--ink-700));
  border-color: color-mix(in oklab, #6aa6ff 38%, transparent);
}

/* Horizontal Guan Yu — pink tint */
.kblock.btype-1x2h {
  background: linear-gradient(135deg,
    color-mix(in oklab, #ff7a9c 22%, var(--ink-600)),
    var(--ink-700));
  border-color: color-mix(in oklab, #ff7a9c 38%, transparent);
}

/* Foot soldiers */
.kblock.btype-1x1 {
  background: linear-gradient(135deg, var(--ink-500), var(--ink-600));
}

/* Selected state — box-shadow and transform only, no size/border-width change */
.kblock.is-selected {
  border-color: var(--accent) !important;
  /* use inset box-shadow instead of outline to avoid shifting neighbours */
  box-shadow: inset 0 0 0 1.5px var(--accent), 0 0 0 2px var(--accent), 0 8px 28px -12px var(--accent);
  transform: scale(1.04);
  z-index: 2;
}

/* Inset focus ring so it never overflows the grid gap */
.kblock:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -3px;
}

/* Win celebration */
.kblock.is-won {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 2.5px var(--accent), 0 10px 40px -12px var(--accent);
  animation: kWin 0.55s var(--ease-out);
}

@keyframes kWin {
  0%   { transform: scale(1); }
  45%  { transform: scale(1.1); }
  100% { transform: scale(1.04); }
}

.kblock__label {
  font-size: clamp(0.68rem, calc(var(--cell) * 0.22), 1.25rem);
  line-height: 1;
  pointer-events: none;
}

.kblock__hint {
  font-size: clamp(0.55rem, calc(var(--cell) * 0.16), 0.85rem);
  opacity: 0.65;
  pointer-events: none;
  animation: exitBounce 1.8s var(--ease) infinite;
}

@keyframes exitBounce {
  0%, 100% { transform: translateY(0); opacity: 0.45; }
  50%       { transform: translateY(3px); opacity: 0.9; }
}

/* Exit zone: row 4-5, cols 2-3 (0-indexed) → grid 4/span 2, row 4/span 2?
   Cao Cao wins when r=3,c=1 (0-indexed) → grid-row 4/span 2, grid-col 2/span 2 */
.kexit {
  grid-row: 4 / span 2;
  grid-column: 2 / span 2;
  border-radius: var(--r-xs);
  border: 2px dashed color-mix(in oklab, var(--accent) 50%, transparent);
  background: color-mix(in oklab, var(--accent) 6%, transparent);
  pointer-events: none;
  z-index: 0;
  animation: exitPulse 2.4s var(--ease) infinite;
}

@keyframes exitPulse {
  0%, 100% { border-color: color-mix(in oklab, var(--accent) 30%, transparent); }
  50%       { border-color: color-mix(in oklab, var(--accent) 75%, transparent); }
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}

.btn[disabled] {
  opacity: 0.35;
  pointer-events: none;
}

/* Numeric readouts: tabular nums already set on .chip__value globally;
   ensure the layoutName chip doesn't cause width jumps by clamping it */
.chip__value[style] {
  min-width: 0;
  max-width: 10ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .kblock__hint { animation: none; }
  .kexit { animation: none; }
  .kblock.is-won { animation: none; }
}
</style>
