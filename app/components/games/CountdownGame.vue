<script setup>
import {
  COUNTDOWN_DIFFICULTIES,
  applyCountdownOp,
  generateCountdownPuzzle,
  isCountdownSolved,
} from "~/games/countdown";

const accent = "#38bdf8";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const difficultyKey = ref("normal");
const effectiveDifficulty = computed(() => (props.daily ? "hard" : difficultyKey.value));
const puzzle = ref(null);
const cards = ref([]);
const selectedCard = ref(null);
const selectedOp = ref(null);
const history = ref([]);
const won = ref(false);
const showSolution = ref(false);
const overlay = reactive({ open: false, title: "", sub: "" });
let seq = 0;

function rng() {
  return makeRng(props.seed == null ? null : `${props.seed}:countdown:${effectiveDifficulty.value}`);
}

function makeCard(value, expr = String(value)) {
  return { id: seq++, value, expr };
}

function generate() {
  puzzle.value = generateCountdownPuzzle(rng(), effectiveDifficulty.value);
  cards.value = puzzle.value.numbers.map((n) => makeCard(n));
  selectedCard.value = null;
  selectedOp.value = null;
  history.value = [];
  won.value = false;
  showSolution.value = false;
  overlay.open = false;
}

watch(() => props.seed, generate);
watch(effectiveDifficulty, generate);

function selectCard(index) {
  if (won.value) return;
  if (selectedCard.value === null) {
    selectedCard.value = index;
    selectedOp.value = null;
    return;
  }
  if (selectedOp.value === null) {
    selectedCard.value = index;
    return;
  }
  if (index === selectedCard.value) {
    selectedCard.value = null;
    selectedOp.value = null;
    return;
  }
  combine(selectedCard.value, index);
}

function selectOp(op) {
  if (won.value || selectedCard.value === null) return;
  selectedOp.value = op;
}

function combine(ai, bi) {
  const a = cards.value[ai];
  const b = cards.value[bi];
  const result = applyCountdownOp(selectedOp.value, a.value, b.value);
  if (result === null) {
    selectedCard.value = null;
    selectedOp.value = null;
    return;
  }
  history.value.push(cards.value.map((card) => ({ ...card })));
  const next = makeCard(result, `(${a.expr} ${selectedOp.value} ${b.expr})`);
  const rest = cards.value.filter((_, index) => index !== ai && index !== bi);
  rest.push(next);
  cards.value = rest;
  selectedCard.value = null;
  selectedOp.value = null;
  checkWin();
}

function undo() {
  if (!history.value.length) return;
  cards.value = history.value.pop();
  selectedCard.value = null;
  selectedOp.value = null;
  won.value = false;
  overlay.open = false;
}

function resetCards() {
  if (!puzzle.value) return;
  cards.value = puzzle.value.numbers.map((n) => makeCard(n));
  selectedCard.value = null;
  selectedOp.value = null;
  history.value = [];
  won.value = false;
  overlay.open = false;
}

function checkWin() {
  if (cards.value.length !== 1 || !puzzle.value || !isCountdownSolved(cards.value[0].value, puzzle.value.target)) return;
  won.value = true;
  overlay.title = "精準命中！";
  overlay.sub = `${cards.value[0].expr} = ${puzzle.value.target}`;
  overlay.open = true;
  emit("solved", {});
}

onMounted(generate);
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="倒數數字" title-en="Countdown Numbers">
      <template #actions>
        <button class="btn" :disabled="history.length === 0" @click="undo">上一步</button>
        <button class="btn" @click="resetCards">重設</button>
        <button class="btn btn--accent" @click="generate">新題目</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">目標</span>
            <span class="chip__value is-accent">{{ puzzle?.target || "—" }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">剩餘</span>
            <span class="chip__value">{{ cards.length }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">步數</span>
            <span class="chip__value">{{ history.length }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div class="countdown-area">
            <div class="countdown-cards">
              <button
                v-for="(card, i) in cards"
                :key="card.id"
                class="count-card"
                :class="{ 'is-selected': selectedCard === i, 'is-target': card.value === puzzle?.target }"
                @click="selectCard(i)"
              >
                <strong>{{ card.value }}</strong>
                <span>{{ card.expr }}</span>
              </button>
            </div>

            <div class="count-ops" aria-label="運算符號">
              <button
                v-for="op in ['+','-','×','÷']"
                :key="op"
                class="count-op"
                :class="{ 'is-selected': selectedOp === op }"
                :disabled="selectedCard === null || won"
                @click="selectOp(op)"
              >
                {{ op }}
              </button>
            </div>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button v-if="!props.daily" class="btn btn--accent" @click="generate">下一題</button>
                <button v-else class="btn" disabled>完成</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div v-if="!props.daily" class="panel__group">
          <span class="panel__legend">難度</span>
          <div class="seg">
            <button
              v-for="d in COUNTDOWN_DIFFICULTIES"
              :key="d.key"
              :class="{ 'is-active': difficultyKey === d.key }"
              :aria-pressed="difficultyKey === d.key"
              @click="difficultyKey = d.key"
            >
              {{ d.label }}
            </button>
          </div>
        </div>
        <div class="panel__group">
          <span class="panel__legend">規則</span>
          <p class="hint">
            每張數字卡都要用一次，透過四則運算把所有卡片合併成目標值。減法不能得到負數，除法必須整除。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">答案</span>
          <button class="btn" @click="showSolution = !showSolution">{{ showSolution ? "隱藏" : "顯示" }}一組解</button>
          <p v-if="showSolution" class="hint">{{ puzzle?.solution }}</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.countdown-area {
  width: min(90vw, 680px);
  display: grid;
  gap: 1rem;
  padding: 1rem;
}
.countdown-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.75rem;
}
.count-card {
  min-height: 118px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.45rem;
  border-radius: var(--r-md);
  background: linear-gradient(180deg, var(--ink-800), var(--ink-900));
  border: 1px solid var(--line);
  color: var(--text);
  cursor: pointer;
}
.count-card strong {
  font-family: var(--font-display);
  font-size: 2.3rem;
  color: var(--accent);
}
.count-card span {
  max-width: 100%;
  padding-inline: 0.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: var(--text-faint);
}
.count-card.is-selected,
.count-card.is-target {
  border-color: var(--accent);
  box-shadow: var(--glow-md);
}
.count-ops {
  display: grid;
  grid-template-columns: repeat(4, minmax(54px, 1fr));
  gap: 0.7rem;
}
.count-op {
  min-height: 56px;
  border-radius: var(--r-md);
  background: var(--ink-800);
  border: 1px solid var(--line);
  color: var(--text);
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 900;
  cursor: pointer;
}
.count-op.is-selected {
  background: var(--accent);
  color: var(--accent-ink);
  box-shadow: var(--glow-sm);
}
</style>
