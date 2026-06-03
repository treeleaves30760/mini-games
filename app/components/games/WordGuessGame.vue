<script setup>
/* 猜詞 Word Guess — Wordle-style 5-letter word game.
   6 guesses, per-letter colour feedback, on-screen QWERTY + physical keyboard.
   Answer derived from seeded RNG (daily = same for everyone). */

const accent = "#6ad0a0";
const SAVE_KEY = "playground.wordguess.stats";

const props = defineProps({
  seed:  { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(['solved']);

// ---- word lists & scoring (shared, unit-tested in app/games/wordguess.ts) ----
import { isValidWord, scoreGuess, pickAnswer } from "~/games/wordguess";

// ---- state ----
const boardRows = ref([]);   // Array of { letters: [{ch, state}] }
const currentRow = ref(0);
const currentInput = ref([]);
const keyStates = ref({});   // key -> 'correct'|'present'|'absent'
const answer = ref('');
const gameState = ref('playing'); // 'playing' | 'won' | 'lost'
const shakeRow = ref(-1);
const revealRow = ref(-1);
const statsData = ref({ played: 0, won: 0, streak: 0 });
const overlay = reactive({ open: false, title: '', sub: '' });
const toast = ref('');
let toastTimer = null;

// ---- seed / daily ----
let rng;
function regenerate() {
  rng = makeRng(props.seed);
  answer.value = pickAnswer(rng);
  boardRows.value = Array.from({ length: 6 }, () => ({ letters: [] }));
  currentRow.value = 0;
  currentInput.value = [];
  keyStates.value = {};
  gameState.value = 'playing';
  shakeRow.value = -1;
  revealRow.value = -1;
  overlay.open = false;
}

watch(() => props.seed, regenerate);

function showToast(msg, ms = 1400) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, ms);
}

async function submitGuess() {
  if (gameState.value !== 'playing') return;
  const guess = currentInput.value.join('');
  if (guess.length < 5) { showToast('再填滿 5 個字母'); triggerShake(currentRow.value); return; }
  if (!isValidWord(guess)) { showToast('不在詞庫中'); triggerShake(currentRow.value); return; }

  const states = scoreGuess(guess, answer.value);
  const row = currentRow.value;
  boardRows.value[row].letters = guess.split('').map((ch, i) => ({ ch, state: states[i] }));
  revealRow.value = row;

  // Update key colours (correct > present > absent)
  const priority = { correct: 3, present: 2, absent: 1 };
  for (let i = 0; i < 5; i++) {
    const k = guess[i];
    const cur = keyStates.value[k];
    if (!cur || priority[states[i]] > priority[cur]) {
      keyStates.value[k] = states[i];
    }
  }

  await new Promise(r => setTimeout(r, 350 * 5 + 100));

  if (guess === answer.value) {
    gameState.value = 'won';
    saveStats(true);
    const msgs = ['天才！', '超強！', '太棒了！', '做到了！', '還不錯！', '好險！'];
    const msg = msgs[Math.min(row, 5)];
    if (props.daily) {
      overlay.title = '完成！';
      overlay.sub = `答案是 ${answer.value}。已用 ${row + 1} 次猜中。`;
    } else {
      overlay.title = msg;
      overlay.sub = `答案正確：${answer.value}。用了 ${row + 1} 次。`;
    }
    overlay.open = true;
    emit('solved', { guesses: row + 1 });
    return;
  }

  currentRow.value++;
  currentInput.value = [];

  if (currentRow.value >= 6) {
    gameState.value = 'lost';
    saveStats(false);
    overlay.title = '很可惜';
    overlay.sub = `答案是：${answer.value}`;
    overlay.open = true;
  }
}

function triggerShake(row) {
  shakeRow.value = row;
  setTimeout(() => { shakeRow.value = -1; }, 600);
}

function inputChar(ch) {
  if (gameState.value !== 'playing') return;
  if (currentInput.value.length < 5) currentInput.value.push(ch);
}

function deleteLast() {
  if (gameState.value !== 'playing') return;
  currentInput.value.pop();
}

function onKey(e) {
  if (overlay.open) return;
  if (e.key === 'Enter') { e.preventDefault(); submitGuess(); return; }
  if (e.key === 'Backspace') { e.preventDefault(); deleteLast(); return; }
  const ch = e.key.toUpperCase();
  if (/^[A-Z]$/.test(ch)) { e.preventDefault(); inputChar(ch); }
}

// ---- persistence ----
function saveStats(won) {
  try {
    const s = statsData.value;
    s.played++;
    if (won) { s.won++; s.streak++; } else { s.streak = 0; }
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch (_) {}
}

// ---- QWERTY ----
const ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
];

// displayed board
const displayBoard = computed(() => {
  return boardRows.value.map((row, ri) => {
    if (ri < currentRow.value) return row.letters;
    if (ri === currentRow.value) {
      return Array.from({ length: 5 }, (_, i) => ({
        ch: currentInput.value[i] || '',
        state: 'tbd',
        filled: !!currentInput.value[i],
      }));
    }
    return Array.from({ length: 5 }, () => ({ ch: '', state: 'empty' }));
  });
});

onMounted(() => {
  try { statsData.value = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch (_) {}
  statsData.value = { played: 0, won: 0, streak: 0, ...statsData.value };
  regenerate();
  window.addEventListener('keydown', onKey);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="猜詞" title-en="Word Guess">
      <template #actions>
        <button v-if="!props.daily" class="btn btn--accent" @click="regenerate">新題目</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">猜測</span>
            <span class="chip__value is-accent">{{ currentRow + 1 }} / 6</span>
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
          <div class="wg-board" aria-label="猜詞盤面">
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
                :class="[
                  `state-${cell.state}`,
                  cell.filled ? 'is-filled' : '',
                ]"
                :style="revealRow === ri ? { '--delay': `${ci * 350}ms` } : {}"
              >
                <span>{{ cell.ch }}</span>
              </div>
            </div>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button v-if="!props.daily && gameState !== 'playing'" class="btn btn--accent" @click="regenerate">換一題</button>
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
            >{{ key }}</button>
          </div>
        </div>
      </div>

      <aside class="panel">
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
          <p class="hint">猜一個 5 個字母的英文單字，共 6 次機會。每次猜測後，方格會變色提示。</p>
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
.toast-enter-active, .toast-leave-active { transition: opacity 0.2s, transform 0.2s; }
.toast-enter-from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
.toast-leave-to   { opacity: 0; transform: translateX(-50%) translateY(-6px); }

.wg-board {
  /* Fixed-size grid: 6 rows × cell-height + gaps + padding — never resizes as guesses are filled */
  display: grid;
  grid-template-rows: repeat(6, clamp(46px, 10vw, 60px));
  gap: 0.4rem;
  padding: 1rem;
  border-radius: var(--r-lg);
  background: radial-gradient(120% 120% at 50% 0%, var(--ink-800), var(--ink-900));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
}

.wg-row {
  display: flex;
  gap: 0.4rem;
  /* row height is governed by grid-template-rows on the parent; no height set here */
}
.wg-row.is-shake {
  animation: wgShake 0.5s var(--ease);
}
@keyframes wgShake {
  0%,100% { transform: translateX(0); }
  15%      { transform: translateX(-6px); }
  35%      { transform: translateX(6px); }
  55%      { transform: translateX(-4px); }
  75%      { transform: translateX(4px); }
}

.wg-cell {
  width: clamp(46px, 10vw, 60px);
  height: clamp(46px, 10vw, 60px);
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  border: 2px solid var(--line);
  font-family: var(--font-display);
  font-size: clamp(1.2rem, 3vw, 1.7rem);
  font-weight: 900;
  letter-spacing: 0.02em;
  background: var(--ink-800);
  color: var(--text);
  transition: border-color 0.1s var(--ease), background 0.15s var(--ease), color 0.15s var(--ease), transform 0.1s var(--ease);
  user-select: none;
}
.wg-cell.is-filled {
  border-color: var(--line-strong);
  animation: wgPop 0.1s var(--ease);
}
@keyframes wgPop {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.07); }
  100% { transform: scale(1); }
}
.wg-row.is-reveal .wg-cell {
  animation: wgFlip 0.7s var(--ease) var(--delay, 0ms) both;
}
@keyframes wgFlip {
  0%   { transform: rotateX(0deg); }
  49%  { transform: rotateX(90deg); }
  50%  { transform: rotateX(90deg); }
  100% { transform: rotateX(0deg); }
}

.wg-cell.state-correct { background: var(--accent); color: var(--ink-900); border-color: var(--accent); }
.wg-cell.state-present { background: #f6c453; color: var(--ink-900); border-color: #f6c453; }
.wg-cell.state-absent  { background: var(--ink-600); color: var(--text-dim); border-color: var(--ink-600); }

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
  transition: background 0.15s var(--ease), color 0.15s var(--ease), border-color 0.15s var(--ease), transform 0.1s var(--ease);
  user-select: none;
}
.wg-key--wide { min-width: 56px; max-width: 64px; font-size: 0.72rem; }
.wg-key:active { transform: scale(0.93); }
.wg-key.key-correct { background: var(--accent); color: var(--ink-900); border-color: var(--accent); }
.wg-key.key-present { background: #f6c453; color: var(--ink-900); border-color: #f6c453; }
.wg-key.key-absent  { background: var(--ink-800); color: var(--text-faint); }

/* reduced-motion: disable all tile animations */
@media (prefers-reduced-motion: reduce) {
  .wg-row.is-shake { animation: none; }
  .wg-cell.is-filled { animation: none; }
  .wg-row.is-reveal .wg-cell { animation: none; }
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
.wg-legend-cell.state-absent  { background: var(--ink-600); color: var(--text-dim); }
</style>
