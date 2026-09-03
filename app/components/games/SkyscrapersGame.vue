<script setup>
/* 摩天樓 Skyscrapers — Latin square of building heights; the clue outside a
   line is how many buildings are visible from that side. */

import {
  SKYSCRAPERS_SIZES,
  clueStates as _clueStates,
  duplicateCells as _duplicateCells,
  generatePuzzle,
  isSolved,
} from "~/games/skyscrapers";

const accent = "#a78bfa";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const DIFFICULTIES = SKYSCRAPERS_SIZES;
const diffIdx = ref(1); // 普通 5×5
const size = computed(() => (props.daily ? 5 : DIFFICULTIES[diffIdx.value].size));

const puzzle = ref(null);
const cells = ref([]); // flat, 0 = empty
const selected = ref(null);
const won = ref(false);

const remaining = computed(() => cells.value.filter((v) => !v).length);
const dup = computed(() => (puzzle.value ? _duplicateCells(cells.value, size.value) : []));
const states = computed(() =>
  puzzle.value ? _clueStates(cells.value, puzzle.value.clues, size.value) : null,
);
const boardStyle = computed(() => ({
  "--n": size.value,
  "--sky-font": size.value <= 4 ? "1.9rem" : size.value === 5 ? "1.65rem" : "1.4rem",
  "--sky-clue-font": size.value <= 4 ? "1.05rem" : "0.95rem",
}));

function rngFor(fresh) {
  if (fresh && !props.daily) return makeRng(null);
  return makeRng(props.seed == null ? null : `${props.seed}:skyscrapers:${size.value}`);
}

function generate(fresh = false) {
  const p = generatePuzzle(rngFor(fresh), size.value);
  puzzle.value = p;
  cells.value = p.givens.slice();
  selected.value = null;
  won.value = false;
}

function newPuzzle() {
  generate(true);
}

function clearBoard() {
  if (!puzzle.value) return;
  cells.value = puzzle.value.givens.slice();
  won.value = false;
}

function setDiff(i) {
  diffIdx.value = i;
  generate();
}

function isGiven(i) {
  return !!puzzle.value?.givens[i];
}

function clueText(side, i) {
  const clue = puzzle.value?.clues[side][i];
  return clue ? String(clue) : "";
}

function clueClass(side, i) {
  const s = states.value?.[side][i];
  return { "is-ok": s === "ok", "is-bad": s === "bad" };
}

function setCell(value) {
  const i = selected.value;
  if (won.value || i === null || isGiven(i)) return;
  const next = cells.value.slice();
  next[i] = value;
  cells.value = next;
  checkWin();
}

function checkWin() {
  if (won.value || !puzzle.value) return;
  if (!isSolved(cells.value, puzzle.value.clues, size.value)) return;
  won.value = true;
  selected.value = null;
  emit("solved", {});
}

function move(dr, dc) {
  const N = size.value;
  if (selected.value === null) {
    selected.value = 0;
    return;
  }
  const r = (Math.floor(selected.value / N) + dr + N) % N;
  const c = ((selected.value % N) + dc + N) % N;
  selected.value = r * N + c;
}

function onKeydown(e) {
  const tag = e.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.key === "ArrowUp") { e.preventDefault(); move(-1, 0); }
  else if (e.key === "ArrowDown") { e.preventDefault(); move(1, 0); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); move(0, -1); }
  else if (e.key === "ArrowRight") { e.preventDefault(); move(0, 1); }
  else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") { e.preventDefault(); setCell(0); }
  else if (/^[1-9]$/.test(e.key) && Number(e.key) <= size.value) setCell(Number(e.key));
}

watch(() => props.seed, () => generate());

onMounted(() => {
  generate();
  window.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="摩天樓" title-en="Skyscrapers">
      <template #actions>
        <button class="btn btn--accent" @click="newPuzzle">{{ daily ? "重來" : "新題目" }}</button>
        <button class="btn" aria-label="清除填入的數字" @click="clearBoard">清除</button>
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
        </div>

        <div class="board-wrap">
          <div v-if="puzzle" class="sky-board" :style="boardStyle" role="grid" :aria-label="`${size}×${size} 摩天樓`">
            <div class="sky-corner"></div>
            <div
              v-for="c in size"
              :key="'t' + c"
              class="sky-clue"
              :class="clueClass('top', c - 1)"
            >{{ clueText('top', c - 1) }}</div>
            <div class="sky-corner"></div>

            <template v-for="r in size" :key="'r' + r">
              <div class="sky-clue" :class="clueClass('left', r - 1)">{{ clueText('left', r - 1) }}</div>
              <button
                v-for="c in size"
                :key="'c' + r + '-' + c"
                class="sky-cell"
                :class="{
                  'is-given': isGiven((r - 1) * size + (c - 1)),
                  'is-selected': selected === (r - 1) * size + (c - 1),
                  'is-dup': dup[(r - 1) * size + (c - 1)],
                }"
                :aria-label="`第 ${r} 行第 ${c} 列${cells[(r - 1) * size + (c - 1)] ? '，' + cells[(r - 1) * size + (c - 1)] : ''}`"
                :aria-pressed="selected === (r - 1) * size + (c - 1)"
                @click="selected = (r - 1) * size + (c - 1)"
              >{{ cells[(r - 1) * size + (c - 1)] || "" }}</button>
              <div class="sky-clue" :class="clueClass('right', r - 1)">{{ clueText('right', r - 1) }}</div>
            </template>

            <div class="sky-corner"></div>
            <div
              v-for="c in size"
              :key="'b' + c"
              class="sky-clue"
              :class="clueClass('bottom', c - 1)"
            >{{ clueText('bottom', c - 1) }}</div>
            <div class="sky-corner"></div>
          </div>

          <div class="overlay" :class="{ 'is-open': won }">
            <div class="overlay__card">
              <h2 class="overlay__title">完成</h2>
              <p class="overlay__sub">{{ size }}×{{ size }} 摩天樓已解開。</p>
              <div class="overlay__actions">
                <button v-if="!daily" class="btn btn--accent" @click="newPuzzle">再玩一次</button>
              </div>
            </div>
          </div>
        </div>

        <div class="sky-pad" :style="{ '--n': size }" aria-label="數字鍵">
          <button
            v-for="n in size"
            :key="n"
            class="sky-pad__key"
            :aria-label="`填入 ${n}`"
            :disabled="selected === null || won || isGiven(selected)"
            @click="setCell(n)"
          >{{ n }}</button>
          <button
            class="sky-pad__key is-clear"
            aria-label="清除此格"
            :disabled="selected === null || won || isGiven(selected)"
            @click="setCell(0)"
          >清除</button>
        </div>

        <div v-if="!daily" class="diff-bar">
          <div class="seg">
            <button
              v-for="(d, i) in DIFFICULTIES"
              :key="i"
              :class="{ 'is-active': diffIdx === i }"
              :aria-pressed="diffIdx === i"
              @click="setDiff(i)"
            >{{ d.label }} {{ d.size }}×{{ d.size }}</button>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            每格填入 1 到 {{ size }}，代表大樓高度，每行每列不重複。<br />
            外圍數字是從那一側望進去能看見的大樓數，高樓會遮住後面的矮樓。<br />
            沒有數字的邊沒有限制。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">操作</span>
          <p class="hint">
            點選格子後按下方數字或鍵盤數字鍵填入。<br />
            <kbd>Backspace</kbd> 清除，方向鍵移動。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.sky-board {
  display: grid;
  grid-template-columns: 0.55fr repeat(var(--n), 1fr) 0.55fr;
  grid-template-rows: 0.55fr repeat(var(--n), 1fr) 0.55fr;
  gap: 4px;
  width: min(88vw, 64vh, 520px);
  aspect-ratio: 1;
  padding: 10px;
  border-radius: var(--r-lg);
  background: var(--ink-900);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  user-select: none;
}

.sky-corner {
  min-width: 0;
  min-height: 0;
}

.sky-clue {
  min-width: 0;
  min-height: 0;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: var(--sky-clue-font);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: var(--text-dim);
  transition: color var(--dur-fast) var(--ease);
}
.sky-clue.is-ok {
  color: var(--text);
}
.sky-clue.is-bad {
  color: #e07070;
}

.sky-cell {
  min-width: 0;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: var(--r-sm);
  border: 1px solid var(--line);
  background: var(--ink-800);
  color: var(--accent);
  font-family: var(--font-display);
  font-size: var(--sky-font);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease);
}
.sky-cell:hover {
  background: var(--ink-700);
  border-color: var(--line-strong);
}
.sky-cell:focus-visible {
  outline: none;
  border-color: var(--accent);
}
.sky-cell.is-given {
  color: var(--text);
  font-weight: 800;
  background: var(--ink-850);
  cursor: default;
}
.sky-cell.is-selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 55%, transparent);
  background: color-mix(in oklab, var(--accent) 12%, var(--ink-800));
}
.sky-cell.is-dup {
  color: #e07070;
  border-color: color-mix(in oklab, #e07070 55%, var(--line));
  background: color-mix(in oklab, #e07070 10%, var(--ink-800));
}
.sky-cell.is-dup.is-given {
  color: var(--text);
}

.sky-pad {
  display: grid;
  grid-template-columns: repeat(var(--n), minmax(44px, 1fr));
  gap: 0.5rem;
  width: min(88vw, 64vh, 520px);
}
.sky-pad__key {
  min-height: 44px;
  border-radius: var(--r-sm);
  background: var(--ink-800);
  border: 1px solid var(--line);
  color: var(--text);
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}
.sky-pad__key:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.sky-pad__key:disabled {
  opacity: 0.45;
  cursor: default;
}
.sky-pad__key.is-clear {
  grid-column: 1 / -1;
}

.diff-bar {
  width: min(88vw, 64vh, 520px);
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}

@media (max-width: 560px) {
  .sky-board,
  .sky-pad,
  .diff-bar {
    width: min(94vw, 520px);
  }
  .sky-cell {
    font-size: min(var(--sky-font), 1.3rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sky-cell,
  .sky-clue,
  .sky-pad__key {
    transition: none;
  }
}
</style>
