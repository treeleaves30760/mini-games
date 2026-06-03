<script setup>
/* 照明 Light Up (Akari) — place bulbs on white cells to illuminate every cell.
   Rules: every white cell lit; no two bulbs see each other; numbered walls have
   exactly that many adjacent bulbs. Seeded RNG guarantees a solvable board. */

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

// ---- index helpers ----
function idx(r, c) { return r * gridSize.value + c; }
function rc(i) {
  const S = gridSize.value;
  return [Math.floor(i / S), i % S];
}
function inBounds(r, c) {
  const S = gridSize.value;
  return r >= 0 && r < S && c >= 0 && c < S;
}

// ---- board generator ----
function buildBoard(rng, size) {
  const S = size;
  const total = S * S;

  // Step 1: place walls (~17% of cells)
  const wallFraction = 0.17;
  const board = Array.from({ length: total }, () => ({
    wall: false, num: null, bulb: false,
  }));
  for (let i = 0; i < total; i++) {
    if (rng.bool(wallFraction)) board[i].wall = true;
  }

  // Step 2: greedy cover — place bulbs on uncovered white cells
  // covered[i] = true when cell i is lit by some bulb
  const covered = new Array(total).fill(false);
  const solutionBulbs = new Set();

  // Mark the rays from a given position as covered (not the bulb cell itself)
  function rayIndices(r, c) {
    const rays = [];
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc;
      while (inBounds(nr, nc)) {
        const ni = idx(nr, nc);
        if (board[ni].wall) break;
        rays.push(ni);
        nr += dr;
        nc += dc;
      }
    }
    return rays;
  }

  // Scan in order; for any uncovered white cell, place a bulb there.
  // Because we only place on uncovered cells, no bulb will be within the
  // ray of an already-placed bulb, so mutual-visibility is automatically safe.
  for (let i = 0; i < total; i++) {
    if (board[i].wall) continue;
    if (covered[i]) continue;
    // Place bulb here
    solutionBulbs.add(i);
    covered[i] = true;
    const [r, c] = rc(i);
    for (const ni of rayIndices(r, c)) {
      covered[ni] = true;
    }
  }

  // Step 3: compute each wall's adjacent bulb count; reveal ~75% of them
  const DIRS4 = [[-1,0],[1,0],[0,-1],[0,1]];
  for (let i = 0; i < total; i++) {
    if (!board[i].wall) continue;
    const [r, c] = rc(i);
    let adjBulbs = 0;
    for (const [dr, dc] of DIRS4) {
      const ni = idx(r + dr, c + dc);
      if (inBounds(r + dr, c + dc) && solutionBulbs.has(ni)) adjBulbs++;
    }
    // Reveal number on ~75% of walls
    if (rng.bool(0.75)) board[i].num = adjBulbs;
  }

  return board;
}

// ---- compute lighting ----
function recomputeLighting() {
  const S = gridSize.value;
  const board = cells.value;
  const total = S * S;
  const newLit = new Set();
  const newConflict = new Set();

  const DIRS4 = [[-1,0],[1,0],[0,-1],[0,1]];

  // For each bulb, cast rays; if ray hits another bulb → conflict
  for (let i = 0; i < total; i++) {
    if (board[i].wall || !board[i].bulb) continue;
    newLit.add(i);
    const [r, c] = rc(i);
    for (const [dr, dc] of DIRS4) {
      let nr = r + dr, nc = c + dc;
      while (inBounds(nr, nc)) {
        const ni = idx(nr, nc);
        if (board[ni].wall) break;
        if (board[ni].bulb) {
          // mutual conflict
          newConflict.add(i);
          newConflict.add(ni);
          break;
        }
        newLit.add(ni);
        nr += dr;
        nc += dc;
      }
    }
  }

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
  const total = gridSize.value * gridSize.value;

  // 1. All white cells lit
  if (litWhite.value !== totalWhite.value) return;

  // 2. No conflicts
  if (conflictSet.value.size > 0) return;

  // 3. Every numbered wall satisfied
  const DIRS4 = [[-1,0],[1,0],[0,-1],[0,1]];
  for (let i = 0; i < total; i++) {
    const cell = board[i];
    if (!cell.wall || cell.num === null) continue;
    const [r, c] = rc(i);
    let adjBulbs = 0;
    for (const [dr, dc] of DIRS4) {
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && !board[idx(nr, nc)].wall && board[idx(nr, nc)].bulb) adjBulbs++;
    }
    if (adjBulbs !== cell.num) return;
  }

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
  const board = cells.value;
  const [r, c] = rc(i);
  const DIRS4 = [[-1,0],[1,0],[0,-1],[0,1]];
  let count = 0;
  for (const [dr, dc] of DIRS4) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc) && !board[idx(nr, nc)].wall && board[idx(nr, nc)].bulb) count++;
  }
  return count;
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
