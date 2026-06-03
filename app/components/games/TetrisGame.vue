<script setup>
/* 俄羅斯方塊 Tetris — canvas, DPR-crisp, keyboard + on-screen buttons.
   7-bag randomizer seeded by rng. Ghost piece, next preview, wall-kicks.
   Pure game logic lives in ~/games/tetris.ts. */

import {
  COLS, ROWS, PIECES, COLORS,
  emptyBoard, spawnPiece, getCells, collides,
  tryRotate as computeRotation,
  lockPiece, clearLines as computeClearLines,
  buildBag, nextFromBag,
} from "~/games/tetris";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(['solved']);

const accent = "#4ea8de";
const BEST_KEY = "playground.tetris.best";

const PREVIEW_SIZE = 4;

// ---- reactive HUD ----
const canvasRef = ref(null);
const previewRef = ref(null);
const score = ref(0);
const best = ref(0);
const level = ref(1);
const lines = ref(0);
const paused = ref(false);
const overlay = reactive({ open: true, mode: 'start', title: '準備好了嗎？', sub: '用方向鍵移動，↑ 旋轉，空白鍵直落。', action: '開始遊戲' });

// ---- non-reactive state ----
let ctx = null, pCtx = null;
let cellW = 0, cellH = 0, boardW = 0, boardH = 0;
let pCell = 0;
let board = [];           // 2D array [row][col] = color or null
let current = null;       // { type, rot, x, y }
let nextPiece = null;
let bag = [];
let rng = makeRng(props.seed);
let rafId = 0;
let started = false, over = false;
let dropAcc = 0, dropInterval = 800, lastT = 0;
let lockDelay = 0, lockPending = false;
let softDropping = false;

// buildBag, nextFromBag, emptyBoard, spawnPiece, getCells, collides
// are imported from ~/games/tetris (bound to the reactive `rng`/`board`).

function tryRotate(cw) {
  const result = computeRotation(board, current, cw);
  if (result !== current) {
    current = result;
    lockPending = false;
  }
}

function hardDrop() {
  let dy = 0;
  while (!collides(board, current, 0, dy + 1)) dy++;
  current = { ...current, y: current.y + dy };
  score.value += dy * 2;
  lock();
}

function lock() {
  // Check for game-over: any cell above the visible area
  for (const { y } of getCells(current)) {
    if (y < 0) { gameOver(); return; }
  }
  lockPiece(board, current);
  applyLineClears();
  const t = nextFromBag(bag, rng);
  nextPiece = spawnPiece(nextFromBag(bag, rng));
  current = spawnPiece(t);
  // spawn at visible top
  current.y = 0;
  if (collides(board, current)) { gameOver(); return; }
  lockPending = false;
  lockDelay = 0;
  drawPreview();
}

function applyLineClears() {
  const result = computeClearLines(board);
  if (result.linesCleared === 0) return;
  board = result.board;
  const earned = result.basePoints * level.value;
  score.value += earned;
  lines.value += result.linesCleared;
  const newLvl = Math.floor(lines.value / 10) + 1;
  if (newLvl > level.value) {
    level.value = newLvl;
    dropInterval = Math.max(80, 800 - (level.value - 1) * 70);
  }
  if (score.value > best.value) {
    best.value = score.value;
    localStorage.setItem(BEST_KEY, String(best.value));
  }
}

function ghostY() {
  let dy = 0;
  while (!collides(board, current, 0, dy + 1)) dy++;
  return current.y + dy;
}

function gameOver() {
  over = true;
  started = false;
  if (score.value > best.value) {
    best.value = score.value;
    localStorage.setItem(BEST_KEY, String(best.value));
  }
  showOverlay('restart', '遊戲結束', `得分 ${score.value}　·　最佳 ${best.value}`, '再玩一次');
}

function reset() {
  rng = makeRng(props.seed);
  board = emptyBoard();
  bag = buildBag(rng);
  score.value = 0; lines.value = 0; level.value = 1;
  dropInterval = 800; dropAcc = 0; lockDelay = 0; lockPending = false;
  over = false; paused.value = false;
  const t = nextFromBag(bag, rng);
  nextPiece = spawnPiece(nextFromBag(bag, rng));
  current = spawnPiece(t);
  current.y = 0;
}

function start() {
  if (over) { reset(); }
  started = true; over = false; paused.value = false;
  overlay.open = false;
  lastT = 0;
}

function restart() { reset(); start(); }

function togglePause() {
  if (!started || over) return;
  paused.value = !paused.value;
  if (paused.value) showOverlay('resume', '已暫停', '隨時繼續。', '繼續遊戲');
  else overlay.open = false;
}

function overlayAction() {
  if (overlay.mode === 'resume') togglePause();
  else start();
}

function showOverlay(mode, title, sub, action) {
  overlay.mode = mode; overlay.title = title; overlay.sub = sub; overlay.action = action; overlay.open = true;
}

// ---- drawing ----
function drawBoard() {
  if (!ctx) return;
  ctx.clearRect(0, 0, boardW, boardH);

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * cellW, 0); ctx.lineTo(c * cellW, boardH); ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * cellH); ctx.lineTo(boardW, r * cellH); ctx.stroke();
  }

  // locked cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) drawCell(ctx, c, r, board[r][c], cellW, cellH, false);
    }
  }

  if (!current) return;

  // ghost
  const gy = ghostY();
  if (gy !== current.y) {
    const gc = getCells({ ...current, y: gy });
    for (const { x, y } of gc) drawCell(ctx, x, y, COLORS[current.type], cellW, cellH, true);
  }

  // current
  const cells = getCells(current);
  for (const { x, y } of cells) {
    if (y >= 0) drawCell(ctx, x, y, COLORS[current.type], cellW, cellH, false);
  }
}

function drawCell(c, col, row, color, cw, ch, ghost) {
  const x = col * cw + 1;
  const y = row * ch + 1;
  const w = cw - 2;
  const h = ch - 2;
  const r = Math.min(3, w * 0.15);
  if (ghost) {
    c.globalAlpha = 0.18;
    c.fillStyle = color;
  } else {
    c.globalAlpha = 1;
    c.fillStyle = color;
  }
  roundRect(c, x, y, w, h, r);
  c.fill();
  if (!ghost) {
    c.globalAlpha = 0.35;
    c.fillStyle = '#fff';
    roundRect(c, x + 2, y + 2, w * 0.4, h * 0.25, 2);
    c.fill();
  }
  c.globalAlpha = 1;
}

function drawPreview() {
  if (!pCtx || !nextPiece) return;
  const size = pCell * PREVIEW_SIZE;
  pCtx.clearRect(0, 0, size, size);
  const cells = PIECES[nextPiece.type][0];
  // center in 4x4 box
  for (const [dc, dr] of cells) {
    drawCell(pCtx, dc, dr, COLORS[nextPiece.type], pCell, pCell, false);
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// ---- loop ----
function loop(ts) {
  rafId = requestAnimationFrame(loop);
  if (!lastT) lastT = ts;
  const dt = Math.min(ts - lastT, 100);
  lastT = ts;

  if (started && !paused.value && !over && current) {
    const speed = softDropping ? Math.min(dropInterval, 50) : dropInterval;
    dropAcc += dt;
    if (dropAcc >= speed) {
      dropAcc -= speed;
      if (!collides(board, current, 0, 1)) {
        current = { ...current, y: current.y + 1 };
        if (softDropping) score.value += 1;
        lockPending = false;
        lockDelay = 0;
      } else {
        lockPending = true;
      }
    }
    if (lockPending) {
      lockDelay += dt;
      if (lockDelay >= 500) lock();
    }
  }

  drawBoard();
}

// ---- sizing ----
function resize() {
  const canvas = canvasRef.value;
  const preview = previewRef.value;
  if (!canvas || !preview) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const rect = canvas.getBoundingClientRect();
  boardW = rect.width;
  boardH = rect.height;
  canvas.width = Math.round(boardW * dpr);
  canvas.height = Math.round(boardH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cellW = boardW / COLS;
  cellH = boardH / ROWS;

  const pr = preview.getBoundingClientRect();
  pCell = pr.width / PREVIEW_SIZE;
  preview.width = Math.round(pr.width * dpr);
  preview.height = Math.round(pr.width * dpr);
  pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawBoard();
  drawPreview();
}

// ---- input ----
let das = 0, arr = 0, dasDir = null;
const DAS_DELAY = 170, ARR_INTERVAL = 50;

function moveH(dx) {
  if (!started || over || paused.value || !current) return;
  if (!collides(board, current, dx, 0)) {
    current = { ...current, x: current.x + dx };
    if (lockPending) { lockDelay = 0; }
  }
}

function onKey(e) {
  if (e.key === ' ') { e.preventDefault(); if (!started && !over) start(); else if (!over) hardDrop(); return; }
  if (e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); return; }
  if (!started || over || paused.value) return;
  switch (e.key) {
    case 'ArrowLeft':  e.preventDefault(); moveH(-1); dasDir = 'left'; das = 0; break;
    case 'ArrowRight': e.preventDefault(); moveH(1);  dasDir = 'right'; das = 0; break;
    case 'ArrowDown':  e.preventDefault(); softDropping = true; break;
    case 'ArrowUp': case 'x': case 'X': e.preventDefault(); tryRotate(true); break;
    case 'z': case 'Z': e.preventDefault(); tryRotate(false); break;
    case 'c': case 'C': e.preventDefault(); tryRotate(false); break;
  }
}
function onKeyUp(e) {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { dasDir = null; das = 0; arr = 0; }
  if (e.key === 'ArrowDown') softDropping = false;
}

function onVis() {
  if (document.hidden && started && !over && !paused.value) togglePause();
}

watch(() => props.seed, () => {
  rng = makeRng(props.seed);
  reset();
  if (started) start();
});

onMounted(() => {
  ctx = canvasRef.value.getContext('2d');
  pCtx = previewRef.value.getContext('2d');
  best.value = +(localStorage.getItem(BEST_KEY) || 0);
  reset();
  resize();
  showOverlay('start', '俄羅斯方塊', '方向鍵移動，↑ 旋轉，空白鍵直落。', '開始遊戲');
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('visibilitychange', onVis);
  rafId = requestAnimationFrame(loop);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  window.removeEventListener('resize', resize);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKeyUp);
  document.removeEventListener('visibilitychange', onVis);
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="俄羅斯方塊" title-en="Tetris">
      <template #actions>
        <button class="btn" :aria-pressed="paused" @click="togglePause">{{ paused ? '繼續' : '暫停' }}</button>
        <button class="btn btn--accent" @click="restart">重新開始</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">分數</span>
            <span class="chip__value is-accent">{{ score }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">最佳</span>
            <span class="chip__value">{{ best }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">等級</span>
            <span class="chip__value">{{ level }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">消行</span>
            <span class="chip__value">{{ lines }}</span>
          </div>
        </div>

        <div class="tetris-layout">
          <div class="board-wrap">
            <canvas ref="canvasRef" class="tetris-board" aria-label="俄羅斯方塊遊戲畫面" />
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

          <div class="tetris-side">
            <div class="next-label">下一個</div>
            <canvas ref="previewRef" class="tetris-preview" aria-label="下一個方塊預覽" />
          </div>
        </div>

        <!-- Mobile controls -->
        <div class="tetris-btns show-touch-only">
          <div class="tetris-row">
            <button class="ctrl-btn" aria-label="左移" @click="moveH(-1)">◀</button>
            <button class="ctrl-btn" aria-label="旋轉" @click="tryRotate(true)">↻</button>
            <button class="ctrl-btn" aria-label="右移" @click="moveH(1)">▶</button>
          </div>
          <div class="tetris-row">
            <button class="ctrl-btn ctrl-btn--wide" aria-label="軟降" @pointerdown="softDropping=true" @pointerup="softDropping=false" @pointercancel="softDropping=false">▼ 軟降</button>
            <button class="ctrl-btn ctrl-btn--wide ctrl-btn--accent" aria-label="直落" @click="hardDrop">⬇ 直落</button>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">操作方式</span>
          <p class="hint">
            移動：<kbd>←</kbd><kbd>→</kbd><br />
            旋轉（順時針）：<kbd>↑</kbd> 或 <kbd>X</kbd><br />
            旋轉（逆時針）：<kbd>Z</kbd><br />
            軟降：<kbd>↓</kbd>（按住加速）<br />
            直落：<kbd>空白鍵</kbd><br />
            暫停：<kbd>P</kbd>
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">計分</span>
          <p class="hint">
            消 1 行：100 × 等級<br />
            消 2 行：300 × 等級<br />
            消 3 行：500 × 等級<br />
            消 4 行（俄羅斯）：800 × 等級<br />
            直落：每格 +2 分
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.tetris-layout {
  display: flex;
  gap: 0.8rem;
  align-items: flex-start;
  /* Ensure .board-wrap doesn't grow/shrink the side column */
  flex: none;
}
.tetris-board {
  display: block;
  width: min(42vw, 36vh, 280px);
  height: min(84vw, 72vh, 560px);
  border-radius: var(--r-lg);
  background: linear-gradient(180deg, var(--ink-850), var(--ink-900));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2), inset 0 0 0 1px rgba(255,255,255,0.02);
  touch-action: none;
}
.board-wrap .overlay { border-radius: var(--r-lg); }

.tetris-side {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  /* Fixed width so the side column never causes horizontal reflow
     as the score/level/lines values change in the main HUD.
     Width = preview canvas max size + borders */
  flex: none;
  width: min(18vw, 15vh, 112px);
}
.next-label {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-faint);
  text-align: center;
}
.tetris-preview {
  display: block;
  /* Width driven by parent .tetris-side fixed width; height via aspect-ratio
     so the preview is always square without duplicating the min() calc */
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--r-md);
  background: var(--ink-800);
  border: 1px solid var(--line);
}

.tetris-btns {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: min(42vw, 280px);
}
.tetris-row {
  display: flex;
  gap: 0.4rem;
}
.ctrl-btn {
  flex: 1;
  padding: 0.9rem 0.5rem;
  border-radius: var(--r-sm);
  background: var(--ink-700);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 1.1rem;
  font-family: var(--font-mono);
  transition: background var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
.ctrl-btn:active {
  background: var(--accent);
  color: var(--accent-ink);
  /* Use box-shadow inset instead of scale so no layout box size changes */
  box-shadow: inset 0 0 0 2px rgba(0,0,0,0.25);
}
.ctrl-btn--wide { font-size: 0.8rem; }
.ctrl-btn--accent { background: color-mix(in oklab, var(--accent) 30%, var(--ink-700)); }
</style>
