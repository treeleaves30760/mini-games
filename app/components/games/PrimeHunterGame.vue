<script setup>
import {
  PRIME_HUNTER_DIFFICULTIES,
  checkPrimeHunterSelection,
  factorize,
  generatePrimeHunterPuzzle,
} from "~/games/prime-hunter";

const accent = "#84cc16";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const difficultyKey = ref("normal");
const effectiveDifficulty = computed(() => (props.daily ? "hard" : difficultyKey.value));
const puzzle = ref(null);
const selected = ref([]);
const won = ref(false);
const overlay = reactive({ open: false, title: "", sub: "" });

const status = computed(() => (puzzle.value ? checkPrimeHunterSelection(puzzle.value, selected.value) : { solved: false, correct: 0, wrong: 0, missing: 0 }));

function rng() {
  return makeRng(props.seed == null ? null : `${props.seed}:prime-hunter:${effectiveDifficulty.value}`);
}

function generate() {
  puzzle.value = generatePrimeHunterPuzzle(rng(), effectiveDifficulty.value);
  selected.value = new Array(puzzle.value.numbers.length).fill(false);
  won.value = false;
  overlay.open = false;
}

watch(() => props.seed, generate);
watch(effectiveDifficulty, generate);

function toggle(index) {
  if (won.value) return;
  const next = selected.value.slice();
  next[index] = !next[index];
  selected.value = next;
  checkWin();
}

function factors(n) {
  return factorize(n).join(" × ");
}

function checkWin() {
  nextTick(() => {
    if (!status.value.solved) return;
    won.value = true;
    overlay.title = "全部命中！";
    overlay.sub = `已找出 ${status.value.correct} 個符合條件的數。`;
    overlay.open = true;
    emit("solved", {});
  });
}

onMounted(generate);
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="質數獵人" title-en="Prime Hunter">
      <template #actions>
        <button class="btn btn--accent" @click="generate">新題目</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">正確</span>
            <span class="chip__value is-accent">{{ status.correct }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">錯選</span>
            <span class="chip__value">{{ status.wrong }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">剩餘</span>
            <span class="chip__value">{{ status.missing }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div v-if="puzzle" class="prime-grid" :style="{ '--n': puzzle.size }" role="grid" :aria-label="puzzle.rule.label">
            <button
              v-for="(n, i) in puzzle.numbers"
              :key="i"
              class="prime-cell"
              :class="{
                'is-selected': selected[i],
                'is-wrong': selected[i] && !puzzle.answers[i],
              }"
              :aria-label="`${n}，質因數 ${factors(n)}`"
              @click="toggle(i)"
            >
              <span class="prime-cell__num">{{ n }}</span>
              <span class="prime-cell__factors">{{ factors(n) }}</span>
            </button>
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
              v-for="d in PRIME_HUNTER_DIFFICULTIES"
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
          <span class="panel__legend">任務</span>
          <p class="hint">{{ puzzle?.rule.label }}</p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">規則</span>
          <p class="hint">
            點選所有符合條件的數字，不能漏選也不能錯選。卡片下方會顯示質因數分解，困難以上需要判斷質因數結構。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.prime-grid {
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
  width: min(90vw, 68vh, 620px);
  aspect-ratio: 1;
  gap: 0.35rem;
  padding: 0.55rem;
  border-radius: var(--r-lg);
  background: var(--ink-950);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
}
.prime-cell {
  min-width: 0;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 0.12rem;
  border-radius: 9px;
  background: linear-gradient(180deg, var(--ink-800), var(--ink-900));
  border: 1px solid var(--line);
  color: var(--text);
  cursor: pointer;
}
.prime-cell__num {
  font-family: var(--font-mono);
  font-size: clamp(0.82rem, calc(5vw / var(--n)), 1.35rem);
  font-weight: 900;
}
.prime-cell__factors {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-inline: 0.15rem;
  font-family: var(--font-mono);
  font-size: clamp(0.46rem, calc(3vw / var(--n)), 0.66rem);
  color: var(--text-faint);
}
.prime-cell.is-selected {
  border-color: var(--accent);
  background: color-mix(in oklab, var(--accent) 22%, var(--ink-850));
  box-shadow: var(--glow-sm);
}
.prime-cell.is-wrong {
  border-color: #ff5d6c;
  box-shadow: 0 0 0 1px rgba(255, 93, 108, 0.35);
}
</style>
