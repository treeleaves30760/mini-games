<script setup>
/* 倒水 Water Sort — tap a tube to pick it up, tap another to pour.
   Only the top colour pours, onto the same colour or into an empty tube.
   Done when every non-empty tube is four units of one colour. */

import {
  CAPACITY,
  DIFFICULTIES,
  canPour,
  pour,
  isSolved,
  isComplete,
  generatePuzzle,
} from "~/games/water-sort";

const accent = "#4ecdc4";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// Muted, distinguishable liquid colours; index = colour id.
const PALETTE = [
  "#c76b62",
  "#d99a52",
  "#a3b85c",
  "#5fa877",
  "#5b9bd5",
  "#8b7fd1",
  "#d07aa8",
  "#e6dcc2",
];
const KEYS = "1234567890";

const diffIdx = ref(1); // 普通
const colors = computed(() => (props.daily ? DIFFICULTIES[1].colors : DIFFICULTIES[diffIdx.value].colors));

const tubes = ref([]);
const start = ref([]);
const history = ref([]); // previous states, oldest first
const selected = ref(-1);
const won = ref(false);

const moves = computed(() => history.value.length);

function initGame(seed) {
  const rng = makeRng(seed);
  start.value = generatePuzzle(rng, { colors: colors.value });
  tubes.value = start.value.map((t) => [...t]);
  history.value = [];
  selected.value = -1;
  won.value = false;
}

function newPuzzle() {
  initGame(props.daily ? props.seed : null);
}

function restart() {
  tubes.value = start.value.map((t) => [...t]);
  history.value = [];
  selected.value = -1;
  won.value = false;
}

function setDiff(i) {
  diffIdx.value = i;
  initGame(props.seed);
}

function clickTube(i) {
  if (won.value) return;
  const s = tubes.value;
  if (selected.value === -1) {
    if (s[i].length === 0) return;
    selected.value = i;
    return;
  }
  if (selected.value === i) {
    selected.value = -1;
    return;
  }
  if (canPour(s, selected.value, i)) {
    history.value = [...history.value, s];
    tubes.value = pour(s, selected.value, i);
    selected.value = -1;
    checkWin();
    return;
  }
  // Not pourable: switch the selection to the tapped tube if it has liquid.
  selected.value = s[i].length === 0 ? -1 : i;
}

function undo() {
  if (won.value || history.value.length === 0) return;
  const prev = history.value[history.value.length - 1];
  history.value = history.value.slice(0, -1);
  tubes.value = prev;
  selected.value = -1;
}

function checkWin() {
  if (isSolved(tubes.value)) {
    won.value = true;
    emit("solved", { moves: moves.value });
  }
}

function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "Escape") {
    selected.value = -1;
    return;
  }
  const k = KEYS.indexOf(e.key);
  if (k === -1 || k >= tubes.value.length) return;
  e.preventDefault();
  clickTube(k);
}

function tubeLabel(i) {
  const t = tubes.value[i];
  const n = t.length;
  return `試管 ${i + 1}，${n === 0 ? "空" : `${n} 格`}${isComplete(t) ? "，已完成" : ""}`;
}

watch(() => props.seed, () => initGame(props.seed));

onMounted(() => {
  initGame(props.seed);
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="倒水" title-en="Water Sort">
      <template #actions>
        <button class="btn btn--accent" @click="newPuzzle">{{ daily ? "重來" : "新題目" }}</button>
        <button v-if="!daily" class="btn" aria-label="重來這一題" @click="restart">重來</button>
        <button class="btn" aria-label="復原上一步" :disabled="moves === 0 || won" @click="undo">復原</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">步數</span>
            <span class="chip__value is-accent">{{ moves }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">顏色</span>
            <span class="chip__value">{{ colors }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div class="ws-board" aria-label="倒水盤面">
            <button
              v-for="(tube, i) in tubes"
              :key="i"
              class="ws-tube"
              :class="{ 'is-selected': selected === i, 'is-done': isComplete(tube) }"
              :aria-label="tubeLabel(i)"
              :aria-pressed="selected === i"
              :tabindex="won ? -1 : 0"
              @click="clickTube(i)"
            >
              <span class="ws-glass">
                <span
                  v-for="(c, j) in tube"
                  :key="j"
                  class="ws-unit"
                  :style="{ background: PALETTE[c] }"
                />
              </span>
              <span class="ws-key" aria-hidden="true">{{ KEYS[i] }}</span>
            </button>
          </div>

          <div class="overlay" :class="{ 'is-open': won }">
            <div class="overlay__card">
              <h2 class="overlay__title">完成</h2>
              <p class="overlay__sub">共 {{ moves }} 步。</p>
              <div class="overlay__actions">
                <button v-if="!daily" class="btn btn--accent" @click="newPuzzle">再玩一次</button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!daily" class="diff-bar">
          <div class="seg">
            <button
              v-for="(d, i) in DIFFICULTIES"
              :key="i"
              :class="{ 'is-active': diffIdx === i }"
              :aria-pressed="diffIdx === i"
              @click="setDiff(i)"
            >{{ d.label }}</button>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            點一支試管拿起，再點另一支倒入。<br />
            只有最上層的顏色會倒出，只能倒進空試管或同色的液面，裝滿為止。<br />
            每支試管都裝滿 {{ CAPACITY }} 格同色即完成。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">操作</span>
          <p class="hint">
            數字鍵 <kbd>1</kbd>–<kbd>9</kbd>、<kbd>0</kbd> 選第 1 到 10 支試管。<br />
            <kbd>Esc</kbd> 放下。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.ws-board {
  --tube-w: 44px;
  --tube-h: 156px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-content: center;
  gap: 18px 10px;
  width: min(92vw, 560px);
  min-height: min(60vh, 420px);
  padding: 28px 12px 20px;
  border-radius: var(--r-lg);
  background: var(--ink-900);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  touch-action: manipulation;
}

.ws-tube {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 4px 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  border-radius: var(--r-md);
  transition: transform var(--dur-fast) var(--ease);
}
.ws-tube:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.ws-tube.is-selected {
  transform: translateY(-8px);
}
.ws-tube:disabled {
  cursor: default;
}

.ws-glass {
  display: flex;
  flex-direction: column-reverse;
  justify-content: flex-start;
  gap: 2px;
  width: var(--tube-w);
  height: var(--tube-h);
  padding: 3px;
  box-sizing: border-box;
  background: var(--ink-800);
  border: 2px solid var(--line-strong);
  border-radius: 6px 6px 22px 22px;
  transition: border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
.ws-tube:hover .ws-glass {
  border-color: color-mix(in oklab, var(--accent) 45%, var(--line-strong));
}
.ws-tube.is-selected .ws-glass {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 30%, transparent);
}
.ws-tube.is-done .ws-glass {
  border-color: color-mix(in oklab, var(--accent) 60%, var(--line-strong));
}

.ws-unit {
  flex: 0 0 auto;
  width: 100%;
  height: calc((var(--tube-h) - 4px - 6px - 6px) / 4);
  border-radius: 3px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
.ws-unit:first-child {
  border-radius: 3px 3px 17px 17px;
}

.ws-key {
  font-size: 0.72rem;
  color: var(--text-faint);
  line-height: 1;
}
.ws-tube.is-selected .ws-key {
  color: var(--accent);
}

.diff-bar {
  width: min(92vw, 560px);
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}

@media (prefers-reduced-motion: reduce) {
  .ws-tube,
  .ws-glass {
    transition: none;
  }
}
</style>
