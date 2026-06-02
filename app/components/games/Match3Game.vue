<script setup>
/* 寶石消除 Match 3 — DOM grid, 8×8, 6 gem colors.
   seeded board via rng, no initial matches, move-limited mode.
   emit('solved') on reaching target score within move limit. */

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(['solved']);

const accent = '#f072a9';
const BEST_KEY = 'playground.match3.best';

const SIZE = 8;
const GEM_TYPES = 6;
const TARGET_SCORE = 1500;
const MOVE_LIMIT = 20;

const GEM_COLORS = [
  '#e85a4f', // red
  '#f4a259', // orange
  '#f7e467', // yellow
  '#5cb85c', // green
  '#4ea8de', // blue
  '#b04af0', // purple
];
const GEM_LABELS = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣'];

// reactive
const board = ref([]);
const score = ref(0);
const best = ref(0);
const movesLeft = ref(MOVE_LIMIT);
const selected = ref(null); // { row, col }
const animating = ref(false);
const overlay = reactive({ open: true, mode: 'start', title: '寶石消除', sub: `${MOVE_LIMIT} 步內達到 ${TARGET_SCORE} 分！`, action: '開始遊戲' });
const gameActive = ref(false);

let rng = makeRng(props.seed);
let reducedMotion = false;
const falling = ref(new Set()); // keys of cells that are falling
const clearing = ref(new Set()); // keys of cells being cleared

function cellKey(r, c) { return `${r},${c}`; }

// ---- board generation ----
function randomGem(r2) { return r2.int(0, GEM_TYPES - 1); }

function hasMatch(grid) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE - 2; c++) {
      if (grid[r][c] === grid[r][c + 1] && grid[r][c] === grid[r][c + 2]) return true;
    }
  }
  for (let c = 0; c < SIZE; c++) {
    for (let r = 0; r < SIZE - 2; r++) {
      if (grid[r][c] === grid[r + 1][c] && grid[r][c] === grid[r + 2][c]) return true;
    }
  }
  return false;
}

function hasValidMove(grid) {
  // check if any swap creates a match
  const dirs = [[0,1],[1,0]];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr >= SIZE || nc >= SIZE) continue;
        // swap
        const tmp = grid[r][c];
        grid[r][c] = grid[nr][nc];
        grid[nr][nc] = tmp;
        const ok = hasMatch(grid);
        // swap back
        grid[nr][nc] = grid[r][c];
        grid[r][c] = tmp;
        if (ok) return true;
      }
    }
  }
  return false;
}

function generateBoard() {
  const r2 = makeRng(String(props.seed ?? 'null') + '-board');
  let grid;
  let attempts = 0;
  do {
    grid = [];
    for (let r = 0; r < SIZE; r++) {
      const row = [];
      for (let c = 0; c < SIZE; c++) {
        let gem;
        let tries = 0;
        do {
          gem = randomGem(r2);
          tries++;
        } while (tries < 20 && (
          (c >= 2 && row[c-1] === gem && row[c-2] === gem) ||
          (r >= 2 && grid[r-1][c] === gem && grid[r-2][c] === gem)
        ));
        row.push(gem);
      }
      grid.push(row);
    }
    attempts++;
  } while ((hasMatch(grid) || !hasValidMove(grid)) && attempts < 50);
  return grid;
}

function initGame() {
  rng = makeRng(props.seed);
  board.value = generateBoard();
  score.value = 0;
  movesLeft.value = MOVE_LIMIT;
  selected.value = null;
  animating.value = false;
  falling.value = new Set();
  clearing.value = new Set();
  gameActive.value = false;
}

function start() {
  initGame();
  gameActive.value = true;
  overlay.open = false;
}

function overlayAction() {
  if (overlay.mode === 'solved' || overlay.mode === 'gameover') {
    initGame();
    gameActive.value = true;
    overlay.open = false;
  } else {
    start();
  }
}

function showOverlay(mode, title, sub, action) {
  overlay.mode = mode; overlay.title = title; overlay.sub = sub; overlay.action = action; overlay.open = true;
}

// ---- match logic ----
function findMatches(grid) {
  const matched = new Set();
  // horizontal
  for (let r = 0; r < SIZE; r++) {
    let run = 1;
    for (let c = 1; c < SIZE; c++) {
      if (grid[r][c] === grid[r][c-1] && grid[r][c] !== null) { run++; }
      else {
        if (run >= 3) for (let k = c - run; k < c; k++) matched.add(cellKey(r, k));
        run = 1;
      }
    }
    if (run >= 3) for (let k = SIZE - run; k < SIZE; k++) matched.add(cellKey(r, k));
  }
  // vertical
  for (let c = 0; c < SIZE; c++) {
    let run = 1;
    for (let r = 1; r < SIZE; r++) {
      if (grid[r][c] === grid[r-1][c] && grid[r][c] !== null) { run++; }
      else {
        if (run >= 3) for (let k = r - run; k < r; k++) matched.add(cellKey(k, c));
        run = 1;
      }
    }
    if (run >= 3) for (let k = SIZE - run; k < SIZE; k++) matched.add(cellKey(k, c));
  }
  return matched;
}

function swapCreatesMatch(grid, r1, c1, r2, c2) {
  const tmp = grid[r1][c1];
  grid[r1][c1] = grid[r2][c2];
  grid[r2][c2] = tmp;
  const ok = findMatches(grid).size > 0;
  grid[r2][c2] = grid[r1][c1];
  grid[r1][c1] = tmp;
  return ok;
}

async function delay(ms) {
  if (reducedMotion) return;
  return new Promise(r => setTimeout(r, ms));
}

async function processCascade(grid) {
  let chain = 0;
  while (true) {
    const matched = findMatches(grid);
    if (matched.size === 0) break;

    clearing.value = new Set(matched);
    await delay(300);

    const pts = matched.size * 10 * (chain + 1);
    score.value += pts;

    for (const key of matched) {
      const [r, c] = key.split(',').map(Number);
      grid[r][c] = null;
    }
    clearing.value = new Set();

    // gravity
    const newFalling = new Set();
    for (let c = 0; c < SIZE; c++) {
      let write = SIZE - 1;
      for (let r = SIZE - 1; r >= 0; r--) {
        if (grid[r][c] !== null) {
          if (r !== write) {
            grid[write][c] = grid[r][c];
            grid[r][c] = null;
            newFalling.add(cellKey(write, c));
          }
          write--;
        }
      }
      // fill top with new gems
      for (let r = write; r >= 0; r--) {
        grid[r][c] = rng.int(0, GEM_TYPES - 1);
        newFalling.add(cellKey(r, c));
      }
    }
    falling.value = new Set(newFalling);
    await delay(250);
    falling.value = new Set();

    chain++;
  }

  if (score.value > best.value) {
    best.value = score.value;
    localStorage.setItem(BEST_KEY, String(best.value));
  }

  board.value = grid.map(row => [...row]);
}

async function onCellClick(row, col) {
  if (!gameActive.value || animating.value || overlay.open) return;

  if (selected.value === null) {
    selected.value = { row, col };
    return;
  }

  const { row: sr, col: sc } = selected.value;
  if (sr === row && sc === col) { selected.value = null; return; }

  // adjacency check
  const dist = Math.abs(sr - row) + Math.abs(sc - col);
  if (dist !== 1) { selected.value = { row, col }; return; }

  const grid = board.value.map(r => [...r]);
  if (!swapCreatesMatch(grid, sr, sc, row, col)) {
    // invalid swap — flash selection to indicate no match
    selected.value = null;
    return;
  }

  selected.value = null;
  animating.value = true;
  movesLeft.value--;

  // do swap
  const tmp = grid[sr][sc];
  grid[sr][sc] = grid[row][col];
  grid[row][col] = tmp;
  board.value = grid.map(r => [...r]);

  await delay(150);
  await processCascade(board.value.map(r => [...r]));

  // check win/lose
  if (score.value >= TARGET_SCORE) {
    emit('solved', { score: score.value });
    showOverlay('solved', '恭喜！', `得分 ${score.value} 已達目標！`, '再玩一次');
  } else if (movesLeft.value <= 0) {
    showOverlay('gameover', '遊戲結束', `得分 ${score.value}，目標 ${TARGET_SCORE}。`, '再玩一次');
  }

  animating.value = false;
}

function isSelected(r, c) {
  return selected.value && selected.value.row === r && selected.value.col === c;
}
function isClearing(r, c) { return clearing.value.has(cellKey(r, c)); }
function isFalling(r, c) { return falling.value.has(cellKey(r, c)); }

watch(() => props.seed, () => {
  rng = makeRng(props.seed);
  initGame();
  if (gameActive.value) {
    gameActive.value = true;
    overlay.open = false;
  }
});

onMounted(() => {
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  best.value = +(localStorage.getItem(BEST_KEY) || 0);
  initGame();
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="寶石消除" title-en="Match 3">
      <template #actions>
        <button class="btn btn--accent" @click="initGame(); gameActive = true; overlay.open = false">重新開始</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">分數</span>
            <span class="chip__value is-accent">{{ score }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">目標</span>
            <span class="chip__value">{{ TARGET_SCORE }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">步數</span>
            <span class="chip__value" :class="movesLeft <= 5 ? 'is-accent' : ''">{{ movesLeft }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">最佳</span>
            <span class="chip__value">{{ best }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div class="m3-grid" :class="{ 'is-animating': animating }" role="grid" aria-label="寶石消除遊戲盤面">
            <template v-for="(row, r) in board" :key="r">
              <button
                v-for="(gem, c) in row"
                :key="c"
                class="gem-cell"
                :class="{
                  'is-selected': isSelected(r, c),
                  'is-clearing': isClearing(r, c),
                  'is-falling': isFalling(r, c),
                }"
                :style="{ '--gem-color': GEM_COLORS[gem] }"
                :aria-label="`${GEM_LABELS[gem]} 位置 ${r+1} 行 ${c+1} 列`"
                :aria-pressed="isSelected(r, c)"
                :disabled="animating || !gameActive"
                @click="onCellClick(r, c)"
              >
                <span class="gem-inner" />
              </button>
            </template>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button class="btn btn--accent" @click="overlayAction">{{ overlay.action }}</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            點擊選擇一顆寶石，再點擊相鄰寶石交換位置。<br />
            只有能形成 3 個以上同色連線的交換才有效。<br />
            連鎖消除可獲得額外分數。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">計分</span>
          <p class="hint">
            每顆 ×10 分，連鎖倍增。<br />
            在 {{ MOVE_LIMIT }} 步內達到 {{ TARGET_SCORE }} 分即勝利。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.m3-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(8, 1fr);
  gap: 4px;
  padding: 8px;
  border-radius: var(--r-lg);
  background: linear-gradient(180deg, var(--ink-850), var(--ink-900));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  width: min(86vw, 68vh, 480px);
  height: min(86vw, 68vh, 480px);
  touch-action: none;
}
.m3-grid.is-animating { pointer-events: none; }

.gem-cell {
  position: relative;
  /* width/height are both set by the grid's explicit 1fr rows+cols;
     aspect-ratio is kept as a fallback for any edge case. */
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  border-radius: var(--r-sm);
  border: 1.5px solid transparent;
  background: var(--ink-800);
  transition:
    transform 0.12s var(--ease),
    border-color 0.12s var(--ease),
    opacity 0.2s var(--ease);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.gem-cell:disabled { cursor: default; }
.gem-cell:not(:disabled):hover { transform: scale(1.07); }
.gem-cell:not(:disabled):active { transform: scale(0.93); }

.gem-cell.is-selected {
  border-color: #fff;
  transform: scale(1.08);
  box-shadow: 0 0 10px var(--gem-color, var(--accent));
}

.gem-cell.is-clearing {
  animation: gem-pop 0.25s forwards;
}

.gem-cell.is-falling {
  animation: gem-fall 0.22s var(--ease-out) forwards;
}

@media (prefers-reduced-motion: reduce) {
  .gem-cell.is-clearing, .gem-cell.is-falling { animation: none; }
}

@keyframes gem-pop {
  0% { transform: scale(1.15); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.6; }
  100% { transform: scale(0); opacity: 0; }
}
@keyframes gem-fall {
  0% { transform: translateY(-18px); opacity: 0.5; }
  100% { transform: translateY(0); opacity: 1; }
}

.gem-inner {
  display: block;
  width: 68%;
  height: 68%;
  border-radius: 50%;
  background: var(--gem-color, var(--accent));
  box-shadow: 0 2px 8px color-mix(in oklab, var(--gem-color, var(--accent)) 60%, transparent);
  position: relative;
}
.gem-inner::after {
  content: '';
  position: absolute;
  top: 12%;
  left: 18%;
  width: 35%;
  height: 28%;
  border-radius: 50%;
  background: rgba(255,255,255,0.42);
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}
</style>
