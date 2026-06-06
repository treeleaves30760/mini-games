<script setup>
import {
  EQUATION_MAZE_DIFFICULTIES,
  evaluateTokens,
  formatRat,
  generateEquationMazePuzzle,
  isEquationMazeSolved,
  isValidMazeSelection,
  selectedTokens,
} from "~/games/equation-maze";

const accent = "#f59e0b";

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
const showPath = ref(false);
const overlay = reactive({ open: false, title: "", sub: "" });

const currentTokens = computed(() => (puzzle.value ? selectedTokens(puzzle.value, selected.value) : []));
const currentValue = computed(() => evaluateTokens(currentTokens.value));
const validSelection = computed(() => (puzzle.value ? isValidMazeSelection(puzzle.value, selected.value) : false));
const mazeFontSize = computed(() => {
  const n = puzzle.value?.size ?? 6;
  if (n <= 5) return "2.25rem";
  if (n === 6) return "2rem";
  if (n === 7) return "1.7rem";
  return "1.5rem";
});

function rng() {
  return makeRng(props.seed == null ? null : `${props.seed}:equation-maze:${effectiveDifficulty.value}`);
}

function generate() {
  puzzle.value = generateEquationMazePuzzle(rng(), effectiveDifficulty.value);
  selected.value = [];
  won.value = false;
  showPath.value = false;
  overlay.open = false;
}

watch(() => props.seed, generate);
watch(effectiveDifficulty, generate);

function canTap(index) {
  if (!puzzle.value || won.value) return false;
  const cell = puzzle.value.cells[index];
  if (!selected.value.length) return cell.kind === "number";
  const last = selected.value[selected.value.length - 1];
  if (last === index) return true;
  if (selected.value.includes(index)) return false;
  const expected = selected.value.length % 2 === 0 ? "number" : "op";
  const lr = Math.floor(last / puzzle.value.size);
  const lc = last % puzzle.value.size;
  const r = Math.floor(index / puzzle.value.size);
  const c = index % puzzle.value.size;
  return cell.kind === expected && Math.abs(lr - r) + Math.abs(lc - c) === 1;
}

function tapCell(index) {
  if (!canTap(index)) return;
  if (selected.value[selected.value.length - 1] === index) {
    selected.value = selected.value.slice(0, -1);
    return;
  }
  selected.value = [...selected.value, index];
  checkWin();
}

function undo() {
  selected.value = selected.value.slice(0, -1);
}

function resetPath() {
  selected.value = [];
}

function checkWin() {
  nextTick(() => {
    if (!puzzle.value || !isEquationMazeSolved(puzzle.value, selected.value)) return;
    won.value = true;
    overlay.title = "路徑成立！";
    overlay.sub = `${currentTokens.value.join(" ")} = ${formatRat(puzzle.value.target)}`;
    overlay.open = true;
    emit("solved", {});
  });
}

onMounted(generate);
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="等式迷宮" title-en="Equation Maze">
      <template #actions>
        <button class="btn" :disabled="selected.length === 0 || won" @click="undo">退一步</button>
        <button class="btn btn--accent" @click="generate">新迷宮</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">目標</span>
            <span class="chip__value is-accent">{{ formatRat(puzzle?.target || null) }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">目前</span>
            <span class="chip__value">{{ formatRat(currentValue) }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">長度</span>
            <span class="chip__value">{{ selected.length }}/{{ puzzle?.expression.length || 0 }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div
            v-if="puzzle"
            class="maze-grid"
            :style="{ '--n': puzzle.size, '--maze-font': mazeFontSize }"
            role="grid"
            :aria-label="`${puzzle.size}×${puzzle.size} 等式迷宮`"
          >
            <button
              v-for="(cell, i) in puzzle.cells"
              :key="i"
              class="maze-cell"
              :class="{
                'is-op': cell.kind === 'op',
                'is-selected': selected.includes(i),
                'is-last': selected[selected.length - 1] === i,
                'is-hint': showPath && cell.onSolution,
              }"
              :disabled="!canTap(i)"
              @click="tapCell(i)"
            >
              {{ cell.token }}
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

        <div class="equation-readout" :class="{ 'is-invalid': selected.length > 0 && !validSelection }">
          {{ currentTokens.length ? currentTokens.join(" ") : "選一個數字開始" }}
        </div>
      </div>

      <aside class="panel">
        <div v-if="!props.daily" class="panel__group">
          <span class="panel__legend">難度</span>
          <div class="seg">
            <button
              v-for="d in EQUATION_MAZE_DIFFICULTIES"
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
            從任一數字格開始，沿相鄰格走出「數字、符號、數字」交錯的路徑。算出的結果必須等於目標。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">工具</span>
          <button class="btn" @click="resetPath">清空路徑</button>
          <button v-if="!props.daily" class="btn" @click="showPath = !showPath">{{ showPath ? "隱藏提示" : "顯示提示" }}</button>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.maze-grid {
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
  grid-template-rows: repeat(var(--n), minmax(0, 1fr));
  width: min(88vw, 66vh, 560px);
  aspect-ratio: 1;
  gap: 0.35rem;
  padding: 0.55rem;
  border-radius: var(--r-lg);
  background: var(--ink-950);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
}
.maze-cell {
  min-width: 0;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 10px;
  background: linear-gradient(180deg, var(--ink-800), var(--ink-900));
  border: 1px solid var(--line);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--maze-font);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  letter-spacing: 0;
  overflow: hidden;
  cursor: pointer;
}
.maze-cell:disabled {
  cursor: default;
  opacity: 0.72;
}
.maze-cell.is-op {
  color: var(--accent);
}
.maze-cell.is-selected {
  border-color: var(--accent);
  background: color-mix(in oklab, var(--accent) 22%, var(--ink-850));
  box-shadow: var(--glow-sm);
  opacity: 1;
}
.maze-cell.is-last {
  transform: translateY(-1px);
  box-shadow: var(--glow-md);
}
.maze-cell.is-hint:not(.is-selected) {
  border-color: color-mix(in oklab, var(--accent) 65%, var(--line));
}
.equation-readout {
  width: min(88vw, 560px);
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.8rem 1rem;
  border-radius: var(--r-md);
  border: 1px solid var(--line);
  background: var(--ink-900);
  color: var(--text-dim);
  font-family: var(--font-mono);
  text-align: center;
}
.equation-readout.is-invalid {
  border-color: #ff5d6c;
}
@media (max-width: 560px) {
  .maze-grid {
    width: min(94vw, 560px);
    gap: 0.28rem;
  }
  .maze-cell {
    font-size: min(var(--maze-font), 1.35rem);
  }
}
</style>
