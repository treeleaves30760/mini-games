<script setup>
/* 數字開關 Rullo — switch cells off until every row and column of active
   cells sums to the target shown at its edge. Long-press / right-click marks
   a cell as kept. Pure logic lives in app/games/rullo.ts. */

import {
  LEVELS,
  generatePuzzle as _generatePuzzle,
  sums as _sums,
  isSolved as _isSolved,
  toggle as _toggle,
} from "~/games/rullo";

const accent = "#e8a33d";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const DIFFICULTIES = LEVELS;
const DAILY_LEVEL = 1; // 普通 6×6
const diffIdx = ref(1);
const level = computed(() => DIFFICULTIES[props.daily ? DAILY_LEVEL : diffIdx.value]);
const N = computed(() => level.value.size);

const values = ref([]);
const rowTargets = ref([]);
const colTargets = ref([]);
const active = ref([]);
const locked = ref([]);
const moves = ref(0);
const won = ref(false);
const focusIdx = ref(0);

const lineSums = computed(() => _sums(values.value, active.value, N.value));
const doneLines = computed(() => {
  let n = 0;
  for (let i = 0; i < N.value; i++) {
    if (lineSums.value.rows[i] === rowTargets.value[i]) n++;
    if (lineSums.value.cols[i] === colTargets.value[i]) n++;
  }
  return n;
});

function initGame(seedOverride) {
  const rng = makeRng(seedOverride !== undefined ? seedOverride : props.seed);
  const { values: v, rowTargets: rt, colTargets: ct } = _generatePuzzle(
    rng,
    level.value.size,
    level.value.maxValue,
  );
  values.value = v;
  rowTargets.value = rt;
  colTargets.value = ct;
  resetBoard();
}

function resetBoard() {
  active.value = new Array(N.value * N.value).fill(true);
  locked.value = new Array(N.value * N.value).fill(false);
  moves.value = 0;
  won.value = false;
  focusIdx.value = 0;
}

function newPuzzle() {
  initGame(null);
}

function setDiff(i) {
  diffIdx.value = i;
  initGame(props.seed);
}

function checkWin() {
  if (_isSolved(values.value, active.value, rowTargets.value, colTargets.value, N.value)) {
    won.value = true;
    emit("solved", { moves: moves.value });
  }
}

function toggleCell(i) {
  if (won.value || locked.value[i]) return;
  active.value = _toggle(active.value, i);
  moves.value++;
  checkWin();
}

function toggleLock(i) {
  if (won.value) return;
  const next = [...locked.value];
  next[i] = !next[i];
  locked.value = next;
}

// ---- Pointer input: tap toggles, long-press locks ----
const LONG_PRESS_MS = 450;
let pressTimer = null;
let pressIdx = -1;
let longPressed = false;

function clearPress() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  pressIdx = -1;
}

function onPointerDown(e, i) {
  if (e.button !== 0) return;
  e.preventDefault();
  focusIdx.value = i;
  longPressed = false;
  pressIdx = i;
  pressTimer = setTimeout(() => {
    longPressed = true;
    pressTimer = null;
    toggleLock(i);
  }, LONG_PRESS_MS);
}

function onPointerUp(e, i) {
  if (pressIdx !== i) { clearPress(); return; }
  const wasLong = longPressed;
  clearPress();
  if (!wasLong) toggleCell(i);
}

function onContextMenu(e, i) {
  e.preventDefault();
  clearPress();
  toggleLock(i);
}

// ---- Keyboard ----
function onKeydown(e) {
  const n = N.value;
  let i = focusIdx.value;
  switch (e.key) {
    case "ArrowLeft": i = i % n > 0 ? i - 1 : i; break;
    case "ArrowRight": i = i % n < n - 1 ? i + 1 : i; break;
    case "ArrowUp": i = i - n >= 0 ? i - n : i; break;
    case "ArrowDown": i = i + n < n * n ? i + n : i; break;
    case " ":
    case "Enter":
      e.preventDefault();
      toggleCell(i);
      return;
    case "l":
    case "L":
      e.preventDefault();
      toggleLock(i);
      return;
    default:
      return;
  }
  e.preventDefault();
  focusIdx.value = i;
  const el = e.currentTarget.querySelector(`[data-idx="${i}"]`);
  if (el) el.focus();
}

watch(() => props.seed, () => initGame());
onMounted(() => { initGame(); });
onBeforeUnmount(() => { clearPress(); });
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="數字開關" title-en="Rullo">
      <template #actions>
        <button v-if="!daily" class="btn btn--accent" @click="newPuzzle">新題目</button>
        <button :class="['btn', { 'btn--accent': daily }]" @click="resetBoard">重來</button>
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
            <span class="chip__label">完成列數</span>
            <span class="chip__value">{{ doneLines }} / {{ N * 2 }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div
            class="ru-board"
            :style="{ '--n': N }"
            role="grid"
            aria-label="數字開關盤面"
            @keydown="onKeydown"
            @contextmenu.prevent
          >
            <template v-for="r in N" :key="'r' + r">
              <button
                v-for="c in N"
                :key="'c' + c"
                class="ru-cell"
                :class="{
                  'is-off': !active[(r - 1) * N + (c - 1)],
                  'is-locked': locked[(r - 1) * N + (c - 1)],
                }"
                :data-idx="(r - 1) * N + (c - 1)"
                :tabindex="focusIdx === (r - 1) * N + (c - 1) ? 0 : -1"
                :aria-pressed="active[(r - 1) * N + (c - 1)]"
                :aria-label="`第${r}行第${c}列 ${values[(r - 1) * N + (c - 1)]}${active[(r - 1) * N + (c - 1)] ? '' : ' 已關'}${locked[(r - 1) * N + (c - 1)] ? ' 已鎖定' : ''}`"
                @pointerdown="onPointerDown($event, (r - 1) * N + (c - 1))"
                @pointerup="onPointerUp($event, (r - 1) * N + (c - 1))"
                @pointercancel="clearPress"
                @pointerleave="clearPress"
                @contextmenu="onContextMenu($event, (r - 1) * N + (c - 1))"
                @focus="focusIdx = (r - 1) * N + (c - 1)"
              >
                <span class="ru-num">{{ values[(r - 1) * N + (c - 1)] }}</span>
                <span v-if="locked[(r - 1) * N + (c - 1)]" class="ru-dot" aria-hidden="true"></span>
              </button>

              <div
                class="ru-target ru-target--row"
                :class="{ 'is-ok': lineSums.rows[r - 1] === rowTargets[r - 1] }"
                :aria-label="`第${r}行目標 ${rowTargets[r - 1]}，目前 ${lineSums.rows[r - 1]}`"
              >
                <span class="ru-target__goal">{{ rowTargets[r - 1] }}</span>
                <span class="ru-target__now">{{ lineSums.rows[r - 1] }}</span>
              </div>
            </template>

            <div
              v-for="c in N"
              :key="'t' + c"
              class="ru-target ru-target--col"
              :class="{ 'is-ok': lineSums.cols[c - 1] === colTargets[c - 1] }"
              :aria-label="`第${c}列目標 ${colTargets[c - 1]}，目前 ${lineSums.cols[c - 1]}`"
            >
              <span class="ru-target__goal">{{ colTargets[c - 1] }}</span>
              <span class="ru-target__now">{{ lineSums.cols[c - 1] }}</span>
            </div>
            <div class="ru-corner" aria-hidden="true"></div>
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
            >{{ d.label }} {{ d.size }}×{{ d.size }}</button>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            點一格把它關掉，關掉的數字不再計入。<br />
            每行每列剩下的數字總和要等於邊上的目標。<br />
            全部符合即完成。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">操作</span>
          <p class="hint">
            長按或右鍵：標記為保留，不會被關掉<br />
            <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> 移動、<kbd>Space</kbd> 切換、<kbd>L</kbd> 保留
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.ru-board {
  --gap: 6px;
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr) 1fr;
  grid-template-rows: repeat(var(--n), 1fr) 1fr;
  gap: var(--gap);
  width: min(86vw, 62vh, 500px);
  aspect-ratio: 1;
  padding: 12px;
  border-radius: var(--r-lg);
  background: var(--ink-900);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  container-type: inline-size;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.ru-cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  border-radius: var(--r-sm);
  background: var(--ink-700);
  border: 1px solid var(--line);
  color: var(--text);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: calc(34cqw / (var(--n) + 1));
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    transform var(--dur-fast) var(--ease);
}
.ru-cell:hover {
  border-color: var(--line-strong);
}
.ru-cell:active {
  transform: scale(0.94);
}
.ru-cell:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.ru-cell.is-off {
  background: var(--ink-850);
  border-color: transparent;
  color: var(--text-faint);
}
.ru-cell.is-off .ru-num {
  text-decoration: line-through;
  text-decoration-thickness: 2px;
  opacity: 0.75;
}

.ru-dot {
  position: absolute;
  top: 12%;
  right: 12%;
  width: max(5px, calc(6cqw / (var(--n) + 1)));
  height: max(5px, calc(6cqw / (var(--n) + 1)));
  border-radius: 50%;
  background: var(--accent);
}

.ru-target {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  transition: color var(--dur-fast) var(--ease);
}
.ru-target--row {
  border-left: 1px solid var(--line);
}
.ru-target--col {
  border-top: 1px solid var(--line);
}
.ru-target__goal {
  font-size: calc(30cqw / (var(--n) + 1));
  font-weight: 700;
}
.ru-target__now {
  font-size: calc(16cqw / (var(--n) + 1));
  color: var(--text-faint);
}
.ru-target.is-ok {
  color: var(--accent);
}
.ru-target.is-ok .ru-target__now {
  visibility: hidden;
}

.ru-corner {
  border-left: 1px solid var(--line);
  border-top: 1px solid var(--line);
}

.diff-bar {
  width: min(86vw, 62vh, 500px);
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}

@media (prefers-reduced-motion: reduce) {
  .ru-cell,
  .ru-target {
    transition: none;
  }
  .ru-cell:active {
    transform: none;
  }
}
</style>
