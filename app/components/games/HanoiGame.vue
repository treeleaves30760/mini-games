<script setup>
/* 河內塔 Tower of Hanoi — click pegs to lift/drop disks.
   N disks (3–6), seeded N in daily. Win when all disks on peg C. */

// ---- pure game logic (shared with unit tests) ----
import {
  initPegs as createPegs,
  isLegalMove,
  isWin as hanoiIsWin,
} from "~/games/hanoi";

const accent = "#4dd4ac";
const BEST_KEY = "playground.hanoi.best";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const rng = makeRng(props.seed);

// ---- state ----
const numDisks = ref(3);
const pegs = ref([[], [], []]);     // peg[i] = array of disk sizes (largest=numDisks at bottom)
const selected = ref(-1);           // which peg is currently "lifted" (-1 = none)
const moves = ref(0);
const won = ref(false);
const overlay = reactive({ open: false, optimal: false });
const bestMap = ref({});            // keyed by numDisks
const diskSeg = ref(3);             // segmented control (non-daily)

const optimal = computed(() => Math.pow(2, numDisks.value) - 1);
const bestForN = computed(() => bestMap.value[numDisks.value] ?? null);

function initPegs(n) {
  pegs.value = createPegs(n);
  selected.value = -1;
  moves.value = 0;
  won.value = false;
  overlay.open = false;
}

function regenerate() {
  const r = makeRng(props.seed);
  if (props.daily) {
    numDisks.value = r.int(4, 6);
  } else {
    numDisks.value = diskSeg.value;
  }
  initPegs(numDisks.value);
}

watch(() => props.seed, regenerate);

watch(diskSeg, (v) => {
  if (props.daily) return;
  numDisks.value = v;
  initPegs(v);
});

// ---- game logic ----
function clickPeg(i) {
  if (won.value) return;
  if (selected.value === -1) {
    if (pegs.value[i].length === 0) return;
    selected.value = i;
  } else {
    if (selected.value === i) {
      selected.value = -1;
      return;
    }
    const from = selected.value;
    const to = i;
    if (!isLegalMove(pegs.value, from, to)) {
      selected.value = -1;
      return;
    }
    const disk = pegs.value[from][pegs.value[from].length - 1];
    pegs.value[from].pop();
    pegs.value[to].push(disk);
    moves.value++;
    selected.value = -1;
    checkWin();
  }
}

function checkWin() {
  if (hanoiIsWin(pegs.value, numDisks.value)) {
    won.value = true;
    const isOpt = moves.value === optimal.value;
    overlay.optimal = isOpt;
    overlay.open = true;
    const prev = bestMap.value[numDisks.value] ?? Infinity;
    if (moves.value < prev) {
      bestMap.value = { ...bestMap.value, [numDisks.value]: moves.value };
      saveBest();
    }
    emit("solved", { moves: moves.value });
  }
}

// ---- disk visual helpers ----
const PEG_LABELS = ["A", "B", "C"];
function diskWidth(size) {
  const min = 22, max = 86;
  return min + ((size - 1) / (numDisks.value - 1 || 1)) * (max - min);
}
function diskHue(size) {
  const t = (size - 1) / Math.max(numDisks.value - 1, 1);
  // range from accent teal to a purple-blue
  const r = Math.round(77 - t * 40);
  const g = Math.round(212 - t * 100);
  const b = Math.round(172 + t * 60);
  return `rgb(${r},${g},${b})`;
}

// ---- persistence ----
function saveBest() {
  localStorage.setItem(BEST_KEY, JSON.stringify(bestMap.value));
}

onMounted(() => {
  try {
    bestMap.value = JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
  } catch (_) {
    bestMap.value = {};
  }
  regenerate();
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="河內塔" title-en="Tower of Hanoi">
      <template #actions>
        <button class="btn btn--accent" @click="initPegs(numDisks)">重設</button>
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
            <span class="chip__label">最佳</span>
            <span class="chip__value">{{ bestForN !== null ? bestForN : "—" }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">最優</span>
            <span class="chip__value">{{ optimal }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div class="hanoi-board" aria-label="河內塔遊戲盤面">
            <!-- Base bar -->
            <div class="hanoi-base" />

            <!-- Three pegs -->
            <div
              v-for="(peg, pi) in pegs"
              :key="pi"
              class="peg-col"
              :class="{ 'is-selected': selected === pi, 'is-target': pi === 2 }"
              role="button"
              :aria-label="`柱子 ${PEG_LABELS[pi]}，${peg.length} 個圓盤`"
              :tabindex="won ? -1 : 0"
              @click="clickPeg(pi)"
              @keydown.enter.space.prevent="clickPeg(pi)"
            >
              <div class="peg-rod" />
              <div class="peg-disks">
                <TransitionGroup name="disk">
                  <div
                    v-for="disk in [...peg].reverse()"
                    :key="disk"
                    class="disk"
                    :style="{
                      width: diskWidth(disk) + '%',
                      background: diskHue(disk),
                    }"
                  />
                </TransitionGroup>
              </div>
              <div class="peg-label">{{ PEG_LABELS[pi] }}</div>
            </div>

            <!-- Lifted disk ghost -->
            <div v-if="selected >= 0" class="lifted-indicator">
              <div
                class="disk disk--lifted"
                :style="{
                  width: diskWidth(pegs[selected][pegs[selected].length - 1]) + '%',
                  background: diskHue(pegs[selected][pegs[selected].length - 1]),
                }"
              />
            </div>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.optimal ? "完美解法！" : "完成！" }}</h2>
              <p class="overlay__sub">
                <template v-if="overlay.optimal">
                  以最少 {{ optimal }} 步完成，太厲害了！
                </template>
                <template v-else-if="daily">
                  共走了 {{ moves }} 步，今日挑戰完成！
                </template>
                <template v-else>
                  共走了 {{ moves }} 步（最優 {{ optimal }} 步）。
                </template>
              </p>
              <div class="overlay__actions">
                <button class="btn" @click="initPegs(numDisks)">再玩一次</button>
                <button v-if="!daily" class="btn btn--accent" @click="() => { diskSeg = (numDisks % 4) + 3; }">
                  換難度
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!daily" class="hanoi-seg-wrap">
          <div class="seg">
            <button
              v-for="n in [3, 4, 5, 6]"
              :key="n"
              :class="{ 'is-active': diskSeg === n }"
              :aria-pressed="diskSeg === n"
              @click="diskSeg = n"
            >
              {{ n }} 片
            </button>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            目標：將所有圓盤從柱子 A 移到柱子 C。<br />
            點擊柱子選取頂部圓盤，再點另一柱子放下。<br />
            大圓盤不能疊在小圓盤上。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">操作</span>
          <p class="hint">
            滑鼠點擊或鍵盤 <kbd>Enter</kbd> / <kbd>空白鍵</kbd> 選擇柱子。<br />
            <kbd>Tab</kbd> 切換焦點柱子。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">趣知識</span>
          <p class="hint">
            N 片的最少步數是 2<sup>N</sup>−1。<br />
            傳說中有 64 片的神廟版本，需要移動超過 1800 億億步！
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.hanoi-board {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  width: min(86vw, 60vh, 540px);
  height: min(86vw, 60vh, 540px);
  border-radius: var(--r-lg);
  background: radial-gradient(120% 120% at 50% 0%, var(--ink-800), var(--ink-900));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  padding: 0 2% 40px;
  touch-action: none;
  overflow: hidden;
}
.hanoi-base {
  position: absolute;
  bottom: 28px;
  left: 4%;
  right: 4%;
  height: 6px;
  border-radius: 3px;
  background: color-mix(in oklab, var(--accent) 35%, var(--ink-600));
  box-shadow: 0 0 12px color-mix(in oklab, var(--accent) 30%, transparent);
}
.peg-col {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  width: 30%;
  height: 100%;
  padding-bottom: 12px;
  cursor: pointer;
  border-radius: var(--r-md);
  transition: background var(--dur-fast) var(--ease);
  outline-offset: 4px;
}
.peg-col:hover {
  background: color-mix(in oklab, var(--accent) 6%, transparent);
}
.peg-col.is-selected {
  background: color-mix(in oklab, var(--accent) 12%, transparent);
}
.peg-col.is-target {
  --target-glow: color-mix(in oklab, var(--accent) 15%, transparent);
}
.peg-rod {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  width: 8px;
  height: 72%;
  border-radius: 4px;
  background: linear-gradient(to top, var(--ink-500), var(--ink-400));
  box-shadow: 0 0 8px color-mix(in oklab, var(--accent) 20%, transparent);
}
.peg-disks {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  width: 100%;
  /* fixed height matches peg-rod height; overflow:hidden prevents disks
     from ever pushing the peg-col taller than the board */
  height: 72%;
  flex-shrink: 0;
  overflow: hidden;
  position: relative;
  z-index: 2;
}
.disk {
  height: 18px;
  border-radius: 9px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.18);
  transition: width var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
  flex-shrink: 0;
  /* stable height — never let content grow the disk row */
  min-height: 18px;
  max-height: 18px;
}
.disk--lifted {
  animation: float 0.8s var(--ease) infinite alternate;
  opacity: 0.85;
}
@keyframes float {
  from { transform: translateY(0); }
  to   { transform: translateY(-6px); }
}
.disk-enter-active,
.disk-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}
.disk-enter-from,
.disk-leave-to {
  opacity: 0;
  transform: scaleX(0.7);
}
.peg-label {
  position: absolute;
  bottom: 6px;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--text-faint);
}
.peg-col.is-selected .peg-label {
  color: var(--accent);
}
.lifted-indicator {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  justify-content: center;
  width: 80%;
  pointer-events: none;
  z-index: 5;
}
.hanoi-seg-wrap {
  display: flex;
  justify-content: center;
}

/* Reserve space for the seg-wrap even when it's absent (daily mode hides it)
   so the board doesn't shift vertically when the slot appears/disappears.
   Because v-if removes it entirely, use min-height on stage__main — but since
   we can't touch shared CSS, keep it local via an invisible placeholder:
   The seg only changes once on mount (daily vs non-daily), so no runtime CLS. */

/* Peg-col focus ring: inset so it doesn't spill outside the board */
.peg-col:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -3px;
  border-radius: var(--r-md);
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}

@media (prefers-reduced-motion: reduce) {
  .disk--lifted { animation: none; }
  .disk { transition: none; }
  .disk-enter-active,
  .disk-leave-active { transition: none; }
}
</style>
