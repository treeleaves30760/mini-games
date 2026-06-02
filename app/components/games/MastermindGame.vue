<script setup>
/* 猜數字 Mastermind (1A2B) — 4 distinct digits, 8 attempts.
   On-screen numpad + keyboard. A = right digit & position, B = right digit wrong position. */

const accent = "#b388ff";
const SAVE_KEY = "playground.mastermind.stats";
const MAX_TRIES = 8;
const CODE_LEN = 4;

const props = defineProps({
  seed:  { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const rng = makeRng(props.seed);

// ---- state ----
const secret    = ref([]);
const input     = ref([]);   // current guess digits
const history   = ref([]);   // [{ guess: [d,d,d,d], a, b }]
const gameOver  = ref(false);
const won       = ref(false);
const revealed  = ref(false);
const overlay   = reactive({ open: false, title: "", sub: "" });
const stats     = reactive({ wins: 0, losses: 0, best: null });
const shake     = ref(false);
const errorMsg  = ref("");

function generateSecret() {
  const digits = [0,1,2,3,4,5,6,7,8,9];
  rng.shuffle(digits);
  return digits.slice(0, CODE_LEN);
}

function init() {
  const r = makeRng(props.seed);
  const digits = [0,1,2,3,4,5,6,7,8,9];
  r.shuffle(digits);
  secret.value = digits.slice(0, CODE_LEN);
  input.value = [];
  history.value = [];
  gameOver.value = false;
  won.value = false;
  revealed.value = false;
  overlay.open = false;
  errorMsg.value = "";
}

function score(guess, sec) {
  let a = 0, b = 0;
  for (let i = 0; i < CODE_LEN; i++) {
    if (guess[i] === sec[i]) a++;
    else if (sec.includes(guess[i])) b++;
  }
  return { a, b };
}

function validate() {
  if (input.value.length < CODE_LEN) {
    showError("請輸入 4 位數字");
    return false;
  }
  if (new Set(input.value).size < CODE_LEN) {
    showError("數字不能重複");
    return false;
  }
  return true;
}

function showError(msg) {
  errorMsg.value = msg;
  shake.value = true;
  setTimeout(() => { shake.value = false; errorMsg.value = ""; }, 700);
}

function submit() {
  if (gameOver.value) return;
  if (!validate()) return;

  const guess = [...input.value];
  const { a, b } = score(guess, secret.value);
  history.value.push({ guess, a, b });
  input.value = [];

  if (a === CODE_LEN) {
    won.value = true;
    gameOver.value = true;
    const attempts = history.value.length;
    emit("solved", { attempts });
    stats.wins++;
    if (stats.best === null || attempts < stats.best) stats.best = attempts;
    overlay.title = "猜中了！";
    overlay.sub = `第 ${attempts} 次猜中，太厲害了！`;
    overlay.open = true;
    saveStats();
    return;
  }

  if (history.value.length >= MAX_TRIES) {
    gameOver.value = true;
    revealed.value = true;
    stats.losses++;
    overlay.title = "很可惜！";
    overlay.sub = `答案是 ${secret.value.join(" ")}，下次加油！`;
    overlay.open = true;
    saveStats();
  }
}

function pressDigit(d) {
  if (gameOver.value) return;
  if (input.value.length >= CODE_LEN) return;
  if (input.value.includes(d)) { showError("已輸入此數字"); return; }
  input.value.push(d);
  errorMsg.value = "";
}

function pressDelete() {
  if (input.value.length > 0) input.value.pop();
  errorMsg.value = "";
}

function restart() {
  init();
}

// ---- keyboard ----
function onKey(e) {
  if (gameOver.value) return;
  const n = parseInt(e.key);
  if (!isNaN(n) && e.key >= "0" && e.key <= "9") {
    e.preventDefault();
    pressDigit(n);
  } else if (e.key === "Backspace" || e.key === "Delete") {
    e.preventDefault();
    pressDelete();
  } else if (e.key === "Enter") {
    e.preventDefault();
    submit();
  }
}

onMounted(() => {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
    if (s.wins != null) { stats.wins = s.wins; stats.losses = s.losses; stats.best = s.best ?? null; }
  } catch(_) {}
  init();
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
watch(() => props.seed, init);

function saveStats() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ wins: stats.wins, losses: stats.losses, best: stats.best })); } catch(_) {}
}

// ---- display helpers ----
const attemptNum = computed(() => history.value.length + 1);

function pegColor(a, b) {
  // A pegs = accent, B pegs = dim, empty = ink
  return { a, b, empty: CODE_LEN - a - b };
}

const DIGIT_COLORS = [
  "#ff6b6b","#ffa94d","#ffd43b","#a9e34b","#63e6be",
  "#4dabf7","#748ffc","#da77f2","#f783ac","#a8a8b3",
];
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="猜數字" title-en="Mastermind">
      <template #actions>
        <button v-if="!daily" class="btn btn--accent" @click="restart">重新開始</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">嘗試</span>
            <span class="chip__value is-accent">
              {{ Math.min(history.length + (gameOver ? 0 : 1), MAX_TRIES) }} / {{ MAX_TRIES }}
            </span>
          </div>
          <div class="chip">
            <span class="chip__label">狀態</span>
            <span class="chip__value">
              {{ gameOver ? (won ? '🎉 成功' : '失敗') : '進行中' }}
            </span>
          </div>
          <div class="chip">
            <span class="chip__label">最佳</span>
            <span class="chip__value">{{ stats.best ?? '—' }}</span>
          </div>
        </div>

        <!-- History rows -->
        <div class="mm-history" aria-live="polite" aria-label="猜測歷史">
          <!-- Past guesses -->
          <div
            v-for="(row, ri) in history"
            :key="ri"
            class="mm-row mm-row--past"
          >
            <div class="mm-digits">
              <span
                v-for="(d, di) in row.guess"
                :key="di"
                class="mm-digit"
                :style="{ '--dc': DIGIT_COLORS[d] }"
              >{{ d }}</span>
            </div>
            <div class="mm-feedback">
              <div class="pegs">
                <span
                  v-for="j in row.a"
                  :key="'a'+j"
                  class="peg peg--a"
                  :aria-label="`${row.a}A`"
                />
                <span
                  v-for="j in row.b"
                  :key="'b'+j"
                  class="peg peg--b"
                  :aria-label="`${row.b}B`"
                />
                <span
                  v-for="j in (CODE_LEN - row.a - row.b)"
                  :key="'e'+j"
                  class="peg peg--empty"
                />
              </div>
              <span class="ab-text">{{ row.a }}A {{ row.b }}B</span>
            </div>
          </div>

          <!-- Current input row -->
          <div
            v-if="!gameOver"
            class="mm-row mm-row--active"
            :class="{ shake: shake }"
          >
            <div class="mm-digits">
              <span
                v-for="di in CODE_LEN"
                :key="di"
                class="mm-digit"
                :class="{ 'mm-digit--filled': input[di-1] !== undefined, 'mm-digit--cursor': input.length === di-1 }"
                :style="input[di-1] !== undefined ? { '--dc': DIGIT_COLORS[input[di-1]] } : {}"
              >
                {{ input[di-1] !== undefined ? input[di-1] : '' }}
              </span>
            </div>
            <div class="mm-feedback">
              <span class="input-hint">{{ errorMsg || '請輸入 4 個不同數字' }}</span>
            </div>
          </div>

          <!-- Empty future rows -->
          <div
            v-for="i in Math.max(0, MAX_TRIES - history.length - (gameOver ? 0 : 1))"
            :key="'empty'+i"
            class="mm-row mm-row--empty"
          >
            <div class="mm-digits">
              <span v-for="d in CODE_LEN" :key="d" class="mm-digit mm-digit--ghost" />
            </div>
          </div>
        </div>

        <!-- Numpad / revealed: fixed-height container so game-over swap doesn't shift page -->
        <div class="mm-input-area">
          <!-- Numpad -->
          <div v-if="!gameOver" class="numpad">
            <button
              v-for="d in [1,2,3,4,5,6,7,8,9,null,0,'del']"
              :key="String(d)"
              class="numpad-btn"
              :class="{
                'numpad-btn--del': d === 'del',
                'numpad-btn--empty-slot': d === null,
                'numpad-btn--used': typeof d === 'number' && input.includes(d),
              }"
              :disabled="d === null || (typeof d === 'number' && input.includes(d))"
              :aria-label="d === 'del' ? '刪除' : d === null ? '' : String(d)"
              @click="d === 'del' ? pressDelete() : typeof d === 'number' ? pressDigit(d) : null"
            >
              <span v-if="d === 'del'">⌫</span>
              <span v-else-if="d !== null">{{ d }}</span>
            </button>
            <button class="numpad-btn numpad-btn--submit btn--accent" :disabled="input.length < CODE_LEN" @click="submit">
              送出
            </button>
          </div>

          <!-- Revealed secret (on loss) -->
          <div v-if="revealed" class="revealed">
            <span class="panel__legend">答案是</span>
            <div class="mm-digits">
              <span
                v-for="(d, i) in secret"
                :key="i"
                class="mm-digit mm-digit--filled"
                :style="{ '--dc': DIGIT_COLORS[d] }"
              >{{ d }}</span>
            </div>
          </div>

          <!-- Won: empty spacer so overlay handles the result -->
          <div v-if="gameOver && won" class="mm-won-spacer" aria-hidden="true" />
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">戰績</span>
          <div class="stats-row">
            <div class="stat-item">
              <span class="stat-val" style="color: var(--accent)">{{ stats.wins }}</span>
              <span class="stat-lbl">勝</span>
            </div>
            <div class="stat-item">
              <span class="stat-val" style="color: #f87171">{{ stats.losses }}</span>
              <span class="stat-lbl">敗</span>
            </div>
            <div class="stat-item">
              <span class="stat-val">{{ stats.best ?? '—' }}</span>
              <span class="stat-lbl">最少</span>
            </div>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            猜一組 4 位數（不重複），最多 8 次。<br/>
            <strong style="color:var(--accent)">A</strong> = 數字對、位置對；
            <strong style="color: var(--text-dim)">B</strong> = 數字對但位置不對。<br/>
            根據提示縮小範圍，猜出答案即獲勝！
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">操作</span>
          <p class="hint">
            點擊數字鍵盤或按鍵盤 <kbd>0</kbd>–<kbd>9</kbd>，
            <kbd>Backspace</kbd> 刪除，<kbd>Enter</kbd> 送出。
          </p>
        </div>
      </aside>
    </div>

    <!-- Win/lose overlay -->
    <div class="overlay" style="position:fixed; border-radius: 0;" :class="{ 'is-open': overlay.open }">
      <div class="overlay__card">
        <h2 class="overlay__title">{{ overlay.title }}</h2>
        <p class="overlay__sub">{{ overlay.sub }}</p>
        <div class="overlay__actions" v-if="!daily">
          <button class="btn btn--accent" @click="restart">再玩一次</button>
        </div>
        <div class="overlay__actions" v-else>
          <button class="btn" @click="overlay.open = false">完成！</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mm-history {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  width: min(86vw, 500px);
  /* Reserve exactly MAX_TRIES (8) rows so the block never grows/shrinks */
  /* Each row: 2.6rem digit + 1rem padding top/bottom = ~4.6rem; plus 0.4rem gap×7 = 2.8rem */
  /* Approximate fixed height to lock the region: 8 × (2.6rem + 1rem) + 7 × 0.4rem */
  min-height: calc(8 * (2.6rem + 1rem + 4px) + 7 * 0.4rem);
}

.mm-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  /* Fixed height: digit cell is 2.6rem, row padding is 0.5rem top+bottom = 1rem, so 3.6rem total */
  min-height: calc(2.6rem + 1rem + 4px); /* 4px = 2px border × 2 */
  padding: 0.5rem 0.8rem;
  border-radius: var(--r-md);
  background: var(--ink-800);
  border: 1px solid var(--line);
  transition: border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
}
.mm-row--active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--accent) 30%, transparent);
}
.mm-row--past {
  background: var(--ink-850);
}
.mm-row--empty {
  opacity: 0.3;
}

.shake {
  animation: shakeRow 0.55s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}
@keyframes shakeRow {
  10%, 90%  { transform: translateX(-2px); }
  20%, 80%  { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-5px); }
  40%, 60%  { transform: translateX(5px); }
  100% { transform: translateX(0); }
}
@media (prefers-reduced-motion: reduce) {
  .shake { animation: none; }
}

.mm-digits {
  display: flex;
  gap: 0.4rem;
}
.mm-digit {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: var(--r-sm);
  background: var(--ink-700);
  border: 2px solid var(--line);
  font-family: var(--font-mono);
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--text-dim);
  transition: background var(--dur-fast), border-color var(--dur-fast);
}
.mm-digit--filled {
  background: color-mix(in oklab, var(--dc, var(--accent)) 22%, var(--ink-700));
  border-color: color-mix(in oklab, var(--dc, var(--accent)) 70%, transparent);
  color: var(--dc, var(--accent));
  box-shadow: 0 0 8px color-mix(in oklab, var(--dc, var(--accent)) 30%, transparent);
}
.mm-digit--ghost {
  opacity: 0.25;
}
.mm-digit--cursor {
  border-color: var(--accent);
  animation: cursorBlink 1.1s ease-in-out infinite;
}
@keyframes cursorBlink {
  0%, 100% { border-color: var(--accent); }
  50% { border-color: transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .mm-digit--cursor { animation: none; }
}

.mm-feedback {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.pegs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 3px;
  width: 26px;
}
.peg {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.peg--a {
  background: var(--accent);
  box-shadow: 0 0 4px color-mix(in oklab, var(--accent) 70%, transparent);
}
.peg--b {
  background: var(--text-dim);
}
.peg--empty {
  background: var(--ink-600);
}
.ab-text {
  font-family: var(--font-mono);
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-dim);
  white-space: nowrap;
}
.input-hint {
  font-size: 0.8rem;
  color: var(--text-faint);
  font-family: var(--font-mono);
  /* prevent line-wrap from changing row height */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Fixed wrapper for numpad / revealed — prevents the region below history from shifting on game-over */
.mm-input-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  /* numpad height: 5 rows × 3.2rem + 4 gaps × 0.5rem + submit row 3.2rem + margin-top 0.5rem */
  min-height: calc(5 * 3.2rem + 4 * 0.5rem + 0.5rem);
  width: min(86vw, 280px);
}
.mm-won-spacer {
  /* preserves height when won and numpad disappears */
  min-height: calc(5 * 3.2rem + 4 * 0.5rem + 0.5rem);
}

/* Numpad */
.numpad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  /* Explicit rows: 4 digit rows + 1 submit row */
  grid-template-rows: repeat(4, 3.2rem) 3.2rem;
  gap: 0.5rem;
  width: min(86vw, 280px);
  /* margin-top removed — parent .mm-input-area handles spacing */
}
.numpad-btn {
  height: 3.2rem;
  border-radius: var(--r-sm);
  background: var(--ink-700);
  border: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text);
  transition: background var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
}
.numpad-btn:hover:not(:disabled) {
  background: var(--ink-600);
  transform: translateY(-1px);
}
.numpad-btn:active:not(:disabled) {
  transform: translateY(0);
}
.numpad-btn--used {
  opacity: 0.3;
  pointer-events: none;
}
.numpad-btn--del {
  font-size: 1.3rem;
}
.numpad-btn--empty-slot {
  visibility: hidden;
  pointer-events: none;
}
.numpad-btn--submit {
  grid-column: span 3;
  height: 3.2rem;
  background: var(--accent);
  color: var(--accent-ink);
  border-color: transparent;
  font-size: 1rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.numpad-btn--submit:hover:not(:disabled) {
  filter: brightness(1.1);
  background: var(--accent);
}
.numpad-btn--submit:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.revealed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
  padding: 1rem;
  /* margin-top removed — lives inside .mm-input-area flex container */
  border-radius: var(--r-md);
  background: var(--ink-800);
  border: 1px solid var(--line);
}

.stats-row {
  display: flex;
  gap: 1rem;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
}
.stat-val {
  font-family: var(--font-mono);
  font-size: 1.4rem;
  font-weight: 700;
}
.stat-lbl {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-faint);
}

/* Better focus ring for numpad buttons */
.numpad-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .shake { animation: none !important; }
  .mm-digit--cursor { animation: none !important; }
}
</style>
