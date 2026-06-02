<script setup>
/* 四子棋 Connect Four — 7×6, Player (紅) vs AI (黃).
   Minimax + alpha-beta (depth 5) with heuristic evaluation.
   Animated disc drop; win highlight; tally in localStorage. */

const accent = "#ffcf5e";
const SAVE_KEY = "playground.connectfour";
const COLS = 7, ROWS = 6;
const EMPTY = 0, RED = 1, YELLOW = 2; // RED = player, YELLOW = AI

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// ---- state ----
const grid = ref(makeGrid());       // grid[row][col]
const currentTurn = ref(RED);
const gameOver = ref(false);
const winCells = ref([]);           // [{r,c}] of winning 4
const winner = ref(EMPTY);
const isDraw = ref(false);
const aiThinking = ref(false);
const mode = ref("ai");
// animated drop: {col, fromRow, toRow, color, animating}
const dropping = ref(null);

const tally = reactive({ win: 0, draw: 0, loss: 0 });
const overlay = reactive({ open: false, title: "", sub: "" });

let rng = makeRng(props.seed);

let reducedMotion = false;

watch(() => props.seed, () => {
  rng = makeRng(props.seed);
  resetGame();
});

function makeGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
}

// ---- board helpers ----
function getGrid() {
  return grid.value;
}

function cloneGrid(g) {
  return g.map(r => [...r]);
}

function topEmptyRow(g, col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (g[r][col] === EMPTY) return r;
  }
  return -1;
}

function colFull(g, col) {
  return g[0][col] !== EMPTY;
}

function legalCols(g) {
  const cols = [];
  for (let c = 0; c < COLS; c++) if (!colFull(g, c)) cols.push(c);
  return cols;
}

// ---- win detection ----
const DIRS = [[0,1],[1,0],[1,1],[1,-1]];

function findWin(g) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = g[r][c];
      if (v === EMPTY) continue;
      for (const [dr, dc] of DIRS) {
        const cells = [{r, c}];
        for (let k = 1; k < 4; k++) {
          const nr = r + dr*k, nc = c + dc*k;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (g[nr][nc] !== v) break;
          cells.push({ r: nr, c: nc });
        }
        if (cells.length === 4) return { winner: v, cells };
      }
    }
  }
  return null;
}

function checkDraw(g) {
  return g[0].every(v => v !== EMPTY);
}

// ---- heuristic ----
function scoreWindow(window, player) {
  const opp = player === RED ? YELLOW : RED;
  const pCount = window.filter(v => v === player).length;
  const eCount = window.filter(v => v === EMPTY).length;
  const oCount = window.filter(v => v === opp).length;
  if (pCount === 4) return 100;
  if (pCount === 3 && eCount === 1) return 5;
  if (pCount === 2 && eCount === 2) return 2;
  if (oCount === 3 && eCount === 1) return -4;
  if (oCount === 4) return -100;
  return 0;
}

function scoreBoard(g, player) {
  let score = 0;
  // center column preference
  const center = Math.floor(COLS / 2);
  let centerCount = 0;
  for (let r = 0; r < ROWS; r++) if (g[r][center] === player) centerCount++;
  score += centerCount * 3;

  // horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const w = [g[r][c], g[r][c+1], g[r][c+2], g[r][c+3]];
      score += scoreWindow(w, player);
    }
  }
  // vertical
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r <= ROWS - 4; r++) {
      const w = [g[r][c], g[r+1][c], g[r+2][c], g[r+3][c]];
      score += scoreWindow(w, player);
    }
  }
  // diagonal /
  for (let r = 3; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const w = [g[r][c], g[r-1][c+1], g[r-2][c+2], g[r-3][c+3]];
      score += scoreWindow(w, player);
    }
  }
  // diagonal \
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const w = [g[r][c], g[r+1][c+1], g[r+2][c+2], g[r+3][c+3]];
      score += scoreWindow(w, player);
    }
  }
  return score;
}

// minimax with alpha-beta
function minimax(g, depth, isMaximizing, alpha, beta) {
  const win = findWin(g);
  if (win) {
    if (win.winner === YELLOW) return 1000000 + depth;
    if (win.winner === RED) return -(1000000 + depth);
    return 0;
  }
  if (checkDraw(g) || depth === 0) {
    return scoreBoard(g, YELLOW) - scoreBoard(g, RED);
  }

  const cols = legalCols(g);
  if (isMaximizing) {
    let best = -Infinity;
    for (const col of cols) {
      const row = topEmptyRow(g, col);
      g[row][col] = YELLOW;
      best = Math.max(best, minimax(g, depth - 1, false, alpha, beta));
      g[row][col] = EMPTY;
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const col of cols) {
      const row = topEmptyRow(g, col);
      g[row][col] = RED;
      best = Math.min(best, minimax(g, depth - 1, true, alpha, beta));
      g[row][col] = EMPTY;
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function getBestCol(g) {
  const center = Math.floor(COLS / 2);
  const cols = legalCols(g);
  // order: center-first for better pruning
  cols.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
  const tmp = cloneGrid(g);
  let bestScore = -Infinity;
  let bestCols = [];
  for (const col of cols) {
    const row = topEmptyRow(tmp, col);
    tmp[row][col] = YELLOW;
    const score = minimax(tmp, 5, false, -Infinity, Infinity);
    tmp[row][col] = EMPTY;
    if (score > bestScore) {
      bestScore = score;
      bestCols = [col];
    } else if (score === bestScore) {
      bestCols.push(col);
    }
  }
  return bestCols.length === 1 ? bestCols[0] : rng.pick(bestCols);
}

// ---- game flow ----
function resolveAfterDrop(newGrid, col, row, who) {
  const win = findWin(newGrid);
  if (win) {
    winCells.value = win.cells;
    winner.value = win.winner;
    gameOver.value = true;
    if (mode.value === "ai") {
      if (win.winner === RED) {
        tally.win++; saveTally();
        emit("solved", {});
        overlay.title = "你贏了！"; overlay.sub = "四子連成一線，太厲害了！";
      } else {
        tally.loss++; saveTally();
        overlay.title = "電腦贏了"; overlay.sub = "再試試吧！";
      }
    } else {
      overlay.title = win.winner === RED ? "紅方獲勝！" : "黃方獲勝！";
      overlay.sub = "精彩的對局！";
    }
    overlay.open = true;
    return;
  }
  if (checkDraw(newGrid)) {
    isDraw.value = true; gameOver.value = true;
    if (mode.value === "ai") { tally.draw++; saveTally(); }
    overlay.title = "平局！"; overlay.sub = "棋盤填滿了，不分勝負。";
    overlay.open = true;
    return;
  }
  currentTurn.value = who === RED ? YELLOW : RED;
  if (mode.value === "ai" && currentTurn.value === YELLOW) {
    triggerAI(newGrid);
  }
}

function animateDrop(col, row, color, newGrid, who) {
  if (reducedMotion) {
    grid.value = newGrid;
    resolveAfterDrop(newGrid, col, row, who);
    return;
  }
  // show disc animating from row=0 to destination row
  dropping.value = { col, fromRow: 0, toRow: row, color };
  // transition via CSS; after animation end commit
  setTimeout(() => {
    dropping.value = null;
    grid.value = newGrid;
    resolveAfterDrop(newGrid, col, row, who);
  }, 320);
}

function playerDrop(col) {
  if (gameOver.value || aiThinking.value) return;
  if (mode.value === "ai" && currentTurn.value !== RED) return;
  if (colFull(grid.value, col)) return;
  const g = cloneGrid(grid.value);
  const row = topEmptyRow(g, col);
  g[row][col] = currentTurn.value;
  animateDrop(col, row, currentTurn.value, g, currentTurn.value);
}

function triggerAI(g) {
  aiThinking.value = true;
  setTimeout(() => {
    const col = getBestCol(g);
    const row = topEmptyRow(g, col);
    const ng = cloneGrid(g);
    ng[row][col] = YELLOW;
    aiThinking.value = false;
    animateDrop(col, row, YELLOW, ng, YELLOW);
  }, 350);
}

function resetGame() {
  grid.value = makeGrid();
  currentTurn.value = RED;
  gameOver.value = false;
  winCells.value = [];
  winner.value = EMPTY;
  isDraw.value = false;
  aiThinking.value = false;
  dropping.value = null;
  overlay.open = false;
}

function saveTally() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(tally)); } catch (_) {}
}

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
    if (saved.win !== undefined) { tally.win = saved.win || 0; tally.draw = saved.draw || 0; tally.loss = saved.loss || 0; }
  } catch (_) {}
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  rng = makeRng(props.seed);
});

// ---- computed ----
function isWinCell(r, c) {
  return winCells.value.some(cell => cell.r === r && cell.c === c);
}

function isDropAnimCol(c) {
  return dropping.value && dropping.value.col === c;
}

function dropAnimStyle(c) {
  if (!dropping.value || dropping.value.col !== c) return {};
  const cellSize = 100 / ROWS;
  const dest = dropping.value.toRow * cellSize;
  return { '--drop-to': `${dest}%` };
}

const statusText = computed(() => {
  if (gameOver.value) {
    if (isDraw.value) return "平局";
    if (mode.value === "ai") return winner.value === RED ? "你贏了！" : "電腦贏了";
    return winner.value === RED ? "紅方獲勝" : "黃方獲勝";
  }
  if (mode.value === "ai") {
    return aiThinking.value ? "電腦思考中…" : "你的回合（紅）";
  }
  return currentTurn.value === RED ? "紅方的回合" : "黃方的回合";
});

function colAriaLabel(c) {
  return `第 ${c + 1} 欄${colFull(grid.value, c) ? "（已滿）" : ""}`;
}
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="四子棋" title-en="Connect Four">
      <template #actions>
        <button class="btn btn--accent" @click="resetGame">重新開始</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <!-- HUD -->
        <div class="hud">
          <div class="chip">
            <span class="chip__label">勝</span>
            <span class="chip__value is-accent">{{ tally.win }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">和</span>
            <span class="chip__value">{{ tally.draw }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">負</span>
            <span class="chip__value">{{ tally.loss }}</span>
          </div>
        </div>

        <p class="status-text" :class="{ 'is-thinking': aiThinking }">{{ statusText }}</p>

        <!-- Board -->
        <div class="board-wrap">
          <div class="c4-board" role="grid" aria-label="四子棋盤面">
            <!-- Column click zones (top row hover targets) -->
            <div class="c4-col-zones">
              <button
                v-for="c in COLS"
                :key="'zone-' + c"
                class="c4-col-zone"
                :aria-label="colAriaLabel(c - 1)"
                :disabled="colFull(grid, c - 1) || gameOver || aiThinking"
                @click="playerDrop(c - 1)"
              />
            </div>
            <!-- Grid cells -->
            <div
              v-for="r in ROWS"
              :key="'row-' + r"
              class="c4-row"
              role="row"
            >
              <div
                v-for="c in COLS"
                :key="'cell-' + r + '-' + c"
                class="c4-cell"
                role="gridcell"
                :aria-label="`行${r}列${c}: ${grid[r-1][c-1] === 1 ? '紅' : grid[r-1][c-1] === 2 ? '黃' : '空'}`"
              >
                <div
                  class="c4-disc"
                  :class="{
                    'is-red': grid[r-1][c-1] === RED,
                    'is-yellow': grid[r-1][c-1] === YELLOW,
                    'is-win': isWinCell(r-1, c-1),
                    'is-drop-anim': dropping && dropping.col === c-1 && dropping.toRow === r-1,
                  }"
                />
              </div>
            </div>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button class="btn btn--accent" @click="resetGame">再玩一次</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Side Panel -->
      <aside class="panel">
        <div v-if="!daily" class="panel__group">
          <span class="panel__legend">模式</span>
          <div class="seg">
            <button
              :aria-pressed="mode === 'ai'"
              :class="{ 'is-active': mode === 'ai' }"
              @click="mode = 'ai'; resetGame()"
            >對電腦</button>
            <button
              :aria-pressed="mode === '2p'"
              :class="{ 'is-active': mode === '2p' }"
              @click="mode = '2p'; resetGame()"
            >雙人</button>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">規則</span>
          <p class="hint">
            7×6 棋盤，輪流在欄位中投入棋子。<br />
            率先在橫、直、斜任一方向連成四子者獲勝。<br />
            你執 <span class="disc-inline red">●</span> 紅，電腦執 <span class="disc-inline yellow">●</span> 黃。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">戰績</span>
          <p class="hint">勝 {{ tally.win }} ／ 和 {{ tally.draw }} ／ 負 {{ tally.loss }}</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.status-text {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  min-height: 1.4em;
}
.status-text.is-thinking { color: var(--accent); }

.c4-board {
  position: relative;
  width: min(86vw, 60vh, 540px);
  aspect-ratio: 7 / 6;
  border-radius: var(--r-lg);
  background: var(--ink-800);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  /* Ensure the aspect-ratio-derived height doesn't collapse:
     flex children (c4-row) use flex:1 to share height equally. */
  min-height: 0;
}

.c4-col-zones {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  z-index: 2;
  pointer-events: none;
}
.c4-col-zone {
  pointer-events: auto;
  border-radius: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease);
}
.c4-col-zone:not(:disabled):hover {
  background: rgba(255,255,255,0.04);
}
.c4-col-zone:disabled { cursor: default; }

.c4-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  flex: 1;
  /* Prevent rows from overflowing the board height */
  min-height: 0;
}
.c4-cell {
  display: grid;
  place-items: center;
  padding: clamp(3px, 0.8vw, 7px);
  /* Cells must not grow beyond the row height allocated by flex:1 */
  min-height: 0;
  overflow: hidden;
}
.c4-disc {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--ink-700);
  /* Use transparent border as base so is-red/is-yellow border doesn't shift size */
  border: 1px solid transparent;
  transition: background var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.c4-disc.is-red {
  background: #e84c4c;
  border-color: #ff6b6b;
  animation: discDrop 0.28s cubic-bezier(0.2,0,0.6,1.3) both;
}
.c4-disc.is-yellow {
  background: var(--accent);
  border-color: color-mix(in oklab, var(--accent) 80%, white);
  animation: discDrop 0.28s cubic-bezier(0.2,0,0.6,1.3) both;
}
.c4-disc.is-win {
  /* outer box-shadow doesn't affect layout; no border change needed */
  box-shadow: 0 0 0 3px white, 0 0 18px 4px currentColor;
  animation: winPulse 0.9s var(--ease) infinite;
}
/* :focus-visible on col-zone uses box-shadow so it never shifts layout */
.c4-col-zone:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--accent);
}
@media (prefers-reduced-motion: reduce) {
  .c4-disc.is-red,
  .c4-disc.is-yellow { animation: none; }
  .c4-disc.is-win    { animation: none; }
}
.c4-disc.is-red.is-win { color: #e84c4c; }
.c4-disc.is-yellow.is-win { color: var(--accent); }

@keyframes discDrop {
  from { transform: scaleY(0.1) scaleX(1.3); opacity: 0.5; }
  to   { transform: scaleY(1) scaleX(1); opacity: 1; }
}
@keyframes winPulse {
  0%,100% { filter: brightness(1); }
  50%      { filter: brightness(1.4); }
}

.disc-inline {
  font-size: 0.9em;
  display: inline;
}
.disc-inline.red { color: #e84c4c; }
.disc-inline.yellow { color: var(--accent); }
</style>
