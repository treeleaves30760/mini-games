<script setup>
/* 打地鼠 Whack-a-Mole — canvas, 3×3 holes, 30s round.
   Mole schedule fully driven by rng. emit('solved') on round end. */
import {
  HOLE_COUNT,
  ROUND_DURATION,
  buildSchedule as _buildSchedule,
  calcMoleScore,
  applyBombPenalty,
  applyBombTimePenalty,
  findWhackableEntity,
} from '~/games/whack';

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(['solved']);

const accent = '#a0c15a';
const BEST_KEY = 'playground.whack.best';

const GRID_SIZE = 3;

// reactive
const canvasRef = ref(null);
const score = ref(0);
const best = ref(0);
const timeLeft = ref(30);
const paused = ref(false);
const overlay = reactive({ open: true, mode: 'start', title: '打地鼠', sub: '30 秒內盡量打地鼠，小心炸彈！', action: '開始遊戲' });

// non-reactive state
let ctx = null;
let W = 0, H = 0;
let rafId = 0, lastT = 0;
let started = false, over = false;
let rng = makeRng(props.seed);
let schedule = []; // [{hole, at, dur, type: 'mole'|'bomb'}]
let activeEntities = []; // {hole, type, spawnedAt, dur, whacked, animPop, animWhack}
let elapsed = 0;
let reducedMotion = false;
const FLASH_DURATION = 220; // ms for whack visual

// layout
let holes = []; // {cx, cy, rx, ry}
let holeR = 0;

function layoutHoles() {
  const pad = Math.min(W, H) * 0.08;
  const cols = GRID_SIZE, rows = GRID_SIZE;
  const cellW = (W - pad * 2) / cols;
  const cellH = (H - pad * 2) / rows;
  holeR = Math.min(cellW, cellH) * 0.36;
  holes = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      holes.push({
        cx: pad + c * cellW + cellW / 2,
        cy: pad + r * cellH + cellH / 2,
        rx: holeR * 1.4,
        ry: holeR * 0.5,
        r: holeR,
      });
    }
  }
}

function reset() {
  rng = makeRng(props.seed);
  schedule = _buildSchedule(props.seed);
  activeEntities = [];
  score.value = 0;
  timeLeft.value = 30;
  elapsed = 0;
  over = false;
  paused.value = false;
}

function start() {
  if (over) reset();
  started = true; over = false; paused.value = false;
  overlay.open = false;
  lastT = 0;
}

function overlayAction() {
  if (overlay.mode === 'solved') { reset(); start(); }
  else start();
}

function showOverlay(mode, title, sub, action) {
  overlay.mode = mode; overlay.title = title; overlay.sub = sub; overlay.action = action; overlay.open = true;
}

function gameEnd() {
  over = true; started = false;
  if (score.value > best.value) {
    best.value = score.value;
    localStorage.setItem(BEST_KEY, String(best.value));
  }
  emit('solved', { score: score.value });
  showOverlay('solved', '時間到！', `得分 ${score.value}　·　最佳 ${best.value}`, '再玩一次');
}

// ---- update ----
function update(dt) {
  if (!started || paused.value || over) return;
  elapsed += dt;
  timeLeft.value = Math.max(0, Math.ceil((ROUND_DURATION - elapsed) / 1000));

  if (elapsed >= ROUND_DURATION) { gameEnd(); return; }

  // spawn entities from schedule
  for (const evt of schedule) {
    if (evt._spawned) continue;
    if (elapsed >= evt.at) {
      evt._spawned = true;
      // don't spawn on same hole as existing active entity
      const occupied = activeEntities.some(e => !e.whacked && e.hole === evt.hole && Date.now() - e.spawnedAt < e.dur);
      if (!occupied) {
        activeEntities.push({
          hole: evt.hole,
          type: evt.type,
          spawnedAt: elapsed,
          dur: evt.dur,
          whacked: false,
          whackTime: 0,
          popAnim: 0, // 0..1
        });
      }
    }
  }

  // update entities
  const now = elapsed;
  for (const e of activeEntities) {
    if (e.whacked) continue;
    const age = now - e.spawnedAt;
    e.popAnim = Math.min(1, age / 200);
    if (age > e.dur) {
      e.whacked = true; // escaped
    }
  }

  // clean up old whacked/escaped (keep for brief animation)
  activeEntities = activeEntities.filter(e => {
    if (e.whacked) return (now - e.spawnedAt) < e.dur + FLASH_DURATION;
    return true;
  });
}

// ---- draw ----
function draw() {
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);

  // background
  ctx.fillStyle = '#1a2a10';
  ctx.fillRect(0, 0, W, H);

  // grass-ish
  ctx.fillStyle = '#2a3d1a';
  ctx.fillRect(0, 0, W, H);

  // draw holes and entities
  for (let i = 0; i < holes.length; i++) {
    drawHole(i);
  }

  // timer bar
  const barW = W * 0.8;
  const barX = W * 0.1;
  const barY = H - 22;
  const barH = 8;
  const frac = Math.max(0, (ROUND_DURATION - elapsed) / ROUND_DURATION);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  roundRect2(barX, barY, barW, barH, 4);
  ctx.fill();
  const barColor = frac > 0.4 ? accent : frac > 0.2 ? '#f4a259' : '#e85a4f';
  ctx.fillStyle = barColor;
  roundRect2(barX, barY, barW * frac, barH, 4);
  ctx.fill();
}

function drawHole(i) {
  const h = holes[i];
  const { cx, cy, rx, ry, r } = h;

  // shadow/dirt
  ctx.fillStyle = '#0d1a08';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.1, rx * 1.05, ry * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // hole dark ellipse
  ctx.fillStyle = '#0a100a';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.05, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // rim
  ctx.strokeStyle = '#3a5020';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.05, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  // active entity in this hole
  const entity = activeEntities.find(e => e.hole === i);
  if (!entity) return;

  const age = elapsed - entity.spawnedAt;
  let prog = Math.min(1, age / 200);
  let exitProg = 0;
  if (entity.whacked && age > entity.dur) {
    exitProg = Math.min(1, (age - entity.dur) / FLASH_DURATION);
    prog = 1 - exitProg;
  }

  const moleH = r * 1.6;
  const showH = moleH * prog;
  const moleY = cy + ry - showH * 0.6;

  // clip to hole for depth illusion
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.05, rx * 1.1, ry * 1.2, 0, 0, Math.PI);
  ctx.rect(cx - rx * 1.2, cy - moleH, rx * 2.4, moleH + ry);
  ctx.clip();

  if (entity.type === 'mole') {
    // body
    const bodyColor = entity.whacked ? '#c17a3a' : '#8b5e3c';
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(cx, moleY, r * 0.6, showH * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (showH > r * 0.4) {
      // face
      ctx.fillStyle = '#c8976a';
      ctx.beginPath();
      ctx.ellipse(cx, moleY - showH * 0.1, r * 0.42, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();

      // eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx - r * 0.14, moleY - showH * 0.15, r * 0.1, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.14, moleY - showH * 0.15, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(cx - r * 0.14, moleY - showH * 0.15, r * 0.055, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.14, moleY - showH * 0.15, r * 0.055, 0, Math.PI * 2);
      ctx.fill();

      // snout
      ctx.fillStyle = '#e8a080';
      ctx.beginPath();
      ctx.ellipse(cx, moleY - showH * 0.04, r * 0.2, r * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();

      // whack star flash
      if (entity.whacked && exitProg < 0.5) {
        ctx.globalAlpha = 1 - exitProg * 2;
        ctx.fillStyle = '#fff9a0';
        ctx.font = `bold ${r * 0.7}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', cx, moleY - showH * 0.5);
        ctx.globalAlpha = 1;
      }
    }
  } else {
    // bomb
    const br = r * 0.45 * Math.min(1, prog * 1.5);
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(cx, moleY, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#666';
    ctx.fillRect(cx - 3, moleY - br - 8, 6, 9);
    // fuse spark
    if (!entity.whacked && !reducedMotion) {
      const spark = Math.sin(elapsed / 60) > 0;
      if (spark) {
        ctx.fillStyle = '#ff0';
        ctx.beginPath();
        ctx.arc(cx + 2, moleY - br - 8, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (entity.whacked && exitProg < 0.5) {
      ctx.globalAlpha = 1 - exitProg * 2;
      ctx.fillStyle = '#ff6600';
      ctx.font = `bold ${r}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💥', cx, moleY);
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();
}

function roundRect2(x, y, w, h, r) {
  if (w <= 0) return;
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
  const dt = Math.min(ts - lastT, 80);
  lastT = ts;
  update(dt);
  draw();
}

// ---- hit detection ----
function hitTest(x, y) {
  for (let i = holes.length - 1; i >= 0; i--) {
    const h = holes[i];
    const dx = x - h.cx, dy = y - h.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < h.r * 1.1) return i;
  }
  return -1;
}

function onCanvasClick(e) {
  if (!started || over || paused.value) {
    if (!started && !over) { start(); }
    return;
  }
  const canvas = canvasRef.value;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (W / rect.width);
  const y = (e.clientY - rect.top) * (H / rect.height);

  const holeIdx = hitTest(x, y);
  if (holeIdx === -1) return;

  const entity = findWhackableEntity(holeIdx, activeEntities, elapsed);
  if (!entity) return;

  entity.whacked = true;
  entity.whackTime = elapsed;

  if (entity.type === 'mole') {
    score.value += calcMoleScore(elapsed);
  } else {
    // bomb penalty
    score.value = applyBombPenalty(score.value);
    elapsed = applyBombTimePenalty(elapsed);
    timeLeft.value = Math.max(0, Math.ceil((ROUND_DURATION - elapsed) / 1000));
  }
}

// ---- hole buttons for accessibility (keyboard) ----
function onHoleKey(i, e) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (!started || over || paused.value) return;
    const entity = findWhackableEntity(i, activeEntities, elapsed);
    if (!entity) return;
    entity.whacked = true;
    if (entity.type === 'mole') score.value += calcMoleScore(elapsed);
    else {
      score.value = applyBombPenalty(score.value);
      elapsed = applyBombTimePenalty(elapsed);
      timeLeft.value = Math.max(0, Math.ceil((ROUND_DURATION - elapsed) / 1000));
    }
  }
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
  layoutHoles();
  draw();
}

function onVis() {
  if (document.hidden && started && !over && !paused.value) {
    paused.value = true;
    showOverlay('resume', '已暫停', '', '繼續遊戲');
  }
}

watch(() => props.seed, () => {
  rng = makeRng(props.seed);
  reset();
  if (started) { start(); }
});

onMounted(() => {
  ctx = canvasRef.value.getContext('2d');
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  best.value = +(localStorage.getItem(BEST_KEY) || 0);
  reset();
  resize();
  showOverlay('start', '打地鼠', '30 秒內盡量打地鼠，小心炸彈會扣分和時間！', '開始遊戲');
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVis);
  rafId = requestAnimationFrame(loop);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  window.removeEventListener('resize', resize);
  document.removeEventListener('visibilitychange', onVis);
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="打地鼠" title-en="Whack-a-Mole">
      <template #actions>
        <button class="btn btn--accent" @click="reset(); if(started) start();">重新開始</button>
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
            <span class="chip__label">時間</span>
            <!-- min-width via class so "30s"→"1s" doesn't narrow the chip -->
            <span class="chip__value time-chip-value" :class="timeLeft <= 5 ? 'is-accent' : ''">{{ timeLeft }}s</span>
          </div>
        </div>

        <div class="board-wrap whack-wrap">
          <canvas
            ref="canvasRef"
            class="whack-board"
            aria-label="打地鼠遊戲畫面"
            @click="onCanvasClick"
          />

          <!-- Accessible keyboard buttons overlaid on holes -->
          <div v-if="started && !over" class="whack-holes-overlay" aria-hidden="true">
            <button
              v-for="(h, i) in holes"
              :key="i"
              class="hole-btn"
              :style="{ left: `${h.cx / W * 100}%`, top: `${h.cy / H * 100}%`, width: `${h.r * 2.2 / W * 100}%`, height: `${h.r * 2.2 / H * 100}%` }"
              :aria-label="`洞 ${i+1}`"
              tabindex="0"
              @keydown="onHoleKey(i, $event)"
            />
          </div>

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
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            點擊或點選跳出的地鼠得分。<br />
            出現炸彈時千萬別打！否則扣 15 分且時間減 3 秒。<br />
            地鼠越快打分數越高。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">計分</span>
          <p class="hint">
            打到地鼠：+10 ～ +20 分（後期加成）<br />
            打到炸彈：-15 分，-3 秒時間<br />
            共 30 秒，盡量拿高分！
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.whack-wrap {
  position: relative;
}

/* Keep time chip stable as count ticks 30→1 */
.time-chip-value {
  min-width: 3ch;
  display: inline-block;
  text-align: center;
}
.whack-board {
  display: block;
  width: min(86vw, 70vh, 480px);
  height: min(86vw, 70vh, 480px);
  border-radius: var(--r-lg);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2), inset 0 0 0 1px rgba(255,255,255,0.02);
  touch-action: manipulation;
  cursor: crosshair;
}
.board-wrap .overlay { border-radius: var(--r-lg); }

.whack-holes-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.hole-btn {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: transparent;
  border: none;
  pointer-events: auto;
  cursor: crosshair;
  outline: none;
}
.hole-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
