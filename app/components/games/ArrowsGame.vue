<script setup>
/* 箭頭 Arrows — each piece is a variable-length, possibly bent arrow (a snake of
   cells with a head pointing one way). Tap it and the whole rigid piece slides off
   the board in the head's direction — but only if every cell it sweeps through, all
   the way to the edge, is clear of OTHER pieces. Long bent arrows can wrap around
   others, so reading "is this one actually free?" is the puzzle.

   Puzzles are built by reverse-placement, which guarantees solvability: each piece
   is placed (in reverse removal order) only where it could currently slide out past
   the pieces already down — so removing them in reverse always works. Removing a
   piece only frees cells, never blocks another, so there are no dead-ends: you can
   always clear the board, in any order, as long as you spot a free piece. */

// Pure game logic — unit-tested in app/games/arrows.ts
import {
  DIRV, DIFFS, buildOne, solveDepth, isRemovable, isWon as arrowsIsWon,
} from "~/games/arrows";

const props = defineProps({ seed: { type: String, default: null } });

const accent = "#9aa6ff";
const CLEARED_KEY = "playground.arrows.cleared";

/* per-piece hues — distinct colours make interlocking / wrapped arrows readable */
const PALETTE = [
  "#9aa6ff", "#67e8c3", "#ffd27d", "#ff9aa9",
  "#7fc8ff", "#c4a6ff", "#a6e886", "#ffb27d",
];

const difficulty = ref("medium");
const n = ref(6);
const pieces = ref([]); // { id, cells:[{r,c}...tail→head], dir, color, leaving, shake, hint }
const won = ref(false);
const cleared = ref(0);

const remaining = computed(() => pieces.value.filter((p) => !p.leaving).length);
const diffLabel = computed(() => DIFFS.find((d) => d.key === difficulty.value)?.label || "");

function newGame(diffKey) {
  if (diffKey) difficulty.value = diffKey;
  const cfg = DIFFS.find((d) => d.key === difficulty.value);
  n.value = cfg.n;
  won.value = false;

  const rng = makeRng(props.seed ?? null);
  let best = null;
  for (let k = 0; k < 10; k++) {
    const built = buildOne(rng, cfg);
    const depth = solveDepth(built, cfg.n);
    if (depth < 0) continue;
    const cells = built.reduce((s, p) => s + p.cells.length, 0);
    const score = depth * 1000 + built.length * 10 + cells;
    if (!best || score > best.score) best = { built, score };
  }
  const built = best ? best.built : buildOne(rng, cfg);

  const pal = makeRng(props.seed ? props.seed + "#c" : null).shuffle(PALETTE.slice());
  let id = 1;
  pieces.value = built.map((p, i) => ({
    id: id++,
    cells: p.cells,
    dir: p.dir,
    color: pal[i % pal.length],
    leaving: false,
    shake: false,
    hint: false,
  }));
}

/* ------------------------------------------------------------------- gameplay */
function removable(p) {
  const activePieces = pieces.value.filter((q) => !q.leaving);
  return isRemovable(p, activePieces, n.value);
}

function tap(p) {
  if (p.leaving || won.value) return;
  if (removable(p)) {
    p.leaving = true;
    setTimeout(() => {
      const i = pieces.value.findIndex((x) => x.id === p.id);
      if (i >= 0) pieces.value.splice(i, 1);
      if (arrowsIsWon(pieces.value)) winGame();
    }, 300);
  } else {
    p.shake = true;
    setTimeout(() => (p.shake = false), 420);
  }
}

function winGame() {
  won.value = true;
  cleared.value++;
  localStorage.setItem(CLEARED_KEY, String(cleared.value));
}

function hint() {
  if (won.value) return;
  const p = pieces.value.find((x) => !x.leaving && removable(x));
  if (!p) return;
  p.hint = true;
  setTimeout(() => (p.hint = false), 800);
}

/* ------------------------------------------------------------------ rendering */
const unit = (dir) => [DIRV[dir][1], DIRV[dir][0]]; // [x=Δcol, y=Δrow]
const ctr = (cl) => [cl.c + 0.5, cl.r + 0.5];
const f = (pt) => `${pt[0].toFixed(3)} ${pt[1].toFixed(3)}`;

const TIP = 0.28; // how far the tip pokes past the head-cell centre (shaft + chevron share it)

function shaftPath(p) {
  const [ux, uy] = unit(p.dir);
  const pts = p.cells.map(ctr);
  const head = pts[pts.length - 1];
  const tip = [head[0] + ux * TIP, head[1] + uy * TIP]; // run into the chevron tip so they join
  let body;
  if (pts.length === 1) body = [[head[0] - ux * 0.3, head[1] - uy * 0.3], tip];
  else body = pts.slice(0, -1).concat([tip]);
  return "M " + body.map(f).join(" L ");
}

function headPath(p) {
  const [ux, uy] = unit(p.dir);
  const [px, py] = [-uy, ux];
  const head = ctr(p.cells[p.cells.length - 1]);
  const tip = [head[0] + ux * TIP, head[1] + uy * TIP];
  const a = [tip[0] - ux * TIP + px * 0.22, tip[1] - uy * TIP + py * 0.22];
  const b = [tip[0] - ux * TIP - px * 0.22, tip[1] - uy * TIP - py * 0.22];
  return `M ${f(a)} L ${f(tip)} L ${f(b)}`;
}

function hitPath(p) {
  const [ux, uy] = unit(p.dir);
  const pts = p.cells.map(ctr);
  const head = pts[pts.length - 1];
  const tip = [head[0] + ux * 0.30, head[1] + uy * 0.30];
  let body;
  if (pts.length === 1) body = [[head[0] - ux * 0.40, head[1] - uy * 0.40], tip];
  else body = pts.slice(0, -1).concat([tip]);
  return "M " + body.map(f).join(" L ");
}

function pieceStyle(p) {
  const [ux, uy] = unit(p.dir);
  return { "--lx": ux * 118 + "%", "--ly": uy * 118 + "%", "--hue": p.color };
}

onMounted(() => {
  cleared.value = +(localStorage.getItem(CLEARED_KEY) || 0);
  newGame();
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="箭頭" title-en="Arrow Out">
      <template #actions>
        <button class="btn" @click="hint">提示</button>
        <button class="btn btn--accent" @click="newGame()">新遊戲</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">Level</span>
            <span class="chip__value is-accent">{{ diffLabel }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">Remaining</span>
            <span class="chip__value">{{ remaining }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">Cleared</span>
            <span class="chip__value">{{ cleared }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div class="arrows-board" :style="{ '--n': n }">
            <div
              v-for="p in pieces"
              :key="p.id"
              class="piece"
              :class="{ 'is-leaving': p.leaving, 'is-shake': p.shake, 'is-hint': p.hint }"
              :style="pieceStyle(p)"
            >
              <svg class="piece__svg" :viewBox="`0 0 ${n} ${n}`" aria-hidden="true">
                <path class="piece__hit" :d="hitPath(p)" @click="tap(p)" />
                <path class="piece__shaft" :d="shaftPath(p)" />
                <path class="piece__head" :d="headPath(p)" />
              </svg>
            </div>
          </div>

          <div class="overlay" :class="{ 'is-open': won }">
            <div class="overlay__card">
              <h2 class="overlay__title">全部清空！</h2>
              <p class="overlay__sub">難度 {{ diffLabel }}　·　漂亮，所有箭頭都離開了。</p>
              <div class="overlay__actions">
                <button class="btn btn--accent" @click="newGame()">再來一局</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">難度</span>
          <div class="seg" role="group" aria-label="難度選擇">
            <button
              v-for="d in DIFFS"
              :key="d.key"
              :class="{ 'is-active': difficulty === d.key }"
              @click="newGame(d.key)"
            >
              {{ d.label }}
            </button>
          </div>
          <p class="hint">切換難度會開始新的一局。</p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            每個箭頭可能長短不一、還會轉彎，甚至繞住別的箭頭。點一下，
            整條箭頭會朝箭頭方向一起滑出畫面——但只有當「它每一節的前方、
            直到邊界都淨空」時才走得掉。被擋住的箭頭點了會晃一下。
            把全部箭頭清空即過關。
          </p>
        </div>

        <div class="panel__group">
          <span class="panel__legend">小提示</span>
          <p class="hint">
            先清掉最外圈、前方完全淨空的箭頭，騰出空間，被包在裡層的箭頭才有路可走。
            轉彎的長箭頭要逐節檢查前方是否都通。卡關時可按「提示」。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.arrows-board {
  position: relative;
  width: min(92vw, 60vh, 460px);
  aspect-ratio: 1;
  border-radius: var(--r-lg);
  background-color: var(--ink-850);
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.06) 1.3px, transparent 1.6px);
  background-size: calc(100% / var(--n)) calc(100% / var(--n));
  background-position: 0 0;
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  overflow: hidden;
}

.piece {
  position: absolute;
  inset: 0;
  pointer-events: none;
  color: var(--hue);
  transition: transform 0.28s var(--ease), opacity 0.28s var(--ease);
}
.piece__svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
.piece__hit {
  fill: none;
  stroke: transparent;
  stroke-width: 0.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: stroke;
  cursor: pointer;
}
.piece__shaft,
.piece__head {
  fill: none;
  stroke: currentColor;
  stroke-width: 0.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 4px);
  transition: filter 0.15s var(--ease), stroke-width 0.15s var(--ease);
}

.piece__hit:hover ~ .piece__shaft,
.piece__hit:hover ~ .piece__head {
  filter: drop-shadow(0 0 8px);
  stroke-width: 0.26;
}

.piece.is-leaving {
  transform: translate(var(--lx), var(--ly));
  opacity: 0;
}

.piece.is-shake { animation: pcShake 0.42s var(--ease); }
@keyframes pcShake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-5px); }
  40% { transform: translateX(5px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(3px); }
}

.piece.is-hint .piece__shaft,
.piece.is-hint .piece__head { animation: pcHint 0.8s var(--ease); }
@keyframes pcHint {
  0%, 100% { filter: drop-shadow(0 0 4px); stroke-width: 0.2; }
  50% { filter: drop-shadow(0 0 11px); stroke-width: 0.32; }
}
</style>
