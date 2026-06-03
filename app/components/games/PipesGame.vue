<script setup>
/* 水管連線 Pipes — rotate every tile so all pipes connect from the central source.
   Spanning-tree generation guarantees a solvable puzzle every time. */

const accent = "#34c7c0";

const props = defineProps({
  seed:  { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(['solved']);

// ---- constants ----
// Directions bitmask: N=1, E=2, S=4, W=8
const N = 1, E = 2, S = 4, W = 8;
const ALL_DIRS = [N, E, S, W];

// dr/dc for each direction
const DR = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 };
const DC = { [N]: 0,  [E]: 1, [S]: 0, [W]: -1 };
// Opposite direction
const OPP = { [N]: S, [E]: W, [S]: N, [W]: E };

// Rotate a connector set 90° clockwise: N→E, E→S, S→W, W→N
function rotateCW(mask) {
  let r = 0;
  if (mask & N) r |= E;
  if (mask & E) r |= S;
  if (mask & S) r |= W;
  if (mask & W) r |= N;
  return r;
}

// ---- difficulty sizes ----
const SIZES = [5, 7, 9];
const SIZE_LABELS = ['簡單', '普通', '困難'];
const sizeIdx = ref(1); // default 7×7 (普通)
const gridSize = computed(() => props.daily ? 7 : SIZES[sizeIdx.value]);

// ---- game state ----
// cells[r][c] = current connector bitmask (live rotation state)
const cells     = ref([]);
// solved[r][c] = the target bitmask (the solution)
const solved    = ref([]);
// start[r][c]  = initial scrambled bitmask (for 清除 reset)
const startMask = ref([]);
// powered[r][c] = boolean — flood-fill from source
const powered   = ref([]);
// rotation angle per cell (multiples of 90, for CSS animation)
const rotDeg    = ref([]);

const moves     = ref(0);
const gameWon   = ref(false);
const overlay   = reactive({ open: false });

// ---- generation ----
function buildPuzzle(rng) {
  const G = gridSize.value;
  const srcR = Math.floor(G / 2);
  const srcC = Math.floor(G / 2);

  // 1. Randomized DFS spanning tree
  const visited = Array.from({ length: G }, () => new Array(G).fill(false));
  // solvedMask[r][c]: which directions connect to tree neighbors
  const solvedMask = Array.from({ length: G }, () => new Array(G).fill(0));

  function dfs(r, c) {
    visited[r][c] = true;
    // Build shuffled neighbor list
    const neighbors = [];
    for (const d of ALL_DIRS) {
      const nr = r + DR[d];
      const nc = c + DC[d];
      if (nr >= 0 && nr < G && nc >= 0 && nc < G && !visited[nr][nc]) {
        neighbors.push({ d, nr, nc });
      }
    }
    rng.shuffle(neighbors);
    for (const { d, nr, nc } of neighbors) {
      if (!visited[nr][nc]) {
        // carve edge: r,c → nr,nc
        solvedMask[r][c] |= d;
        solvedMask[nr][nc] |= OPP[d];
        dfs(nr, nc);
      }
    }
  }

  dfs(srcR, srcC);

  // 2. Scramble each cell with a random rotation
  const initMask = Array.from({ length: G }, () => new Array(G).fill(0));
  const initDeg  = Array.from({ length: G }, () => new Array(G).fill(0));

  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      const rotations = rng.int(0, 3);
      let m = solvedMask[r][c];
      for (let i = 0; i < rotations; i++) m = rotateCW(m);
      initMask[r][c] = m;
      initDeg[r][c] = 0; // visual angle starts at 0 (already embedded rotation)
    }
  }

  // 3. Apply state
  cells.value     = initMask.map(row => [...row]);
  solved.value    = solvedMask.map(row => [...row]);
  startMask.value = initMask.map(row => [...row]);
  rotDeg.value    = initDeg.map(row => [...row]);
  moves.value     = 0;
  gameWon.value   = false;
  overlay.open    = false;

  computePowered();
}

// ---- powered flood-fill ----
function computePowered() {
  const G = gridSize.value;
  const srcR = Math.floor(G / 2);
  const srcC = Math.floor(G / 2);

  const pw = Array.from({ length: G }, () => new Array(G).fill(false));
  const queue = [{ r: srcR, c: srcC }];
  pw[srcR][srcC] = true;

  while (queue.length > 0) {
    const { r, c } = queue.shift();
    for (const d of ALL_DIRS) {
      const nr = r + DR[d];
      const nc = c + DC[d];
      if (nr < 0 || nr >= G || nc < 0 || nc >= G) continue;
      if (pw[nr][nc]) continue;
      // Linked iff both cells have matching connectors
      if ((cells.value[r][c] & d) && (cells.value[nr][nc] & OPP[d])) {
        pw[nr][nc] = true;
        queue.push({ r: nr, c: nc });
      }
    }
  }

  powered.value = pw;
}

// ---- win check ----
function checkWin() {
  const G = gridSize.value;
  // Condition A: no unmatched connectors (none point off-grid or at non-matching neighbor)
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      const m = cells.value[r][c];
      for (const d of ALL_DIRS) {
        if (!(m & d)) continue;
        const nr = r + DR[d];
        const nc = c + DC[d];
        // Points off-grid
        if (nr < 0 || nr >= G || nc < 0 || nc >= G) return;
        // Neighbor doesn't have the opposite connector
        if (!(cells.value[nr][nc] & OPP[d])) return;
      }
    }
  }
  // Condition B: all cells powered
  const totalCells = G * G;
  const poweredCount = powered.value.flat().filter(Boolean).length;
  if (poweredCount < totalCells) return;

  // Win!
  gameWon.value = true;
  overlay.open  = true;
  emit('solved', { moves: moves.value });
}

// ---- powered cell count for HUD ----
const poweredCount = computed(() => {
  if (!powered.value.length) return 0;
  return powered.value.flat().filter(Boolean).length;
});
const totalCells = computed(() => gridSize.value * gridSize.value);

// ---- interaction ----
function rotateTile(r, c) {
  if (gameWon.value) return;
  // Rotate logical mask CW
  cells.value[r][c] = rotateCW(cells.value[r][c]);
  // Advance visual angle
  rotDeg.value[r][c] += 90;
  moves.value++;
  computePowered();
  checkWin();
}

function onPointerDown(e, r, c) {
  e.preventDefault();
  rotateTile(r, c);
}

// ---- reset (清除) ----
function resetPuzzle() {
  const G = gridSize.value;
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      cells.value[r][c]  = startMask.value[r][c];
      rotDeg.value[r][c] = 0;
    }
  }
  moves.value   = 0;
  gameWon.value = false;
  overlay.open  = false;
  computePowered();
}

// ---- new puzzle ----
function newPuzzle() {
  buildPuzzle(makeRng(null));
}

// ---- size change ----
function setSize(i) {
  sizeIdx.value = i;
  buildPuzzle(makeRng(props.seed));
}

// ---- seeded init & watch ----
watch(() => props.seed, () => {
  buildPuzzle(makeRng(props.seed));
});

onMounted(() => {
  buildPuzzle(makeRng(props.seed));
});

// ---- source cell ----
const srcR = computed(() => Math.floor(gridSize.value / 2));
const srcC = computed(() => Math.floor(gridSize.value / 2));

// ---- SVG pipe path helper ----
// Returns SVG "d" paths for the lines from center to each connector midpoint.
// Tile is drawn in a 40×40 viewBox. Center = (20,20).
const CX = 20, CY = 20;
const HALF = 20; // half-tile length (to midpoint of edge)

function getPipeLines(mask) {
  const lines = [];
  if (mask & N) lines.push(`M${CX},${CY} L${CX},${CY - HALF}`);
  if (mask & S) lines.push(`M${CX},${CY} L${CX},${CY + HALF}`);
  if (mask & E) lines.push(`M${CX},${CY} L${CX + HALF},${CY}`);
  if (mask & W) lines.push(`M${CX},${CY} L${CX - HALF},${CY}`);
  return lines.join(' ');
}

// Count bits set
function bitCount(mask) {
  let n = 0;
  if (mask & N) n++;
  if (mask & E) n++;
  if (mask & S) n++;
  if (mask & W) n++;
  return n;
}
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="水管" title-en="Pipes">
      <template #actions>
        <button v-if="!props.daily" class="btn btn--accent" @click="newPuzzle">新題目</button>
        <button class="btn" @click="resetPuzzle">清除</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <!-- HUD -->
        <div class="hud">
          <div class="chip">
            <span class="chip__label">已接</span>
            <span class="chip__value is-accent">{{ poweredCount }} / {{ totalCells }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">步數</span>
            <span class="chip__value">{{ moves }}</span>
          </div>
        </div>

        <!-- Board -->
        <div class="board-wrap">
          <div
            class="pipes-board"
            :style="{ '--g': gridSize }"
            aria-label="水管連線盤面"
            role="grid"
          >
            <div
              v-for="r in gridSize"
              :key="r"
              class="pipes-row"
              role="row"
            >
              <div
                v-for="c in gridSize"
                :key="c"
                class="pipes-cell"
                :class="{
                  'is-powered': powered[r - 1]?.[c - 1],
                  'is-source': r - 1 === srcR && c - 1 === srcC,
                }"
                role="gridcell"
                :aria-label="`第${r}行第${c}列管件`"
                @pointerdown="(e) => onPointerDown(e, r - 1, c - 1)"
              >
                <!-- Pipe SVG rotates visually -->
                <svg
                  class="pipe-svg"
                  viewBox="0 0 40 40"
                  :style="{ transform: `rotate(${rotDeg[r - 1]?.[c - 1] ?? 0}deg)` }"
                  aria-hidden="true"
                >
                  <!-- Pipe lines -->
                  <path
                    v-if="cells[r - 1]?.[c - 1]"
                    class="pipe-line"
                    :d="getPipeLines(cells[r - 1][c - 1])"
                    fill="none"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <!-- Center dot -->
                  <circle
                    cx="20"
                    cy="20"
                    :r="r - 1 === srcR && c - 1 === srcC ? 6 : 3.5"
                    class="pipe-dot"
                  />
                </svg>
              </div>
            </div>
          </div>

          <!-- Win overlay -->
          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">接通了！</h2>
              <p class="overlay__sub">用 {{ moves }} 步接通整個水路！</p>
              <div class="overlay__actions">
                <button v-if="!props.daily" class="btn btn--accent" @click="newPuzzle">再來一局</button>
                <button class="btn" @click="overlay.open = false">關閉</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Difficulty selector (non-daily only) -->
        <div v-if="!props.daily" class="diff-bar">
          <div class="seg">
            <button
              v-for="(label, i) in SIZE_LABELS"
              :key="i"
              :class="{ 'is-active': sizeIdx === i }"
              :aria-pressed="sizeIdx === i"
              @click="setSize(i)"
            >{{ label }}</button>
          </div>
        </div>
      </div>

      <!-- Side panel -->
      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">規則</span>
          <p class="hint">
            點一下旋轉管線。把所有水管接起來、不留任何開口，讓整個盤面都接通中央的水源就過關。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">圖例</span>
          <div class="legend-row">
            <span class="legend-dot is-powered"></span>
            <span class="hint-inline">已接通（亮色）</span>
          </div>
          <div class="legend-row">
            <span class="legend-dot"></span>
            <span class="hint-inline">未接通（暗色）</span>
          </div>
          <div class="legend-row">
            <span class="legend-dot is-source"></span>
            <span class="hint-inline">水源（中央格）</span>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">戰績 / 狀態</span>
          <div class="stats-list">
            <div class="stats-row">
              <span class="stats-label">盤面大小</span>
              <span class="stats-val">{{ gridSize }}×{{ gridSize }}</span>
            </div>
            <div class="stats-row">
              <span class="stats-label">已接通</span>
              <span class="stats-val is-accent">{{ poweredCount }} / {{ totalCells }}</span>
            </div>
            <div class="stats-row">
              <span class="stats-label">旋轉次數</span>
              <span class="stats-val">{{ moves }}</span>
            </div>
            <div class="stats-row">
              <span class="stats-label">狀態</span>
              <span class="stats-val" :class="gameWon ? 'is-accent' : ''">
                {{ gameWon ? '完成！' : '進行中' }}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ---- Board ---- */
.pipes-board {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px;
  border-radius: var(--r-lg);
  background: radial-gradient(130% 130% at 50% 0%, var(--ink-800), var(--ink-900));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  touch-action: none;
  user-select: none;
  width: min(92vw, 70vh, 560px);
}

.pipes-row {
  display: flex;
  gap: 3px;
}

/* ---- Individual tile ---- */
.pipes-cell {
  /* Each cell is a square: total board width / gridSize, accounting for gaps */
  width: calc((min(92vw, 70vh, 560px) - 24px - (var(--g) - 1) * 3px) / var(--g));
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--ink-800);
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease);
  position: relative;
  overflow: hidden;
}

.pipes-cell:hover {
  background: var(--ink-700);
  border-color: var(--line-strong);
}

.pipes-cell:active {
  transform: scale(0.93);
}

/* Powered state */
.pipes-cell.is-powered {
  background: color-mix(in oklab, var(--accent) 12%, var(--ink-800));
  border-color: color-mix(in oklab, var(--accent) 40%, transparent);
}

/* Source cell */
.pipes-cell.is-source {
  background: color-mix(in oklab, var(--accent) 20%, var(--ink-800));
  border-color: color-mix(in oklab, var(--accent) 60%, transparent);
  box-shadow: 0 0 14px color-mix(in oklab, var(--accent) 35%, transparent);
}

/* ---- SVG pipe ---- */
.pipe-svg {
  width: 100%;
  height: 100%;
  display: block;
  transition: transform 0.18s var(--ease);
}

.pipe-line {
  stroke: var(--text-faint);
  stroke-width: 5.5;
}

.pipe-dot {
  fill: var(--text-faint);
}

/* Powered pipe appearance */
.pipes-cell.is-powered .pipe-line {
  stroke: var(--accent);
  filter: drop-shadow(0 0 3px color-mix(in oklab, var(--accent) 70%, transparent));
}

.pipes-cell.is-powered .pipe-dot {
  fill: var(--accent);
}

/* Source dot is always accent-colored */
.pipes-cell.is-source .pipe-dot {
  fill: var(--accent);
  filter: drop-shadow(0 0 4px var(--accent));
}

/* ---- Difficulty bar ---- */
.diff-bar {
  width: min(92vw, 70vh, 560px);
}

/* ---- Panel legend items ---- */
.legend-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.35rem;
}

.legend-dot {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  background: var(--ink-700);
  border: 1px solid var(--text-faint);
  flex-shrink: 0;
}

.legend-dot.is-powered {
  background: color-mix(in oklab, var(--accent) 25%, var(--ink-700));
  border-color: var(--accent);
}

.legend-dot.is-source {
  background: color-mix(in oklab, var(--accent) 40%, var(--ink-700));
  border-color: var(--accent);
  box-shadow: 0 0 6px color-mix(in oklab, var(--accent) 50%, transparent);
}

.hint-inline {
  font-size: 0.85rem;
  color: var(--text-dim);
}

/* ---- Stats list ---- */
.stats-list {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
}

.stats-label {
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  letter-spacing: 0.04em;
}

.stats-val {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text);
}

.stats-val.is-accent {
  color: var(--accent);
}

/* ---- reduced motion ---- */
@media (prefers-reduced-motion: reduce) {
  .pipe-svg {
    transition: none;
  }

  .pipes-cell:active {
    transform: none;
  }
}
</style>
