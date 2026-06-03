<script setup>
/* 找單字 Word Search — 12×12 grid, 8 directions, pointer-drag to select.
   4 themed word banks; puzzle generated from seeded RNG (always solvable). */

const accent = "#f6c453";
const SAVE_KEY = "playground.wordsearch.best";

const props = defineProps({
  seed:  { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(['solved']);

// ---- word banks ----
const BANKS = {
  ANIMALS: {
    label: '動物 Animals',
    words: ['CAT','DOG','FOX','OWL','BEAR','WOLF','LION','DEER','FROG','FISH','EAGLE','HORSE','TIGER','SNAKE','WHALE','SHARK','PANDA','ZEBRA'],
  },
  FRUITS: {
    label: '水果 Fruits',
    words: ['FIG','PEAR','PLUM','KIWI','LIME','MANGO','GRAPE','LEMON','PEACH','APPLE','MELON','BERRY','PAPAYA','CHERRY','BANANA','ORANGE','GUAVA','LYCHEE'],
  },
  SPACE: {
    label: '宇宙 Space',
    words: ['STAR','MOON','MARS','COMET','ORBIT','VENUS','SOLAR','PLUTO','SATURN','GALAXY','PLANET','NEBULA','METEOR','COSMOS','ROCKET','ECLIPSE','JUPITER'],
  },
  COLORS: {
    label: '顏色 Colors',
    words: ['RED','TAN','BLUE','GOLD','GREY','CYAN','PINK','JADE','IVORY','BLACK','GREEN','WHITE','CORAL','AMBER','VIOLET','INDIGO','MAROON','SCARLET'],
  },
};

const GRID_SIZE = 12;
const DIRS = [
  [0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1],
];

// ---- grid state ----
const grid        = ref([]);       // 2d array of letters
const wordList    = ref([]);       // words to find
const foundSet    = ref(new Set());
const bankLabel   = ref('');
const selections  = ref([]);       // array of {cells: [{r,c}], word}
const dragCells   = ref([]);       // live drag preview cells
const dragStart   = ref(null);
const isDragging  = ref(false);
const gameWon     = ref(false);
const startTime   = ref(0);
const elapsed     = ref(0);
let timerInterval = null;
const overlay = reactive({ open: false, title: '', sub: '' });

// ---- grid builder ----
function buildGrid(rng) {
  const bankKey = rng.pick(Object.keys(BANKS));
  const bank = BANKS[bankKey];
  bankLabel.value = bank.label;

  // pick ~8 words that fit in 12x12
  const eligible = bank.words.filter(w => w.length <= GRID_SIZE);
  const shuffled = rng.shuffle([...eligible]);
  const chosen = shuffled.slice(0, 8);
  wordList.value = chosen;
  foundSet.value = new Set();

  // init empty grid
  const g = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(''));

  function place(word) {
    const attempts = 200;
    for (let t = 0; t < attempts; t++) {
      const dir = rng.pick(DIRS);
      const maxR = GRID_SIZE - 1;
      const maxC = GRID_SIZE - 1;
      let r = rng.int(0, maxR);
      let c = rng.int(0, maxC);
      // Check if word fits
      const endR = r + dir[0] * (word.length - 1);
      const endC = c + dir[1] * (word.length - 1);
      if (endR < 0 || endR > maxR || endC < 0 || endC > maxC) continue;
      // Check no conflict
      let ok = true;
      for (let i = 0; i < word.length; i++) {
        const gr = r + dir[0] * i;
        const gc = c + dir[1] * i;
        if (g[gr][gc] !== '' && g[gr][gc] !== word[i]) { ok = false; break; }
      }
      if (!ok) continue;
      // Place
      for (let i = 0; i < word.length; i++) {
        g[r + dir[0] * i][c + dir[1] * i] = word[i];
      }
      return true;
    }
    return false;
  }

  for (const w of chosen) place(w);

  // Fill empty cells
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (g[r][c] === '') g[r][c] = letters[rng.int(0, 25)];
    }
  }

  grid.value = g;
  selections.value = [];
  dragCells.value = [];
  gameWon.value = false;
  overlay.open = false;
}

// ---- regenerate ----
function regenerate() {
  const rng = makeRng(props.seed);
  buildGrid(rng);
  stopTimer();
  startTime.value = 0;
  elapsed.value = 0;
  timerInterval = setInterval(() => {
    if (!gameWon.value) elapsed.value = Math.floor((Date.now() - startTime.value) / 1000);
  }, 1000);
}

watch(() => props.seed, regenerate);

// ---- timer ----
function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

// ---- drag selection ----
function cellId(r, c) { return `${r},${c}`; }

function getLineCells(start, end) {
  const dr = end.r - start.r;
  const dc = end.c - start.c;
  const adR = Math.abs(dr);
  const adC = Math.abs(dc);
  // Must be in one of 8 directions
  if (dr !== 0 && dc !== 0 && adR !== adC) return null;
  const len = Math.max(adR, adC) + 1;
  const stepR = dr === 0 ? 0 : dr / adR;
  const stepC = dc === 0 ? 0 : dc / adC;
  const cells = [];
  for (let i = 0; i < len; i++) {
    cells.push({ r: start.r + stepR * i, c: start.c + stepC * i });
  }
  return cells;
}

function cellsToWord(cells) {
  return cells.map(({ r, c }) => grid.value[r][c]).join('');
}

// The grid element — we capture the pointer on the WHOLE grid (not the start
// cell) and hit-test cells with elementFromPoint. Capturing the start cell would
// swallow pointer events for every other cell (and touch implicitly captures to
// the target), so dragging across cells would never register.
const gridEl = ref(null);

function cellFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  const cell = el && el.closest ? el.closest('.ws-cell') : null;
  if (!cell) return null;
  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);
  if (Number.isNaN(r) || Number.isNaN(c)) return null;
  return { r, c };
}

function onPointerDown(e, r, c) {
  if (gameWon.value) return;
  e.preventDefault();
  if (startTime.value === 0) startTime.value = Date.now();
  isDragging.value = true;
  dragStart.value = { r, c };
  dragCells.value = [{ r, c }];
  try { gridEl.value?.setPointerCapture(e.pointerId); } catch (_) {}
}

function onPointerMove(e) {
  if (!isDragging.value || !dragStart.value) return;
  const pt = cellFromPoint(e.clientX, e.clientY);
  if (!pt) return;
  const line = getLineCells(dragStart.value, pt);
  dragCells.value = line || [dragStart.value];
}

function onPointerUp() {
  if (!isDragging.value) return;
  isDragging.value = false;
  if (!dragStart.value || dragCells.value.length < 2) { dragCells.value = []; dragStart.value = null; return; }

  const word = cellsToWord(dragCells.value);
  const reversed = word.split('').reverse().join('');
  const match = wordList.value.find(w => w === word || w === reversed);

  if (match && !foundSet.value.has(match)) {
    foundSet.value.add(match);
    selections.value.push({ cells: [...dragCells.value], word: match });
    if (foundSet.value.size === wordList.value.length) {
      handleWin();
    }
  }

  dragCells.value = [];
  dragStart.value = null;
}

function handleWin() {
  gameWon.value = true;
  stopTimer();
  const t = elapsed.value;
  if (props.daily) {
    overlay.title = '完成！';
    overlay.sub = `全部找到了！用時 ${formatTime(t)}。`;
  } else {
    overlay.title = '太厲害了！';
    overlay.sub = `找完所有單字！用時 ${formatTime(t)}。`;
  }
  overlay.open = true;
  emit('solved', { time: t });
  try {
    const best = +(localStorage.getItem(SAVE_KEY) || 999999);
    if (t < best) localStorage.setItem(SAVE_KEY, String(t));
  } catch (_) {}
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

// ---- cell display helpers ----
function isCellInSelection(r, c) {
  return selections.value.some(sel => sel.cells.some(k => k.r === r && k.c === c));
}
function isCellInDrag(r, c) {
  return dragCells.value.some(k => k.r === r && k.c === c);
}
function selectionColorIndex(r, c) {
  const idx = selections.value.findIndex(sel => sel.cells.some(k => k.r === r && k.c === c));
  return idx;
}

const SEL_COLORS = ['#6ad0a0','#f6c453','#ff9aa2','#90c0ff','#d0a0ff','#ffa070','#70e0e0','#ffcc88'];

onMounted(() => {
  regenerate();
});

onBeforeUnmount(() => {
  stopTimer();
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="找單字" title-en="Word Search">
      <template #actions>
        <button v-if="!props.daily" class="btn btn--accent" @click="regenerate">新題目</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">找到</span>
            <span class="chip__value is-accent">{{ foundSet.size }} / {{ wordList.length }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">時間</span>
            <span class="chip__value">{{ formatTime(elapsed) }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">主題</span>
            <span class="chip__value ws-theme">{{ bankLabel.split(' ')[0] }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div
            ref="gridEl"
            class="ws-grid"
            :style="{ '--cols': GRID_SIZE }"
            aria-label="找單字遊戲格"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
          >
            <div
              v-for="r in GRID_SIZE"
              :key="r"
              class="ws-row"
            >
              <div
                v-for="c in GRID_SIZE"
                :key="c"
                class="ws-cell"
                :class="{
                  'is-drag': isCellInDrag(r-1, c-1),
                  'is-found': isCellInSelection(r-1, c-1),
                }"
                :style="isCellInSelection(r-1, c-1) ? {
                  '--sel-color': SEL_COLORS[selectionColorIndex(r-1, c-1) % SEL_COLORS.length]
                } : {}"
                :data-r="r-1"
                :data-c="c-1"
                :aria-label="`${grid[r-1]?.[c-1]} 第${r}行第${c}列`"
                @pointerdown="(e) => onPointerDown(e, r-1, c-1)"
              >
                {{ grid[r-1]?.[c-1] }}
              </div>
            </div>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button v-if="!props.daily" class="btn btn--accent" @click="regenerate">換一題</button>
                <button class="btn" @click="overlay.open = false">關閉</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">{{ bankLabel }}</span>
          <div class="ws-wordlist">
            <div
              v-for="w in wordList"
              :key="w"
              class="ws-word"
              :class="{ 'is-found': foundSet.has(w) }"
            >{{ w }}</div>
          </div>
        </div>

        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">在格子中找出右側所有單字，可以橫、縱、斜向，或反向排列。<br />
          用手指或滑鼠從第一個字母拖曳到最後一個字母。</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.ws-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0.8rem;
  border-radius: var(--r-lg);
  background: radial-gradient(120% 120% at 50% 0%, var(--ink-800), var(--ink-900));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  touch-action: none;
  user-select: none;
}
.ws-row {
  display: flex;
  gap: 2px;
}
.ws-cell {
  width: clamp(30px, 6.4vw, 44px);
  height: clamp(30px, 6.4vw, 44px);
  display: grid;
  place-items: center;
  border-radius: 5px;
  font-family: var(--font-mono);
  font-size: clamp(0.9rem, 1.9vw, 1.15rem);
  font-weight: 700;
  letter-spacing: 0.02em;
  background: var(--ink-800);
  color: var(--text-dim);
  border: 1px solid transparent;
  cursor: default;
  transition: background 0.12s var(--ease), color 0.12s var(--ease),
              border-color 0.12s var(--ease), transform 0.1s var(--ease);
}
.ws-cell.is-drag {
  background: color-mix(in oklab, var(--accent) 45%, var(--ink-700));
  color: var(--text);
  border-color: var(--accent);
  transform: scale(1.05);
}
.ws-cell.is-found {
  background: color-mix(in oklab, var(--sel-color, var(--accent)) 30%, var(--ink-700));
  color: var(--sel-color, var(--accent));
  border-color: color-mix(in oklab, var(--sel-color, var(--accent)) 60%, transparent);
}

.ws-wordlist {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.ws-word {
  font-family: var(--font-mono);
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--text);
  padding: 0.3rem 0.7rem;
  border-radius: var(--r-pill);
  background: var(--ink-700);
  border: 1px solid var(--line);
  /* no width/height/padding in transition — only appearance props */
  transition: background 0.2s var(--ease), color 0.2s var(--ease),
              border-color 0.2s var(--ease), opacity 0.2s var(--ease);
}
.ws-word.is-found {
  text-decoration: line-through;
  color: var(--text-faint);
  background: var(--ink-800);
  border-color: transparent;
  opacity: 0.6;
}
@media (prefers-reduced-motion: reduce) {
  .ws-cell.is-drag { transform: none; }
}

.ws-theme {
  font-size: 0.9rem;
  letter-spacing: 0.03em;
}
</style>
