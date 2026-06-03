<script setup>
/* 推箱子 Sokoban — tile grid, ASCII maps, undo, level nav, swipe + dpad + keyboard. */

// ---- pure game logic (framework-free, unit-tested in app/games/sokoban.ts) ----
import {
  WALL,
  TARGET,
  LEVELS,
  cellAt   as _cellAt,
  boxAt    as _boxAt,
  isTarget as _isTarget,
  isWon    as _isWon,
} from "~/games/sokoban";

const accent = "#e8a87c";
const BEST_KEY = "playground.sokoban.best";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// ---- reactive state ----
const rng = makeRng(props.seed);
const li = ref(0);
const playerX = ref(0);
const playerY = ref(0);
const boxes = ref([]);
const history = ref([]);  // each entry: { px, py, boxes: [...] }
const moves = ref(0);
const pushes = ref(0);
const won = ref(false);
const overlay = reactive({ open: false });
const bestMap = ref({});  // keyed by level name

const level = computed(() => LEVELS[li.value]);
const isWon = computed(() => _isWon(level.value, boxes.value));
const bestForLevel = computed(() => bestMap.value[level.value.name] ?? null);

function loadLevel(idx) {
  const lv = LEVELS[(idx + LEVELS.length) % LEVELS.length];
  li.value = (idx + LEVELS.length) % LEVELS.length;
  playerX.value = lv.px;
  playerY.value = lv.py;
  boxes.value = lv.boxes.map((b) => ({ ...b }));
  history.value = [];
  moves.value = 0;
  pushes.value = 0;
  won.value = false;
  overlay.open = false;
}

function resetLevel() {
  loadLevel(li.value);
}

function regenerate() {
  const r = makeRng(props.seed);
  if (props.daily) {
    const idx = r.int(0, LEVELS.length - 1);
    loadLevel(idx);
  } else {
    loadLevel(li.value);
  }
}

watch(() => props.seed, regenerate);

// ---- movement helpers (thin wrappers that bind reactive level/boxes) ----
function cellAt(x, y) { return _cellAt(level.value, x, y); }
function boxAt(x, y)  { return _boxAt(boxes.value, x, y); }
function isTarget(x, y) { return _isTarget(level.value, x, y); }

function move(dx, dy) {
  if (won.value) return;
  const nx = playerX.value + dx;
  const ny = playerY.value + dy;
  if (cellAt(nx, ny) === WALL) return;
  const bi = boxAt(nx, ny);
  if (bi >= 0) {
    const bx2 = nx + dx;
    const by2 = ny + dy;
    if (cellAt(bx2, by2) === WALL || boxAt(bx2, by2) >= 0) return;
    // save state before push
    history.value.push({
      px: playerX.value, py: playerY.value,
      boxes: boxes.value.map((b) => ({ ...b })),
    });
    boxes.value[bi].x = bx2;
    boxes.value[bi].y = by2;
    pushes.value++;
    playerX.value = nx;
    playerY.value = ny;
    moves.value++;
    checkWin();
  } else {
    history.value.push({
      px: playerX.value, py: playerY.value,
      boxes: boxes.value.map((b) => ({ ...b })),
    });
    playerX.value = nx;
    playerY.value = ny;
    moves.value++;
  }
}

function undo() {
  if (history.value.length === 0) return;
  const prev = history.value.pop();
  playerX.value = prev.px;
  playerY.value = prev.py;
  boxes.value = prev.boxes;
  moves.value = Math.max(0, moves.value - 1);
  if (won.value) { won.value = false; overlay.open = false; }
  // recalc pushes from scratch isn't worth it; just decrement if we undid a push
}

function checkWin() {
  if (isWon.value) {
    won.value = true;
    const key = level.value.name;
    const prev = bestMap.value[key] ?? Infinity;
    if (moves.value < prev) {
      bestMap.value = { ...bestMap.value, [key]: moves.value };
      saveBest();
    }
    overlay.open = true;
    emit("solved", { moves: moves.value });
  }
}

// ---- keyboard ----
function onKey(e) {
  const MAP = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
  };
  const d = MAP[e.key];
  if (d) { e.preventDefault(); move(d[0], d[1]); }
  if (e.key === "z" || e.key === "Z") { e.preventDefault(); undo(); }
}

// ---- swipe ----
let sx = 0, sy = 0;
function onTouchStart(e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
function onTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - sx;
  const dy = e.changedTouches[0].clientY - sy;
  if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0);
  else move(0, dy > 0 ? 1 : -1);
}

// ---- tile appearance ----
function tileClass(x, y) {
  const cell = cellAt(x, y);
  const hasBox = boxAt(x, y) >= 0;
  const onTarget = isTarget(x, y);
  const isPlayer = playerX.value === x && playerY.value === y;
  if (cell === WALL) return "tile tile--wall";
  if (isPlayer) return onTarget ? "tile tile--floor tile--target-floor" : "tile tile--floor";
  if (hasBox) return onTarget ? "tile tile--floor tile--box-on" : "tile tile--floor tile--box";
  if (cell === TARGET) return "tile tile--floor tile--target";
  return "tile tile--floor";
}

// Build a flat list of tiles for rendering
const tiles = computed(() => {
  const lv = level.value;
  const list = [];
  for (let y = 0; y < lv.rows; y++) {
    for (let x = 0; x < lv.cols; x++) {
      list.push({
        x, y,
        key: `${x}-${y}`,
        cls: tileClass(x, y),
        isPlayer: playerX.value === x && playerY.value === y,
      });
    }
  }
  return list;
});

// ---- persistence ----
function saveBest() {
  localStorage.setItem(BEST_KEY, JSON.stringify(bestMap.value));
}

onMounted(() => {
  try { bestMap.value = JSON.parse(localStorage.getItem(BEST_KEY) || "{}"); } catch (_) { bestMap.value = {}; }
  regenerate();
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => { window.removeEventListener("keydown", onKey); });
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="推箱子" title-en="Sokoban">
      <template #actions>
        <button class="btn" @click="undo">復原</button>
        <button class="btn btn--accent" @click="resetLevel">重設</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div v-if="!daily" class="chip">
            <span class="chip__label">關卡</span>
            <span class="chip__value is-accent">{{ li + 1 }} / {{ LEVELS.length }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">步數</span>
            <span class="chip__value is-accent">{{ moves }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">推動</span>
            <span class="chip__value">{{ pushes }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">最佳</span>
            <span class="chip__value">{{ bestForLevel !== null ? bestForLevel : "—" }}</span>
          </div>
        </div>

        <div
          class="board-wrap"
          @touchstart.passive="onTouchStart"
          @touchend.passive="onTouchEnd"
        >
          <div
            class="sokoban-board"
            :style="{
              gridTemplateColumns: `repeat(${level.cols}, 1fr)`,
              gridTemplateRows: `repeat(${level.rows}, 1fr)`,
            }"
            role="img"
            :aria-label="`推箱子盤面，關卡 ${level.name}`"
          >
            <div
              v-for="t in tiles"
              :key="t.key"
              :class="t.cls"
            >
              <span v-if="t.isPlayer" class="player-icon" aria-hidden="true">◉</span>
            </div>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">過關！</h2>
              <p class="overlay__sub">
                <template v-if="daily">今日推箱子完成，共走 {{ moves }} 步！</template>
                <template v-else>{{ level.name }} 完成，共走 {{ moves }} 步。</template>
              </p>
              <div class="overlay__actions">
                <button class="btn" @click="resetLevel">再玩</button>
                <button v-if="!daily && li < LEVELS.length - 1" class="btn btn--accent" @click="loadLevel(li + 1)">
                  下一關
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!daily" class="level-nav">
          <button class="btn btn--ghost" :disabled="li === 0" @click="loadLevel(li - 1)">← 上一關</button>
          <span class="level-name">{{ level.name }}</span>
          <button class="btn btn--ghost" :disabled="li === LEVELS.length - 1" @click="loadLevel(li + 1)">下一關 →</button>
        </div>

        <div class="dpad show-touch-only">
          <button class="up" aria-label="上" @click="move(0, -1)">▲</button>
          <button class="left" aria-label="左" @click="move(-1, 0)">◀</button>
          <button class="right" aria-label="右" @click="move(1, 0)">▶</button>
          <button class="down" aria-label="下" @click="move(0, 1)">▼</button>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            將所有橙色箱子推到目標格（◆）上。<br />
            只能推，不能拉；箱子後方需有空格才能推動。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">操作</span>
          <p class="hint">
            <kbd>↑↓←→</kbd> 或 <kbd>WASD</kbd> 移動<br />
            <kbd>Z</kbd> 復原一步<br />
            行動裝置：滑動或下方方向鍵
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">圖例</span>
          <div class="legend-row">
            <span class="legend-swatch swatch--target" />目標格
          </div>
          <div class="legend-row">
            <span class="legend-swatch swatch--box" />箱子
          </div>
          <div class="legend-row">
            <span class="legend-swatch swatch--box-on" />箱子在目標上
          </div>
          <div class="legend-row">
            <span class="player-icon legend-player">◉</span>玩家
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.sokoban-board {
  display: grid;
  /* fixed dimensions: board never reflows as the level (and tile count) changes */
  width: min(86vw, 60vh, 540px);
  height: min(86vw, 60vh, 540px);
  border-radius: var(--r-lg);
  background: var(--ink-900);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  overflow: hidden;
  /* touch-action moved to board-wrap below so swipe handlers actually fire */
}

/* board-wrap must block native scroll so the touch listeners on it work */
.board-wrap {
  touch-action: none;
}
.tile {
  display: flex;
  align-items: center;
  justify-content: center;
}
.tile--wall {
  background: color-mix(in oklab, var(--ink-600) 90%, var(--accent) 10%);
  box-shadow: inset 0 0 0 1px var(--line);
}
.tile--floor {
  background: var(--ink-850);
}
.tile--target {
  background: var(--ink-850);
  position: relative;
}
.tile--target::after {
  content: "◆";
  font-size: clamp(0.5rem, 2vw, 1rem);
  color: color-mix(in oklab, var(--accent) 55%, var(--ink-500));
  position: absolute;
  pointer-events: none;
}
.tile--target-floor::after {
  content: "◆";
  font-size: clamp(0.5rem, 2vw, 1rem);
  color: color-mix(in oklab, var(--accent) 30%, var(--ink-500));
  position: absolute;
  pointer-events: none;
}
.tile--box {
  background: var(--ink-850);
  position: relative;
}
.tile--box::before {
  content: "";
  position: absolute;
  inset: 10%;
  border-radius: 4px;
  background: var(--accent);
  box-shadow: 0 2px 10px color-mix(in oklab, var(--accent) 50%, transparent), inset 0 1px 0 rgba(255,255,255,0.2);
}
.tile--box-on {
  background: var(--ink-850);
  position: relative;
}
.tile--box-on::before {
  content: "";
  position: absolute;
  inset: 10%;
  border-radius: 4px;
  background: color-mix(in oklab, var(--accent) 85%, #fff 15%);
  box-shadow:
    0 2px 12px color-mix(in oklab, var(--accent) 70%, transparent),
    0 0 20px color-mix(in oklab, var(--accent) 40%, transparent),
    inset 0 1px 0 rgba(255,255,255,0.35);
}
.player-icon {
  font-size: clamp(0.65rem, 2.4vw, 1.2rem);
  color: #f0f0e8;
  position: relative;
  z-index: 2;
  line-height: 1;
  text-shadow: 0 0 8px rgba(255,255,255,0.4);
  pointer-events: none;
}
.level-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  width: min(86vw, 60vh, 540px);
}
.level-name {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--text);
  /* prevent name change from reflowing the nav row */
  flex: 1;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.level-nav .btn[disabled] {
  opacity: 0.35;
  pointer-events: none;
}
.legend-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.84rem;
  color: var(--text-dim);
  margin-bottom: 0.3rem;
}
.legend-swatch {
  display: inline-block;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  flex-shrink: 0;
}
.swatch--target {
  background: var(--ink-850);
  border: 1px solid var(--line);
  position: relative;
}
.swatch--target::after {
  content: "◆";
  font-size: 0.65rem;
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: color-mix(in oklab, var(--accent) 55%, var(--ink-500));
}
.swatch--box {
  background: var(--accent);
  box-shadow: 0 2px 8px color-mix(in oklab, var(--accent) 50%, transparent);
}
.swatch--box-on {
  background: color-mix(in oklab, var(--accent) 85%, #fff 15%);
  box-shadow: 0 2px 8px color-mix(in oklab, var(--accent) 60%, transparent);
}
.legend-player {
  font-size: 0.9rem;
}
</style>
