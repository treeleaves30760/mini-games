<script setup>
/* 打磚塊 Breakout — canvas, DPR-crisp, mouse/touch/keyboard paddle.
   Brick layout seeded by rng so daily is reproducible.
   emit('solved') on final level cleared. */

// ---- pure game logic (unit-tested) ----
import {
  COLS,
  BRICK_ROWS,
  TOTAL_LEVELS,
  LIVES_START,
  buildBricks as _buildBricks,
  reflectWalls,
  reflectPaddle,
  collideBrick,
  allBricksCleared,
  isBallLost,
  brickHitScore,
} from "~/games/breakout";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(['solved']);

const accent = '#ff6f91';
const BEST_KEY = 'playground.breakout.best';

// reactive HUD
const canvasRef = ref(null);
const score = ref(0);
const best = ref(0);
const lives = ref(LIVES_START);
const lvl = ref(1);
const paused = ref(false);
const overlay = reactive({ open: true, mode: 'start', title: '打磚塊', sub: '移動滑鼠 / 手指拖曳控制板子，空白鍵發球。', action: '開始遊戲' });

// non-reactive state
let ctx = null;
let W = 0, H = 0;
let rafId = 0, lastT = 0;
let started = false, over = false;
let rng = makeRng(props.seed);
let reducedMotion = false;

// game objects
let paddle = { x: 0, y: 0, w: 0, h: 0 };
let ball = { x: 0, y: 0, vx: 0, vy: 0, r: 0, launched: false };
let bricks = [];  // { x, y, w, h, hp, maxHp, alive }
let brickW = 0, brickH = 0, brickPad = 0;

// input
let keys = { left: false, right: false };
let mouseX = null;

function buildBricks(lvlNum) {
  bricks = _buildBricks(props.seed, lvlNum);
}

function layoutObjects() {
  const pad = brickPad;
  const totalPadW = pad * (COLS + 1);
  brickW = (W - totalPadW) / COLS;
  brickH = Math.max(16, Math.min(26, H * 0.045));
  const topOff = H * 0.1;

  for (const b of bricks) {
    b.x = pad + b.col * (brickW + pad);
    b.y = topOff + b.row * (brickH + pad);
    b.w = brickW;
    b.h = brickH;
  }

  paddle.w = Math.min(120, W * 0.22);
  paddle.h = 12;
  paddle.y = H - paddle.h - 18;
  if (paddle.x === 0) paddle.x = W / 2 - paddle.w / 2;

  ball.r = Math.max(7, Math.min(10, W * 0.015));
  if (!ball.launched) {
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.r - 2;
  }
}

function launchBall() {
  if (ball.launched) return;
  const speed = 4.5 + (lvl.value - 1) * 0.6;
  const angle = -Math.PI / 2 + (rng.float(-0.4, 0.4));
  ball.vx = Math.cos(angle) * speed;
  ball.vy = Math.sin(angle) * speed;
  ball.launched = true;
}

function resetBall() {
  ball.launched = false;
  ball.x = paddle.x + paddle.w / 2;
  ball.y = paddle.y - ball.r - 2;
  ball.vx = 0; ball.vy = 0;
}

function initLevel(lvlNum) {
  lvl.value = lvlNum;
  buildBricks(lvlNum);
  layoutObjects();
  resetBall();
}

function reset() {
  rng = makeRng(props.seed);
  score.value = 0; lives.value = LIVES_START;
  over = false; paused.value = false;
  paddle.x = 0;
  initLevel(1);
}

function start() {
  if (over) reset();
  started = true; over = false; paused.value = false;
  overlay.open = false; lastT = 0;
}

function restart() { reset(); start(); }

function togglePause() {
  if (!started || over) return;
  paused.value = !paused.value;
  if (paused.value) showOverlay('resume', '已暫停', '', '繼續遊戲');
  else overlay.open = false;
}

function showOverlay(mode, title, sub, action) {
  overlay.mode = mode; overlay.title = title; overlay.sub = sub; overlay.action = action; overlay.open = true;
}

function overlayAction() {
  if (overlay.mode === 'resume') togglePause();
  else start();
}

// ---- physics step ----
function update(dt) {
  if (!started || paused.value || over) return;
  const spd = Math.min(dt / 16, 3);

  // keyboard paddle
  const pspd = 7;
  if (keys.left)  paddle.x = Math.max(0, paddle.x - pspd * spd);
  if (keys.right) paddle.x = Math.min(W - paddle.w, paddle.x + pspd * spd);
  if (mouseX !== null) {
    paddle.x = Math.max(0, Math.min(W - paddle.w, mouseX - paddle.w / 2));
  }

  if (!ball.launched) {
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.r - 2;
    return;
  }

  ball.x += ball.vx * spd;
  ball.y += ball.vy * spd;

  // walls
  { const r2 = reflectWalls(ball, W); ball.x = r2.x; ball.y = r2.y; ball.vx = r2.vx; ball.vy = r2.vy; }

  // lose
  if (isBallLost(ball, H)) {
    lives.value--;
    if (lives.value <= 0) { gameOver(); return; }
    resetBall();
    return;
  }

  // paddle collision
  { const p2 = reflectPaddle(ball, paddle); ball.x = p2.x; ball.y = p2.y; ball.vx = p2.vx; ball.vy = p2.vy; }

  // brick collisions
  const brickResult = collideBrick(ball, bricks);
  const hitAny = brickResult.hit;
  if (hitAny) {
    ball.vx = brickResult.vx;
    ball.vy = brickResult.vy;
    score.value += brickHitScore(bricks[brickResult.brickIndex], lvl.value);
  }

  if (hitAny && score.value > best.value) {
    best.value = score.value;
    localStorage.setItem(BEST_KEY, String(best.value));
  }

  // check all bricks cleared
  if (allBricksCleared(bricks)) {
    if (lvl.value >= TOTAL_LEVELS) {
      // solved!
      if (score.value > best.value) {
        best.value = score.value;
        localStorage.setItem(BEST_KEY, String(best.value));
      }
      emit('solved', { score: score.value });
      showOverlay('win', '恭喜通關！', `最終得分 ${score.value}`, '再玩一次');
      over = true; started = false;
    } else {
      initLevel(lvl.value + 1);
      showOverlay('next', `第 ${lvl.value} 關`, '所有磚塊已清除！繼續下一關。', '繼續');
    }
  }

  // speed up slightly over time
  const maxSpd = 8 + (lvl.value - 1) * 1.2;
  const curSpd = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  if (curSpd < maxSpd && hitAny) {
    const factor = Math.min((curSpd + 0.15) / curSpd, maxSpd / curSpd);
    ball.vx *= factor; ball.vy *= factor;
  }
}

function gameOver() {
  over = true; started = false;
  if (score.value > best.value) {
    best.value = score.value;
    localStorage.setItem(BEST_KEY, String(best.value));
  }
  showOverlay('restart', '遊戲結束', `得分 ${score.value}　·　最佳 ${best.value}`, '再玩一次');
}

// ---- draw ----
function draw() {
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);

  // bricks
  for (const b of bricks) {
    if (!b.alive) continue;
    const alpha = b.hp === b.maxHp ? 1 : 0.55;
    const hue = 20 + b.row * 30;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `hsl(${hue + b.col * 3},80%,58%)`;
    drawRoundRect(b.x, b.y, b.w, b.h, 4);
    ctx.fill();
    if (b.hp > 1) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.min(b.h * 0.55, 13)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(b.hp), b.x + b.w / 2, b.y + b.h / 2);
    }
    ctx.globalAlpha = 1;
    // shine
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#fff';
    drawRoundRect(b.x + 3, b.y + 2, b.w * 0.4, b.h * 0.35, 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // paddle
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = reducedMotion ? 0 : 12;
  ctx.fillStyle = accent;
  drawRoundRect(paddle.x, paddle.y, paddle.w, paddle.h, 6);
  ctx.fill();
  ctx.restore();

  // ball
  if (ball.launched || !started) {
    ctx.save();
    ctx.shadowColor = '#ffccd5';
    ctx.shadowBlur = reducedMotion ? 0 : 14;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    // idle on paddle
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    // tap hint
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `${Math.min(H * 0.028, 14)}px var(--font-mono, monospace)`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('空白鍵 / 點擊 發球', W / 2, ball.y + ball.r + 22);
  }

  // lives pips
  for (let i = 0; i < lives.value; i++) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(16 + i * 22, H - 10, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRoundRect(x, y, w, h, r) {
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
  const dt = Math.min(ts - lastT, 50);
  lastT = ts;
  update(dt);
  draw();
}

// ---- sizing ----
function resize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  W = rect.width;
  H = rect.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  brickPad = Math.max(4, W * 0.008);
  layoutObjects();
  draw();
}

// ---- input ----
function onKey(e) {
  if (e.key === ' ') {
    e.preventDefault();
    if (!started && !over) start();
    else if (!over && !paused.value) launchBall();
    return;
  }
  if (e.key === 'p' || e.key === 'P') { togglePause(); return; }
  if (e.key === 'ArrowLeft')  { e.preventDefault(); keys.left = true; }
  if (e.key === 'ArrowRight') { e.preventDefault(); keys.right = true; }
}
function onKeyUp(e) {
  if (e.key === 'ArrowLeft')  keys.left = false;
  if (e.key === 'ArrowRight') keys.right = false;
}

function onPointerMove(e) {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
}
function onPointerLeave() { mouseX = null; }

function onCanvasClick() {
  if (!started && !over) { start(); return; }
  if (!over && !paused.value) launchBall();
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
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  best.value = +(localStorage.getItem(BEST_KEY) || 0);
  reset();
  resize();
  showOverlay('start', '打磚塊', '移動滑鼠 / 手指拖曳控制板子，空白鍵發球。', '開始遊戲');
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
    <GameTopbar title="打磚塊" title-en="Breakout">
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
            <span class="chip__label">關卡</span>
            <span class="chip__value">{{ lvl }} / {{ 3 }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">生命</span>
            <!-- min-width reserved for 3 hearts so chip never shrinks -->
            <span class="chip__value chip__value--lives">{{ '♥'.repeat(lives) }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <canvas
            ref="canvasRef"
            class="breakout-board"
            aria-label="打磚塊遊戲畫面"
            @pointermove="onPointerMove"
            @pointerleave="onPointerLeave"
            @click="onCanvasClick"
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

        <!-- Mobile controls -->
        <div class="show-touch-only breakout-mobile">
          <button class="ctrl-btn" aria-label="左移" @pointerdown="keys.left=true" @pointerup="keys.left=false" @pointercancel="keys.left=false">◀ 左</button>
          <button class="ctrl-btn ctrl-btn--accent" aria-label="發球" @click="launchBall">發球</button>
          <button class="ctrl-btn" aria-label="右移" @pointerdown="keys.right=true" @pointerup="keys.right=false" @pointercancel="keys.right=false">右 ▶</button>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">操作方式</span>
          <p class="hint">
            移動板子：<kbd>←</kbd><kbd>→</kbd> 或滑鼠<br />
            發球：<kbd>空白鍵</kbd> 或點擊畫面<br />
            暫停：<kbd>P</kbd>
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">規則</span>
          <p class="hint">
            3 條命，球落地失去一命。<br />
            灰色磚塊需打 2 次。<br />
            共 {{ 3 }} 關，全部清除即通關。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.breakout-board {
  display: block;
  width: min(86vw, 60vh, 520px);
  height: min(110vw, 75vh, 620px);
  border-radius: var(--r-lg);
  background: linear-gradient(180deg, var(--ink-850), var(--ink-900));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2), inset 0 0 0 1px rgba(255,255,255,0.02);
  touch-action: none;
  cursor: none;
}
.board-wrap .overlay { border-radius: var(--r-lg); }

.breakout-mobile {
  display: flex;
  gap: 0.5rem;
  width: min(86vw, 520px);
}
.ctrl-btn {
  flex: 1;
  padding: 1rem 0.5rem;
  border-radius: var(--r-sm);
  background: var(--ink-700);
  border: 1px solid var(--line);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  transition: background var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
/* Reserve space for 3 hearts so chip width never shrinks as lives are lost */
.chip__value--lives {
  min-width: 3ch;
  text-align: center;
  letter-spacing: 0.12em;
}

.ctrl-btn:active {
  background: var(--accent);
  color: var(--accent-ink);
  /* Box-shadow inset instead of scale to avoid geometry/layout changes */
  box-shadow: inset 0 0 0 2px rgba(0,0,0,0.25);
}
.ctrl-btn--accent { background: color-mix(in oklab, var(--accent) 30%, var(--ink-700)); }
</style>
