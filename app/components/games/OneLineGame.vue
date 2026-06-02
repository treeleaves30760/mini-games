<script setup>
/* 一筆畫 One Line — trace every edge exactly once (Eulerian path puzzle).
   Tap-to-step and drag-to-draw, undo by backing up, per-level progress.
   Every level is hand-checked to have 0 or 2 odd-degree vertices. */

const accent = "#ffb057";
const SAVE_KEY = "playground.oneline.solved";

const LEVELS = [
  { name: "三角形", nodes: [[50, 15], [85, 80], [15, 80]], edges: [[0, 1], [1, 2], [2, 0]] },
  {
    name: "五角星",
    nodes: [[50, 14], [86.1, 40.3], [72.3, 82.7], [27.7, 82.7], [13.9, 40.3]],
    edges: [[0, 2], [2, 4], [4, 1], [1, 3], [3, 0]],
  },
  {
    name: "對角方塊",
    nodes: [[22, 22], [78, 22], [78, 78], [22, 78]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]],
  },
  {
    name: "蝴蝶結",
    nodes: [[15, 25], [15, 75], [50, 50], [85, 25], [85, 75]],
    edges: [[0, 2], [1, 2], [0, 1], [3, 2], [4, 2], [3, 4]],
  },
  {
    name: "房子",
    nodes: [[20, 82], [80, 82], [80, 45], [20, 45], [50, 16]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [2, 4]],
  },
  {
    name: "六邊形＋對角",
    nodes: [[50, 14], [81.2, 32], [81.2, 68], [50, 86], [18.8, 68], [18.8, 32]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 3]],
  },
  {
    name: "雙斜屋",
    nodes: [[20, 82], [80, 82], [80, 45], [20, 45], [50, 16]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [2, 4], [3, 1]],
  },
  {
    name: "信封",
    nodes: [[20, 40], [80, 40], [80, 82], [20, 82], [50, 15]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [3, 1]],
  },
];
const total = LEVELS.length;

const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

// ---- state ----
const svgRef = ref(null);
const li = ref(0);
const path = ref([]);
const used = ref(new Set());
const solved = ref(false);
const solvedSet = ref(new Set());
const rubber = reactive({ show: false, x1: 0, y1: 0, x2: 0, y2: 0 });
const overlay = reactive({ open: false, title: "過關！", sub: "", lastLevel: false });
let dragging = false;

// ---- derived ----
const level = computed(() => LEVELS[li.value]);
const nodes = computed(() => level.value.nodes);
const edges = computed(() => level.value.edges);
const edgeSet = computed(() => new Set(edges.value.map(([a, b]) => key(a, b))));
const head = computed(() => (path.value.length ? path.value[path.value.length - 1] : -1));
const oddNodes = computed(() => {
  const deg = new Array(nodes.value.length).fill(0);
  edges.value.forEach(([a, b]) => {
    deg[a]++;
    deg[b]++;
  });
  return deg.map((d, i) => (d % 2 ? i : -1)).filter((i) => i >= 0);
});
const ruleHint = computed(() =>
  oddNodes.value.length === 2
    ? "這個圖形有 2 個奇點（亮起的點），請從其中一個出發。"
    : "全是偶點，從任意點出發都可以完成。"
);
const cleared = computed(() => solvedSet.value.size);

// ---- traversal ----
function enter(n) {
  if (path.value.length === 0) {
    if (oddNodes.value.length === 2 && !oddNodes.value.includes(n)) return false;
    path.value.push(n);
    return true;
  }
  const h = head.value;
  if (n === h) return false;
  if (path.value.length >= 2 && n === path.value[path.value.length - 2]) {
    const removed = path.value.pop();
    used.value.delete(key(removed, head.value));
    return true;
  }
  const ek = key(h, n);
  if (edgeSet.value.has(ek) && !used.value.has(ek)) {
    used.value.add(ek);
    path.value.push(n);
    return true;
  }
  return false;
}

function isVisited(i) {
  return path.value.includes(i);
}
function isStart(i) {
  return path.value.length === 0 && oddNodes.value.length === 2 && oddNodes.value.includes(i);
}

function checkWin() {
  if (solved.value || used.value.size !== edges.value.length) return;
  solved.value = true;
  dragging = false;
  hideRubber();
  if (!solvedSet.value.has(li.value)) {
    solvedSet.value.add(li.value);
    saveSolved();
  }
  const last = li.value === total - 1;
  overlay.lastLevel = last;
  overlay.title = last && solvedSet.value.size === total ? "全部完成！" : "過關！";
  overlay.sub = last ? "你已完成最後一關，太強了。" : "一筆完成，漂亮。準備好下一關了嗎？";
  overlay.open = true;
}

// ---- pointer input ----
function toView(e) {
  const r = svgRef.value.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * 100,
    y: ((e.clientY - r.top) / r.height) * 100,
  };
}
function nodeAt(e) {
  const p = toView(e);
  let best = -1;
  let bd = 9;
  const ns = nodes.value;
  for (let i = 0; i < ns.length; i++) {
    const d = Math.hypot(ns[i][0] - p.x, ns[i][1] - p.y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
function showRubber(e) {
  const h = head.value;
  if (h < 0 || solved.value) return hideRubber();
  const p = toView(e);
  rubber.x1 = nodes.value[h][0];
  rubber.y1 = nodes.value[h][1];
  rubber.x2 = p.x;
  rubber.y2 = p.y;
  rubber.show = true;
}
function hideRubber() {
  rubber.show = false;
}

function onDown(e) {
  if (solved.value) return;
  const n = nodeAt(e);
  if (n < 0) return;
  e.preventDefault();
  try {
    svgRef.value.setPointerCapture(e.pointerId);
  } catch (_) {}
  if (enter(n)) {
    dragging = true;
    showRubber(e);
    checkWin();
  } else if (n === head.value) {
    dragging = true;
    showRubber(e);
  }
}
function onMove(e) {
  if (!dragging || solved.value) return;
  showRubber(e);
  const n = nodeAt(e);
  if (n < 0 || n === head.value) return;
  if (enter(n)) {
    showRubber(e);
    checkWin();
  }
}
function onUp() {
  dragging = false;
  hideRubber();
}

// ---- controls ----
function build(index) {
  li.value = (index + total) % total;
  path.value = [];
  used.value = new Set();
  solved.value = false;
  dragging = false;
  hideRubber();
  overlay.open = false;
}
function resetLevel() {
  path.value = [];
  used.value = new Set();
  solved.value = false;
  overlay.open = false;
}
function undo() {
  if (path.value.length === 0) return;
  const removed = path.value.pop();
  if (path.value.length) used.value.delete(key(removed, head.value));
  solved.value = false;
  overlay.open = false;
}

// ---- persistence ----
function saveSolved() {
  localStorage.setItem(SAVE_KEY, JSON.stringify([...solvedSet.value]));
}

onMounted(() => {
  try {
    solvedSet.value = new Set(JSON.parse(localStorage.getItem(SAVE_KEY) || "[]"));
  } catch (_) {
    solvedSet.value = new Set();
  }
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="一筆畫" title-en="One Line">
      <template #actions>
        <button class="btn" @click="undo">復原</button>
        <button class="btn btn--accent" @click="resetLevel">重來</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">Level</span>
            <span class="chip__value is-accent">{{ li + 1 }} / {{ total }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">Edges</span>
            <span class="chip__value">{{ used.size }} / {{ edges.length }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">Cleared</span>
            <span class="chip__value">{{ cleared }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <svg
            ref="svgRef"
            class="oneline-board"
            viewBox="0 0 100 100"
            aria-label="一筆畫盤面"
            @pointerdown="onDown"
            @pointermove="onMove"
            @pointerup="onUp"
            @pointercancel="onUp"
          >
            <line
              v-for="(e, idx) in edges"
              :key="'e' + idx"
              class="edge"
              :class="{ 'is-drawn': used.has(key(e[0], e[1])) }"
              :x1="nodes[e[0]][0]"
              :y1="nodes[e[0]][1]"
              :x2="nodes[e[1]][0]"
              :y2="nodes[e[1]][1]"
            />
            <line
              v-if="rubber.show"
              class="rubber"
              :x1="rubber.x1"
              :y1="rubber.y1"
              :x2="rubber.x2"
              :y2="rubber.y2"
            />
            <circle
              v-for="(nd, i) in nodes"
              :key="'n' + i"
              class="node"
              :class="{ 'is-visited': isVisited(i), 'is-head': i === head, 'is-start': isStart(i) }"
              :cx="nd[0]"
              :cy="nd[1]"
              r="4.6"
            />
          </svg>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button class="btn" @click="resetLevel">再畫一次</button>
                <button v-if="!overlay.lastLevel" class="btn btn--accent" @click="build(li + 1)">
                  下一關
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="level-nav">
          <button class="btn btn--ghost" :disabled="li === 0" @click="build(li - 1)">← 上一關</button>
          <span class="level-name">{{ level.name }}</span>
          <button class="btn btn--ghost" :disabled="li === total - 1" @click="build(li + 1)">
            下一關 →
          </button>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">本關</span>
          <p class="hint">{{ ruleHint }}</p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            點一個點當起點，接著沿著線「拖曳」或「點擊」相鄰的點。<br />
            每條線只能畫一次，往回拖可以收回上一步。<br />
            畫完所有線段即過關。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">小提示</span>
          <p class="hint">
            若有兩個「奇點」(連奇數條線的點)，必須從其中一個出發；
            若全是「偶點」，從任意點出發都行。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.oneline-board {
  display: block;
  width: min(86vw, 56vh, 500px);
  height: min(86vw, 56vh, 500px);
  border-radius: var(--r-lg);
  background: radial-gradient(120% 120% at 50% 0%, var(--ink-800), var(--ink-900));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  touch-action: none;
  overflow: visible;
}
.edge {
  stroke: var(--ink-500);
  stroke-width: 2.4;
  stroke-linecap: round;
  transition: stroke var(--dur-fast) var(--ease), stroke-width var(--dur-fast) var(--ease);
}
.edge.is-drawn {
  stroke: var(--accent);
  stroke-width: 4;
  filter: drop-shadow(0 0 4px color-mix(in oklab, var(--accent) 70%, transparent));
}
.rubber {
  stroke: color-mix(in oklab, var(--accent) 55%, transparent);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 1 5;
  pointer-events: none;
}
.node {
  fill: var(--ink-700);
  stroke: var(--line-strong);
  stroke-width: 1.6;
  cursor: pointer;
  transition: fill var(--dur-fast) var(--ease), stroke var(--dur-fast) var(--ease);
}
.node.is-visited {
  fill: color-mix(in oklab, var(--accent) 35%, var(--ink-700));
  stroke: var(--accent);
}
.node.is-head {
  fill: var(--accent);
  stroke: var(--accent);
}
.node.is-start {
  stroke: var(--accent);
  animation: startPulse 1.6s var(--ease) infinite;
}
@keyframes startPulse {
  0%, 100% { stroke-opacity: 0.4; }
  50% { stroke-opacity: 1; }
}
.level-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  width: min(86vw, 56vh, 500px);
}
.level-name {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--text);
}
.level-nav .btn[disabled] {
  opacity: 0.35;
  pointer-events: none;
}
</style>
