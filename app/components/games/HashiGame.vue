<script setup>
/* 數橋 Hashi (Hashiwokakero / Bridges) — connect numbered islands with 1-2 bridges.
   Seeded generation always yields a solvable, connected puzzle.
   Pure game logic lives in ~/games/hashi.ts (framework-free, unit-tested). */

import {
  buildPuzzle,
  DIFFICULTIES,
  wouldCross as hapiWouldCross,
  pathClear as hapiPathClear,
  islandDegree as hapiIslandDegree,
  checkWin as hapiCheckWin,
} from "~/games/hashi";

const accent = "#9d8cff";

const props = defineProps({
  seed:  { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(['solved']);

// ---- difficulty config (from module) ----
const difficulty = ref('normal');

const currentDiff = computed(() => DIFFICULTIES.find(d => d.key === difficulty.value) || DIFFICULTIES[1]);

// ---- puzzle state ----
const cols       = ref(9);
const rows       = ref(9);
const islands    = ref([]);   // [{ id, r, c, clue }]
const bridges    = ref([]);   // [{ id1, id2, r1,c1, r2,c2, count }] player-placed
const solvedIslands = ref(0);
const totalIslands  = ref(0);
const totalBridges  = ref(0);
const gameWon    = ref(false);
const overlay    = reactive({ open: false, title: '', sub: '' });

// ---- interaction state ----
const selectedId = ref(null);   // selected island id
const shakeId    = ref(null);   // island id to shake (invalid tap)

// ---- initialize game from puzzle data ----
function applyPuzzle(puzzle) {
  cols.value  = puzzle.gc;
  rows.value  = puzzle.gr;
  islands.value = puzzle.islands.slice();
  bridges.value = [];
  solvedIslands.value = 0;
  totalIslands.value  = puzzle.islands.length;
  totalBridges.value  = 0;
  gameWon.value = false;
  overlay.open  = false;
  selectedId.value = null;
}

// ---- bridge lookup helpers ----
function getBridge(id1, id2) {
  return bridges.value.find(b =>
    (b.id1 === id1 && b.id2 === id2) || (b.id1 === id2 && b.id2 === id1)
  ) || null;
}

function islandById(id) {
  return islands.value.find(i => i.id === id) || null;
}

// ---- interaction ----
function onIslandClick(id) {
  if (gameWon.value) return;

  if (selectedId.value === null) {
    selectedId.value = id;
    return;
  }

  if (selectedId.value === id) {
    selectedId.value = null;
    return;
  }

  const src = islandById(selectedId.value);
  const dst = islandById(id);
  if (!src || !dst) { selectedId.value = null; return; }

  // must be same row or same column
  if (src.r !== dst.r && src.c !== dst.c) {
    triggerShake(id);
    return;
  }

  // path must be clear of islands in between
  if (!hapiPathClear(src, dst, islands.value)) {
    triggerShake(id);
    return;
  }

  // must not cross existing bridges
  if (hapiWouldCross(src.r, src.c, dst.r, dst.c, bridges.value)) {
    triggerShake(id);
    return;
  }

  // cycle bridge count 0->1->2->0
  const existing = getBridge(src.id, dst.id);
  if (existing) {
    if (existing.count === 2) {
      existing.count = 0;
    } else {
      existing.count += 1;
    }
  } else {
    const minId = Math.min(src.id, dst.id);
    const maxId = Math.max(src.id, dst.id);
    const a = islandById(minId);
    const bb = islandById(maxId);
    bridges.value.push({ id1: minId, id2: maxId, r1: a.r, c1: a.c, r2: bb.r, c2: bb.c, count: 1 });
  }

  selectedId.value = null;
  updateStats();
  triggerWinCheck();
}

function triggerShake(id) {
  shakeId.value = id;
  setTimeout(() => { shakeId.value = null; }, 400);
}

// ---- win check ----
function updateStats() {
  let sat = 0;
  let totalB = 0;
  for (const isl of islands.value) {
    if (hapiIslandDegree(isl.id, bridges.value) === isl.clue) sat++;
  }
  for (const b of bridges.value) totalB += b.count;
  solvedIslands.value = sat;
  totalBridges.value  = totalB;
}

function triggerWinCheck() {
  if (!hapiCheckWin(islands.value, bridges.value)) return;

  // WIN
  gameWon.value   = true;
  overlay.title   = '全部接通！';
  overlay.sub     = '所有島嶼都連起來了！';
  overlay.open    = true;
  emit('solved', {});
}

// ---- clear all bridges ----
function clearBridges() {
  bridges.value = [];
  solvedIslands.value = 0;
  totalBridges.value  = 0;
  selectedId.value    = null;
}

// ---- new puzzle ----
function regenerate(seedOverride) {
  const rng    = makeRng(seedOverride !== undefined ? seedOverride : props.seed);
  const diff   = props.daily ? DIFFICULTIES[1] : currentDiff.value;
  const puzzle = buildPuzzle(rng, diff);
  applyPuzzle(puzzle);
}

function newPuzzle() {
  // random new puzzle (seedOverride = null → random)
  difficulty.value = currentDiff.value.key;
  regenerate(null);
}

watch(() => props.seed, () => regenerate());

watch(difficulty, () => {
  if (!props.daily) regenerate();
});

onMounted(() => {
  regenerate();
});

// ---- SVG rendering helpers ----
// cell size in SVG units (we'll use 1 cell = 48 units)
const CELL = 48;
const PAD  = 28;  // padding around the grid in SVG units

// flattened grid dot positions for SVG rendering
const gridDots = computed(() => {
  const dots = [];
  for (let r = 0; r < rows.value; r++) {
    for (let c = 0; c < cols.value; c++) {
      dots.push({ r, c, key: `${r}-${c}` });
    }
  }
  return dots;
});

const svgW = computed(() => cols.value * CELL + PAD * 2);
const svgH = computed(() => rows.value * CELL + PAD * 2);

function cx(c) { return PAD + c * CELL + CELL / 2; }
function cy(r) { return PAD + r * CELL + CELL / 2; }

// island ring color
function ringColor(id) {
  const deg = hapiIslandDegree(id, bridges.value);
  const isl = islandById(id);
  if (!isl) return 'var(--line)';
  if (deg === isl.clue) return 'var(--accent)';
  if (deg >  isl.clue) return '#ff6b6b';
  return 'var(--line-strong)';
}

// thin wrapper used in template :class bindings
function islandDegree(id) { return hapiIslandDegree(id, bridges.value); }

function isSelected(id) { return selectedId.value === id; }

// are both endpoints satisfied?
function bridgeSatisfied(b) {
  const i1 = islandById(b.id1);
  const i2 = islandById(b.id2);
  return i1 && i2 && hapiIslandDegree(b.id1, bridges.value) === i1.clue && hapiIslandDegree(b.id2, bridges.value) === i2.clue;
}

// single line between two island centers, optional offset for double bridge
function bridgeLine(b, offsetIndex) {
  // offsetIndex: 0 for single, -1 or +1 for double
  const horiz = b.r1 === b.r2;
  const off = offsetIndex * 5; // pixel offset perpendicular to bridge
  const x1 = cx(b.c1) + (horiz ? 0 : off);
  const y1 = cy(b.r1) + (horiz ? off : 0);
  const x2 = cx(b.c2) + (horiz ? 0 : off);
  const y2 = cy(b.r2) + (horiz ? off : 0);
  // shorten toward island edge
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x1, y1, x2, y2 };
  const trim = 20;
  const ux = dx / len, uy = dy / len;
  return { x1: x1 + ux * trim, y1: y1 + uy * trim, x2: x2 - ux * trim, y2: y2 - uy * trim };
}
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="數橋" title-en="Hashi">
      <template #actions>
        <button v-if="!props.daily" class="btn btn--accent" @click="newPuzzle">新題目</button>
        <button class="btn" @click="clearBridges">清除</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <!-- HUD -->
        <div class="hud">
          <div class="chip">
            <span class="chip__label">完成</span>
            <span class="chip__value is-accent">{{ solvedIslands }} / {{ totalIslands }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">橋</span>
            <span class="chip__value">{{ totalBridges }}</span>
          </div>
        </div>

        <!-- Board -->
        <div class="board-wrap">
          <svg
            class="hashi-svg"
            :viewBox="`0 0 ${svgW} ${svgH}`"
            :width="svgW"
            :height="svgH"
            aria-label="數橋遊戲盤"
            role="img"
          >
            <!-- grid dots -->
            <g class="grid-dots" aria-hidden="true">
              <circle
                v-for="dot in gridDots"
                :key="`dot-${dot.key}`"
                :cx="cx(dot.c)"
                :cy="cy(dot.r)"
                r="2"
                fill="var(--line)"
              />
            </g>

            <!-- bridges -->
            <g class="bridges" aria-hidden="true">
              <template v-for="b in bridges" :key="`bridge-${b.id1}-${b.id2}`">
                <template v-if="b.count === 1">
                  <line
                    v-bind="bridgeLine(b, 0)"
                    class="bridge-line"
                    :class="{ 'is-satisfied': bridgeSatisfied(b) }"
                    stroke-width="3.5"
                  />
                </template>
                <template v-else-if="b.count === 2">
                  <line
                    v-bind="bridgeLine(b, -1)"
                    class="bridge-line"
                    :class="{ 'is-satisfied': bridgeSatisfied(b) }"
                    stroke-width="3"
                  />
                  <line
                    v-bind="bridgeLine(b, 1)"
                    class="bridge-line"
                    :class="{ 'is-satisfied': bridgeSatisfied(b) }"
                    stroke-width="3"
                  />
                </template>
              </template>
            </g>

            <!-- islands -->
            <g class="islands">
              <g
                v-for="isl in islands"
                :key="`isl-${isl.id}`"
                class="island-group"
                :class="{
                  'is-selected': isSelected(isl.id),
                  'is-shake': shakeId === isl.id,
                  'is-satisfied': islandDegree(isl.id) === isl.clue,
                  'is-over': islandDegree(isl.id) > isl.clue,
                }"
                :aria-label="`島嶼 ${isl.clue}，位置 行${isl.r+1} 列${isl.c+1}`"
                @click="onIslandClick(isl.id)"
                @pointerdown.prevent
              >
                <!-- tap target (invisible, large) -->
                <circle
                  :cx="cx(isl.c)"
                  :cy="cy(isl.r)"
                  r="22"
                  fill="transparent"
                  class="island-tap"
                />
                <!-- outer glow ring (selected) -->
                <circle
                  v-if="isSelected(isl.id)"
                  :cx="cx(isl.c)"
                  :cy="cy(isl.r)"
                  r="21"
                  fill="none"
                  stroke="var(--accent)"
                  stroke-width="2.5"
                  class="island-glow"
                />
                <!-- island body -->
                <circle
                  :cx="cx(isl.c)"
                  :cy="cy(isl.r)"
                  r="17"
                  class="island-body"
                  :style="{ '--ring': ringColor(isl.id) }"
                />
                <!-- clue number -->
                <text
                  :x="cx(isl.c)"
                  :y="cy(isl.r)"
                  class="island-num"
                  dominant-baseline="central"
                  text-anchor="middle"
                >{{ isl.clue }}</text>
              </g>
            </g>
          </svg>

          <!-- Win overlay -->
          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button v-if="!props.daily" class="btn btn--accent" @click="newPuzzle">新題目</button>
                <button class="btn" @click="overlay.open = false">關閉</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Side panel -->
      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">規則</span>
          <p class="hint">
            點選一座島，再點同排或同列的另一座島，即可在兩島間架 0 / 1 / 2 座橋。<br />
            讓每座島的橋數等於島上的數字，並把所有島連成一片。
          </p>
        </div>

        <div v-if="!props.daily" class="panel__group">
          <span class="panel__legend">難度</span>
          <div class="seg">
            <button
              v-for="d in DIFFICULTIES"
              :key="d.key"
              :class="{ 'is-active': difficulty === d.key }"
              :aria-pressed="difficulty === d.key"
              @click="difficulty = d.key"
            >{{ d.label }}</button>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">提示</span>
          <p class="hint">
            橋不能交叉，也不能穿越島嶼。<br />
            對同一對島再次點擊可增加橋數（0 → 1 → 2 → 0）。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.hashi-svg {
  width: min(88vw, 80vh, 540px);
  height: auto;
  display: block;
  border-radius: var(--r-lg);
  background: radial-gradient(120% 120% at 50% 0%, var(--ink-800), var(--ink-900));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  cursor: default;
  overflow: visible;
}

/* grid dots rendered via v-for nested — handled by Vue template */

/* bridge lines */
.bridge-line {
  stroke: color-mix(in oklab, var(--accent) 55%, transparent);
  stroke-linecap: round;
  transition: stroke var(--dur-fast) var(--ease);
}
.bridge-line.is-satisfied {
  stroke: color-mix(in oklab, var(--accent) 85%, transparent);
}

/* island group */
.island-group {
  cursor: pointer;
}
.island-tap {
  cursor: pointer;
}

/* island body circle */
.island-body {
  fill: var(--ink-700);
  stroke: var(--ring, var(--line-strong));
  stroke-width: 2.5;
  transition: fill var(--dur-fast) var(--ease), stroke var(--dur-fast) var(--ease),
              stroke-width var(--dur-fast) var(--ease);
}

.island-group:hover .island-body {
  fill: var(--ink-600);
}

.island-group.is-selected .island-body {
  fill: color-mix(in oklab, var(--accent) 18%, var(--ink-700));
  stroke: var(--accent);
  stroke-width: 3;
}

.island-group.is-satisfied .island-body {
  fill: color-mix(in oklab, var(--accent) 12%, var(--ink-700));
}

.island-group.is-over .island-body {
  fill: color-mix(in oklab, #ff6b6b 12%, var(--ink-700));
}

/* glow ring animation for selected */
.island-glow {
  opacity: 0.6;
  animation: glowPulse 1.6s ease-in-out infinite;
}
@keyframes glowPulse {
  0%, 100% { opacity: 0.4; r: 20; }
  50%       { opacity: 0.8; r: 22; }
}
@media (prefers-reduced-motion: reduce) {
  .island-glow { animation: none; opacity: 0.7; }
}

/* island number */
.island-num {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
  fill: var(--text);
  pointer-events: none;
  user-select: none;
}

/* shake animation for invalid taps */
@keyframes shake {
  0%   { transform: translateX(0); }
  20%  { transform: translateX(-5px); }
  40%  { transform: translateX(5px); }
  60%  { transform: translateX(-4px); }
  80%  { transform: translateX(4px); }
  100% { transform: translateX(0); }
}
.island-group.is-shake {
  animation: shake 0.38s var(--ease);
}
@media (prefers-reduced-motion: reduce) {
  .island-group.is-shake { animation: none; }
}

/* board-wrap overlay sits over the SVG */
.board-wrap {
  position: relative;
}
.board-wrap .overlay {
  border-radius: var(--r-lg);
}
</style>
