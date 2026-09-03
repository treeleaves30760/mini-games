<script setup>
import {
  KENKEN_DIFFICULTIES,
  cageEdges,
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
const kenGridStyle = computed(() => {
  const n = size.value;
  return {
    "--n": n,
    "--ken-value-font": n <= 4 ? "2.1rem" : n === 5 ? "1.9rem" : n === 6 ? "1.65rem" : "1.42rem",
    "--ken-cage-font": n <= 4 ? "0.78rem" : n === 5 ? "0.72rem" : n === 6 ? "0.66rem" : "0.58rem",
  };
});
// Cage outlines: which sides of each cell border another cage (or the grid edge).
const edges = computed(() => {
  const p = puzzle.value;
  if (!p) return [];
  return Array.from({ length: p.size * p.size }, (_, i) => cageEdges(p, i));
});

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
  overlay.title = "完成";
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
        <button class="btn btn--accent" @click="generate">{{ daily ? "重來" : "新題目" }}</button>
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
          <div v-if="puzzle" class="ken-grid" :style="kenGridStyle" role="grid" :aria-label="`${size}×${size} 算術數獨`">
            <button
              v-for="(_, i) in cells"
              :key="i"
              class="ken-cell"
              :class="{
                'is-selected': selected === i,
                'is-error': cellError(i),
                'is-edge-top': edges[i]?.top,
                'is-edge-right': edges[i]?.right,
                'is-edge-bottom': edges[i]?.bottom,
                'is-edge-left': edges[i]?.left,
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
          <span class="panel__legend">玩法</span>
          <p class="hint">
            每行每列都要填入 1 到 {{ size }}，不能重複。<br />
            每個粗框區塊要用運算符算出左上角的目標數。<br />
            紅框代表目前重複或區塊結果不符。
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
  grid-template-rows: repeat(var(--n), minmax(0, 1fr));
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
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 8px;
  border: 1px solid color-mix(in oklab, var(--accent) 28%, var(--line));
  background: linear-gradient(180deg, var(--ink-800), var(--ink-900));
  color: var(--text);
  line-height: 1;
  overflow: hidden;
  cursor: pointer;
  transition: transform var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
/* Cage outline: thick accent edges wherever a cell borders another cage or the grid. */
.ken-cell.is-edge-top {
  border-top-width: 3px;
  border-top-color: var(--accent);
}
.ken-cell.is-edge-right {
  border-right-width: 3px;
  border-right-color: var(--accent);
}
.ken-cell.is-edge-bottom {
  border-bottom-width: 3px;
  border-bottom-color: var(--accent);
}
.ken-cell.is-edge-left {
  border-left-width: 3px;
  border-left-color: var(--accent);
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
  max-width: calc(100% - 0.64rem);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: var(--ken-cage-font);
  line-height: 1;
  color: var(--accent);
}
.ken-value {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  font-family: var(--font-display);
  font-size: var(--ken-value-font);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  letter-spacing: 0;
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
.guide-list {
  display: grid;
  gap: 0.55rem;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: guide;
}
.guide-list li {
  counter-increment: guide;
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 0.6rem;
  align-items: start;
  color: var(--text-dim);
  font-size: 0.92rem;
  line-height: 1.55;
}
.guide-list li::before {
  content: counter(guide);
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: color-mix(in oklab, var(--accent) 20%, var(--ink-900));
  border: 1px solid color-mix(in oklab, var(--accent) 40%, var(--line));
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 900;
  line-height: 1;
}
@media (max-width: 560px) {
  .ken-grid {
    width: min(94vw, 560px);
  }
  .ken-value {
    font-size: min(var(--ken-value-font), 1.35rem);
  }
  .ken-cage {
    font-size: min(var(--ken-cage-font), 0.58rem);
  }
  .ken-pad {
    width: min(94vw, 560px);
  }
}
</style>
