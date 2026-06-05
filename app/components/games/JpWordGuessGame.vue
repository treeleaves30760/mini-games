<script setup>
/* 日語猜詞 Japanese Word Guess — a Wordle played in hiragana.
   Guess a common 4-kana Japanese word in 6 tries; tiles colour by kana like
   Wordle. Solve it and a vocabulary card reveals the word's kanji, reading,
   Chinese + English meanings, and a worked example sentence — so every win
   teaches the word. Input via the on-screen 五十音 keyboard or by typing romaji
   on a physical keyboard (tomodachi → ともだち). Answer is seeded (daily = same
   for everyone). */

const accent = "#ff7ea6";
const SAVE_KEY = "playground.jpwordguess.stats";
const LEARNED_KEY = "playground.jpwordguess.learned";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// ---- word list & scoring (shared, unit-tested in app/games/jpwordguess.ts) ----
import {
  WORDS,
  KANA,
  scoreGuess,
  isWin,
  pickWord,
  parseRomaji,
  WORD_LENGTH,
  MAX_GUESSES,
} from "~/games/jpwordguess";

const WORD_BY_KANA = Object.fromEntries(WORDS.map((w) => [w.kana, w]));

// ---- on-screen 五十音 keyboard layout (null = grid gap) ----
const SEION = [
  ["あ", "い", "う", "え", "お"],
  ["か", "き", "く", "け", "こ"],
  ["さ", "し", "す", "せ", "そ"],
  ["た", "ち", "つ", "て", "と"],
  ["な", "に", "ぬ", "ね", "の"],
  ["は", "ひ", "ふ", "へ", "ほ"],
  ["ま", "み", "む", "め", "も"],
  ["や", null, "ゆ", null, "よ"],
  ["ら", "り", "る", "れ", "ろ"],
  ["わ", null, null, null, "を"],
  ["ん", null, null, null, null],
];
const DAKUTEN = [
  ["が", "ぎ", "ぐ", "げ", "ご"],
  ["ざ", "じ", "ず", "ぜ", "ぞ"],
  ["だ", "ぢ", "づ", "で", "ど"],
  ["ば", "び", "ぶ", "べ", "ぼ"],
  ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"],
];

// ---- state ----
const wordObj = ref(null); // the JpWord answer
const answer = computed(() => wordObj.value?.kana || "");
const boardRows = ref([]); // Array of { letters: [{ch, state}] }
const currentRow = ref(0);
const currentInput = ref([]); // committed kana of the active row
const pendingRomaji = ref(""); // half-typed romaji awaiting its vowel
const keyStates = ref({}); // kana -> 'correct'|'present'|'absent'
const gameState = ref("playing"); // 'playing' | 'won' | 'lost'
const shakeRow = ref(-1);
const revealRow = ref(-1);
const statsData = ref({ played: 0, won: 0, streak: 0 });
const learned = ref([]); // array of solved kana strings
const solvedWord = ref(null); // JpWord kept on the panel after a win
const overlay = reactive({ open: false, win: false, title: "", sub: "" });
const toast = ref("");
let toastTimer = null;

// ---- seed / daily ----
let rng;
function regenerate() {
  rng = makeRng(props.seed);
  wordObj.value = pickWord(rng);
  boardRows.value = Array.from({ length: MAX_GUESSES }, () => ({ letters: [] }));
  currentRow.value = 0;
  currentInput.value = [];
  pendingRomaji.value = "";
  keyStates.value = {};
  gameState.value = "playing";
  shakeRow.value = -1;
  revealRow.value = -1;
  solvedWord.value = null;
  overlay.open = false;
}

watch(() => props.seed, regenerate);

function showToast(msg, ms = 1400) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = "";
  }, ms);
}

function triggerShake(row) {
  shakeRow.value = row;
  setTimeout(() => {
    shakeRow.value = -1;
  }, 600);
}

/* Commit any half-typed romaji into the row before reading the guess: completed
   kana are pushed, and a lone trailing "n" becomes ん. */
function flushPending() {
  if (!pendingRomaji.value) return;
  const { kana, rest } = parseRomaji(pendingRomaji.value);
  for (const k of kana) {
    if (currentInput.value.length < WORD_LENGTH) currentInput.value.push(k);
  }
  if (rest === "n" && currentInput.value.length < WORD_LENGTH) {
    currentInput.value.push("ん");
  }
  pendingRomaji.value = "";
}

async function submitGuess() {
  if (gameState.value !== "playing") return;
  flushPending();
  if (currentInput.value.length < WORD_LENGTH) {
    showToast(`再填滿 ${WORD_LENGTH} 個假名`);
    triggerShake(currentRow.value);
    return;
  }

  const guess = currentInput.value.join("");
  const states = scoreGuess(guess, answer.value);
  const row = currentRow.value;
  boardRows.value[row].letters = [...guess].map((ch, i) => ({ ch, state: states[i] }));
  revealRow.value = row;

  // Update key colours (correct > present > absent)
  const priority = { correct: 3, present: 2, absent: 1 };
  const chars = [...guess];
  for (let i = 0; i < WORD_LENGTH; i++) {
    const k = chars[i];
    const cur = keyStates.value[k];
    if (!cur || priority[states[i]] > priority[cur]) keyStates.value[k] = states[i];
  }

  await new Promise((r) => setTimeout(r, 320 * WORD_LENGTH + 120));

  if (isWin(states)) {
    gameState.value = "won";
    solvedWord.value = wordObj.value;
    rememberWord(wordObj.value.kana);
    saveStats(true);
    const praise = ["天才！", "厲害！", "太棒了！", "做到了！", "不錯哦！", "好險！"];
    overlay.win = true;
    overlay.title = `${praise[Math.min(row, 5)]}  ✿`;
    overlay.sub = `用了 ${row + 1} 次猜中`;
    overlay.open = true;
    emit("solved", { guesses: row + 1 });
    return;
  }

  currentRow.value++;
  currentInput.value = [];

  if (currentRow.value >= MAX_GUESSES) {
    gameState.value = "lost";
    solvedWord.value = wordObj.value; // reveal the word even on a loss — still learn it
    saveStats(false);
    overlay.win = false;
    overlay.title = "很可惜…";
    overlay.sub = "下面是這個單字的解說";
    overlay.open = true;
  }
}

// ---- input ----
function inputKana(ch) {
  if (gameState.value !== "playing") return;
  pendingRomaji.value = "";
  if (currentInput.value.length < WORD_LENGTH) currentInput.value.push(ch);
}

function deleteLast() {
  if (gameState.value !== "playing") return;
  if (pendingRomaji.value) {
    pendingRomaji.value = pendingRomaji.value.slice(0, -1);
    return;
  }
  currentInput.value.pop();
}

function onKey(e) {
  if (overlay.open) return;
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
  // Direct kana from a Japanese IME.
  if (KANA.has(e.key)) {
    e.preventDefault();
    inputKana(e.key);
    return;
  }
  // Romaji from a Latin keyboard → buffer & convert on the fly.
  if (/^[a-zA-Z]$/.test(e.key) && gameState.value === "playing") {
    e.preventDefault();
    if (currentInput.value.length >= WORD_LENGTH) return;
    pendingRomaji.value += e.key.toLowerCase();
    const { kana, rest } = parseRomaji(pendingRomaji.value);
    for (const k of kana) {
      if (currentInput.value.length < WORD_LENGTH) currentInput.value.push(k);
    }
    pendingRomaji.value = rest;
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

function rememberWord(kana) {
  if (!learned.value.includes(kana)) learned.value.unshift(kana);
  try {
    localStorage.setItem(LEARNED_KEY, JSON.stringify(learned.value));
  } catch (_) {}
}

const learnedWords = computed(() =>
  learned.value.map((k) => WORD_BY_KANA[k]).filter(Boolean)
);

// ---- pronunciation (Web Speech API — client-only, no network needed) ----
const canSpeak = ref(false);
let jaVoice = null;
function refreshVoices() {
  try {
    const vs = window.speechSynthesis.getVoices() || [];
    jaVoice = vs.find((v) => (v.lang || "").toLowerCase().startsWith("ja")) || jaVoice;
  } catch (_) {}
}
function speak(text) {
  if (!canSpeak.value || !text) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel(); // stop anything already playing
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = 0.9;
    if (jaVoice) u.voice = jaVoice;
    synth.speak(u);
  } catch (_) {}
}

// ---- displayed board ----
const displayBoard = computed(() =>
  boardRows.value.map((row, ri) => {
    if (ri < currentRow.value) return row.letters;
    if (ri === currentRow.value && gameState.value === "playing") {
      return Array.from({ length: WORD_LENGTH }, (_, i) => {
        if (i < currentInput.value.length) {
          return { ch: currentInput.value[i], state: "tbd", filled: true };
        }
        if (i === currentInput.value.length && pendingRomaji.value) {
          return { ch: pendingRomaji.value, state: "tbd", composing: true };
        }
        return { ch: "", state: "tbd" };
      });
    }
    if (ri === currentRow.value) return row.letters.length ? row.letters : Array.from({ length: WORD_LENGTH }, () => ({ ch: "", state: "empty" }));
    return Array.from({ length: WORD_LENGTH }, () => ({ ch: "", state: "empty" }));
  })
);

onMounted(() => {
  try {
    statsData.value = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
  } catch (_) {}
  statsData.value = { played: 0, won: 0, streak: 0, ...statsData.value };
  try {
    learned.value = JSON.parse(localStorage.getItem(LEARNED_KEY) || "[]") || [];
  } catch (_) {}
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    canSpeak.value = true;
    refreshVoices();
    // Voices often load asynchronously — refresh when they arrive.
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }
  regenerate();
  window.addEventListener("keydown", onKey);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  try {
    window.speechSynthesis.cancel();
  } catch (_) {}
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="日語猜詞" title-en="Japanese Word Guess">
      <template #actions>
        <button v-if="!props.daily" class="btn btn--accent" @click="regenerate">新題目</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">猜測</span>
            <span class="chip__value is-accent">{{ currentRow + 1 }} / {{ MAX_GUESSES }}</span>
          </div>
          <div class="chip chip--hint" v-if="wordObj">
            <span class="chip__label">提示 ヒント</span>
            <span class="chip__value">{{ wordObj.category }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">連勝</span>
            <span class="chip__value">{{ statsData.streak }}</span>
          </div>
        </div>

        <Teleport to="body">
          <Transition name="toast">
            <div v-if="toast" class="wg-toast" role="status" aria-live="polite">{{ toast }}</div>
          </Transition>
        </Teleport>

        <!-- Board -->
        <div class="board-wrap">
          <div class="wg-board" aria-label="日語猜詞盤面">
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
                  cell.composing ? 'is-composing' : '',
                ]"
                :style="revealRow === ri ? { '--delay': `${ci * 320}ms` } : {}"
              >
                <span>{{ cell.ch }}</span>
              </div>
            </div>
          </div>

          <!-- Win / lose overlay with the vocabulary reveal card -->
          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card" :class="{ 'is-win': overlay.win }">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>

              <div v-if="solvedWord" class="word-card">
                <div class="word-card__head">
                  <span class="word-card__kanji">{{ solvedWord.display }}</span>
                  <div class="word-card__reading">
                    <span class="word-card__kana">{{ solvedWord.kana }}</span>
                    <span class="word-card__romaji">{{ solvedWord.romaji }}</span>
                  </div>
                  <button
                    v-if="canSpeak"
                    class="speak-btn speak-btn--lg"
                    @click="speak(solvedWord.kana)"
                    aria-label="播放單字發音"
                    title="播放發音"
                  >🔊</button>
                </div>
                <div class="word-card__means">
                  <div class="mean"><span class="mean__tag">中文</span>{{ solvedWord.zh }}</div>
                  <div class="mean"><span class="mean__tag">EN</span>{{ solvedWord.en }}</div>
                </div>
                <p v-if="solvedWord.note" class="word-card__note">💡 {{ solvedWord.note }}</p>
                <div class="word-card__ex">
                  <span class="word-card__ex-label">例句 / Examples</span>
                  <div v-for="(ex, i) in solvedWord.examples" :key="i" class="ex">
                    <div class="ex__jp-row">
                      <p class="ex-jp">{{ ex.jp }}</p>
                      <button
                        v-if="canSpeak"
                        class="speak-btn"
                        @click="speak(ex.jp)"
                        aria-label="播放例句發音"
                        title="播放例句"
                      >🔊</button>
                    </div>
                    <p class="ex-romaji">{{ ex.romaji }}</p>
                    <p class="ex-zh">{{ ex.zh }}</p>
                    <p class="ex-en">{{ ex.en }}</p>
                  </div>
                </div>
              </div>

              <div class="overlay__actions">
                <button v-if="!props.daily" class="btn btn--accent" @click="regenerate">換一題</button>
                <button class="btn" @click="overlay.open = false">關閉</button>
              </div>
            </div>
          </div>
        </div>

        <!-- On-screen 五十音 keyboard -->
        <div class="kana-pad" aria-label="五十音鍵盤">
          <div class="kana-blocks">
            <div class="kana-grid" aria-label="清音">
              <template v-for="(row, ri) in SEION" :key="`s${ri}`">
                <template v-for="(k, ci) in row" :key="`s${ri}-${ci}`">
                  <button
                    v-if="k"
                    class="kana-key"
                    :class="`key-${keyStates[k] || 'idle'}`"
                    @click="inputKana(k)"
                  >{{ k }}</button>
                  <span v-else class="kana-gap" aria-hidden="true"></span>
                </template>
              </template>
            </div>
            <div class="kana-grid kana-grid--daku" aria-label="濁音・半濁音">
              <template v-for="(row, ri) in DAKUTEN" :key="`d${ri}`">
                <button
                  v-for="(k, ci) in row"
                  :key="`d${ri}-${ci}`"
                  class="kana-key"
                  :class="`key-${keyStates[k] || 'idle'}`"
                  @click="inputKana(k)"
                >{{ k }}</button>
              </template>
            </div>
          </div>
          <div class="kana-ctrl">
            <button class="kana-key kana-key--ctrl" @click="deleteLast" aria-label="刪除">⌫ 刪除</button>
            <button class="kana-key kana-key--enter" @click="submitGuess">送出 ⏎</button>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            猜一個 4 個假名的日文常用單字，共 {{ MAX_GUESSES }} 次機會。可點下方的五十音鍵盤，
            或用實體鍵盤直接輸入羅馬拼音（例：<code>tomodachi</code> → ともだち）。猜對後會顯示這個字的
            <b>中文、英文意思、用法小提示與兩個例句</b>{{ canSpeak ? '，還能按 🔊 聽日語發音' : '' }}。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">顏色說明</span>
          <div class="wg-legend">
            <div class="wg-legend-item">
              <span class="wg-legend-cell state-correct">あ</span>
              <span>假名與位置都正確</span>
            </div>
            <div class="wg-legend-item">
              <span class="wg-legend-cell state-present">い</span>
              <span>單字裡有這個假名，位置不對</span>
            </div>
            <div class="wg-legend-item">
              <span class="wg-legend-cell state-absent">う</span>
              <span>單字裡沒有這個假名</span>
            </div>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">已學會 {{ learnedWords.length }} 字</span>
          <div v-if="learnedWords.length" class="learned">
            <button
              v-for="w in learnedWords.slice(0, 24)"
              :key="w.kana"
              class="learned__chip"
              :title="w.romaji + ' · ' + w.en + (canSpeak ? ' · 點擊發音' : '')"
              @click="speak(w.kana)"
            >
              {{ w.kana }}<i>{{ w.zh }}</i>
            </button>
          </div>
          <p v-else class="hint">猜對的單字會收進這裡，方便複習{{ canSpeak ? '；點一下可再聽發音' : '' }}。</p>
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

.chip--hint .chip__value { color: var(--accent); font-family: var(--font-mono); font-size: 0.9rem; }

.wg-board {
  display: grid;
  grid-template-rows: repeat(6, clamp(48px, 11vw, 62px));
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
  justify-content: center;
}
.wg-row.is-shake { animation: wgShake 0.5s var(--ease); }
@keyframes wgShake {
  0%,100% { transform: translateX(0); }
  15%      { transform: translateX(-6px); }
  35%      { transform: translateX(6px); }
  55%      { transform: translateX(-4px); }
  75%      { transform: translateX(4px); }
}

.wg-cell {
  width: clamp(48px, 11vw, 62px);
  height: clamp(48px, 11vw, 62px);
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  border: 2px solid var(--line);
  font-family: var(--font-display);
  font-size: clamp(1.3rem, 3.4vw, 1.9rem);
  font-weight: 800;
  background: var(--ink-800);
  color: var(--text);
  transition: border-color 0.1s var(--ease), background 0.15s var(--ease), color 0.15s var(--ease), transform 0.1s var(--ease);
  user-select: none;
}
.wg-cell.is-filled {
  border-color: var(--line-strong);
  animation: wgPop 0.1s var(--ease);
}
.wg-cell.is-composing {
  border-color: var(--accent);
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: clamp(0.7rem, 2vw, 0.95rem);
  font-weight: 700;
}
@keyframes wgPop {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.07); }
  100% { transform: scale(1); }
}
.wg-row.is-reveal .wg-cell { animation: wgFlip 0.66s var(--ease) var(--delay, 0ms) both; }
@keyframes wgFlip {
  0%   { transform: rotateX(0deg); }
  49%  { transform: rotateX(90deg); }
  50%  { transform: rotateX(90deg); }
  100% { transform: rotateX(0deg); }
}

.wg-cell.state-correct { background: var(--accent); color: var(--ink-900); border-color: var(--accent); }
.wg-cell.state-present { background: #f6c453; color: var(--ink-900); border-color: #f6c453; }
.wg-cell.state-absent  { background: var(--ink-600); color: var(--text-dim); border-color: var(--ink-600); }

/* kana keyboard */
.kana-pad {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.6rem;
  border-radius: var(--r-lg);
  background: var(--ink-850, var(--ink-800));
  border: 1px solid var(--line);
  width: min(560px, 96vw);
}
.kana-blocks {
  display: flex;
  gap: 0.7rem;
  justify-content: center;
  flex-wrap: wrap;
}
.kana-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.26rem;
}
.kana-grid--daku { align-content: start; }
.kana-key {
  height: clamp(34px, 8.5vw, 42px);
  min-width: clamp(30px, 8vw, 40px);
  border-radius: var(--r-sm);
  background: var(--ink-600);
  border: 1px solid var(--line);
  font-family: var(--font-display);
  font-size: clamp(0.95rem, 2.6vw, 1.15rem);
  font-weight: 700;
  color: var(--text);
  transition: background 0.15s var(--ease), color 0.15s var(--ease), border-color 0.15s var(--ease), transform 0.1s var(--ease);
  user-select: none;
}
.kana-gap { visibility: hidden; }
.kana-key:active { transform: scale(0.9); }
.kana-key.key-correct { background: var(--accent); color: var(--ink-900); border-color: var(--accent); }
.kana-key.key-present { background: #f6c453; color: var(--ink-900); border-color: #f6c453; }
.kana-key.key-absent  { background: var(--ink-800); color: var(--text-faint); }

.kana-ctrl { display: flex; gap: 0.5rem; }
.kana-key--ctrl, .kana-key--enter {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  letter-spacing: 0.03em;
}
.kana-key--enter { background: var(--accent); color: var(--ink-900); border-color: var(--accent); }

@media (prefers-reduced-motion: reduce) {
  .wg-row.is-shake { animation: none; }
  .wg-cell.is-filled { animation: none; }
  .wg-row.is-reveal .wg-cell { animation: none; }
}

/* legend */
.wg-legend { display: flex; flex-direction: column; gap: 0.6rem; }
.wg-legend-item { display: flex; align-items: center; gap: 0.7rem; font-size: 0.82rem; color: var(--text-dim); }
.wg-legend-cell {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  flex: none;
}
.wg-legend-cell.state-correct { background: var(--accent); color: var(--ink-900); }
.wg-legend-cell.state-present { background: #f6c453; color: var(--ink-900); }
.wg-legend-cell.state-absent  { background: var(--ink-600); color: var(--text-dim); }

.hint code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  padding: 0.05em 0.35em;
  border-radius: 5px;
  background: var(--ink-700);
  color: var(--accent);
}

/* learned-words chips */
.learned { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.learned__chip {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  padding: 0.28rem 0.55rem;
  border-radius: var(--r-pill);
  background: var(--ink-700);
  border: 1px solid var(--line);
  font-family: var(--font-display);
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text);
  cursor: pointer;
  transition: border-color 0.15s var(--ease), background 0.15s var(--ease);
}
.learned__chip:hover { border-color: var(--accent); background: var(--ink-600); }
.learned__chip i { font-style: normal; font-size: 0.7rem; color: var(--text-faint); }

/* speaker buttons (pronunciation) */
.speak-btn {
  flex: none;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--ink-700);
  color: var(--accent);
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.15s var(--ease), transform 0.1s var(--ease);
}
.speak-btn:hover { background: var(--ink-600); }
.speak-btn:active { transform: scale(0.9); }
.speak-btn--lg { width: 38px; height: 38px; font-size: 1.15rem; margin-left: auto; }

/* vocabulary reveal card — the richer learner card is taller than the board, so
   center it over the whole viewport (the shared .overlay is absolute-on-board). */
.overlay { position: fixed; z-index: 50; }
.overlay__card.is-win { border-color: var(--accent); }
.overlay__card { width: min(440px, 100%); max-height: 88vh; overflow-y: auto; }
.word-card {
  text-align: left;
  margin: 0.4rem 0 1rem;
  padding: 1rem;
  border-radius: var(--r-md, 14px);
  background: var(--ink-800);
  border: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.word-card__head { display: flex; align-items: center; gap: 0.9rem; }
.word-card__kanji {
  font-family: var(--font-display);
  font-size: 2.1rem;
  font-weight: 900;
  color: var(--accent);
  line-height: 1;
}
.word-card__reading { display: flex; flex-direction: column; gap: 0.1rem; }
.word-card__kana { font-size: 1.1rem; font-weight: 700; color: var(--text); }
.word-card__romaji { font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-dim); }
.word-card__means { display: flex; flex-wrap: wrap; gap: 0.5rem 1.2rem; }
.word-card__note {
  font-size: 0.85rem;
  line-height: 1.55;
  color: var(--text-dim);
  background: var(--ink-700);
  border-radius: 10px;
  padding: 0.5rem 0.7rem;
}
.mean { font-size: 0.98rem; color: var(--text); display: flex; align-items: baseline; gap: 0.45rem; }
.mean__tag {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 0.12em 0.45em;
  border-radius: 5px;
  background: var(--accent);
  color: var(--ink-900);
}
.word-card__ex {
  border-top: 1px dashed var(--line);
  padding-top: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.word-card__ex-label {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  color: var(--text-faint);
  text-transform: uppercase;
}
.ex { display: flex; flex-direction: column; gap: 0.15rem; }
.ex + .ex { border-top: 1px dashed var(--line); padding-top: 0.5rem; }
.ex__jp-row { display: flex; align-items: center; gap: 0.5rem; }
.ex__jp-row .ex-jp { flex: 1; }
.ex-jp { font-size: 1rem; font-weight: 700; color: var(--text); }
.ex-romaji { font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-dim); }
.ex-zh { font-size: 0.9rem; color: var(--text-dim); }
.ex-en { font-size: 0.86rem; color: var(--text-faint); font-style: italic; }
</style>
