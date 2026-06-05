<script setup>
/* 猜詞 Word Guess — Wordle-style word game with selectable length (5–8).
   Per-letter colour feedback is REVEALED in sync with each tile's flip (the
   colour swaps at the half-flip, like the real thing). On-screen QWERTY +
   physical keyboard. The answer comes from a seeded RNG (daily = same for
   everyone) and its dictionary meaning is shown when the round ends. */

import {
  WORD_LENGTHS,
  DEFAULT_LENGTH,
  scoreGuess,
  isValidWord,
  pickAnswer,
  definitionOf,
  loadWordPack,
} from "~/games/wordguess";

const accent = "#6ad0a0";
const SAVE_KEY = "playground.wordguess.stats";

// Reveal timing. The colour for tile i swaps at its flip's mid-point, so the
// board lights up left-to-right as each tile turns. Keep FLIP_MS in sync with
// the `wgFlip` animation duration in the stylesheet (0.5s).
const STEP_MS = 260; // stagger between adjacent tiles
const FLIP_MS = 500; // full flip duration (matches CSS)

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// ---- state ----
const length = ref(DEFAULT_LENGTH);
const maxGuesses = ref(length.value + 1);
const pack = ref(null);
const loading = ref(true);

const boardRows = ref(makeEmptyBoard(maxGuesses.value)); // [{ letters:[{ch,state}], locked }]
const currentRow = ref(0);
const currentInput = ref([]);
const keyStates = ref({}); // key -> 'correct'|'present'|'absent'
const answer = ref("");
const gameState = ref("playing"); // 'playing' | 'won' | 'lost'
const busy = ref(false); // true while a row is animating its reveal
const shakeRow = ref(-1);
const revealRow = ref(-1);

const statsData = ref({ played: 0, won: 0, streak: 0 });
const lastAnswer = ref("");
const lastDef = ref("");
const overlay = reactive({ open: false, title: "", answer: "", def: "", note: "" });
const toast = ref("");
let toastTimer = null;

function makeEmptyBoard(rows) {
  return Array.from({ length: rows }, () => ({ letters: [], locked: false }));
}

// ---- seed / daily / length ----
let rng;
async function regenerate() {
  const len = props.daily ? DEFAULT_LENGTH : length.value;
  length.value = len;
  loading.value = true;
  gameState.value = "loading";
  overlay.open = false;

  const loaded = await loadWordPack(len);
  if (length.value !== len) return; // a newer length switch superseded this one

  pack.value = loaded;
  maxGuesses.value = loaded.maxGuesses;
  rng = makeRng(props.seed);
  answer.value = pickAnswer(rng, loaded);
  boardRows.value = makeEmptyBoard(loaded.maxGuesses);
  currentRow.value = 0;
  currentInput.value = [];
  keyStates.value = {};
  gameState.value = "playing";
  busy.value = false;
  shakeRow.value = -1;
  revealRow.value = -1;
  loading.value = false;
}

function setLength(len) {
  if (props.daily || len === length.value) return;
  length.value = len;
  regenerate();
}

watch(() => props.seed, regenerate);

function showToast(msg, ms = 1400) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = "";
  }, ms);
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Reveal a locked row: flip each tile and swap in its colour at the half-flip.
async function animateReveal(row, states) {
  revealRow.value = row;
  const cells = boardRows.value[row].letters;
  if (prefersReducedMotion()) {
    states.forEach((s, i) => (cells[i].state = s));
    await new Promise((r) => setTimeout(r, 200));
  } else {
    states.forEach((s, i) => {
      setTimeout(() => {
        cells[i].state = s;
      }, i * STEP_MS + FLIP_MS / 2);
    });
    await new Promise((r) => setTimeout(r, (states.length - 1) * STEP_MS + FLIP_MS));
  }
  revealRow.value = -1;
}

async function submitGuess() {
  if (gameState.value !== "playing" || busy.value || !pack.value) return;
  const guess = currentInput.value.join("");
  if (guess.length < length.value) {
    showToast(`再填滿 ${length.value} 個字母`);
    triggerShake(currentRow.value);
    return;
  }
  if (!isValidWord(guess, pack.value)) {
    showToast("不在詞庫中");
    triggerShake(currentRow.value);
    return;
  }

  const states = scoreGuess(guess, answer.value);
  const row = currentRow.value;
  boardRows.value[row].letters = guess.split("").map((ch) => ({ ch, state: "pre" }));
  boardRows.value[row].locked = true;

  busy.value = true;
  await animateReveal(row, states);
  busy.value = false;

  // Update key colours only after the reveal, so they don't spoil the flip.
  const priority = { correct: 3, present: 2, absent: 1 };
  for (let i = 0; i < guess.length; i++) {
    const k = guess[i];
    const cur = keyStates.value[k];
    if (!cur || priority[states[i]] > priority[cur]) keyStates.value[k] = states[i];
  }

  if (guess === answer.value) {
    finish(true, row);
    return;
  }

  currentRow.value++;
  currentInput.value = [];
  if (currentRow.value >= maxGuesses.value) finish(false, row);
}

function finish(won, row) {
  gameState.value = won ? "won" : "lost";
  saveStats(won);
  const def = definitionOf(answer.value, pack.value);
  lastAnswer.value = answer.value;
  lastDef.value = def || "";

  if (won) {
    const msgs = ["天才！", "超強！", "太棒了！", "做到了！", "還不錯！", "好險！"];
    overlay.title = props.daily ? "完成！" : msgs[Math.min(row, msgs.length - 1)];
    overlay.note = `用了 ${row + 1} / ${maxGuesses.value} 次`;
    emit("solved", { guesses: row + 1 });
  } else {
    overlay.title = "很可惜";
    overlay.note = "再接再厲！";
  }
  overlay.answer = answer.value;
  overlay.def = def || "";
  overlay.open = true;
}

function triggerShake(row) {
  shakeRow.value = row;
  setTimeout(() => {
    shakeRow.value = -1;
  }, 600);
}

function inputChar(ch) {
  if (gameState.value !== "playing" || busy.value) return;
  if (currentInput.value.length < length.value) currentInput.value.push(ch);
}

function deleteLast() {
  if (gameState.value !== "playing" || busy.value) return;
  currentInput.value.pop();
}

function onKey(e) {
  if (overlay.open || busy.value) return;
  if (e.key === "Enter") {
    e.preventDefault();
    submitGuess();
    return;
  }
  if (e.key === "Backspace") {
    e.preventDefault();
    deleteLast();
    return;
  }
  const ch = e.key.toUpperCase();
  if (/^[A-Z]$/.test(ch)) {
    e.preventDefault();
    inputChar(ch);
  }
}

// ---- persistence ----
function saveStats(won) {
  try {
    const s = statsData.value;
    s.played++;
    if (won) {
      s.won++;
      s.streak++;
    } else {
      s.streak = 0;
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch (_) {}
}

// ---- QWERTY ----
const ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "⌫"],
];

// Displayed board: locked rows show their flipped letters; the active row shows
// the in-progress input; the rest are empty placeholders.
const displayBoard = computed(() => {
  const cols = length.value;
  return boardRows.value.map((row, ri) => {
    if (row.locked) return row.letters;
    if (ri === currentRow.value && gameState.value === "playing") {
      return Array.from({ length: cols }, (_, i) => ({
        ch: currentInput.value[i] || "",
        state: "tbd",
        filled: !!currentInput.value[i],
      }));
    }
    return Array.from({ length: cols }, () => ({ ch: "", state: "empty" }));
  });
});

onMounted(() => {
  try {
    statsData.value = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
  } catch (_) {}
  statsData.value = { played: 0, won: 0, streak: 0, ...statsData.value };
  regenerate();
  window.addEventListener("keydown", onKey);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="猜詞" title-en="Word Guess">
      <template #actions>
        <div v-if="!props.daily" class="wg-lens" role="group" aria-label="單字長度">
          <button
            v-for="L in WORD_LENGTHS"
            :key="L"
            class="wg-len"
            :class="{ 'is-active': length === L }"
            :aria-pressed="length === L"
            @click="setLength(L)"
          >
            {{ L }}
          </button>
        </div>
        <button v-if="!props.daily" class="btn btn--accent" @click="regenerate">新題目</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">長度</span>
            <span class="chip__value is-accent">{{ length }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">猜測</span>
            <span class="chip__value">{{ Math.min(currentRow + 1, maxGuesses) }} / {{ maxGuesses }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">勝場</span>
            <span class="chip__value">{{ statsData.won }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">連勝</span>
            <span class="chip__value">{{ statsData.streak }}</span>
          </div>
        </div>

        <!-- Toast: position:fixed so it floats above the board with no layout impact -->
        <Teleport to="body">
          <Transition name="toast">
            <div v-if="toast" class="wg-toast" role="status" aria-live="polite">{{ toast }}</div>
          </Transition>
        </Teleport>

        <!-- Board -->
        <div class="board-wrap">
          <div
            class="wg-board"
            :style="{ '--cols': length, '--rows': maxGuesses }"
            aria-label="猜詞盤面"
          >
            <div
              v-for="(row, ri) in displayBoard"
              :key="ri"
              class="wg-row"
              :class="{ 'is-shake': shakeRow === ri, 'is-reveal': revealRow === ri }"
            >
              <div
                v-for="(cell, ci) in row"
                :key="ci"
                class="wg-cell"
                :class="[`state-${cell.state}`, cell.filled ? 'is-filled' : '']"
                :style="revealRow === ri ? { '--delay': `${ci * STEP_MS}ms` } : {}"
              >
                <span>{{ cell.ch }}</span>
              </div>
            </div>
          </div>

          <div v-if="loading" class="wg-loading"><div class="wg-spinner" aria-hidden="true" /></div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <div class="overlay__answer">{{ overlay.answer }}</div>
              <p v-if="overlay.def" class="overlay__def">{{ overlay.def }}</p>
              <p class="overlay__note">{{ overlay.note }}</p>
              <div class="overlay__actions">
                <button
                  v-if="!props.daily && gameState !== 'playing'"
                  class="btn btn--accent"
                  @click="regenerate"
                >
                  換一題
                </button>
                <button class="btn" @click="overlay.open = false">關閉</button>
              </div>
            </div>
          </div>
        </div>

        <!-- On-screen keyboard -->
        <div class="wg-keyboard" aria-label="鍵盤">
          <div v-for="(row, ri) in ROWS" :key="ri" class="wg-kb-row">
            <button
              v-for="key in row"
              :key="key"
              class="wg-key"
              :class="[
                key === 'ENTER' || key === '⌫' ? 'wg-key--wide' : '',
                key !== 'ENTER' && key !== '⌫' ? `key-${keyStates[key] || 'idle'}` : '',
              ]"
              :aria-label="key === '⌫' ? '刪除' : key"
              @click="key === 'ENTER' ? submitGuess() : key === '⌫' ? deleteLast() : inputChar(key)"
            >
              {{ key }}
            </button>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div v-if="lastAnswer" class="panel__group">
          <span class="panel__legend">單字意思</span>
          <p class="wg-meaning"><b>{{ lastAnswer }}</b> — {{ lastDef }}</p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">顏色說明</span>
          <div class="wg-legend">
            <div class="wg-legend-item">
              <span class="wg-legend-cell state-correct">A</span>
              <span>字母在正確位置</span>
            </div>
            <div class="wg-legend-item">
              <span class="wg-legend-cell state-present">B</span>
              <span>字母在單字中，位置錯誤</span>
            </div>
            <div class="wg-legend-item">
              <span class="wg-legend-cell state-absent">C</span>
              <span>字母不在單字中</span>
            </div>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            猜一個 {{ length }} 個字母的英文單字，共 {{ maxGuesses }} 次機會。每次猜測後方格會翻面變色提示，猜中或用完機會後會告訴你這個單字的意思。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">統計</span>
          <p class="hint">已玩 {{ statsData.played }} 局，勝場 {{ statsData.won }}，連勝 {{ statsData.streak }}。</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.wg-toast {
  position: fixed;
  top: 5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  padding: 0.6rem 1.4rem;
  border-radius: var(--r-pill);
  background: var(--text);
  color: var(--ink-900);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  pointer-events: none;
  white-space: nowrap;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-6px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-6px);
}

/* length selector */
.wg-lens {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.2rem;
  border-radius: var(--r-pill);
  background: var(--ink-800);
  border: 1px solid var(--line);
}
.wg-len {
  min-width: 34px;
  height: 32px;
  border-radius: var(--r-pill);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-dim);
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}
.wg-len:hover {
  color: var(--text);
}
.wg-len.is-active {
  background: var(--accent);
  color: var(--ink-900);
}

.board-wrap {
  position: relative;
}

.wg-board {
  /* Fixed-size grid sized by --cols / --rows so it never reflows as the player
     fills it in. --cell shrinks for longer words to stay on one row. */
  --gap: 0.4rem;
  --cell: clamp(30px, calc((min(94vw, 34rem) - 2rem - (var(--cols) - 1) * var(--gap)) / var(--cols)), 60px);
  display: grid;
  grid-template-rows: repeat(var(--rows), var(--cell));
  gap: var(--gap);
  padding: 1rem;
  border-radius: var(--r-lg);
  background: radial-gradient(120% 120% at 50% 0%, var(--ink-800), var(--ink-900));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
}

.wg-row {
  display: flex;
  gap: var(--gap);
}
.wg-row.is-shake {
  animation: wgShake 0.5s var(--ease);
}
@keyframes wgShake {
  0%, 100% { transform: translateX(0); }
  15% { transform: translateX(-6px); }
  35% { transform: translateX(6px); }
  55% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

.wg-cell {
  width: var(--cell);
  height: var(--cell);
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  border: 2px solid var(--line);
  font-family: var(--font-display);
  font-size: calc(var(--cell) * 0.42);
  font-weight: 900;
  letter-spacing: 0.02em;
  background: var(--ink-800);
  color: var(--text);
  transition: border-color 0.1s var(--ease), background 0.15s var(--ease),
    color 0.15s var(--ease), transform 0.1s var(--ease);
  user-select: none;
}
/* a typed-but-not-yet-revealed tile (input row and the pre-flip locked row) */
.wg-cell.state-tbd.is-filled,
.wg-cell.state-pre {
  border-color: var(--line-strong);
}
.wg-cell.is-filled {
  animation: wgPop 0.1s var(--ease);
}
@keyframes wgPop {
  0% { transform: scale(1); }
  50% { transform: scale(1.07); }
  100% { transform: scale(1); }
}
.wg-row.is-reveal .wg-cell {
  animation: wgFlip 0.5s var(--ease) var(--delay, 0ms) both;
}
@keyframes wgFlip {
  0% { transform: rotateX(0deg); }
  49% { transform: rotateX(90deg); }
  50% { transform: rotateX(90deg); }
  100% { transform: rotateX(0deg); }
}

.wg-cell.state-correct { background: var(--accent); color: var(--ink-900); border-color: var(--accent); }
.wg-cell.state-present { background: #f6c453; color: var(--ink-900); border-color: #f6c453; }
.wg-cell.state-absent { background: var(--ink-600); color: var(--text-dim); border-color: var(--ink-600); }

/* loading veil */
.wg-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: var(--r-lg);
  background: color-mix(in oklab, var(--ink-900) 60%, transparent);
  backdrop-filter: blur(2px);
}
.wg-spinner {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 3px solid var(--line);
  border-top-color: var(--accent);
  animation: wgSpin 0.8s linear infinite;
}
@keyframes wgSpin {
  to { transform: rotate(360deg); }
}

/* keyboard */
.wg-keyboard {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem;
  border-radius: var(--r-lg);
  background: var(--ink-850, var(--ink-800));
  border: 1px solid var(--line);
  width: min(500px, 94vw);
}
.wg-kb-row {
  display: flex;
  justify-content: center;
  gap: 0.3rem;
}
.wg-key {
  height: 50px;
  min-width: 36px;
  flex: 1;
  max-width: 44px;
  border-radius: var(--r-sm);
  background: var(--ink-600);
  border: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text);
  transition: background 0.15s var(--ease), color 0.15s var(--ease),
    border-color 0.15s var(--ease), transform 0.1s var(--ease);
  user-select: none;
}
.wg-key--wide { min-width: 56px; max-width: 64px; font-size: 0.72rem; }
.wg-key:active { transform: scale(0.93); }
.wg-key.key-correct { background: var(--accent); color: var(--ink-900); border-color: var(--accent); }
.wg-key.key-present { background: #f6c453; color: var(--ink-900); border-color: #f6c453; }
.wg-key.key-absent { background: var(--ink-800); color: var(--text-faint); }

/* reduced-motion: disable all tile animations (colours still appear) */
@media (prefers-reduced-motion: reduce) {
  .wg-row.is-shake { animation: none; }
  .wg-cell.is-filled { animation: none; }
  .wg-row.is-reveal .wg-cell { animation: none; }
}

/* overlay extras */
.overlay__answer {
  font-family: var(--font-display);
  font-size: clamp(1.6rem, 6vw, 2.4rem);
  font-weight: 900;
  letter-spacing: 0.12em;
  color: var(--accent);
  margin-top: 0.2rem;
}
.overlay__def {
  margin: 0.4rem auto 0;
  max-width: 30ch;
  font-size: 0.92rem;
  line-height: 1.45;
  color: var(--text-dim);
}
.overlay__note {
  margin-top: 0.6rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-faint);
}

/* meaning panel */
.wg-meaning {
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text-dim);
}
.wg-meaning b {
  color: var(--accent);
  font-family: var(--font-mono);
  letter-spacing: 0.06em;
}

/* legend */
.wg-legend { display: flex; flex-direction: column; gap: 0.6rem; }
.wg-legend-item { display: flex; align-items: center; gap: 0.7rem; font-size: 0.82rem; color: var(--text-dim); }
.wg-legend-cell {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  font-weight: 700;
  flex: none;
}
.wg-legend-cell.state-correct { background: var(--accent); color: var(--ink-900); }
.wg-legend-cell.state-present { background: #f6c453; color: var(--ink-900); }
.wg-legend-cell.state-absent { background: var(--ink-600); color: var(--text-dim); }
</style>
