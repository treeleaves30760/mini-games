<script setup>
/* 數字推盤 15 Puzzle — 4×4 sliding tile puzzle.
   Scrambled via repeated legal moves from solved state (always solvable).
   Click a tile in the blank's row or column to slide the whole run.
   Arrow keys move tiles. Win when ascending order with blank last. */

const accent = "#c08cff";
const BEST_KEY = "playground.fifteen.best";

const SIZES = [
  { key: "3", label: "3×3", n: 3 },
  { key: "4", label: "4×4", n: 4 },
  { key: "5", label: "5×5", n: 5 },
];

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// ---- pure game logic (unit-tested in app/games/fifteen.ts) ----
import { isSolved as isBoardSolved, blankPos, legalMoves, applyMove, generateBoard } from "~/games/fifteen";

const sizeKey = ref("4");
const tiles = ref([]); // flat array, blank is 0
const blankIdx = ref(0);
const moves = ref(0);
const seconds = ref(0);
const won = ref(false);
const bestMoves = ref(0);
const bestTime = ref(0);
const isRecord = ref(false);
const overlayOpen = ref(false);

let timerH = null;
let started = false;
let gen = 0;

const N = computed(() => {
  if (props.daily) return 4;
  return SIZES.find((s) => s.key === sizeKey.value)?.n || 4;
});
const total = computed(() => N.value * N.value);

function newGame(sk) {
  if (sk && !props.daily) sizeKey.value = sk;
  const n = N.value;
  const rng = makeRng(props.seed);
  tiles.value = generateBoard(n, rng);
  blankIdx.value = tiles.value.indexOf(0);
  moves.value = 0;
  seconds.value = 0;
  won.value = false;
  isRecord.value = false;
  overlayOpen.value = false;
  started = false;
  gen++;
  stopTimer();
  loadBest();
}

function regenerate() {
  newGame();
}
watch(() => props.seed, regenerate);

function loadBest() {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
    const key = `${N.value}`;
    bestMoves.value = raw[key]?.moves || 0;
    bestTime.value = raw[key]?.time || 0;
  } catch (_) {
    bestMoves.value = 0;
    bestTime.value = 0;
  }
}

function saveBest() {
  try {
    const raw = JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
    const key = `${N.value}`;
    const prev = raw[key];
    if (!prev || moves.value < prev.moves || (moves.value === prev.moves && seconds.value < prev.time)) {
      raw[key] = { moves: moves.value, time: seconds.value };
      localStorage.setItem(BEST_KEY, JSON.stringify(raw));
      bestMoves.value = moves.value;
      bestTime.value = seconds.value;
      isRecord.value = true;
    }
  } catch (_) {}
}

function startTimer() {
  stopTimer();
  timerH = setInterval(() => seconds.value++, 1000);
}
function stopTimer() {
  if (timerH) { clearInterval(timerH); timerH = null; }
}

function fmt(s) {
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
const timeStr = computed(() => fmt(seconds.value));
const bestStr = computed(() => bestTime.value ? fmt(bestTime.value) : "—");

// ---- sliding logic ----
// Click a tile: if blank is in same row or col, slide entire run
function tileClick(idx) {
  if (won.value) return;
  const n = N.value;
  const tr = (idx / n) | 0;
  const tc = idx % n;
  const bi = blankIdx.value;
  const br = (bi / n) | 0;
  const bc = bi % n;

  if (tr !== br && tc !== bc) return; // not in same row/col

  if (!started) { started = true; startTimer(); }

  const next = tiles.value.slice();
  let cursor = bi;
  if (tr === br) {
    // same row — slide horizontally
    const step = tc > bc ? 1 : -1;
    while (cursor !== idx) {
      const from = cursor + step;
      next[cursor] = next[from];
      cursor = from;
    }
  } else {
    // same col — slide vertically
    const step = tr > br ? n : -n;
    while (cursor !== idx) {
      const from = cursor + step;
      next[cursor] = next[from];
      cursor = from;
    }
  }
  next[idx] = 0;
  tiles.value = next;
  blankIdx.value = idx;
  moves.value++;
  checkWin();
}

function checkWin() {
  if (isBoardSolved(tiles.value)) {
    won.value = true;
    stopTimer();
    saveBest();
    overlayOpen.value = true;
    emit("solved", { moves: moves.value, time: seconds.value });
  }
}

// ---- keyboard ----
function onKey(e) {
  if (won.value) return;
  const n = N.value;
  const bi = blankIdx.value;
  const br = (bi / n) | 0;
  const bc = bi % n;
  let ti = -1;
  // Arrow keys: the tile that slides into the blank
  if (e.key === "ArrowUp" && br < n - 1) ti = bi + n;
  else if (e.key === "ArrowDown" && br > 0) ti = bi - n;
  else if (e.key === "ArrowLeft" && bc < n - 1) ti = bi + 1;
  else if (e.key === "ArrowRight" && bc > 0) ti = bi - 1;
  if (ti < 0) return;
  e.preventDefault();
  tileClick(ti);
}

// ---- tile position ----
function tileStyle(i) {
  const n = N.value;
  const r = (i / n) | 0;
  const c = i % n;
  return {
    gridRow: r + 1,
    gridColumn: c + 1,
  };
}

function tileValue(i) {
  return tiles.value[i];
}

function isSolved(i) {
  // tile at position i has value i+1 (or blank at last)
  const v = tiles.value[i];
  return v !== 0 && v === i + 1;
}

onMounted(() => {
  loadBest();
  newGame();
  window.addEventListener("keydown", onKey);
});

onBeforeUnmount(() => {
  stopTimer();
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="數字推盤" title-en="15 Puzzle">
      <template #actions>
        <button class="btn btn--accent" @click="newGame()">新遊戲</button>
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
            <span class="chip__label">時間</span>
            <span class="chip__value">{{ timeStr }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">最佳步</span>
            <span class="chip__value">{{ bestMoves || "—" }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">最佳時</span>
            <span class="chip__value">{{ bestStr }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div
            class="fboard"
            :style="{ '--n': N }"
            :aria-label="`${N}×${N} 數字推盤`"
            role="grid"
          >
            <button
              v-for="(v, i) in tiles"
              :key="i"
              class="ftile"
              :class="{
                'is-blank': v === 0,
                'is-solved': isSolved(i) && !won,
                'is-won': won && v !== 0,
              }"
              :style="tileStyle(i)"
              :aria-label="v === 0 ? '空格' : `${v}`"
              :disabled="v === 0 || won"
              @click="tileClick(i)"
            >
              <span v-if="v !== 0">{{ v }}</span>
            </button>
          </div>

          <div class="overlay" :class="{ 'is-open': overlayOpen }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ isRecord ? "新紀錄！" : "完成！" }}</h2>
              <p class="overlay__sub">
                {{ N }}×{{ N }} · {{ moves }} 步 · {{ timeStr }}{{ isRecord ? "（最佳）" : "" }}
              </p>
              <div class="overlay__actions">
                <button v-if="!daily" class="btn btn--accent" @click="newGame()">再來一局</button>
                <span v-else class="hint">今日挑戰完成！</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div v-if="!daily" class="panel__group">
          <span class="panel__legend">盤面大小</span>
          <div class="seg" role="group" aria-label="盤面大小">
            <button
              v-for="s in SIZES"
              :key="s.key"
              :class="{ 'is-active': sizeKey === s.key }"
              @click="newGame(s.key)"
            >
              {{ s.label }}
            </button>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            點擊與空格同列或同行的數字磚，整排磚塊會向空格滑動。<br />
            也可用方向鍵控制（鍵盤箭頭 = 磚塊滑入方向的反方向）。<br />
            將數字由小到大排列、空格在右下角即過關。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">提示</span>
          <p class="hint">
            先固定最上方兩行，再固定最左兩列，最後處理右下角的 2×2 區塊。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.fboard {
  --gap: clamp(4px, 1vw, 8px);
  --size: min(86vw, 60vh, 540px);
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
  grid-template-rows: repeat(var(--n), 1fr);
  gap: var(--gap);
  width: var(--size);
  height: var(--size);
  padding: var(--gap);
  border-radius: var(--r-lg);
  background: linear-gradient(180deg, var(--ink-850), var(--ink-900));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
}

.ftile {
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  background: var(--ink-700);
  border: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: clamp(0.9rem, calc(5vw / var(--n)), 2.4rem);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    transform var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease);
  user-select: none;
  touch-action: none;
}

.ftile:not(.is-blank):hover {
  background: var(--ink-600);
  border-color: var(--line-strong);
  transform: scale(1.04);
  z-index: 1;
}

.ftile:not(.is-blank):active {
  transform: scale(0.97);
}

.ftile.is-blank {
  background: transparent;
  border-color: transparent;
  cursor: default;
  pointer-events: none;
}

.ftile.is-solved {
  background: color-mix(in oklab, var(--accent) 14%, var(--ink-700));
  border-color: color-mix(in oklab, var(--accent) 40%, transparent);
  color: var(--accent);
}

.ftile.is-won {
  background: color-mix(in oklab, var(--accent) 18%, var(--ink-700));
  border-color: color-mix(in oklab, var(--accent) 60%, transparent);
  color: var(--accent);
  box-shadow: 0 4px 18px -8px var(--accent);
  animation: tileWin 0.5s var(--ease-out);
}

@keyframes tileWin {
  0% { transform: scale(0.92); }
  60% { transform: scale(1.06); }
  100% { transform: scale(1); }
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}
</style>
