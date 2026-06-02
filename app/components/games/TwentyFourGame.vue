<script setup>
/* 24點 Make 24 — tap number, tap operator, tap number to combine cards.
   Brute-force solver verifies solvability; re-rolls seeded stream until solvable.
   Exact rational arithmetic (numerator/denominator) avoids floating-point errors. */

const accent = "#ff9aa2";
const SAVE_KEY = "playground.twentyfour.solved";

const props = defineProps({
  seed:  { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(['solved']);

// ---- Rational arithmetic ----
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
function rat(n, d = 1) {
  if (d === 0) return null; // division by zero
  if (n === 0) return { n: 0, d: 1 };
  const g = gcd(Math.abs(n), Math.abs(d));
  const sign = d < 0 ? -1 : 1;
  return { n: sign * n / g, d: sign * d / g };
}
function radd(a, b) { return rat(a.n * b.d + b.n * a.d, a.d * b.d); }
function rsub(a, b) { return rat(a.n * b.d - b.n * a.d, a.d * b.d); }
function rmul(a, b) { return rat(a.n * b.n, a.d * b.d); }
function rdiv(a, b) { if (b.n === 0) return null; return rat(a.n * b.d, a.d * b.n); }
function req(a, b) { return a !== null && b !== null && a.n === b.n && a.d === b.d; }
const TARGET = rat(24);

function applyOp(op, a, b) {
  if (op === '+') return radd(a, b);
  if (op === '-') return rsub(a, b);
  if (op === '*') return rmul(a, b);
  if (op === '/') return rdiv(a, b);
  return null;
}

// 5 binary tree shapes for 4 numbers: ((a op b) op c) op d etc.
// We iterate all permutations × all operator combos × all structures.
function* permutations(arr) {
  if (arr.length <= 1) { yield [...arr]; return; }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) yield [arr[i], ...p];
  }
}

const OPS = ['+','-','*','/'];

function solve24(nums) {
  const rats = nums.map(n => rat(n));
  for (const perm of permutations([0,1,2,3])) {
    const [a,b,c,d] = perm.map(i => rats[i]);
    const [na,nb,nc,nd] = perm.map(i => nums[i]);
    for (const o1 of OPS) for (const o2 of OPS) for (const o3 of OPS) {
      // Shape 1: ((a o1 b) o2 c) o3 d
      {
        const ab = applyOp(o1,a,b);
        if (ab) {
          const abc = applyOp(o2,ab,c);
          if (abc) {
            const abcd = applyOp(o3,abc,d);
            if (abcd && req(abcd,TARGET))
              return `((${na}${o1}${nb})${o2}${nc})${o3}${nd}`;
          }
        }
      }
      // Shape 2: (a o1 (b o2 c)) o3 d
      {
        const bc = applyOp(o2,b,c);
        if (bc) {
          const abc = applyOp(o1,a,bc);
          if (abc) {
            const abcd = applyOp(o3,abc,d);
            if (abcd && req(abcd,TARGET))
              return `(${na}${o1}(${nb}${o2}${nc}))${o3}${nd}`;
          }
        }
      }
      // Shape 3: (a o1 b) o2 (c o3 d)
      {
        const ab = applyOp(o1,a,b);
        const cd = applyOp(o3,c,d);
        if (ab && cd) {
          const abcd = applyOp(o2,ab,cd);
          if (abcd && req(abcd,TARGET))
            return `(${na}${o1}${nb})${o2}(${nc}${o3}${nd})`;
        }
      }
      // Shape 4: a o1 ((b o2 c) o3 d)
      {
        const bc = applyOp(o2,b,c);
        if (bc) {
          const bcd = applyOp(o3,bc,d);
          if (bcd) {
            const abcd = applyOp(o1,a,bcd);
            if (abcd && req(abcd,TARGET))
              return `${na}${o1}((${nb}${o2}${nc})${o3}${nd})`;
          }
        }
      }
      // Shape 5: a o1 (b o2 (c o3 d))
      {
        const cd = applyOp(o3,c,d);
        if (cd) {
          const bcd = applyOp(o2,b,cd);
          if (bcd) {
            const abcd = applyOp(o1,a,bcd);
            if (abcd && req(abcd,TARGET))
              return `${na}${o1}(${nb}${o2}(${nc}${o3}${nd}))`;
          }
        }
      }
    }
  }
  return null;
}

// ---- pretty-print solution ----
function prettySolution(expr) {
  if (!expr) return '';
  return expr
    .replace(/\*/g, ' × ')
    .replace(/\//g, ' ÷ ')
    .replace(/\+/g, ' + ')
    .replace(/-/g, ' − ')
    .replace(/\s+/g, ' ');
}

// ---- generate puzzle ----
function genPuzzle(rng) {
  for (let i = 0; i < 500; i++) {
    const nums = [rng.int(1,9), rng.int(1,9), rng.int(1,9), rng.int(1,9)];
    const sol = solve24(nums);
    if (sol) return { nums, solution: sol };
  }
  return { nums: [3,3,8,8], solution: '8/(3-8/3)' }; // fallback (known solvable)
}

// ---- game state ----
const nums = ref([]);
const solution = ref('');
const cards = ref([]);          // { id, value: rat, display: string }
const selectedCard = ref(null); // index in cards
const selectedOp = ref(null);   // '+' | '-' | '*' | '/'
const history = ref([]);        // for undo: snapshots of cards
const gameWon = ref(false);
const showSolution = ref(false);
const solvedCount = ref(0);
const overlay = reactive({ open: false, title: '', sub: '' });

let cardIdSeq = 0;
function newCard(val, disp) { return { id: cardIdSeq++, value: val, display: disp }; }

function initCards(ns) {
  cards.value = ns.map(n => newCard(rat(n), String(n)));
  selectedCard.value = null;
  selectedOp.value = null;
  history.value = [];
  gameWon.value = false;
  showSolution.value = false;
  overlay.open = false;
}

function regenerate() {
  const rng = makeRng(props.seed);
  const puzzle = genPuzzle(rng);
  nums.value = puzzle.nums;
  solution.value = puzzle.solution;
  initCards(puzzle.nums);
}

watch(() => props.seed, regenerate);

// ---- interact ----
function selectCard(i) {
  if (gameWon.value) return;
  if (selectedCard.value === null) {
    // First card pick
    selectedCard.value = i;
    selectedOp.value = null;
    return;
  }
  if (selectedOp.value === null) {
    // Re-pick card before op
    selectedCard.value = i;
    return;
  }
  // Second card: combine
  if (i === selectedCard.value) {
    // Deselect
    selectedCard.value = null;
    selectedOp.value = null;
    return;
  }
  combineCards(selectedCard.value, i);
}

function selectOp(op) {
  if (gameWon.value) return;
  if (selectedCard.value === null) return; // need first card first
  selectedOp.value = op;
}

function combineCards(ai, bi) {
  const a = cards.value[ai];
  const b = cards.value[bi];
  const result = applyOp(selectedOp.value, a.value, b.value);
  if (result === null) {
    // Division by zero — deselect
    selectedCard.value = null;
    selectedOp.value = null;
    return;
  }
  // Save undo snapshot
  history.value.push(cards.value.map(c => ({ ...c })));

  const dispA = a.display.includes(' ') || a.display.includes('(') ? `(${a.display})` : a.display;
  const dispB = b.display.includes(' ') || b.display.includes('(') ? `(${b.display})` : b.display;
  const opSymbol = { '+': '+', '-': '−', '*': '×', '/': '÷' }[selectedOp.value];
  const newDisp = `${dispA} ${opSymbol} ${dispB}`;
  const combined = newCard(result, newDisp);

  const newCards = cards.value.filter((_, i) => i !== ai && i !== bi);
  newCards.push(combined);
  cards.value = newCards;
  selectedCard.value = null;
  selectedOp.value = null;

  if (newCards.length === 1) {
    if (req(result, TARGET)) {
      handleWin();
    } else {
      // Wrong — show result but no win
    }
  }
}

function handleWin() {
  gameWon.value = true;
  solvedCount.value++;
  try { localStorage.setItem(SAVE_KEY, String(solvedCount.value)); } catch (_) {}
  if (props.daily) {
    overlay.title = '完成！';
    overlay.sub = '成功湊到 24！';
  } else {
    overlay.title = '答對了！';
    overlay.sub = '太厲害，成功湊到 24！';
  }
  overlay.open = true;
  emit('solved', {});
}

function resetCards() {
  initCards(nums.value);
}

function undo() {
  if (history.value.length === 0) return;
  cards.value = history.value.pop();
  selectedCard.value = null;
  selectedOp.value = null;
  gameWon.value = false;
}

function revealSolution() {
  showSolution.value = true;
}

// ---- display helpers ----
function ratToDisplay(r) {
  if (r.d === 1) return String(r.n);
  return `${r.n}/${r.d}`;
}
function isExact24(card) {
  return req(card.value, TARGET);
}

onMounted(() => {
  try { solvedCount.value = +(localStorage.getItem(SAVE_KEY) || 0); } catch (_) {}
  regenerate();
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="24點" title-en="Make 24">
      <template #actions>
        <button class="btn" @click="undo">上一步</button>
        <button class="btn" @click="resetCards">重設</button>
        <button v-if="!props.daily" class="btn btn--accent" @click="regenerate">換一題</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">目標</span>
            <span class="chip__value is-accent">24</span>
          </div>
          <div class="chip">
            <span class="chip__label">剩餘</span>
            <span class="chip__value">{{ cards.length }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">已解</span>
            <span class="chip__value">{{ solvedCount }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div class="tf-arena">
            <!-- Number cards -->
            <div class="tf-cards-area">
              <div
                v-for="(card, i) in cards"
                :key="card.id"
                class="tf-card"
                :class="{
                  'is-selected': selectedCard === i,
                  'is-24': cards.length === 1 && isExact24(card),
                  'is-wrong': cards.length === 1 && !isExact24(card),
                }"
                :aria-pressed="selectedCard === i"
                :aria-label="`數字 ${card.display}`"
                role="button"
                tabindex="0"
                @click="selectCard(i)"
                @keydown.enter="selectCard(i)"
                @keydown.space.prevent="selectCard(i)"
              >
                <span class="tf-card-val">{{ ratToDisplay(card.value) }}</span>
                <span v-if="card.display !== ratToDisplay(card.value)" class="tf-card-expr">{{ card.display }}</span>
              </div>
            </div>

            <!-- Operator buttons -->
            <div class="tf-ops">
              <button
                v-for="op in ['+','-','*','/']"
                :key="op"
                class="tf-op"
                :class="{ 'is-selected': selectedOp === op }"
                :aria-pressed="selectedOp === op"
                :aria-label="{ '+': '加', '-': '減', '*': '乘', '/': '除' }[op]"
                @click="selectOp(op)"
              >
                {{ { '+': '+', '-': '−', '*': '×', '/': '÷' }[op] }}
              </button>
            </div>

            <!-- Hint: step instructions -->
            <div class="tf-instruction">
              <template v-if="gameWon">
                <span class="tf-instr-win">已完成！</span>
              </template>
              <template v-else-if="cards.length === 1 && !isExact24(cards[0])">
                <span class="tf-instr-fail">結果是 {{ ratToDisplay(cards[0].value) }}，不是 24。請重設再試。</span>
              </template>
              <template v-else-if="selectedCard === null">
                <span>先點選一張數字牌</span>
              </template>
              <template v-else-if="selectedOp === null">
                <span>選好了 <b>{{ ratToDisplay(cards[selectedCard].value) }}</b>，選運算符號</span>
              </template>
              <template v-else>
                <span>再點選第二張數字牌</span>
              </template>
            </div>

            <!-- Solution reveal: always in DOM, hidden until requested — no layout shift -->
            <div class="tf-solution" :class="{ 'tf-solution--hidden': !showSolution }" aria-live="polite">
              <span class="panel__legend">參考答案</span>
              <span class="tf-sol-expr">{{ prettySolution(solution) }} = 24</span>
            </div>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button v-if="!props.daily" class="btn btn--accent" @click="regenerate">換一題</button>
                <button class="btn" @click="resetCards">再玩</button>
                <button class="btn" @click="overlay.open = false">關閉</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">本題數字</span>
          <div class="tf-orig-nums">
            <span v-for="(n, i) in nums" :key="i" class="tf-orig-num">{{ n }}</span>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">操作</span>
          <div style="display:flex;flex-direction:column;gap:0.5rem;">
            <button class="btn" style="width:100%" @click="undo">上一步 Undo</button>
            <button class="btn" style="width:100%" @click="resetCards">重設 Reset</button>
            <button class="btn" style="width:100%" @click="revealSolution">
              {{ showSolution ? '已顯示解答' : '提示 / 顯示解答' }}
            </button>
            <button v-if="!props.daily" class="btn btn--accent" style="width:100%" @click="regenerate">換一題</button>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            用 4 張數字牌做加、減、乘、除，讓最後結果等於 24。<br />
            1. 點選一張數字牌<br />
            2. 點選運算符號<br />
            3. 點選第二張數字牌，兩張合併為新牌<br />
            重複到只剩一張牌為止。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.tf-arena {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;
  padding: 1.5rem;
  border-radius: var(--r-lg);
  background: radial-gradient(120% 120% at 50% 0%, var(--ink-800), var(--ink-900));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  min-width: min(400px, 90vw);
}

.tf-cards-area {
  /* Fixed single-row area: always reserves space for 4 cards side by side.
     Cards never increase rows — cards shrink in count from 4→1, never more than 4.
     Height = max card height; width = arena width so cards center in place. */
  display: flex;
  flex-wrap: nowrap;
  gap: 1rem;
  justify-content: center;
  align-items: center;
  /* Lock the height to the tallest card so combining cards never changes this row's height */
  height: clamp(72px, 16vw, 100px);
  width: 100%;
}

.tf-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  width: clamp(72px, 16vw, 100px);
  height: clamp(72px, 16vw, 100px);
  border-radius: var(--r-md);
  background: var(--ink-700);
  border: 2px solid var(--line);
  cursor: pointer;
  transition: background 0.15s var(--ease), border-color 0.15s var(--ease),
              box-shadow 0.15s var(--ease), transform 0.15s var(--ease);
  user-select: none;
}
.tf-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}
.tf-card:active { transform: scale(0.95); }
.tf-card.is-selected {
  background: color-mix(in oklab, var(--accent) 25%, var(--ink-700));
  border-color: var(--accent);
  box-shadow: 0 0 16px color-mix(in oklab, var(--accent) 40%, transparent);
  transform: translateY(-3px) scale(1.04);
}
.tf-card.is-24 {
  background: color-mix(in oklab, var(--accent) 30%, var(--ink-700));
  border-color: var(--accent);
  animation: tf-win-pulse 0.8s var(--ease) 2;
}
.tf-card.is-wrong {
  background: color-mix(in oklab, #ff5555 20%, var(--ink-700));
  border-color: #ff5555;
}
@keyframes tf-win-pulse {
  0%,100% { box-shadow: 0 0 12px color-mix(in oklab, var(--accent) 40%, transparent); }
  50%     { box-shadow: 0 0 32px color-mix(in oklab, var(--accent) 80%, transparent); }
}

.tf-card-val {
  font-family: var(--font-display);
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  font-weight: 900;
  line-height: 1;
  color: var(--text);
}
.tf-card-expr {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  color: var(--text-faint);
  text-align: center;
  padding: 0 0.3rem;
  line-height: 1.2;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tf-ops {
  display: flex;
  gap: 0.8rem;
}
.tf-op {
  width: clamp(48px, 12vw, 64px);
  height: clamp(48px, 12vw, 64px);
  border-radius: var(--r-md);
  background: var(--ink-700);
  border: 2px solid var(--line);
  font-family: var(--font-display);
  font-size: clamp(1.2rem, 3vw, 1.8rem);
  font-weight: 700;
  color: var(--text);
  cursor: pointer;
  transition: background 0.15s var(--ease), border-color 0.15s var(--ease),
              box-shadow 0.15s var(--ease), transform 0.15s var(--ease), color 0.15s var(--ease);
  user-select: none;
}
.tf-op:hover { border-color: var(--accent); }
.tf-op:active { transform: scale(0.92); }
.tf-op.is-selected {
  background: var(--accent);
  color: var(--accent-ink, var(--ink-900));
  border-color: var(--accent);
  box-shadow: 0 0 14px color-mix(in oklab, var(--accent) 50%, transparent);
}

.tf-instruction {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--text-dim);
  text-align: center;
  min-height: 1.4em;
}
.tf-instr-win { color: var(--accent); font-weight: 700; }
.tf-instr-fail { color: #ff7777; }

.tf-solution {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 0.8rem 1.2rem;
  border-radius: var(--r-md);
  background: var(--ink-800);
  border: 1px solid var(--line-strong);
  transition: opacity 0.25s var(--ease);
}
.tf-solution--hidden {
  /* Reserve space but hide content — prevents arena from growing when solution is revealed */
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
}
.tf-sol-expr {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.04em;
}

.tf-orig-nums {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.tf-orig-num {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--r-sm);
  background: var(--ink-700);
  border: 1px solid var(--line);
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 900;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

/* Card value uses tabular nums to prevent width shifts between single/multi-digit results */
.tf-card-val {
  font-variant-numeric: tabular-nums;
}

/* Keyboard accessibility for card and op buttons */
.tf-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.tf-op:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .tf-card.is-24 { animation: none; }
  .tf-solution { transition: none; }
}
</style>
