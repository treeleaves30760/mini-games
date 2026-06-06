<script setup>
import {
  FRACTION_BALANCE_DIFFICULTIES,
  formatFraction,
  generateFractionBalancePuzzle,
  isFractionBalanceSolved,
  signedSum,
} from "~/games/fraction-balance";

const accent = "#a78bfa";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const difficultyKey = ref("normal");
const effectiveDifficulty = computed(() => (props.daily ? "hard" : difficultyKey.value));
const puzzle = ref(null);
const selectedIds = ref([]);
const signs = ref([]);
const won = ref(false);
const overlay = reactive({ open: false, title: "", sub: "" });

const currentSum = computed(() => (puzzle.value ? signedSum(puzzle.value.cards, selectedIds.value, signs.value) : null));

function rng() {
  return makeRng(props.seed == null ? null : `${props.seed}:fraction-balance:${effectiveDifficulty.value}`);
}

function generate() {
  puzzle.value = generateFractionBalancePuzzle(rng(), effectiveDifficulty.value);
  selectedIds.value = [];
  signs.value = new Array(puzzle.value.slots).fill(1);
  won.value = false;
  overlay.open = false;
}

watch(() => props.seed, generate);
watch(effectiveDifficulty, generate);

function selectCard(id) {
  if (!puzzle.value || won.value) return;
  if (selectedIds.value.includes(id)) {
    const idx = selectedIds.value.indexOf(id);
    selectedIds.value = selectedIds.value.filter((x) => x !== id);
    signs.value = signs.value.filter((_, i) => i !== idx);
    return;
  }
  if (selectedIds.value.length >= puzzle.value.slots) return;
  selectedIds.value = [...selectedIds.value, id];
  signs.value = [...signs.value, 1];
  checkWin();
}

function toggleSign(index) {
  const next = signs.value.slice();
  next[index] = next[index] === 1 ? -1 : 1;
  signs.value = next;
  checkWin();
}

function cardById(id) {
  return puzzle.value?.cards.find((card) => card.id === id);
}

function checkWin() {
  nextTick(() => {
    if (!puzzle.value || !isFractionBalanceSolved(puzzle.value, selectedIds.value, signs.value)) return;
    won.value = true;
    overlay.title = "天平平衡！";
    overlay.sub = `右側合計 ${formatFraction(puzzle.value.target)}。`;
    overlay.open = true;
    emit("solved", {});
  });
}

onMounted(generate);
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="分數天平" title-en="Fraction Balance">
      <template #actions>
        <button class="btn btn--accent" @click="generate">新題目</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">目標</span>
            <span class="chip__value is-accent">{{ puzzle ? formatFraction(puzzle.target) : "—" }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">目前</span>
            <span class="chip__value">{{ currentSum ? formatFraction(currentSum) : "—" }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">卡片</span>
            <span class="chip__value">{{ selectedIds.length }}/{{ puzzle?.slots || 0 }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div v-if="puzzle" class="balance">
            <div class="balance__pan is-target">
              <span class="balance__label">左側</span>
              <strong>{{ formatFraction(puzzle.target) }}</strong>
            </div>
            <div class="balance__beam" aria-hidden="true"></div>
            <div class="balance__pan">
              <span class="balance__label">右側</span>
              <div class="slots">
                <div v-for="slot in puzzle.slots" :key="slot" class="slot">
                  <button
                    class="slot__sign"
                    :disabled="!selectedIds[slot - 1] || won"
                    :aria-label="`切換第 ${slot} 張卡正負號`"
                    @click="toggleSign(slot - 1)"
                  >
                    {{ signs[slot - 1] === -1 ? "−" : "+" }}
                  </button>
                  <span class="slot__value">
                    {{ selectedIds[slot - 1] ? formatFraction(cardById(selectedIds[slot - 1]).value) : "空" }}
                  </span>
                </div>
              </div>
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

        <div v-if="puzzle" class="fraction-cards" aria-label="分數卡片">
          <button
            v-for="card in puzzle.cards"
            :key="card.id"
            class="fraction-card"
            :class="{ 'is-selected': selectedIds.includes(card.id) }"
            :disabled="won || (!selectedIds.includes(card.id) && selectedIds.length >= puzzle.slots)"
            @click="selectCard(card.id)"
          >
            {{ formatFraction(card.value) }}
          </button>
        </div>
      </div>

      <aside class="panel">
        <div v-if="!props.daily" class="panel__group">
          <span class="panel__legend">難度</span>
          <div class="seg">
            <button
              v-for="d in FRACTION_BALANCE_DIFFICULTIES"
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
            從卡片中選出指定數量的分數，讓右側總和等於左側目標。困難以上會出現負分數與減法。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.balance {
  width: min(88vw, 660px);
  min-height: 280px;
  display: grid;
  grid-template-columns: 1fr 80px 1fr;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
}
.balance__pan {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.9rem;
  padding: 1rem;
  border-radius: var(--r-lg);
  border: 1px solid var(--line);
  background: linear-gradient(180deg, var(--ink-800), var(--ink-900));
  box-shadow: var(--shadow-2);
  text-align: center;
}
.balance__pan strong {
  font-family: var(--font-display);
  font-size: clamp(2rem, 7vw, 3.5rem);
  color: var(--accent);
}
.balance__label {
  font-family: var(--font-mono);
  font-size: 0.76rem;
  letter-spacing: 0.16em;
  color: var(--text-faint);
}
.balance__beam {
  height: 10px;
  border-radius: var(--r-pill);
  background: var(--accent);
  box-shadow: var(--glow-sm);
}
.slots {
  display: grid;
  gap: 0.55rem;
}
.slot {
  display: grid;
  grid-template-columns: 44px 1fr;
  align-items: center;
  gap: 0.5rem;
  min-height: 48px;
  border-radius: var(--r-sm);
  background: var(--ink-950);
  border: 1px solid var(--line);
  padding: 0.35rem;
}
.slot__sign {
  min-height: 40px;
  border-radius: 8px;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 900;
}
.slot__value {
  font-family: var(--font-mono);
  font-size: 1.1rem;
}
.fraction-cards {
  width: min(88vw, 660px);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(86px, 1fr));
  gap: 0.65rem;
}
.fraction-card {
  min-height: 54px;
  border-radius: var(--r-sm);
  background: var(--ink-800);
  border: 1px solid var(--line);
  color: var(--text);
  font-family: var(--font-mono);
  font-weight: 800;
  cursor: pointer;
}
.fraction-card.is-selected {
  border-color: var(--accent);
  color: var(--accent);
  box-shadow: var(--glow-sm);
}
@media (max-width: 680px) {
  .balance {
    grid-template-columns: 1fr;
  }
  .balance__beam {
    width: 70%;
    margin-inline: auto;
  }
}
</style>
