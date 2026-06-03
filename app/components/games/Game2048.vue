<script setup>
/* 2048 — reactive tiles, slide + merge animation, keyboard + swipe.
   Positions are pure CSS (% of board), so no pixel measuring is needed.
   Core merge/win/over logic lives in ~/games/game2048 (unit-tested). */

import { slideLine, hasWon, isGameOver as checkGameOver } from "~/games/game2048";

const accent = "#c79bff";
const SIZE = 4;
const ANIM = 120; // ms — slide duration / input lock window
const BEST_KEY = "playground.2048.best";

const tiles = ref([]); // { id, value, r, c, isNew, justMerged }
const score = ref(0);
const best = ref(0);
const won = ref(false);
const over = ref(false);
const keepPlaying = ref(false);
let nextId = 1;
let animating = false;

const overlay = computed(() => {
  if (over.value) return { open: true, kind: "lose" };
  if (won.value && !keepPlaying.value) return { open: true, kind: "win" };
  return { open: false, kind: "" };
});

function emptyCells() {
  const occ = new Set(tiles.value.map((t) => t.r * SIZE + t.c));
  const free = [];
  for (let i = 0; i < SIZE * SIZE; i++) if (!occ.has(i)) free.push(i);
  return free;
}

function addRandomTile() {
  const free = emptyCells();
  if (!free.length) return;
  const idx = free[(Math.random() * free.length) | 0];
  tiles.value.push({
    id: nextId++,
    value: Math.random() < 0.9 ? 2 : 4,
    r: (idx / SIZE) | 0,
    c: idx % SIZE,
    isNew: true,
    justMerged: false,
  });
  requestAnimationFrame(() => {
    const t = tiles.value[tiles.value.length - 1];
    if (t) t.isNew = false;
  });
}

function newGame() {
  tiles.value = [];
  score.value = 0;
  won.value = false;
  over.value = false;
  keepPlaying.value = false;
  animating = false;
  addRandomTile();
  addRandomTile();
}

function move(dir) {
  if (animating || over.value) return;
  const [dr, dc] = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] }[dir];
  const ts = tiles.value;
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  for (const t of ts) grid[t.r][t.c] = t;

  const rs = dr > 0 ? [3, 2, 1, 0] : [0, 1, 2, 3];
  const cs = dc > 0 ? [3, 2, 1, 0] : [0, 1, 2, 3];
  let moved = false;
  const merges = [];

  for (const r of rs)
    for (const c of cs) {
      const t = grid[r][c];
      if (!t) continue;
      let nr = r;
      let nc = c;
      while (true) {
        const fr = nr + dr;
        const fc = nc + dc;
        if (fr < 0 || fr >= SIZE || fc < 0 || fc >= SIZE) break;
        if (grid[fr][fc] === null) {
          nr = fr;
          nc = fc;
          continue;
        }
        const other = grid[fr][fc];
        if (other.value === t.value && !other._merged && !t._merged) {
          grid[r][c] = null;
          other._merged = true;
          t.r = other.r;
          t.c = other.c;
          merges.push({ survivor: other, absorbed: t });
          moved = true;
          nr = -1;
        }
        break;
      }
      if (nr === -1) continue;
      if (nr !== r || nc !== c) {
        grid[r][c] = null;
        grid[nr][nc] = t;
        t.r = nr;
        t.c = nc;
        moved = true;
      }
    }

  if (!moved) {
    for (const t of ts) t._merged = false;
    return;
  }

  animating = true;
  setTimeout(() => {
    for (const { survivor, absorbed } of merges) {
      survivor.value *= 2;
      survivor.justMerged = true;
      score.value += survivor.value;
      const i = tiles.value.findIndex((x) => x.id === absorbed.id);
      if (i >= 0) tiles.value.splice(i, 1);
      if (!won.value && hasWon([survivor.value])) won.value = true;
    }
    for (const t of tiles.value) t._merged = false;
    addRandomTile();
    if (score.value > best.value) {
      best.value = score.value;
      localStorage.setItem(BEST_KEY, String(best.value));
    }
    requestAnimationFrame(() => {
      for (const t of tiles.value) t.justMerged = false;
    });
    if (isGameOver()) over.value = true;
    animating = false;
  }, ANIM);
}

function isGameOver() {
  // Delegate to the pure helper from ~/games/game2048
  const flat = Array(SIZE * SIZE).fill(0);
  for (const t of tiles.value) flat[t.r * SIZE + t.c] = t.value;
  return checkGameOver(flat);
}

function tileClass(t) {
  const digits = String(t.value).length;
  return [
    `v-${t.value <= 2048 ? t.value : "big"}`,
    digits >= 4 ? "len-4" : digits === 3 ? "len-3" : "",
    t.isNew ? "is-new" : "",
    t.justMerged ? "is-merged" : "",
  ];
}

// ---- input ----
function onKey(e) {
  const map = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
  };
  const dir = map[e.key];
  if (dir) {
    e.preventDefault();
    move(dir);
  }
}
let sx = 0, sy = 0, swiping = false;
function onDown(e) {
  swiping = true;
  sx = e.clientX;
  sy = e.clientY;
}
function onUp(e) {
  if (!swiping) return;
  swiping = false;
  const dx = e.clientX - sx;
  const dy = e.clientY - sy;
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
  else move(dy > 0 ? "down" : "up");
}

onMounted(() => {
  best.value = +(localStorage.getItem(BEST_KEY) || 0);
  newGame();
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="2048" title-en="2048">
      <template #actions>
        <button class="btn btn--accent" @click="newGame">新遊戲</button>
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
        </div>

        <div class="board-wrap">
          <div class="b2048" @pointerdown="onDown" @pointerup="onUp">
            <div class="b2048__cells">
              <div v-for="i in 16" :key="i" class="b2048__slot" />
            </div>
            <div
              v-for="t in tiles"
              :key="t.id"
              class="tile"
              :class="tileClass(t)"
              :style="{ '--r': t.r, '--c': t.c }"
            >
              {{ t.value }}
            </div>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.kind === "win" ? "達成 2048！" : "遊戲結束" }}</h2>
              <p class="overlay__sub">
                {{ overlay.kind === "win" ? `得分 ${score}，要繼續挑戰更大數字嗎？` : `本局得分 ${score}　·　最佳 ${best}` }}
              </p>
              <div class="overlay__actions">
                <button v-if="overlay.kind === 'win'" class="btn" @click="keepPlaying = true">繼續</button>
                <button class="btn btn--accent" @click="newGame">{{ overlay.kind === "win" ? "新遊戲" : "再玩一次" }}</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">操作方式</span>
          <p class="hint">
            移動方塊：<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> 或 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><br />
            行動裝置：在棋盤上往四個方向滑動。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            每次移動，所有方塊往該方向滑動；兩個相同數字相撞會合併相加。
            目標是合出 <strong>2048</strong>。當棋盤填滿且無法再合併即結束。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.b2048 {
  --gap: 2.6%;
  --cell: calc((100% - 5 * var(--gap)) / 4);
  position: relative;
  width: min(92vw, 58vh, 460px);
  aspect-ratio: 1;
  container-type: inline-size;
  border-radius: var(--r-lg);
  background: var(--ink-700);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  touch-action: none;
  user-select: none;
}
.b2048__cells {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: var(--gap);
  padding: var(--gap);
}
.b2048__slot {
  border-radius: 12px;
  background: var(--ink-850);
}
.tile {
  position: absolute;
  width: var(--cell);
  height: var(--cell);
  left: calc(var(--gap) + (var(--cell) + var(--gap)) * var(--c));
  top: calc(var(--gap) + (var(--cell) + var(--gap)) * var(--r));
  display: grid;
  place-items: center;
  border-radius: 12px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 11cqw;
  color: #0a0b0f;
  background: #cdd4e4;
  transition: left 0.12s var(--ease), top 0.12s var(--ease);
  will-change: left, top;
}
.tile.len-3 { font-size: 8.5cqw; }
.tile.len-4 { font-size: 6.5cqw; }
.tile.is-new { animation: tilePop 0.16s var(--ease-out); }
.tile.is-merged { animation: tileMerge 0.18s var(--ease); }
@keyframes tilePop {
  0% { transform: scale(0.1); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes tileMerge {
  0% { transform: scale(1); }
  45% { transform: scale(1.18); }
  100% { transform: scale(1); }
}

/* value palette */
.tile.v-2 { background: #c9d2e6; }
.tile.v-4 { background: #b9c4e0; }
.tile.v-8 { background: #6aa6ff; color: #07101f; }
.tile.v-16 { background: #4f9be8; color: #07101f; }
.tile.v-32 { background: #45c0b8; color: #06140f; }
.tile.v-64 { background: #61d07a; color: #06140d; }
.tile.v-128 { background: #c6d84e; color: #10130a; }
.tile.v-256 { background: #f2c14e; color: #1a1206; }
.tile.v-512 { background: #f29f4e; color: #1a1206; }
.tile.v-1024 { background: #f2724e; color: #fff; }
.tile.v-2048 { background: #ff5d6c; color: #fff; box-shadow: 0 0 24px rgba(255, 93, 108, 0.6); }
.tile.v-big { background: #c79bff; color: #14082a; box-shadow: 0 0 24px rgba(199, 155, 255, 0.6); }
</style>
