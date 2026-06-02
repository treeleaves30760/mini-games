<script setup>
/* 迷宮 Maze — perfect maze via recursive-backtracker DFS, rendered on canvas.
   Player: top-left. Goal: bottom-right. Arrow/WASD + swipe + on-screen D-pad.
   Faint visited trail, accent-dot player, glowing goal. HUD: 步數, 時間. */

const accent = "#62b6ff";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const SIZES = [11, 15, 21];
const SIZE_LABELS = ["11", "15", "21"];
const SAVE_KEY = "playground.maze2d.best";

const sizeIdx = ref(1);
const mazeSize = computed(() => props.daily ? 15 : SIZES[sizeIdx.value]);

const canvasRef = ref(null);
const steps = ref(0);
const elapsed = ref(0);
const bestSteps = ref(null);
const won = ref(false);
const overlay = reactive({ open: false, title: "", sub: "" });

// maze walls stored as bit flags per cell: N=1,E=2,S=4,W=8
// 0 means no wall passage open in that direction
let maze = null;
let rows = 0, cols = 0;
let px = 0, py = 0;
let visited = null;  // visited trail
let ctx = null;
let canvasSize = 0;
let rafId = 0;
let timerInterval = null;
let startTime = 0;
let rng = makeRng(props.seed);

// ---- maze generation (recursive-backtracker DFS) ----
const N = 1, E = 2, S = 4, W = 8;
const OPPOSITE = { [N]: S, [S]: N, [E]: W, [W]: E };
const DR = { [N]: -1, [S]: 1, [E]: 0, [W]: 0 };
const DC = { [N]: 0, [S]: 0, [E]: 1, [W]: -1 };

function generateMaze(size) {
  const r = size, c = size;
  // walls[row][col] = bitmask of OPEN directions (passage exists)
  const walls = Array.from({ length: r }, () => new Uint8Array(c));
  const cellVisited = Array.from({ length: r }, () => new Uint8Array(c));
  const stack = [];
  const startR = 0, startC = 0;
  cellVisited[startR][startC] = 1;
  stack.push([startR, startC]);

  while (stack.length) {
    const [cr, cc] = stack[stack.length - 1];
    const dirs = rng.shuffle([N, E, S, W]);
    let moved = false;
    for (const d of dirs) {
      const nr = cr + DR[d];
      const nc = cc + DC[d];
      if (nr < 0 || nc < 0 || nr >= r || nc >= c) continue;
      if (cellVisited[nr][nc]) continue;
      // carve passage
      walls[cr][cc] |= d;
      walls[nr][nc] |= OPPOSITE[d];
      cellVisited[nr][nc] = 1;
      stack.push([nr, nc]);
      moved = true;
      break;
    }
    if (!moved) stack.pop();
  }
  return walls;
}

function generate() {
  clearInterval(timerInterval);
  rng = makeRng(props.seed);
  rows = cols = mazeSize.value;
  maze = generateMaze(rows);
  px = 0; py = 0;
  visited = Array.from({ length: rows }, () => new Uint8Array(cols));
  visited[0][0] = 1;
  steps.value = 0;
  elapsed.value = 0;
  won.value = false;
  overlay.open = false;
  startTime = Date.now();
  timerInterval = setInterval(() => {
    if (!won.value) elapsed.value = Math.floor((Date.now() - startTime) / 1000);
  }, 1000);
  resize();
}

watch(() => props.seed, generate);
watch(sizeIdx, () => { if (!props.daily) generate(); });

// ---- movement ----
function move(dr, dc) {
  if (won.value) return;
  const dir = dr === -1 ? N : dr === 1 ? S : dc === 1 ? E : W;
  if (!(maze[py][px] & dir)) return; // wall blocks
  const nr = py + dr;
  const nc = px + dc;
  if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) return;
  py = nr; px = nc;
  steps.value++;
  visited[py][px] = 1;
  if (py === rows - 1 && px === cols - 1) {
    onWin();
  }
}

function onWin() {
  won.value = true;
  clearInterval(timerInterval);
  const s = steps.value;
  const t = elapsed.value;
  if (bestSteps.value === null || s < bestSteps.value) {
    bestSteps.value = s;
    saveBest();
  }
  emit("solved", { steps: s, time: t });
  if (props.daily) {
    overlay.title = "完成！";
    overlay.sub = `${s} 步，${formatTime(t)} 走出迷宮。`;
  } else {
    overlay.title = "走出去了！";
    overlay.sub = `用 ${s} 步，耗時 ${formatTime(t)}。`;
  }
  overlay.open = true;
}

// ---- rendering ----
function draw() {
  if (!ctx || !maze) return;
  ctx.clearRect(0, 0, canvasSize, canvasSize);

  const cell = canvasSize / rows;
  const wall = Math.max(1, cell * 0.08);

  // background
  ctx.fillStyle = "#0d0f14";
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  // visited trail
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (visited[r][c]) {
        ctx.fillStyle = "rgba(98,182,255,0.10)";
        ctx.fillRect(c * cell + wall, r * cell + wall, cell - wall * 2, cell - wall * 2);
      }
    }
  }

  // walls
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = wall;
  ctx.lineCap = "round";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cell, y = r * cell;
      const w = maze[r][c];
      ctx.beginPath();
      // draw walls where NO passage
      if (!(w & N)) { ctx.moveTo(x, y); ctx.lineTo(x + cell, y); }
      if (!(w & E)) { ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); }
      if (!(w & S)) { ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y + cell); }
      if (!(w & W)) { ctx.moveTo(x, y); ctx.lineTo(x, y + cell); }
      ctx.stroke();
    }
  }

  // outer border
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = wall * 1.5;
  ctx.strokeRect(wall * 0.75, wall * 0.75, canvasSize - wall * 1.5, canvasSize - wall * 1.5);

  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ts = performance.now();

  // goal glow
  const gx = (cols - 1) * cell + cell / 2;
  const gy = (rows - 1) * cell + cell / 2;
  const pulse = reduce ? 0 : Math.sin(ts / 500) * 0.15;
  const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, cell * (0.45 + pulse));
  gr.addColorStop(0, "rgba(255,215,80,0.95)");
  gr.addColorStop(0.35, "rgba(255,200,40,0.6)");
  gr.addColorStop(1, "transparent");
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(gx, gy, cell * (0.45 + pulse), 0, Math.PI * 2);
  ctx.fill();
  // star icon
  ctx.fillStyle = "#ffd750";
  ctx.font = `${cell * 0.55}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("★", gx, gy);

  // player
  const playerX = px * cell + cell / 2;
  const playerY = py * cell + cell / 2;
  const pr = cell * 0.3;
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = cell * 0.7;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(playerX, playerY, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // inner highlight
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.arc(playerX - pr * 0.3, playerY - pr * 0.3, pr * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

function loop() {
  rafId = requestAnimationFrame(loop);
  draw();
}

// ---- resize ----
function resize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  canvasSize = Math.round(rect.width);
  canvas.width = Math.round(canvasSize * dpr);
  canvas.height = Math.round(canvasSize * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---- keyboard ----
const KEYMAP = {
  ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
  w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
  W: [-1, 0], S: [1, 0], A: [0, -1], D: [0, 1],
};
function onKey(e) {
  const mv = KEYMAP[e.key];
  if (mv) { e.preventDefault(); move(mv[0], mv[1]); }
}

// ---- swipe ----
let swipeX = 0, swipeY = 0;
function onPointerDown(e) { swipeX = e.clientX; swipeY = e.clientY; }
function onPointerUp(e) {
  const dx = e.clientX - swipeX;
  const dy = e.clientY - swipeY;
  if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
  if (Math.abs(dx) > Math.abs(dy)) move(0, dx > 0 ? 1 : -1);
  else move(dy > 0 ? 1 : -1, 0);
}

// ---- helpers ----
function formatTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function saveBest() {
  try { localStorage.setItem(SAVE_KEY, String(bestSteps.value)); } catch (_) {}
}

onMounted(() => {
  ctx = canvasRef.value.getContext("2d");
  try { bestSteps.value = +localStorage.getItem(SAVE_KEY) || null; } catch (_) {}
  generate();
  rafId = requestAnimationFrame(loop);
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", resize);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  clearInterval(timerInterval);
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", resize);
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="迷宮" title-en="Maze">
      <template #actions>
        <button class="btn btn--accent" @click="generate">新迷宮</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">步數</span>
            <span class="chip__value is-accent">{{ steps }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">時間</span>
            <span class="chip__value">{{ formatTime(elapsed) }}</span>
          </div>
          <!-- always render so the HUD row never reflows when a best is first set -->
          <div class="chip">
            <span class="chip__label">最佳</span>
            <span class="chip__value">{{ bestSteps !== null ? bestSteps : '—' }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <canvas
            ref="canvasRef"
            class="maze-canvas"
            aria-label="迷宮遊戲畫面"
            @pointerdown="onPointerDown"
            @pointerup="onPointerUp"
          />
          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button v-if="!props.daily" class="btn btn--accent" @click="generate">新迷宮</button>
                <button v-else class="btn" disabled>完成！</button>
              </div>
            </div>
          </div>
        </div>

        <div class="dpad show-touch-only" aria-label="方向控制">
          <button class="up" aria-label="向上" @click="move(-1, 0)">▲</button>
          <button class="left" aria-label="向左" @click="move(0, -1)">◀</button>
          <button class="right" aria-label="向右" @click="move(0, 1)">▶</button>
          <button class="down" aria-label="向下" @click="move(1, 0)">▼</button>
        </div>
      </div>

      <aside class="panel">
        <div v-if="!props.daily" class="panel__group">
          <span class="panel__legend">尺寸</span>
          <div class="seg">
            <button
              v-for="(label, i) in SIZE_LABELS"
              :key="i"
              :class="{ 'is-active': sizeIdx === i }"
              :aria-pressed="sizeIdx === i"
              @click="sizeIdx = i"
            >{{ label }}</button>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">目標</span>
          <p class="hint">從左上角（藍點）出發，找到右下角的金星。每個迷宮都有唯一通道可達終點。</p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">操作方式</span>
          <p class="hint">
            鍵盤：<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> 或 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><br />
            觸控：在畫面上滑動，或點擊下方按鈕移動。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.maze-canvas {
  display: block;
  width: min(86vw, 60vh, 540px);
  height: min(86vw, 60vh, 540px);
  border-radius: var(--r-lg);
  background: var(--ink-850);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  touch-action: none;
}

.board-wrap .overlay {
  border-radius: var(--r-lg);
}

/* Size-selector seg: reserve height even in daily mode (always same height)
   so stage layout doesn't shift when the aside panel content differs. */

/* Stable chip widths: chip__value with tabular-nums already set globally;
   ensure "最佳" step count doesn't widen the chip after first win */
.chip .chip__value {
  font-variant-numeric: tabular-nums;
  min-width: 3ch;
  display: block;
  text-align: center;
}
</style>
