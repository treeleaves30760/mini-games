<script setup>
import {
  KENKEN_DIFFICULTIES,
  cageLabel,
  cageSatisfied,
  cellHasDuplicate,
  generateKenKenPuzzle,
  isKenKenSolved,
} from "~/games/kenken";

const accent = "#2dd4bf";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const difficultyKey = ref("normal");
const effectiveDifficulty = computed(() => (props.daily ? "hard" : difficultyKey.value));
const puzzle = ref(null);
const cells = ref([]);
const selected = ref(null);
const won = ref(false);
const overlay = reactive({ open: false, title: "", sub: "" });

const size = computed(() => puzzle.value?.size ?? 4);
const remaining = computed(() => cells.value.filter((value) => value === null).length);

function rng() {
  return makeRng(props.seed == null ? null : `${props.seed}:kenken:${effectiveDifficulty.value}`);
}

function generate() {
  puzzle.value = generateKenKenPuzzle(rng(), effectiveDifficulty.value);
  cells.value = new Array(puzzle.value.size * puzzle.value.size).fill(null);
  selected.value = null;
  won.value = false;
  overlay.open = false;
}

watch(() => props.seed, generate);
watch(effectiveDifficulty, generate);

function cageForCell(index) {
  const cageId = puzzle.value?.cageOf[index] ?? -1;
  return puzzle.value?.cages[cageId] ?? null;
}

function isCageHead(index) {
  const cage = cageForCell(index);
  return cage?.cells[0] === index;
}

function setCell(value) {
  if (won.value || selected.value === null) return;
  const next = cells.value.slice();
  next[selected.value] = value;
  cells.value = next;
  checkWin();
}

function clearCell() {
  if (selected.value === null) return;
  const next = cells.value.slice();
  next[selected.value] = null;
  cells.value = next;
}

function cellError(index) {
  if (!puzzle.value || cells.value[index] === null) return false;
  if (cellHasDuplicate(cells.value, puzzle.value.size, index)) return true;
  const cage = cageForCell(index);
  if (!cage) return false;
  const complete = cage.cells.every((cell) => cells.value[cell] !== null);
  return complete && !cageSatisfied(cage, cells.value);
}

function checkWin() {
  if (!puzzle.value || !isKenKenSolved(puzzle.value, cells.value)) return;
  won.value = true;
  selected.value = null;
  overlay.title = "完成！";
  overlay.sub = `${size.value}×${size.value} 算術數獨已解開。`;
  overlay.open = true;
  emit("solved", {});
}

onMounted(generate);
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="算術數獨" title-en="KenKen">
      <template #actions>
        <button class="btn btn--accent" @click="generate">新題目</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">尺寸</span>
            <span class="chip__value is-accent">{{ size }}×{{ size }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">空格</span>
            <span class="chip__value">{{ remaining }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">區塊</span>
            <span class="chip__value">{{ puzzle?.cages.length || 0 }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div v-if="puzzle" class="ken-grid" :style="{ '--n': size }" role="grid" :aria-label="`${size}×${size} 算術數獨`">
            <button
              v-for="(_, i) in cells"
              :key="i"
              class="ken-cell"
              :class="{
                'is-selected': selected === i,
                'is-error': cellError(i),
              }"
              :aria-label="`第 ${Math.floor(i / size) + 1} 行第 ${(i % size) + 1} 列`"
              @click="selected = i"
            >
              <span v-if="isCageHead(i)" class="ken-cage">{{ cageLabel(cageForCell(i)) }}</span>
              <span class="ken-value">{{ cells[i] || "" }}</span>
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

        <div class="ken-pad" :style="{ '--n': size }" aria-label="數字鍵">
          <button
            v-for="n in size"
            :key="n"
            class="ken-pad__key"
            :disabled="selected === null || won"
            @click="setCell(n)"
          >
            {{ n }}
          </button>
          <button class="ken-pad__key is-clear" :disabled="selected === null || won" @click="clearCell">清除</button>
        </div>
      </div>

      <aside class="panel">
        <div v-if="!props.daily" class="panel__group">
          <span class="panel__legend">難度</span>
          <div class="seg">
            <button
              v-for="d in KENKEN_DIFFICULTIES"
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
            每行、每列都要填入 1 到 {{ size }}，且不能重複。每個粗框區塊必須用左上角的目標和運算符算出答案。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">提示</span>
          <p class="hint">
            紅框代表目前行列重複，或完整區塊的運算結果不符。專家難度會有更大的盤面與更多多格區塊。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.ken-grid {
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
  width: min(88vw, 66vh, 560px);
  aspect-ratio: 1;
  padding: 6px;
  gap: 3px;
  border-radius: var(--r-lg);
  background: var(--ink-950);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
}
.ken-cell {
  position: relative;
  min-width: 0;
  border-radius: 8px;
  border: 1px solid color-mix(in oklab, var(--accent) 28%, var(--line));
  background: linear-gradient(180deg, var(--ink-800), var(--ink-900));
  color: var(--text);
  cursor: pointer;
  transition: transform var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
.ken-cell:hover,
.ken-cell:focus-visible {
  border-color: var(--accent);
  box-shadow: var(--glow-sm);
}
.ken-cell.is-selected {
  transform: translateY(-1px);
  border-color: var(--accent);
  box-shadow: var(--glow-md);
}
.ken-cell.is-error {
  border-color: #ff5d6c;
  box-shadow: 0 0 0 1px rgba(255, 93, 108, 0.35);
}
.ken-cage {
  position: absolute;
  top: 0.25rem;
  left: 0.32rem;
  font-family: var(--font-mono);
  font-size: clamp(0.54rem, 1.6vw, 0.78rem);
  color: var(--accent);
}
.ken-value {
  display: grid;
  place-items: center;
  height: 100%;
  font-family: var(--font-display);
  font-size: clamp(1.2rem, calc(7vw / var(--n)), 2.1rem);
  font-weight: 800;
}
.ken-pad {
  display: grid;
  grid-template-columns: repeat(var(--n), minmax(44px, 1fr));
  gap: 0.5rem;
  width: min(88vw, 560px);
}
.ken-pad__key {
  min-height: 46px;
  border-radius: var(--r-sm);
  background: var(--ink-800);
  border: 1px solid var(--line);
  color: var(--text);
  font-family: var(--font-display);
  font-weight: 800;
  cursor: pointer;
}
.ken-pad__key:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.ken-pad__key.is-clear {
  grid-column: 1 / -1;
}
@media (max-width: 560px) {
  .ken-grid {
    width: min(94vw, 560px);
  }
  .ken-pad {
    width: min(94vw, 560px);
  }
}
</style>
