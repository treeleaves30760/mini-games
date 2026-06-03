<script setup>
/* 五子棋 Gomoku — 15×15, Player black vs AI white.
   Heuristic AI: scores every candidate cell in 4 directions,
   attacks and defends, blocks 4s and open-3s.
   Win = 5+ in a row; winning stones highlighted. Undo (悔棋) + restart. */

const accent = "#d89b6a";
const SAVE_KEY = "playground.gomoku";
const SIZE = 15;
const EMPTY = 0, BLACK = 1, WHITE = 2; // BLACK = player

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// ---- state ----
const board = ref(makeBoard());
const history = ref([]);
const currentTurn = ref(BLACK);
const gameOver = ref(false);
const isDraw = ref(false);
const winStones = ref([]);
const winner = ref(EMPTY);
const aiThinking = ref(false);

// Renju forbidden-move rule (applies to BLACK / 先手 only): no 三三 / 四四 / 長連.
const renjuRule = ref(true);
const forbiddenFlash = ref(null); // {r,c} flashed red when a forbidden move is blocked
const forbiddenMsg = ref("");

const tally = reactive({ win: 0, draw: 0, loss: 0 });
const overlay = reactive({ open: false, title: "", sub: "" });

let rng = makeRng(props.seed);
let reducedMotion = false;
let forbiddenTimer = null;

watch(() => props.seed, () => {
  rng = makeRng(props.seed);
  resetGame();
});

function makeBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
}

// ---- win detection ----
const DIRS4 = [[0,1],[1,0],[1,1],[1,-1]];

function countDir(b, r, c, dr, dc, color) {
  let count = 0;
  let rr = r + dr, cc = c + dc;
  while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && b[rr][cc] === color) {
    count++; rr += dr; cc += dc;
  }
  return count;
}

function findWin(b) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = b[r][c];
      if (v === EMPTY) continue;
      for (const [dr, dc] of DIRS4) {
        const fwd = 1 + countDir(b, r, c, dr, dc, v);
        const bwd = countDir(b, r, c, -dr, -dc, v);
        const total = fwd + bwd;
        if (total >= 5) {
          const cells = [];
          let rr = r - bwd * dr, cc = c - bwd * dc;
          for (let k = 0; k < total; k++) {
            cells.push({ r: rr, c: cc });
            rr += dr; cc += dc;
          }
          return { winner: v, cells };
        }
      }
    }
  }
  return null;
}

function isBoardFull(b) {
  return b.every(row => row.every(v => v !== EMPTY));
}

// ---- Renju forbidden moves (禁手) — BLACK only ----
// A black move is forbidden when it forms a double-three (三三), a double-four
// (四四) or an overline of six+ (長連). Making exactly five always wins and
// overrides any forbidden shape. White (the AI) has no restrictions.

// One direction through (r,c) as a small array: 1=black, 0=empty, -1=block/edge.
function dirLine(b, r, c, dr, dc, radius) {
  const arr = [];
  for (let i = -radius; i <= radius; i++) {
    const rr = r + dr * i, cc = c + dc * i;
    if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) arr.push(-1);
    else if (b[rr][cc] === BLACK) arr.push(1);
    else if (b[rr][cc] === EMPTY) arr.push(0);
    else arr.push(-1);
  }
  return arr;
}

// Length of the contiguous black run passing through index ci.
function maxRun(arr, ci) {
  let len = 1;
  for (let i = ci - 1; i >= 0 && arr[i] === 1; i--) len++;
  for (let i = ci + 1; i < arr.length && arr[i] === 1; i++) len++;
  return len;
}

// A "four": some empty cell, once filled, completes a run of EXACTLY five through
// ci. Requiring exactly five rejects overline traps (e.g. BBB_BBB) that only
// complete to six, which are not real four threats under Renju rules.
function makesFour(arr, ci) {
  for (let e = 0; e < arr.length; e++) {
    if (arr[e] !== 0) continue;
    arr[e] = 1;
    const run = maxRun(arr, ci);
    arr[e] = 0;
    if (run === 5) return true;
  }
  return false;
}

// A straight/open four (".1111.") that includes ci among the four stones.
function hasStraightFour(arr, ci) {
  for (let s = 0; s + 5 < arr.length; s++) {
    if (arr[s] === 0 && arr[s + 1] === 1 && arr[s + 2] === 1 &&
        arr[s + 3] === 1 && arr[s + 4] === 1 && arr[s + 5] === 0 &&
        ci >= s + 1 && ci <= s + 4) return true;
  }
  return false;
}

// An open three: some empty cell, once filled, turns this line into an open four.
function makesOpenThree(arr, ci) {
  for (let e = 0; e < arr.length; e++) {
    if (arr[e] !== 0) continue;
    arr[e] = 1;
    const ok = hasStraightFour(arr, ci);
    arr[e] = 0;
    if (ok) return true;
  }
  return false;
}

// Classify the strongest threat the black stone at (r,c) makes in one direction.
function classifyDir(b, r, c, dr, dc) {
  const arr = dirLine(b, r, c, dr, dc, 5);
  const ci = 5;
  const run = maxRun(arr, ci);
  if (run >= 6) return "overline";
  if (run === 5) return "five";
  if (makesFour(arr, ci)) return "four";
  if (makesOpenThree(arr, ci)) return "three";
  return "none";
}

// Verdict for a black stone already placed at (r,c) on grid b.
function analyzeBlack(b, r, c) {
  let five = 0, overline = 0, four = 0, three = 0;
  for (const [dr, dc] of DIRS4) {
    const k = classifyDir(b, r, c, dr, dc);
    if (k === "five") five++;
    else if (k === "overline") overline++;
    else if (k === "four") four++;
    else if (k === "three") three++;
  }
  if (five > 0) return { result: "win" };           // exact five wins, overrides禁手
  if (overline > 0) return { result: "forbidden", reason: "長連" };
  if (four >= 2) return { result: "forbidden", reason: "四四" };
  if (three >= 2) return { result: "forbidden", reason: "三三" };
  return { result: "ok" };
}

// Empties (near existing stones) that would be forbidden for black on grid b.
function computeForbiddenPoints(b) {
  const set = new Set();
  for (const { r, c } of getCandidates(b)) {
    b[r][c] = BLACK;
    const a = analyzeBlack(b, r, c);
    b[r][c] = EMPTY;
    if (a.result === "forbidden") set.add(r + "," + c);
  }
  return set;
}

// ---- AI heuristic ----
function scorePattern(b, r, c, dr, dc, color) {
  function scan(dr2, dc2) {
    let count = 0;
    let rr = r + dr2, cc = c + dc2;
    while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) {
      if (b[rr][cc] === color) { count++; rr += dr2; cc += dc2; }
      else { break; }
    }
    const open = (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) && b[rr][cc] === EMPTY;
    return { count, open };
  }

  const fwd = scan(dr, dc);
  const bwd = scan(-dr, -dc);
  const total = fwd.count + bwd.count + 1;
  const opens = (fwd.open ? 1 : 0) + (bwd.open ? 1 : 0);

  if (total >= 5)              return 100000;
  if (total === 4 && opens >= 1) return 10000;
  if (total === 4 && opens === 0) return 500;
  if (total === 3 && opens === 2) return 1000;
  if (total === 3 && opens === 1) return 200;
  if (total === 2 && opens === 2) return 50;
  if (total === 2 && opens === 1) return 10;
  return 0;
}

function scoreCell(b, r, c, color) {
  let s = 0;
  for (const [dr, dc] of DIRS4) s += scorePattern(b, r, c, dr, dc, color);
  return s;
}

function getCandidates(b) {
  const cands = new Set();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (b[r][c] === EMPTY) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && b[nr][nc] === EMPTY) {
            cands.add(nr * SIZE + nc);
          }
        }
      }
    }
  }
  if (cands.size === 0) {
    const mid = Math.floor(SIZE / 2);
    cands.add(mid * SIZE + mid);
  }
  return [...cands].map(k => ({ r: Math.floor(k / SIZE), c: k % SIZE }));
}

function getAIMove(b) {
  const cands = getCandidates(b);
  const mid = Math.floor(SIZE / 2);
  let bestScore = -1;
  let bestCells = [];

  for (const { r, c } of cands) {
    const attack = scoreCell(b, r, c, WHITE);
    const defense = scoreCell(b, r, c, BLACK);
    const score = Math.max(attack, defense * 0.95);
    if (score > bestScore) {
      bestScore = score;
      bestCells = [{ r, c }];
    } else if (score === bestScore) {
      bestCells.push({ r, c });
    }
  }

  if (bestCells.length > 1) {
    bestCells.sort((a, b) => {
      const da = Math.abs(a.r - mid) + Math.abs(a.c - mid);
      const db = Math.abs(b.r - mid) + Math.abs(b.c - mid);
      return da - db;
    });
    const topDist = Math.abs(bestCells[0].r - mid) + Math.abs(bestCells[0].c - mid);
    const tied = bestCells.filter(cell => Math.abs(cell.r - mid) + Math.abs(cell.c - mid) === topDist);
    return tied.length === 1 ? tied[0] : rng.pick(tied);
  }
  return bestCells[0];
}

// ---- game flow ----
function resolveGame(b) {
  const win = findWin(b);
  if (win) {
    winStones.value = win.cells;
    winner.value = win.winner;
    gameOver.value = true;
    if (win.winner === BLACK) {
      tally.win++; saveTally();
      emit("solved", {});
      overlay.title = "你贏了！"; overlay.sub = "黑棋五子連線，恭喜！";
    } else {
      tally.loss++; saveTally();
      overlay.title = "電腦贏了"; overlay.sub = "白棋五子連線，再接再厲！";
    }
    overlay.open = true;
    return true;
  }
  if (isBoardFull(b)) {
    isDraw.value = true; gameOver.value = true;
    tally.draw++; saveTally();
    overlay.title = "平局！"; overlay.sub = "棋盤填滿，不分勝負。";
    overlay.open = true;
    return true;
  }
  return false;
}

function placeStone(r, c) {
  if (gameOver.value || aiThinking.value) return;
  if (board.value[r][c] !== EMPTY) return;
  if (currentTurn.value !== BLACK) return;

  if (renjuRule.value) {
    const test = board.value.map(row => [...row]);
    test[r][c] = BLACK;
    const verdict = analyzeBlack(test, r, c);
    if (verdict.result === "forbidden") {
      flashForbidden(r, c, verdict.reason);
      return;
    }
  }

  const nb = board.value.map(row => [...row]);
  nb[r][c] = BLACK;
  history.value = [...history.value, { r, c, color: BLACK }];
  board.value = nb;

  if (!resolveGame(nb)) {
    currentTurn.value = WHITE;
    triggerAI(nb);
  }
}

function triggerAI(b) {
  aiThinking.value = true;
  setTimeout(() => {
    const move = getAIMove(b);
    if (!move) { aiThinking.value = false; return; }
    const nb = b.map(row => [...row]);
    nb[move.r][move.c] = WHITE;
    history.value = [...history.value, { r: move.r, c: move.c, color: WHITE }];
    board.value = nb;
    aiThinking.value = false;
    if (!resolveGame(nb)) {
      currentTurn.value = BLACK;
    }
  }, 250);
}

function undoMove() {
  if (aiThinking.value) return;
  if (history.value.length === 0) return;
  const hist = [...history.value];
  const nb = board.value.map(row => [...row]);
  let undone = 0;
  while (undone < 2 && hist.length > 0) {
    const last = hist.pop();
    nb[last.r][last.c] = EMPTY;
    undone++;
  }
  history.value = hist;
  board.value = nb;
  currentTurn.value = BLACK;
  gameOver.value = false;
  isDraw.value = false;
  winStones.value = [];
  winner.value = EMPTY;
  overlay.open = false;
}

function resetGame() {
  board.value = makeBoard();
  history.value = [];
  currentTurn.value = BLACK;
  gameOver.value = false;
  isDraw.value = false;
  winStones.value = [];
  winner.value = EMPTY;
  aiThinking.value = false;
  overlay.open = false;
}

function saveTally() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(tally)); } catch (_) {}
}

// ---- forbidden-point marking (black's turn) ----
const forbiddenPoints = computed(() => {
  if (!renjuRule.value || gameOver.value || aiThinking.value || currentTurn.value !== BLACK) {
    return new Set();
  }
  const grid = board.value.map((row) => [...row]);
  return computeForbiddenPoints(grid);
});

function isForbidden(r, c) {
  return forbiddenPoints.value.has(r + "," + c);
}

function toggleRenju() {
  renjuRule.value = !renjuRule.value;
}

function flashForbidden(r, c, reason) {
  forbiddenFlash.value = { r, c };
  forbiddenMsg.value = `禁手！黑棋不可下「${reason}」`;
  clearTimeout(forbiddenTimer);
  forbiddenTimer = setTimeout(() => {
    forbiddenFlash.value = null;
    forbiddenMsg.value = "";
  }, 1600);
}

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
    if (saved.win !== undefined) {
      tally.win = saved.win || 0;
      tally.draw = saved.draw || 0;
      tally.loss = saved.loss || 0;
    }
  } catch (_) {}
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  rng = makeRng(props.seed);
});

// ---- display ----
const CELL_FRAC = 100 / (SIZE - 1);
// Flat array of all cells for v-for
const CELLS = Array.from({ length: SIZE * SIZE }, (_, i) => ({
  r: Math.floor(i / SIZE),
  c: i % SIZE,
}));

const STAR_POINTS = [[3,3],[3,11],[7,7],[11,3],[11,11]];

function cellState(r, c) {
  return board.value[r][c];
}

function isWinStone(r, c) {
  return winStones.value.some(s => s.r === r && s.c === c);
}

function isLastMove(r, c) {
  if (history.value.length === 0) return false;
  const last = history.value[history.value.length - 1];
  return last.r === r && last.c === c;
}

function cellAriaLabel(r, c) {
  const v = board.value[r][c];
  const stone = v === BLACK ? "黑" : v === WHITE ? "白" : "空";
  return `行${r+1}列${c+1}: ${stone}`;
}

const statusText = computed(() => {
  if (forbiddenMsg.value) return forbiddenMsg.value;
  if (gameOver.value) {
    if (isDraw.value) return "平局";
    return winner.value === BLACK ? "黑棋獲勝！" : "白棋獲勝";
  }
  if (aiThinking.value) return "電腦思考中…";
  return "黑棋落子";
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="五子棋" title-en="Gomoku">
      <template #actions>
        <button
          class="btn"
          :disabled="history.length === 0 || aiThinking"
          @click="undoMove"
        >悔棋</button>
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
          <div class="gomoku-board" aria-label="五子棋盤面">
            <!-- SVG grid -->
            <svg class="gomoku-grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line
                v-for="i in SIZE"
                :key="'v'+i"
                :x1="(i-1)*CELL_FRAC" y1="0"
                :x2="(i-1)*CELL_FRAC" y2="100"
                class="grid-line"
              />
              <line
                v-for="i in SIZE"
                :key="'h'+i"
                x1="0" :y1="(i-1)*CELL_FRAC"
                x2="100" :y2="(i-1)*CELL_FRAC"
                class="grid-line"
              />
              <circle
                v-for="sp in STAR_POINTS"
                :key="'sp'+sp[0]+'-'+sp[1]"
                :cx="sp[0]*CELL_FRAC"
                :cy="sp[1]*CELL_FRAC"
                r="0.9"
                class="star-point"
              />
            </svg>

            <!-- Intersection buttons -->
            <button
              v-for="cell in CELLS"
              :key="`c-${cell.r}-${cell.c}`"
              class="gomoku-cell"
              :class="{
                'has-black': cellState(cell.r, cell.c) === BLACK,
                'has-white': cellState(cell.r, cell.c) === WHITE,
                'is-win': isWinStone(cell.r, cell.c),
                'is-last': isLastMove(cell.r, cell.c),
                'is-hover': cellState(cell.r, cell.c) === EMPTY && !isForbidden(cell.r, cell.c),
                'is-forbidden': isForbidden(cell.r, cell.c),
                'is-forbidden-flash': forbiddenFlash && forbiddenFlash.r === cell.r && forbiddenFlash.c === cell.c,
              }"
              :style="{
                left: `calc(${cell.c * CELL_FRAC}% - var(--stone-half))`,
                top: `calc(${cell.r * CELL_FRAC}% - var(--stone-half))`,
              }"
              :aria-label="cellAriaLabel(cell.r, cell.c) + (isForbidden(cell.r, cell.c) ? '（禁手）' : '')"
              :disabled="cellState(cell.r, cell.c) !== EMPTY || gameOver || aiThinking || currentTurn !== BLACK || isForbidden(cell.r, cell.c)"
              @click="placeStone(cell.r, cell.c)"
            >
              <span v-if="isForbidden(cell.r, cell.c)" class="gomoku-x" aria-hidden="true">✕</span>
            </button>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button class="btn" @click="overlay.open = false">繼續觀看</button>
                <button class="btn btn--accent" @click="resetGame">再玩一次</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Side Panel -->
      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">規則</span>
          <p class="hint">
            15×15 棋盤，你執黑，電腦執白。<br />
            率先連成五子（橫、直、斜）者獲勝。<br />
            點擊交叉點落子。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">禁手規則</span>
          <div class="toggle-row">
            <span>黑棋禁手</span>
            <button
              class="switch"
              role="switch"
              :aria-checked="renjuRule ? 'true' : 'false'"
              aria-label="黑棋禁手規則開關"
              @click="toggleRenju"
            ></button>
          </div>
          <p class="hint">
            開啟後，先手黑棋不得下出
            <strong style="color: var(--text)">三三</strong>、<strong style="color: var(--text)">四四</strong>
            或 <strong style="color: var(--text)">長連</strong>（六子以上），必須改用四三等手段取勝。
            盤面上的 <span style="color:#ff5d6c">✕</span> 即為禁著點。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">功能</span>
          <p class="hint">
            <strong style="color: var(--text)">悔棋</strong>：撤回你和電腦各一步。<br />
            <strong style="color: var(--text)">重新開始</strong>：清空棋盤。
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

.gomoku-board {
  position: relative;
  width: min(92vw, 70vh, 560px);
  height: min(92vw, 70vh, 560px);
  border-radius: var(--r-lg);
  background:
    radial-gradient(ellipse at 30% 20%, color-mix(in oklab, var(--accent) 14%, transparent) 0%, transparent 55%),
    linear-gradient(160deg, #2c2016 0%, #1d1510 50%, #130e0a 100%);
  border: 1px solid color-mix(in oklab, var(--accent) 30%, var(--line));
  box-shadow: var(--shadow-2), inset 0 0 50px rgba(0,0,0,0.4);
  touch-action: none;
  overflow: hidden;
  /* Stone sizing: button covers the intersection area.
     board/(SIZE+2) keeps adjacent buttons non-overlapping while leaving a
     small gap; visual stone ::after is 88% of button, centred. */
  --stone-size: calc(min(92vw, 70vh, 560px) / 17);
  --stone-half: calc(var(--stone-size) / 2);
}

.gomoku-grid {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
.grid-line {
  stroke: color-mix(in oklab, var(--accent) 20%, rgba(200,150,80,0.25));
  stroke-width: 0.35;
  vector-effect: non-scaling-stroke;
}
.star-point {
  fill: color-mix(in oklab, var(--accent) 50%, rgba(255,200,100,0.4));
}

/* Each intersection is a positioned button */
.gomoku-cell {
  position: absolute;
  width: var(--stone-size);
  height: var(--stone-size);
  border-radius: 50%;
  background: transparent;
  border: none;
  display: grid;
  place-items: center;
  z-index: 2;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease);
}
.gomoku-cell:disabled {
  cursor: default;
}
/* Renju forbidden point: a red ✕ on an empty intersection black may not play. */
.gomoku-cell.is-forbidden {
  cursor: not-allowed;
}
.gomoku-x {
  font-family: var(--font-mono);
  font-size: calc(var(--stone-size) * 0.66);
  font-weight: 700;
  line-height: 1;
  color: #ff5d6c;
  opacity: 0.8;
  pointer-events: none;
}
.gomoku-cell.is-forbidden:hover .gomoku-x {
  opacity: 1;
}
.gomoku-cell.is-forbidden-flash {
  background: color-mix(in oklab, #ff5d6c 32%, transparent);
  border-radius: 50%;
}
.gomoku-cell.is-hover:not(:disabled):hover {
  background: color-mix(in oklab, var(--accent) 22%, transparent);
}
/* After pseudo-element = the stone */
.gomoku-cell.has-black::after,
.gomoku-cell.has-white::after {
  content: "";
  display: block;
  width: 88%;
  height: 88%;
  border-radius: 50%;
  animation: stonePlace 0.18s cubic-bezier(0.2, 0, 0.35, 1.4) both;
}
.gomoku-cell.has-black::after {
  background: radial-gradient(circle at 35% 30%, #606060, #0d0d0d);
  border: 1px solid rgba(255,255,255,0.18);
  box-shadow: 0 2px 7px rgba(0,0,0,0.75), inset 0 1px 2px rgba(255,255,255,0.14);
}
.gomoku-cell.has-white::after {
  background: radial-gradient(circle at 35% 30%, #ffffff, #d4d4d4);
  border: 1px solid rgba(0,0,0,0.18);
  box-shadow: 0 2px 7px rgba(0,0,0,0.5), inset 0 1px 3px rgba(255,255,255,0.8);
}
/* Last move dot */
.gomoku-cell.is-last::before {
  content: "";
  position: absolute;
  width: 28%;
  height: 28%;
  border-radius: 50%;
  background: color-mix(in oklab, var(--accent) 90%, transparent);
  z-index: 3;
  pointer-events: none;
}
/* Win highlight */
.gomoku-cell.is-win::after {
  box-shadow:
    0 0 0 2px var(--accent),
    0 0 16px 3px color-mix(in oklab, var(--accent) 65%, transparent) !important;
  animation: stonePlace 0.18s cubic-bezier(0.2, 0, 0.35, 1.4) both, winPulse 0.85s var(--ease) infinite 0.2s;
}

@keyframes stonePlace {
  from { transform: scale(0.25); opacity: 0.3; }
  to   { transform: scale(1); opacity: 1; }
}
@keyframes winPulse {
  0%, 100% { filter: brightness(1); }
  50%       { filter: brightness(1.55); }
}

/* focus-visible ring rendered as inset box-shadow on the button so it
   doesn't shift neighbours (absolute-positioned cells are already inert
   to normal flow, but this keeps the ring contained within the button). */
.gomoku-cell:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent);
}

@media (prefers-reduced-motion: reduce) {
  .gomoku-cell.has-black::after,
  .gomoku-cell.has-white::after {
    animation: none;
  }
  .gomoku-cell.is-win::after {
    animation: none;
  }
}
</style>
