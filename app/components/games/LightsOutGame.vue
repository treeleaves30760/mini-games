<script setup>
/* 關燈 Lights Out — guaranteed-solvable board via random-press generation.
   Click a cell to toggle it and its 4 orthogonal neighbors. Win = all off. */

const accent = "#ffd45e";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const SIZES = [3, 5, 7];
const sizeIdx = ref(1); // default 5×5
const size = computed(() => SIZES[sizeIdx.value]);

// Board state: array of 0/1 (off/on)
const board = ref([]);
const moves = ref(0);
const gameState = ref("playing"); // playing | won
const scrambleMoves = ref(0); // how many presses used in scramble

const startTime = ref(0);
const elapsed = ref(0);
let timerHandle = null;

function startTimer() {
  stopTimer();
  startTime.value = Date.now();
  timerHandle = setInterval(() => {
    elapsed.value = Math.floor((Date.now() - startTime.value) / 1000);
  }, 250);
}
function stopTimer() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
}

function idx(r, c) {
  return r * size.value + c;
}

// Apply a press at (r, c) to a given board array (mutates in-place)
function applyPress(b, r, c, N) {
  const toggle = (rr, cc) => {
    if (rr >= 0 && rr < N && cc >= 0 && cc < N) {
      b[rr * N + cc] ^= 1;
    }
  };
  toggle(r, c);
  toggle(r - 1, c);
  toggle(r + 1, c);
  toggle(r, c - 1);
  toggle(r, c + 1);
}

function generateBoard() {
  const N = size.value;
  const rng = makeRng(props.seed);

  // Start all-off, apply N*N/2 random presses (guaranteed solvable)
  const b = new Array(N * N).fill(0);
  const numPresses = Math.max(N * N, Math.floor(N * N * 0.7));
  let actualPresses = 0;
  for (let i = 0; i < numPresses; i++) {
    const r = rng.int(0, N - 1);
    const c = rng.int(0, N - 1);
    applyPress(b, r, c, N);
    actualPresses++;
  }

  // If by chance all lights are already off, apply one more press
  if (b.every((v) => v === 0)) {
    applyPress(b, Math.floor(N / 2), Math.floor(N / 2), N);
    actualPresses++;
  }

  scrambleMoves.value = actualPresses;
  return b;
}

function initGame() {
  stopTimer();
  board.value = generateBoard();
  moves.value = 0;
  gameState.value = "playing";
  elapsed.value = 0;
  startTimer();
}

function pressCell(r, c) {
  if (gameState.value !== "playing") return;
  const N = size.value;
  const b = [...board.value];
  applyPress(b, r, c, N);
  board.value = b;
  moves.value++;
  checkWin();
}

function checkWin() {
  if (board.value.every((v) => v === 0)) {
    stopTimer();
    gameState.value = "won";
    emit("solved", { moves: moves.value });
  }
}

function onCellClick(r, c) {
  pressCell(r, c);
}

function setSize(i) {
  sizeIdx.value = i;
  initGame();
}

watch(() => props.seed, () => { initGame(); });

onMounted(() => { initGame(); });
onBeforeUnmount(() => { stopTimer(); });
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="關燈" title-en="Lights Out">
      <template #actions>
        <button class="btn btn--accent" @click="initGame">重新打亂</button>
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
            <span class="chip__value">{{ elapsed }}s</span>
          </div>
          <div class="chip">
            <span class="chip__label">目標</span>
            <span class="chip__value">{{ scrambleMoves }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div
            class="lo-board"
            :style="{ '--n': size }"
            aria-label="關燈盤面"
            role="grid"
          >
            <button
              v-for="(val, i) in board"
              :key="i"
              class="lo-cell"
              :class="{ 'is-on': val === 1, 'is-off': val === 0 }"
              :aria-label="`行${Math.floor(i / size) + 1}列${(i % size) + 1} ${val ? '亮' : '暗'}`"
              :aria-pressed="val === 1"
              @click="onCellClick(Math.floor(i / size), i % size)"
            >
              <span class="lo-inner"></span>
            </button>
          </div>

          <div class="overlay" :class="{ 'is-open': gameState === 'won' }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ daily ? '完成！' : '🌙 全滅！' }}</h2>
              <p class="overlay__sub">
                <template v-if="daily">
                  今日關燈完成！用了 {{ moves }} 步，共 {{ elapsed }} 秒。
                </template>
                <template v-else>
                  太厲害了！你用了 {{ moves }} 步把所有燈都關掉了。
                </template>
              </p>
              <div class="overlay__actions">
                <button v-if="!daily" class="btn btn--accent" @click="initGame">再玩一次</button>
                <button v-else class="btn btn--accent" @click="() => {}">完成</button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!daily" class="diff-bar">
          <div class="seg">
            <button
              v-for="(s, i) in SIZES"
              :key="i"
              :class="{ 'is-active': sizeIdx === i }"
              :aria-pressed="sizeIdx === i"
              @click="setSize(i)"
            >{{ s }}×{{ s }}</button>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            點擊任一格，該格及其上下左右相鄰格的燈會切換亮暗。<br />
            目標是把所有燈都關掉！
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">目標步數</span>
          <p class="hint">
            「目標」欄顯示打亂時使用的按壓次數，是理論上的參考解法步數。<br />
            實際上可能存在更短的解法！
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">小提示</span>
          <p class="hint">
            每個按鈕按兩下等於沒按。從角落或邊緣開始分析，逐步消滅亮燈往往更有效率。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.lo-board {
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
  grid-template-rows: repeat(var(--n), 1fr);
  gap: 8px;
  width: min(86vw, 60vh, 480px);
  aspect-ratio: 1;
  border-radius: var(--r-lg);
  background: var(--ink-900);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  padding: 16px;
  touch-action: none;
}

.lo-cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-md);
  border: 1px solid var(--line);
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    transform var(--dur-fast) var(--ease);
  overflow: hidden;
}

.lo-cell:active {
  transform: scale(0.92);
}

.lo-inner {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  transition: opacity var(--dur-fast) var(--ease);
}

/* OFF state */
.lo-cell.is-off {
  background: var(--ink-800);
  border-color: var(--line);
  box-shadow: none;
}
.lo-cell.is-off:hover {
  background: var(--ink-700);
  border-color: var(--line-strong);
}
.lo-cell.is-off .lo-inner {
  opacity: 0;
}

/* ON state — glowing yellow lamp */
.lo-cell.is-on {
  background: color-mix(in oklab, var(--accent) 90%, white 10%);
  border-color: var(--accent);
  box-shadow:
    0 0 12px color-mix(in oklab, var(--accent) 70%, transparent),
    0 0 30px color-mix(in oklab, var(--accent) 35%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
}
.lo-cell.is-on .lo-inner {
  opacity: 1;
  background: radial-gradient(
    50% 50% at 35% 30%,
    rgba(255, 255, 255, 0.55) 0%,
    rgba(255, 255, 255, 0) 100%
  );
}

@media (prefers-reduced-motion: no-preference) {
  .lo-cell.is-on {
    animation: lampPulse 2.4s ease-in-out infinite;
  }
}

@keyframes lampPulse {
  0%, 100% {
    box-shadow:
      0 0 12px color-mix(in oklab, var(--accent) 70%, transparent),
      0 0 30px color-mix(in oklab, var(--accent) 35%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.35);
  }
  50% {
    box-shadow:
      0 0 20px color-mix(in oklab, var(--accent) 85%, transparent),
      0 0 50px color-mix(in oklab, var(--accent) 50%, transparent),
      0 0 80px color-mix(in oklab, var(--accent) 20%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.35);
  }
}

.diff-bar {
  width: min(86vw, 60vh, 480px);
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}
</style>
