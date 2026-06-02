<script setup>
/* 貪食蛇 Snake — canvas, grid-stepped, DPR-crisp.
   Keyboard + WASD + swipe + on-screen D-pad. High score in localStorage. */

const GRID = 19;
const accent = "#9ce85a";
const accentRGB = hexToRgb(accent);
const BEST_KEY = "playground.snake.best";

const DIRS = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};
const OPP = { up: "down", down: "up", left: "right", right: "left" };

// ---- reactive HUD / UI ----
const canvasRef = ref(null);
const score = ref(0);
const best = ref(0);
const level = ref(1);
const paused = ref(false);
const wrap = ref(false);
const overlay = reactive({
  open: true, mode: "start",
  title: "準備好了嗎？", sub: "用方向鍵 / WASD 控制，或在畫面上滑動。", action: "開始遊戲",
});

// ---- non-reactive game state (hot loop) ----
let ctx = null, size = 0, cell = 0;
let snake, dir, queue, food, stepInterval, acc = 0, lastT = 0, rafId = 0;
let started = false, over = false;

function reset() {
  const c = Math.floor(GRID / 2);
  snake = [
    { x: c, y: c }, { x: c - 1, y: c }, { x: c - 2, y: c },
  ];
  dir = "right";
  queue = [];
  score.value = 0;
  level.value = 1;
  stepInterval = 135;
  over = false;
  paused.value = false;
  placeFood();
}

function start() {
  if (over) reset();
  started = true;
  paused.value = false;
  over = false;
  acc = 0;
  lastT = 0;
  overlay.open = false;
}

function restart() {
  reset();
  start();
}

function gameOver() {
  over = true;
  started = false;
  if (score.value > best.value) {
    best.value = score.value;
    localStorage.setItem(BEST_KEY, String(best.value));
  }
  showOverlay("restart", "遊戲結束", `本局得分 ${score.value}　·　最佳 ${best.value}`, "再玩一次");
}

function togglePause() {
  if (!started || over) return;
  paused.value = !paused.value;
  if (paused.value) showOverlay("resume", "已暫停", "休息一下，準備好再繼續。", "繼續遊戲");
  else overlay.open = false;
}

function step() {
  while (queue.length) {
    const d = queue.shift();
    if (d !== OPP[dir]) { dir = d; break; }
  }
  const d = DIRS[dir];
  let nx = snake[0].x + d.x;
  let ny = snake[0].y + d.y;

  if (wrap.value) {
    nx = (nx + GRID) % GRID;
    ny = (ny + GRID) % GRID;
  } else if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) {
    return gameOver();
  }

  const ate = food && nx === food.x && ny === food.y;
  const limit = ate ? snake.length : snake.length - 1;
  for (let i = 0; i < limit; i++) {
    if (snake[i].x === nx && snake[i].y === ny) return gameOver();
  }

  snake.unshift({ x: nx, y: ny });
  if (ate) {
    score.value += 10;
    if (score.value % 50 === 0) {
      level.value++;
      stepInterval = Math.max(60, stepInterval - 12);
    }
    placeFood();
  } else {
    snake.pop();
  }
}

function placeFood() {
  const occ = new Set(snake.map((s) => s.x + "," + s.y));
  const free = [];
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++)
      if (!occ.has(x + "," + y)) free.push({ x, y });
  food = free.length ? free[(Math.random() * free.length) | 0] : null;
}

// ---- rendering ----
function draw(ts) {
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  drawGrid();
  if (food) drawFood(ts || 0);
  drawSnake();
}
function drawGrid() {
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.beginPath();
  for (let i = 1; i < GRID; i++) {
    const p = Math.round(i * cell) + 0.5;
    ctx.moveTo(p, 0); ctx.lineTo(p, size);
    ctx.moveTo(0, p); ctx.lineTo(size, p);
  }
  ctx.stroke();
}
function drawFood(ts) {
  const cx = (food.x + 0.5) * cell;
  const cy = (food.y + 0.5) * cell;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pulse = reduce ? 0 : Math.sin(ts / 240) * 0.06;
  const r = cell * (0.32 + pulse);
  ctx.save();
  ctx.shadowColor = "rgba(255,93,108,0.7)";
  ctx.shadowBlur = cell * 0.6;
  ctx.fillStyle = "#ff5d6c";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.35, cy - r * 0.85, r * 0.34, r * 0.18, -0.7, 0, Math.PI * 2);
  ctx.fill();
}
function drawSnake() {
  const n = snake.length;
  for (let i = n - 1; i >= 0; i--) {
    const s = snake[i];
    const pad = cell * 0.1;
    const x = s.x * cell + pad;
    const y = s.y * cell + pad;
    const w = cell - pad * 2;
    const r = w * 0.32;
    const t = 1 - i / Math.max(n, 8);
    const alpha = 0.45 + 0.55 * t;
    if (i === 0) {
      ctx.save();
      ctx.shadowColor = accent;
      ctx.shadowBlur = cell * 0.5;
      ctx.fillStyle = accent;
      roundRect(x, y, w, w, r);
      ctx.fill();
      ctx.restore();
      drawEyes(s);
    } else {
      ctx.fillStyle = `rgba(${accentRGB.r},${accentRGB.g},${accentRGB.b},${alpha})`;
      roundRect(x, y, w, w, r);
      ctx.fill();
    }
  }
}
function drawEyes(head) {
  const cx = (head.x + 0.5) * cell;
  const cy = (head.y + 0.5) * cell;
  const d = DIRS[dir];
  const perp = { x: -d.y, y: d.x };
  const fwd = cell * 0.12, off = cell * 0.18, er = cell * 0.085;
  ctx.fillStyle = "#0a0b0f";
  for (const sgn of [1, -1]) {
    const ex = cx + d.x * fwd + perp.x * off * sgn;
    const ey = cy + d.y * fwd + perp.y * off * sgn;
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fill();
  }
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- loop ----
function loop(ts) {
  rafId = requestAnimationFrame(loop);
  if (!lastT) lastT = ts;
  const dt = ts - lastT;
  lastT = ts;
  if (started && !paused.value && !over) {
    acc += dt;
    let guard = 0;
    while (acc >= stepInterval && guard++ < 8) {
      acc -= stepInterval;
      step();
      if (over) break;
    }
  }
  draw(ts);
}

// ---- overlay ----
function showOverlay(mode, title, sub, action) {
  overlay.mode = mode; overlay.title = title;
  overlay.sub = sub; overlay.action = action; overlay.open = true;
}
function overlayAction() {
  if (overlay.mode === "resume") togglePause();
  else start();
}

// ---- input ----
function pushDir(d) {
  if (over) return;
  if (!started) start();
  const lastIntent = queue.length ? queue[queue.length - 1] : dir;
  if (d === lastIntent || d === OPP[lastIntent]) return;
  if (queue.length < 2) queue.push(d);
}
const KEYMAP = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
};
function onKey(e) {
  if (e.key === " " || e.key === "p" || e.key === "P") {
    e.preventDefault();
    if (!started && !over) start();
    else togglePause();
    return;
  }
  const dd = KEYMAP[e.key];
  if (dd) { e.preventDefault(); pushDir(dd); }
}

let sx = 0, sy = 0, swiping = false;
function onDown(e) { swiping = true; sx = e.clientX; sy = e.clientY; }
function onUp(e) {
  if (!swiping) return;
  swiping = false;
  const dx = e.clientX - sx, dy = e.clientY - sy;
  if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
    if (!started && !over) start();
    return;
  }
  if (Math.abs(dx) > Math.abs(dy)) pushDir(dx > 0 ? "right" : "left");
  else pushDir(dy > 0 ? "down" : "up");
}
function onVis() {
  if (document.hidden && started && !over && !paused.value) togglePause();
}

// ---- sizing ----
function resize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  size = Math.round(rect.width);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cell = size / GRID;
  draw();
}

function hexToRgb(hex) {
  const m = hex.replace("#", "");
  const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const int = parseInt(v, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

onMounted(() => {
  ctx = canvasRef.value.getContext("2d");
  best.value = +(localStorage.getItem(BEST_KEY) || 0);
  reset();
  resize();
  showOverlay("start", "準備好了嗎？", "用方向鍵 / WASD 控制，或在畫面上滑動。", "開始遊戲");
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVis);
  rafId = requestAnimationFrame(loop);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  window.removeEventListener("resize", resize);
  window.removeEventListener("keydown", onKey);
  document.removeEventListener("visibilitychange", onVis);
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="貪食蛇" title-en="Snake">
      <template #actions>
        <button class="btn" :aria-pressed="paused" @click="togglePause">
          {{ paused ? "繼續" : "暫停" }}
        </button>
        <button class="btn btn--accent" @click="restart">重新開始</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">Score</span>
            <span class="chip__value is-accent">{{ score }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">Best</span>
            <span class="chip__value">{{ best }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">Speed</span>
            <span class="chip__value">{{ level }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <canvas
            ref="canvasRef"
            class="game-board"
            aria-label="貪食蛇遊戲畫面"
            @pointerdown="onDown"
            @pointerup="onUp"
          />
          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button class="btn btn--accent" @click="overlayAction">{{ overlay.action }}</button>
              </div>
            </div>
          </div>
        </div>

        <div class="dpad show-touch-only">
          <button class="up" aria-label="上" @click="pushDir('up')">▲</button>
          <button class="left" aria-label="左" @click="pushDir('left')">◀</button>
          <button class="right" aria-label="右" @click="pushDir('right')">▶</button>
          <button class="down" aria-label="下" @click="pushDir('down')">▼</button>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">玩法設定</span>
          <div class="toggle-row">
            <span>穿牆模式</span>
            <button class="switch" role="switch" :aria-checked="wrap" aria-label="穿牆模式" @click="wrap = !wrap" />
          </div>
          <p class="hint">開啟後，從邊界穿出會由另一側出現；關閉則撞牆即結束。</p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">操作方式</span>
          <p class="hint">
            移動：<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> 或 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><br />
            暫停：<kbd>空白鍵</kbd> 或 <kbd>P</kbd><br />
            行動裝置可直接在畫面上滑動。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">關於</span>
          <p class="hint">每吃一顆果實 +10 分，速度也會逐步加快。小心別咬到自己！</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.game-board {
  display: block;
  width: min(86vw, 60vh, 540px);
  height: min(86vw, 60vh, 540px);
  border-radius: var(--r-lg);
  background: linear-gradient(180deg, var(--ink-850), var(--ink-900));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2), inset 0 0 0 1px rgba(255, 255, 255, 0.02);
  touch-action: none;
}
.board-wrap .overlay {
  border-radius: var(--r-lg);
}
</style>
