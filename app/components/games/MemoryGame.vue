<script setup>
/* 記憶翻牌 Memory — flip two cards a turn; matching pairs stay face-up, a
   mismatch flips back. Clear every pair in as few moves as you can. Deck is a
   shuffled set of emoji pairs sized to the chosen board. */

// ---- core game logic (pure, unit-tested) ----
import { buildDeck, isMatch, canFlip, isWin as isDeckWon } from "~/games/memory";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const accent = "#ff7a9c";
const BEST_KEY = "playground.memory.best.";

const DIFFS = [
  { key: "easy", label: "簡單", cols: 4, rows: 3 },
  { key: "medium", label: "中等", cols: 4, rows: 4 },
  { key: "hard", label: "困難", cols: 6, rows: 4 },
];
// distinct, easily-told-apart glyphs; sliced to the pair count each game needs
const SYMBOLS = ["🦊", "🐼", "🐸", "🐵", "🦄", "🐯", "🦁", "🐷", "🐮", "🐰", "🐶", "🐱", "🐻", "🐨", "🐹", "🦉", "🐧", "🐢"];

const difficulty = ref("medium");
const cols = ref(4);
const rows = ref(4);
const cards = ref([]); // { id, sym, flipped, matched }
const moves = ref(0);
const matched = ref(0);
const won = ref(false);
const isRecord = ref(false);
const seconds = ref(0);
const best = ref(0);

let first = null; // index of the first flipped card this turn
let lock = false; // input lock during the mismatch flip-back
let started = false;
let gen = 0; // bumped each new game so stale timeouts no-op
let timerH = null;

const totalPairs = computed(() => (cols.value * rows.value) / 2);
const diffLabel = computed(() => DIFFS.find((d) => d.key === difficulty.value)?.label || "");

function newGame(diffKey) {
  // Daily challenge is a fixed 4×4 board generated from the date seed.
  if (props.daily) difficulty.value = "medium";
  else if (diffKey) difficulty.value = diffKey;
  const d = DIFFS.find((x) => x.key === difficulty.value);
  cols.value = d.cols;
  rows.value = d.rows;
  const pairs = (d.cols * d.rows) / 2;
  const syms = SYMBOLS.slice(0, pairs);
  const rng = makeRng(props.seed);
  cards.value = buildDeck(syms, rng);
  first = null;
  lock = false;
  started = false;
  gen++;
  moves.value = 0;
  matched.value = 0;
  won.value = false;
  isRecord.value = false;
  best.value = Number(localStorage.getItem(BEST_KEY + difficulty.value) || 0);
  seconds.value = 0;
  stopTimer();
}

function flip(i) {
  if (lock || won.value || !canFlip(cards.value, i, first)) return;
  const c = cards.value[i];
  if (!started) {
    started = true;
    startTimer();
  }
  c.flipped = true;
  if (first === null) {
    first = i;
    return;
  }
  moves.value++;
  const a = cards.value[first];
  if (isMatch(a, c)) {
    a.matched = true;
    c.matched = true;
    first = null;
    matched.value++;
    if (isDeckWon(cards.value)) win();
  } else {
    lock = true;
    const g = gen;
    setTimeout(() => {
      if (g !== gen) return; // a new game started meanwhile
      a.flipped = false;
      c.flipped = false;
      first = null;
      lock = false;
    }, 850);
  }
}

function win() {
  won.value = true;
  stopTimer();
  const key = BEST_KEY + difficulty.value;
  const prev = Number(localStorage.getItem(key) || 0);
  if (!prev || seconds.value < prev) {
    localStorage.setItem(key, String(seconds.value));
    best.value = seconds.value;
    isRecord.value = true;
  }
  emit("solved", { moves: moves.value, time: seconds.value });
}

watch(() => props.seed, () => newGame());

function startTimer() {
  stopTimer();
  timerH = setInterval(() => seconds.value++, 1000);
}
function stopTimer() {
  if (timerH) {
    clearInterval(timerH);
    timerH = null;
  }
}
function fmt(s) {
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
const timeStr = computed(() => fmt(seconds.value));
const bestStr = computed(() => (best.value ? fmt(best.value) : "—"));

onMounted(() => newGame());
onBeforeUnmount(() => stopTimer());
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="記憶翻牌" title-en="Memory">
      <template #actions>
        <button v-if="!daily" class="btn btn--accent" @click="newGame()">新遊戲</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">Time</span>
            <span class="chip__value is-accent">{{ timeStr }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">Moves</span>
            <span class="chip__value">{{ moves }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">Pairs</span>
            <span class="chip__value">{{ matched }} / {{ totalPairs }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">Best</span>
            <span class="chip__value">{{ bestStr }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div class="mboard" :style="{ '--cols': cols, '--rows': rows }">
            <button
              v-for="(c, i) in cards"
              :key="c.id"
              class="mcard"
              :class="{ 'is-up': c.flipped || c.matched, 'is-matched': c.matched }"
              :disabled="won"
              :aria-label="c.flipped || c.matched ? c.sym : '蓋著的卡片'"
              @click="flip(i)"
            >
              <span class="mcard__inner">
                <span class="mcard__face mcard__back" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M12 4 L18 12 L12 20 L6 12 Z" />
                    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
                  </svg>
                </span>
                <span class="mcard__face mcard__front">{{ c.sym }}</span>
              </span>
            </button>
          </div>

          <div class="overlay" :class="{ 'is-open': won }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ isRecord ? "新紀錄！" : "全部配對完成！" }}</h2>
              <p class="overlay__sub">
                難度 {{ diffLabel }}　·　{{ moves }} 步　·　用時 {{ timeStr }}{{ isRecord ? "（最佳）" : ` · 最佳 ${bestStr}` }}
              </p>
              <div class="overlay__actions">
                <button v-if="!daily" class="btn btn--accent" @click="newGame()">再來一局</button>
                <span v-else class="hint">今日挑戰完成 🎉</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div v-if="!daily" class="panel__group">
          <span class="panel__legend">難度</span>
          <div class="seg" role="group" aria-label="難度選擇">
            <button
              v-for="d in DIFFS"
              :key="d.key"
              :class="{ 'is-active': difficulty === d.key }"
              @click="newGame(d.key)"
            >
              {{ d.label }}
            </button>
          </div>
          <p class="hint">切換難度會開始新的一局（{{ cols }}×{{ rows }} 張牌、{{ totalPairs }} 組）。</p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            每回合翻開兩張卡片：圖案<strong>相同</strong>就配對成功、留在正面；
            <strong>不同</strong>則自動蓋回去。記住每張卡的位置，把所有成對的卡片都翻開即過關。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">小提示</span>
          <p class="hint">用越少步數越好。先翻開沒看過的新卡蒐集資訊，再回頭配對你已經記住位置的卡片。</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.mboard {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  grid-template-rows: repeat(var(--rows), 1fr);
  gap: clamp(6px, 1.7vw, 12px);
  width: min(94vw, 58vh * var(--cols) / var(--rows), 480px);
  /* Pin height to match width scaled by the row/col ratio so rows never
     size to content and cause layout shift during card flips. */
  height: calc(min(94vw, 58vh * var(--cols) / var(--rows), 480px) * var(--rows) / var(--cols));
  container-type: inline-size;
}
.mcard {
  aspect-ratio: 1;
  padding: 0;
  background: none;
  border: none;
  border-radius: var(--r-sm);
  perspective: 700px;
  cursor: pointer;
}
.mcard:disabled {
  cursor: default;
}
.mcard__inner {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.42s var(--ease);
}
.mcard.is-up .mcard__inner {
  transform: rotateY(180deg);
}
.mcard__face {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border: 1px solid var(--line);
}
.mcard__back {
  background: linear-gradient(150deg, color-mix(in oklab, var(--accent) 24%, var(--ink-700)), var(--ink-800));
  color: color-mix(in oklab, var(--accent) 80%, white 10%);
}
.mcard__back svg {
  width: 34%;
  height: 34%;
  opacity: 0.85;
}
.mcard:not(:disabled):hover .mcard__back {
  border-color: color-mix(in oklab, var(--accent) 50%, transparent);
}
.mcard__front {
  background: var(--ink-600);
  border-color: var(--line-strong);
  transform: rotateY(180deg);
  font-size: calc(50cqw / var(--cols));
  line-height: 1;
  user-select: none;
}
.mcard.is-matched .mcard__front {
  background: color-mix(in oklab, var(--accent) 18%, var(--ink-700));
  border-color: color-mix(in oklab, var(--accent) 70%, transparent);
  box-shadow: inset 0 0 0 1.5px color-mix(in oklab, var(--accent) 55%, transparent),
    0 6px 20px -10px var(--accent);
}
.mcard.is-matched {
  animation: mPop 0.4s var(--ease);
}
@keyframes mPop {
  0% { transform: scale(1); }
  40% { transform: scale(1.07); }
  100% { transform: scale(1); }
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}
</style>
