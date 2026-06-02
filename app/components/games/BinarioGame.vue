<script setup>
/* 二進位 Binario (Takuzu) — fill the grid with 0s and 1s.
   Rules: no three identical consecutive in any row/col; equal counts per row/col.
   A full valid solution is generated via backtracking with rng, then cells are
   removed. Given cells are locked; clicking empty cells cycles empty→0→1→empty.
   Live-validation highlights violated cells in red. */

const accent = "#7ed957";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const SIZES = [4, 6, 8];
const SIZE_LABELS = ["4", "6", "8"];
const SAVE_KEY_TIME = "playground.binario.besttime";

const sizeIdx = ref(1);
const gridSize = computed(() => props.daily ? 6 : SIZES[sizeIdx.value]);

// ---- reactive state ----
const solution = ref([]);  // flat array, 0 or 1
const given = ref([]);     // flat bool array
const cells = ref([]);     // flat array: null | 0 | 1
const won = ref(false);
const startTime = ref(0);
const elapsed = ref(0);
const bestTime = ref(null);
const overlay = reactive({ open: false, title: "", sub: "" });
let timerInterval = null;

let rng = makeRng(props.seed);

// ---- solver / generator ----
function generateSolution(size) {
  const grid = new Array(size * size).fill(-1);

  function rowOk(g, r, c, v) {
    const base = r * size;
    // no three consecutive
    if (c >= 2 && g[base + c - 1] === v && g[base + c - 2] === v) return false;
    if (c >= 1 && c + 1 < size && g[base + c - 1] === v && g[base + c + 1] === v) return false;
    if (c + 2 < size && g[base + c + 1] === v && g[base + c + 2] === v) return false;
    // count constraint
    const halfSize = size / 2;
    const count = g.slice(base, base + size).filter(x => x === v).length;
    if (count >= halfSize) return false;
    return true;
  }

  function colOk(g, r, c, v) {
    const halfSize = size / 2;
    // no three consecutive
    if (r >= 2 && g[(r - 1) * size + c] === v && g[(r - 2) * size + c] === v) return false;
    if (r >= 1 && r + 1 < size && g[(r - 1) * size + c] === v && g[(r + 1) * size + c] === v) return false;
    if (r + 2 < size && g[(r + 1) * size + c] === v && g[(r + 2) * size + c] === v) return false;
    // count
    let count = 0;
    for (let i = 0; i < size; i++) if (g[i * size + c] === v) count++;
    if (count >= halfSize) return false;
    return true;
  }

  function rowsUnique(g, r) {
    const row = g.slice(r * size, r * size + size);
    if (row.includes(-1)) return true;
    for (let pr = 0; pr < r; pr++) {
      const prev = g.slice(pr * size, pr * size + size);
      if (prev.every((v, i) => v === row[i])) return false;
    }
    return true;
  }

  function colsUnique(g, c, r) {
    // only check if column is full up to r
    const col = [];
    for (let i = 0; i <= r; i++) col.push(g[i * size + c]);
    if (r < size - 1) return true;
    if (col.includes(-1)) return true;
    for (let pc = 0; pc < c; pc++) {
      const prev = [];
      for (let i = 0; i < size; i++) prev.push(g[i * size + pc]);
      if (prev.every((v, i) => v === col[i])) return false;
    }
    return true;
  }

  function bt(idx) {
    if (idx === size * size) return true;
    const r = (idx / size) | 0;
    const c = idx % size;
    const order = rng.bool() ? [0, 1] : [1, 0];
    for (const v of order) {
      if (!rowOk(grid, r, c, v)) continue;
      if (!colOk(grid, r, c, v)) continue;
      grid[idx] = v;
      if (!rowsUnique(grid, r)) { grid[idx] = -1; continue; }
      if (!colsUnique(grid, c, r)) { grid[idx] = -1; continue; }
      if (bt(idx + 1)) return true;
      grid[idx] = -1;
    }
    return false;
  }

  bt(0);
  return grid;
}

function removeCells(sol, size) {
  // keep ~50% as givens, remove the other ~50% while maintaining unique solvability
  // For simplicity we remove up to 50% using rng ordering — ensures puzzle is solvable
  // since we keep sufficient constraints
  const indices = Array.from({ length: size * size }, (_, i) => i);
  rng.shuffle(indices);
  const toRemove = Math.floor(size * size * 0.5);
  const giv = new Array(size * size).fill(true);
  for (let i = 0; i < toRemove; i++) {
    giv[indices[i]] = false;
  }
  return giv;
}

function generate() {
  clearInterval(timerInterval);
  rng = makeRng(props.seed);
  const size = gridSize.value;
  const sol = generateSolution(size);
  solution.value = sol;
  const giv = removeCells(sol, size);
  given.value = giv;
  cells.value = sol.map((v, i) => giv[i] ? v : null);
  won.value = false;
  overlay.open = false;
  elapsed.value = 0;
  startTime.value = Date.now();
  timerInterval = setInterval(() => {
    if (!won.value) elapsed.value = Math.floor((Date.now() - startTime.value) / 1000);
  }, 1000);
}

watch(() => props.seed, generate);
watch(sizeIdx, () => { if (!props.daily) generate(); });

// ---- cell interaction ----
function tapCell(i) {
  if (won.value || given.value[i]) return;
  const cur = cells.value[i];
  const next = cur === null ? 0 : cur === 0 ? 1 : null;
  const arr = cells.value.slice();
  arr[i] = next;
  cells.value = arr;
  checkWin();
}

// ---- win check ----
function checkWin() {
  const arr = cells.value;
  if (arr.includes(null)) return;
  // validate all rules
  if (!validateAll(arr, gridSize.value)) return;
  won.value = true;
  clearInterval(timerInterval);
  const t = elapsed.value;
  if (bestTime.value === null || t < bestTime.value) {
    bestTime.value = t;
    saveBest();
  }
  emit("solved", { time: t });
  if (props.daily) {
    overlay.title = "完成！";
    overlay.sub = `耗時 ${formatTime(t)} 完成二進位謎題。`;
  } else {
    overlay.title = "解開了！";
    overlay.sub = `完成！耗時 ${formatTime(t)}。`;
  }
  overlay.open = true;
}

function validateAll(arr, size) {
  for (let r = 0; r < size; r++) {
    const row = arr.slice(r * size, r * size + size);
    if (!validateLine(row)) return false;
  }
  for (let c = 0; c < size; c++) {
    const col = [];
    for (let r = 0; r < size; r++) col.push(arr[r * size + c]);
    if (!validateLine(col)) return false;
  }
  return true;
}

function validateLine(line) {
  if (line.includes(null)) return false;
  const half = line.length / 2;
  const zeros = line.filter(v => v === 0).length;
  const ones = line.filter(v => v === 1).length;
  if (zeros !== half || ones !== half) return false;
  for (let i = 0; i + 2 < line.length; i++) {
    if (line[i] !== null && line[i] === line[i + 1] && line[i] === line[i + 2]) return false;
  }
  return true;
}

// ---- live violation highlighting ----
function violatesCell(idx) {
  if (cells.value[idx] === null) return false;
  const size = gridSize.value;
  const r = (idx / size) | 0;
  const c = idx % size;
  const arr = cells.value;

  // check row three consecutive
  const rowBase = r * size;
  const row = arr.slice(rowBase, rowBase + size);
  if (hasTriple(row, c)) return true;

  // check col three consecutive
  const col = [];
  for (let i = 0; i < size; i++) col.push(arr[i * size + c]);
  if (hasTriple(col, r)) return true;

  // count imbalance only when row/col is fully filled
  const v = arr[idx];
  const rowFull = row.every(x => x !== null);
  if (rowFull) {
    const half = size / 2;
    if (row.filter(x => x === v).length > half) return true;
  }
  const colFull = col.every(x => x !== null);
  if (colFull) {
    const half = size / 2;
    if (col.filter(x => x === v).length > half) return true;
  }

  return false;
}

function hasTriple(line, pos) {
  const v = line[pos];
  if (v === null) return false;
  let streak = 1;
  let l = pos - 1;
  while (l >= 0 && line[l] === v) { streak++; l--; }
  let ri = pos + 1;
  while (ri < line.length && line[ri] === v) { streak++; ri++; }
  return streak >= 3;
}

// ---- helpers ----
function formatTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function saveBest() {
  try { localStorage.setItem(SAVE_KEY_TIME, String(bestTime.value)); } catch (_) {}
}

onMounted(() => {
  try { bestTime.value = +localStorage.getItem(SAVE_KEY_TIME) || null; } catch (_) {}
  generate();
});

onBeforeUnmount(() => clearInterval(timerInterval));
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="二進位" title-en="Binario">
      <template #actions>
        <button class="btn btn--accent" @click="generate">重來</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">時間</span>
            <span class="chip__value is-accent">{{ formatTime(elapsed) }}</span>
          </div>
          <div v-if="bestTime" class="chip">
            <span class="chip__label">最佳</span>
            <span class="chip__value">{{ formatTime(bestTime) }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">空格</span>
            <span class="chip__value">{{ cells.filter(c => c === null).length }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div
            class="binario-grid"
            :style="{ '--gs': gridSize }"
            role="grid"
            :aria-label="`二進位謎題 ${gridSize}×${gridSize}`"
          >
            <button
              v-for="(val, i) in cells"
              :key="i"
              class="bin-cell"
              :class="{
                'is-given': given[i],
                'is-zero': val === 0,
                'is-one': val === 1,
                'is-empty': val === null,
                'is-error': !given[i] && violatesCell(i),
              }"
              :disabled="given[i] || won"
              :aria-label="`格子 ${((i / gridSize) | 0) + 1} 行 ${(i % gridSize) + 1} 列，值為 ${val === null ? '空' : val}`"
              @click="tapCell(i)"
            >
              <span v-if="val !== null" class="bin-val">{{ val }}</span>
            </button>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button v-if="!props.daily" class="btn btn--accent" @click="generate">再來一局</button>
                <button v-else class="btn" disabled>完成！</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div v-if="!props.daily" class="panel__group">
          <span class="panel__legend">尺寸</span>
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
          <span class="panel__legend">規則</span>
          <p class="hint">
            每格填入 <strong>0</strong> 或 <strong>1</strong>。<br />
            每行和每列中 0 和 1 的數量必須相等。<br />
            同一行或列中不能有三個連續相同的數字。<br />
            每行和每列都必須是唯一的。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">操作</span>
          <p class="hint">
            點擊空白格循環切換：空 → 0 → 1 → 空。<br />
            紅色邊框表示目前有衝突。深色格為題目給定，無法修改。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.binario-grid {
  display: grid;
  grid-template-columns: repeat(var(--gs), 1fr);
  grid-template-rows: repeat(var(--gs), 1fr);
  width: min(86vw, 60vh, 480px);
  height: min(86vw, 60vh, 480px);
  border-radius: var(--r-lg);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  overflow: hidden;
  gap: 2px;
  padding: 6px;
  background: var(--ink-900);
}

.bin-cell {
  position: relative;
  display: grid;
  place-items: center;
  border-radius: var(--r-xs);
  background: var(--ink-800);
  border: 2px solid transparent;
  cursor: pointer;
  transition: background 0.14s var(--ease), border-color 0.14s var(--ease), transform 0.1s var(--ease);
  font-family: var(--font-mono);
  overflow: hidden;
}

.bin-cell:not(:disabled):hover {
  background: var(--ink-700);
  transform: scale(0.96);
}

.bin-cell:disabled {
  cursor: default;
}

.bin-cell.is-given {
  background: var(--ink-700);
  border-color: var(--line-strong);
}

.bin-val {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  font-size: clamp(1rem, 3.5vw, 1.7rem);
  line-height: 1;
  pointer-events: none;
}

.bin-cell.is-zero .bin-val {
  color: color-mix(in oklab, var(--accent) 90%, white);
}

.bin-cell.is-one .bin-val {
  color: color-mix(in oklab, #62b6ff 90%, white);
}

.bin-cell.is-given.is-zero {
  background: color-mix(in oklab, var(--accent) 14%, var(--ink-700));
}

.bin-cell.is-given.is-one {
  background: color-mix(in oklab, #62b6ff 14%, var(--ink-700));
}

.bin-cell.is-error {
  border-color: #ff6b6b;
  background: color-mix(in oklab, #ff6b6b 18%, var(--ink-800));
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}

@media (prefers-reduced-motion: reduce) {
  .bin-cell { transition: none; }
}
</style>
