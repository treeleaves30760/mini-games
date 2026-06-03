<script setup>
/* 點格棋 Dots and Boxes — 5×5 dots → 4×4 boxes.
   Click an undrawn edge to draw it; completing a box claims it + extra turn.
   AI: complete boxes first, else safe edge, else give away smallest chain. */

// ---- pure game logic (unit-tested in app/games/dots-boxes.ts) ----
import {
  hIdx,
  vIdx,
  applyMove,
  aiMove,
  scoreOf,
} from "~/games/dots-boxes";

const accent = "#ff8fa3";
const SAVE_KEY = "playground.dotsboxes.stats";

const props = defineProps({
  seed:  { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// Grid: DOTS = 5×5, BOXES = 4×4
// Edges: horizontal (5 rows × 4 cols = 20) + vertical (4 rows × 5 cols = 20) = 40 total
const TOTAL_EDGES = 40;
const TOTAL_BOXES = 16;

const rng = makeRng(props.seed);

// ---- state ----
const edges    = ref(new Set());                      // drawn edge indices
const owners   = ref(new Array(16).fill(0));          // 0=none 1=player 2=ai
const turn     = ref(1);                              // 1=player 2=ai
const hovered  = ref(-1);
const animBox  = ref(-1);
const gameOver = ref(false);
const overlay  = reactive({ open: false, title: "", sub: "" });
const stats    = reactive({ wins: 0, losses: 0, draws: 0 });

// ---- place edge ----
let aiTimer = null;

async function placeEdge(ei) {
  if (gameOver.value || turn.value !== 1) return;
  if (edges.value.has(ei)) return;

  doPlace(ei, 1);
}

function doPlace(ei, player) {
  const result = applyMove(ei, player, edges.value, owners.value);

  edges.value = result.edges;
  owners.value = result.owners;

  if (result.claimed > 0) {
    // Animate last claimed box (find it by scanning newly owned boxes)
    for (let bi = 0; bi < TOTAL_BOXES; bi++) {
      if (result.owners[bi] === player) animBox.value = bi;
    }
    setTimeout(() => { animBox.value = -1; }, 350);
  }

  if (result.gameOver) {
    endGame(result.owners);
    return;
  }

  if (result.keepTurn) {
    // Same player goes again
    if (player === 2) scheduleAI();
    // else wait for player click
  } else {
    // Switch turns
    if (player === 1) {
      turn.value = 2;
      scheduleAI();
    } else {
      turn.value = 1;
    }
  }
}

function scheduleAI() {
  clearTimeout(aiTimer);
  aiTimer = setTimeout(() => {
    if (gameOver.value) return;
    const m = aiMove(edges.value, owners.value, undefined, undefined, rng);
    if (m >= 0) doPlace(m, 2);
  }, 420);
}

function endGame(ownersArr) {
  gameOver.value = true;
  const playerScore = scoreOf(ownersArr, 1);
  const aiScore     = scoreOf(ownersArr, 2);
  if (playerScore > aiScore) {
    emit("solved", { playerScore, aiScore });
    stats.wins++;
    overlay.title = "你贏了！";
    overlay.sub = `你 ${playerScore} — 電腦 ${aiScore}，漂亮！`;
  } else if (aiScore > playerScore) {
    stats.losses++;
    overlay.title = "電腦獲勝";
    overlay.sub = `你 ${playerScore} — 電腦 ${aiScore}，再接再厲！`;
  } else {
    stats.draws++;
    overlay.title = "平局！";
    overlay.sub = `你 ${playerScore} — 電腦 ${aiScore}。`;
  }
  overlay.open = true;
  saveStats();
}

function restart() {
  clearTimeout(aiTimer);
  edges.value = new Set();
  owners.value = new Array(16).fill(0);
  turn.value = 1;
  hovered.value = -1;
  animBox.value = -1;
  gameOver.value = false;
  overlay.open = false;
}

// ---- persistence ----
function saveStats() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ wins: stats.wins, losses: stats.losses, draws: stats.draws })); } catch(_) {}
}
onMounted(() => {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
    if (s.wins != null) { stats.wins = s.wins; stats.losses = s.losses; stats.draws = s.draws; }
  } catch(_) {}
});

watch(() => props.seed, restart);
onBeforeUnmount(() => clearTimeout(aiTimer));

// ---- computed scores ----
const playerScore = computed(() => scoreOf(owners.value, 1));
const aiScore     = computed(() => scoreOf(owners.value, 2));

// ---- SVG layout ----
// Dots at positions (c*80+40, r*80+40) in a 440×440 viewBox
const DOT_STEP = 80;
const PAD = 40;
const VBOX = 440;

const dots = computed(() => {
  const d = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++)
      d.push({ x: PAD + c * DOT_STEP, y: PAD + r * DOT_STEP, r, c });
  return d;
});

const hEdges = computed(() => {
  const h = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 4; c++) {
      const ei = hIdx(r, c);
      h.push({
        ei,
        x1: PAD + c * DOT_STEP,       y1: PAD + r * DOT_STEP,
        x2: PAD + (c+1) * DOT_STEP,   y2: PAD + r * DOT_STEP,
        drawn: edges.value.has(ei),
        hover: hovered.value === ei,
      });
    }
  return h;
});

const vEdges = computed(() => {
  const v = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 5; c++) {
      const ei = vIdx(r, c);
      v.push({
        ei,
        x1: PAD + c * DOT_STEP,   y1: PAD + r * DOT_STEP,
        x2: PAD + c * DOT_STEP,   y2: PAD + (r+1) * DOT_STEP,
        drawn: edges.value.has(ei),
        hover: hovered.value === ei,
      });
    }
  return v;
});

const boxes = computed(() => {
  const b = [];
  for (let br = 0; br < 4; br++)
    for (let bc = 0; bc < 4; bc++) {
      const bi = br * 4 + bc;
      b.push({
        bi,
        x: PAD + bc * DOT_STEP,
        y: PAD + br * DOT_STEP,
        size: DOT_STEP,
        owner: owners.value[bi],
        anim: animBox.value === bi,
      });
    }
  return b;
});

function onEdgeClick(ei) {
  if (gameOver.value || turn.value !== 1 || edges.value.has(ei)) return;
  placeEdge(ei);
}
function onEdgeEnter(ei) {
  if (!edges.value.has(ei) && turn.value === 1 && !gameOver.value) hovered.value = ei;
}
function onEdgeLeave() { hovered.value = -1; }
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="點格棋" title-en="Dots &amp; Boxes">
      <template #actions>
        <button class="btn btn--accent" @click="restart">重新開始</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">你</span>
            <span class="chip__value is-accent">{{ playerScore }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">回合</span>
            <span class="chip__value">
              {{ gameOver ? '結束' : turn === 1 ? '你' : '電腦' }}
            </span>
          </div>
          <div class="chip">
            <span class="chip__label">電腦</span>
            <span class="chip__value">{{ aiScore }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <svg
            class="dots-board"
            :viewBox="`0 0 ${VBOX} ${VBOX}`"
            aria-label="點格棋盤面"
            role="img"
            style="touch-action: none;"
          >
            <!-- Box fills -->
            <rect
              v-for="box in boxes"
              :key="'b'+box.bi"
              :x="box.x + 1"
              :y="box.y + 1"
              :width="box.size - 2"
              :height="box.size - 2"
              :fill="box.owner === 1 ? 'rgba(255,143,163,0.32)' : box.owner === 2 ? 'rgba(120,160,255,0.28)' : 'none'"
              :class="{ 'box-anim': box.anim }"
            />

            <!-- Horizontal hit areas -->
            <rect
              v-for="e in hEdges"
              :key="'hh'+e.ei"
              :x="e.x1 + 6"
              :y="e.y1 - 16"
              :width="DOT_STEP - 12"
              :height="32"
              fill="transparent"
              :style="{ cursor: (!e.drawn && turn === 1 && !gameOver) ? 'pointer' : 'default' }"
              @click="onEdgeClick(e.ei)"
              @mouseenter="onEdgeEnter(e.ei)"
              @mouseleave="onEdgeLeave"
            />
            <!-- Vertical hit areas -->
            <rect
              v-for="e in vEdges"
              :key="'vh'+e.ei"
              :x="e.x1 - 16"
              :y="e.y1 + 6"
              :width="32"
              :height="DOT_STEP - 12"
              fill="transparent"
              :style="{ cursor: (!e.drawn && turn === 1 && !gameOver) ? 'pointer' : 'default' }"
              @click="onEdgeClick(e.ei)"
              @mouseenter="onEdgeEnter(e.ei)"
              @mouseleave="onEdgeLeave"
            />

            <!-- Horizontal edges (lines) -->
            <line
              v-for="e in hEdges"
              :key="'hl'+e.ei"
              :x1="e.x1 + 10" :y1="e.y1"
              :x2="e.x2 - 10" :y2="e.y2"
              class="edge-line"
              :class="{ 'edge-drawn': e.drawn, 'edge-hover': e.hover && !e.drawn }"
              style="pointer-events: none;"
            />
            <!-- Vertical edges (lines) -->
            <line
              v-for="e in vEdges"
              :key="'vl'+e.ei"
              :x1="e.x1" :y1="e.y1 + 10"
              :x2="e.x2" :y2="e.y2 - 10"
              class="edge-line"
              :class="{ 'edge-drawn': e.drawn, 'edge-hover': e.hover && !e.drawn }"
              style="pointer-events: none;"
            />

            <!-- Dots -->
            <circle
              v-for="d in dots"
              :key="`d${d.r}${d.c}`"
              :cx="d.x" :cy="d.y"
              r="6"
              class="dot"
              style="pointer-events: none;"
            />
          </svg>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions" v-if="!daily">
                <button class="btn btn--accent" @click="restart">再來一局</button>
              </div>
              <div class="overlay__actions" v-else>
                <button class="btn" @click="overlay.open = false">完成！</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">戰績</span>
          <div class="stats-row">
            <div class="stat-item">
              <span class="stat-val" style="color: var(--accent)">{{ stats.wins }}</span>
              <span class="stat-lbl">勝</span>
            </div>
            <div class="stat-item">
              <span class="stat-val">{{ stats.draws }}</span>
              <span class="stat-lbl">平</span>
            </div>
            <div class="stat-item">
              <span class="stat-val" style="color: #7aa4ff">{{ stats.losses }}</span>
              <span class="stat-lbl">敗</span>
            </div>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            點擊任意未畫線的邊來畫線。<br/>
            當你完成一個方格（畫上第四條邊），方格歸你並可再走一步。<br/>
            全部邊畫完後，格子多的一方獲勝。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">顏色</span>
          <div class="color-legend">
            <div class="color-swatch" style="background: rgba(255,143,163,0.4); border:1px solid rgba(255,143,163,0.7)"></div>
            <span class="hint">你的格子（粉）</span>
          </div>
          <div class="color-legend">
            <div class="color-swatch" style="background: rgba(120,160,255,0.35); border:1px solid rgba(120,160,255,0.7)"></div>
            <span class="hint">電腦格子（藍）</span>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.dots-board {
  display: block;
  width: min(86vw, 60vh, 500px);
  height: min(86vw, 60vh, 500px);
  border-radius: var(--r-lg);
  background: radial-gradient(130% 120% at 50% 0%, var(--ink-800), var(--ink-900));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  touch-action: none;
}

.edge-line {
  stroke: var(--ink-600);
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke var(--dur-fast) var(--ease), stroke-width var(--dur-fast) var(--ease), opacity var(--dur-fast) var(--ease);
  opacity: 0.35;
}
.edge-drawn {
  stroke: var(--text-dim);
  stroke-width: 4;
  opacity: 1;
}
.edge-hover {
  stroke: var(--accent);
  stroke-width: 5;
  opacity: 0.85;
  filter: drop-shadow(0 0 4px color-mix(in oklab, var(--accent) 70%, transparent));
}

.dot {
  fill: var(--text);
  opacity: 0.9;
}

.box-anim {
  animation: boxPop 0.32s var(--ease-out);
}
@keyframes boxPop {
  0%   { opacity: 0; transform-origin: center; transform: scale(0.5); }
  70%  { transform: scale(1.08); }
  100% { opacity: 1; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .box-anim { animation: none; }
}

.stats-row {
  display: flex;
  gap: 1rem;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
}
.stat-val {
  font-family: var(--font-mono);
  font-size: 1.4rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  min-width: 2ch;
  text-align: center;
}
.stat-lbl {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.color-legend {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.color-swatch {
  width: 20px;
  height: 14px;
  border-radius: 4px;
  flex-shrink: 0;
}
.board-wrap .overlay {
  border-radius: var(--r-lg);
}
</style>
