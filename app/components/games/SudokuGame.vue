<script setup>
/* 數獨 Sudoku — reactive board with unique-solution generator, notes,
   peer/conflict highlighting and timer. */

const accent = "#6aa6ff";
const DIFF = {
  easy: { label: "簡單", remove: 40 },
  medium: { label: "中等", remove: 48 },
  hard: { label: "困難", remove: 54 },
};
const diffs = [
  { key: "easy", label: "簡單" },
  { key: "medium", label: "中等" },
  { key: "hard", label: "困難" },
];

const state = reactive({
  values: new Array(81).fill(0),
  given: new Array(81).fill(false),
  notes: Array.from({ length: 81 }, () => new Set()),
  selected: -1,
  mistakes: 0,
  notesMode: false,
  solved: false,
});
let solution = new Array(81).fill(0);

const difficulty = ref("medium");
const time = ref(0);
const overlay = reactive({ open: false, sub: "" });
let timerId = null;
let startTs = 0;

// ---- lifecycle ----
function newGame(diff) {
  difficulty.value = diff;
  const { puzzle, solution: sol } = generateSudoku(DIFF[diff].remove);
  solution = sol;
  state.values = puzzle.slice();
  state.given = puzzle.map((v) => v !== 0);
  state.notes = Array.from({ length: 81 }, () => new Set());
  state.selected = -1;
  state.mistakes = 0;
  state.solved = false;
  overlay.open = false;
  startTimer();
}

function select(i) {
  state.selected = i;
}

function input(n) {
  const i = state.selected;
  if (state.solved || i < 0 || state.given[i]) return;

  if (state.notesMode && n > 0) {
    if (state.values[i] !== 0) return;
    const set = state.notes[i];
    if (set.has(n)) set.delete(n);
    else set.add(n);
    return;
  }

  if (n === 0) {
    state.values[i] = 0;
    state.notes[i].clear();
  } else {
    state.values[i] = n;
    state.notes[i].clear();
    if (n !== solution[i]) state.mistakes++;
    else clearPeerNotes(i, n);
  }
  checkWin();
}

function clearPeerNotes(idx, n) {
  for (const p of peersOf(idx)) state.notes[p].delete(n);
}
function peersOf(idx) {
  const r = (idx / 9) | 0;
  const c = idx % 9;
  const out = new Set();
  for (let i = 0; i < 9; i++) {
    out.add(r * 9 + i);
    out.add(i * 9 + c);
  }
  const br = r - (r % 3);
  const bc = c - (c % 3);
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) out.add((br + y) * 9 + (bc + x));
  out.delete(idx);
  return out;
}

function hint() {
  if (state.solved) return;
  let target = -1;
  const i = state.selected;
  if (i >= 0 && !state.given[i] && state.values[i] !== solution[i]) {
    target = i;
  } else {
    const empties = [];
    for (let k = 0; k < 81; k++)
      if (!state.given[k] && state.values[k] !== solution[k]) empties.push(k);
    if (!empties.length) return;
    target = empties[(Math.random() * empties.length) | 0];
  }
  state.values[target] = solution[target];
  state.notes[target].clear();
  clearPeerNotes(target, solution[target]);
  state.selected = target;
  checkWin();
}

function checkWin() {
  for (let k = 0; k < 81; k++) if (state.values[k] !== solution[k]) return;
  state.solved = true;
  stopTimer();
  overlay.sub = `難度 ${DIFF[difficulty.value].label}　·　用時 ${fmt(time.value)}　·　錯誤 ${state.mistakes}`;
  overlay.open = true;
}

// ---- cell view helpers ----
function cellClasses(i) {
  const r = (i / 9) | 0;
  const c = i % 9;
  const v = state.values[i];
  const cls = [];
  if (r === 2 || r === 5) cls.push("box-bottom");
  if (state.given[i]) cls.push("is-given");
  if (v !== 0 && !state.given[i] && v !== solution[i]) cls.push("is-error");
  const sel = state.selected;
  if (sel >= 0) {
    const sr = (sel / 9) | 0;
    const sc = sel % 9;
    const samebox = ((r / 3) | 0) === ((sr / 3) | 0) && ((c / 3) | 0) === ((sc / 3) | 0);
    if (i !== sel && (r === sr || c === sc || samebox)) cls.push("is-peer");
    const selVal = state.values[sel];
    if (selVal !== 0 && v === selVal && i !== sel) cls.push("is-same");
    if (i === sel) cls.push("is-selected");
  }
  return cls;
}
function remaining(n) {
  let count = 0;
  for (let i = 0; i < 81; i++) if (state.values[i] === n) count++;
  return 9 - count;
}

// ---- timer ----
function startTimer() {
  stopTimer();
  startTs = performance.now();
  time.value = 0;
  timerId = setInterval(() => {
    time.value = Math.floor((performance.now() - startTs) / 1000);
  }, 500);
}
function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}
function fmt(s) {
  return ((s / 60) | 0) + ":" + String(s % 60).padStart(2, "0");
}

// ---- input ----
function onKey(e) {
  if (e.key >= "1" && e.key <= "9") return input(+e.key);
  if (e.key === "0" || e.key === "Backspace" || e.key === "Delete") return input(0);
  if (e.key === "n" || e.key === "N") {
    state.notesMode = !state.notesMode;
    return;
  }
  const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
  if (e.key in moves) {
    e.preventDefault();
    if (state.selected < 0) return select(40);
    const r = (state.selected / 9) | 0;
    const c = state.selected % 9;
    if (e.key === "ArrowLeft" && c === 0) return;
    if (e.key === "ArrowRight" && c === 8) return;
    if (e.key === "ArrowUp" && r === 0) return;
    if (e.key === "ArrowDown" && r === 8) return;
    select(state.selected + moves[e.key]);
  }
}

onMounted(() => {
  newGame("medium");
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  stopTimer();
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="數獨" title-en="Sudoku">
      <template #actions>
        <button class="btn" @click="hint">提示</button>
        <button class="btn btn--accent" @click="newGame(difficulty)">新遊戲</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">Level</span>
            <span class="chip__value is-accent">{{ DIFF[difficulty].label }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">Mistakes</span>
            <span class="chip__value">{{ state.mistakes }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">Time</span>
            <span class="chip__value">{{ fmt(time) }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div class="sudoku-board" role="grid" aria-label="數獨盤面">
            <button
              v-for="(v, i) in state.values"
              :key="i"
              class="cell"
              :class="cellClasses(i)"
              role="gridcell"
              @click="select(i)"
            >
              <template v-if="v">{{ v }}</template>
              <div v-else-if="state.notes[i] && state.notes[i].size" class="cell__notes">
                <span v-for="n in 9" :key="n">{{ state.notes[i].has(n) ? n : "" }}</span>
              </div>
            </button>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">完成！</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button class="btn btn--accent" @click="newGame(difficulty)">再來一局</button>
              </div>
            </div>
          </div>
        </div>

        <div class="pad" aria-label="數字鍵盤">
          <button
            v-for="n in 9"
            :key="n"
            :class="{ 'is-done': remaining(n) === 0 }"
            @click="input(n)"
          >
            <span class="count">{{ remaining(n) || "" }}</span>{{ n }}
          </button>
          <button class="key-erase" aria-label="清除" @click="input(0)">⌫</button>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">難度</span>
          <div class="seg" role="group" aria-label="難度選擇">
            <button
              v-for="d in diffs"
              :key="d.key"
              :class="{ 'is-active': difficulty === d.key }"
              @click="newGame(d.key)"
            >
              {{ d.label }}
            </button>
          </div>
          <p class="hint">切換難度會開始一局新遊戲。</p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">工具</span>
          <div class="toggle-row">
            <span>筆記模式 <kbd>N</kbd></span>
            <button
              class="switch"
              role="switch"
              :aria-checked="state.notesMode"
              aria-label="筆記模式"
              @click="state.notesMode = !state.notesMode"
            />
          </div>
          <p class="hint">筆記模式下輸入數字會記為候選小字，方便推理。</p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">操作方式</span>
          <p class="hint">
            選格：點擊或方向鍵 <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd><br />
            填入：<kbd>1</kbd>–<kbd>9</kbd>　清除：<kbd>0</kbd> / <kbd>⌫</kbd><br />
            切換筆記：<kbd>N</kbd>
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.sudoku-board {
  --b: min(88vw, 58vh, 520px);
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  grid-template-rows: repeat(9, 1fr);
  width: var(--b);
  height: var(--b);
  background: var(--ink-850);
  border: 2px solid var(--line-strong);
  border-radius: var(--r-md);
  overflow: hidden;
  box-shadow: var(--shadow-2);
  user-select: none;
  touch-action: manipulation;
}
.cell {
  position: relative;
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-size: clamp(1rem, 4.4vw, 1.6rem);
  font-weight: 700;
  color: var(--accent);
  background: var(--ink-800);
  border: 1px solid var(--line);
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  cursor: pointer;
}
.cell:nth-child(3n) { border-right: 2px solid var(--line-strong); }
.cell:nth-child(9n) { border-right: none; }
.cell.box-bottom { border-bottom: 2px solid var(--line-strong); }
.cell.is-given { color: var(--text); background: var(--ink-700); cursor: default; }
.cell.is-peer { background: color-mix(in oklab, var(--accent) 8%, var(--ink-800)); }
.cell.is-same { background: color-mix(in oklab, var(--accent) 18%, var(--ink-800)); }
.cell.is-selected {
  background: color-mix(in oklab, var(--accent) 30%, var(--ink-800));
  box-shadow: inset 0 0 0 2px var(--accent);
  z-index: 1;
}
.cell.is-error { color: #ff6b78; background: color-mix(in oklab, #ff6b78 15%, var(--ink-800)); }
.cell.is-error.is-selected { box-shadow: inset 0 0 0 2px #ff6b78; }
.cell__notes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  width: 100%;
  height: 100%;
  padding: 2px;
}
.cell__notes span {
  display: grid;
  place-items: center;
  font-size: clamp(0.42rem, 1.5vw, 0.62rem);
  font-weight: 400;
  color: var(--text-dim);
  line-height: 1;
}
.pad {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.5rem;
  width: min(88vw, 58vh, 520px);
}
.pad button {
  position: relative;
  aspect-ratio: 1 / 1;
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text);
  background: var(--ink-700);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  transition: background var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease), opacity var(--dur-fast) var(--ease);
}
.pad button:hover { background: var(--ink-600); }
.pad button:active { transform: scale(0.94); }
.pad button.is-done { opacity: 0.32; color: var(--text-faint); }
.pad button .count {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 0.6rem;
  font-weight: 400;
  color: var(--text-faint);
}
.pad button.key-erase { color: var(--accent); font-size: 1.1rem; }
</style>
