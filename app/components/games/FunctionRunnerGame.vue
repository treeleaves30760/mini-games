<script setup>
import {
  FUNCTION_RUNNER_DIFFICULTIES,
  TARGET_RADIUS,
  cellCenter,
  createSoloGame,
  firePvp,
  fireSolo,
  generateFunctionRunnerPuzzle,
  generatePvpMatch,
  getFunctionRunnerDifficulty,
  nextPvpUnit,
  pvpAlive,
  soloStatus,
} from "~/games/function-runner";

const accent = "#fb7185";
/** SVG pixels per board unit. */
const UNIT = 50;
/** Room around the plot for the axis labels. */
const PAD = { left: 46, right: 14, top: 14, bottom: 36 };
/** Board units per second while a shot draws, capped at SHOT_MAX_SECONDS. */
const SHOT_SPEED = 25;
const SHOT_MAX_SECONDS = 0.9;
const MAX_TRACES = 8;
const QUICK_KEYS = [
  { label: "x", text: "x" },
  { label: "^", text: "^" },
  { label: "(", text: "(" },
  { label: ")", text: ")" },
  { label: "sin", text: "sin(" },
  { label: "cos", text: "cos(" },
  { label: "abs", text: "abs(" },
  { label: "sqrt", text: "sqrt(" },
];
const SYNTAX = [
  ["2x + 1", "直線"],
  ["x^2/4 - 2x", "拋物線"],
  ["3sin(pi x/4)", "正弦波"],
  ["abs(x-5)", "V 形"],
  ["sqrt(x)、e^x、ln(x+1)", "其他函式"],
  ["1/2x", "視為 (1/2)x"],
];

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const mode = ref("solo");
const difficultyKey = ref("normal");
const effectiveDifficulty = computed(() => (props.daily ? "hard" : difficultyKey.value));
const solo = ref(null);
const match = ref(null);
const shooterId = ref(null);
const lastUnit = { 1: null, 2: null };
const expression = ref("");
const error = ref("");
const firing = ref(false);
const drawing = ref(null);
const traces = ref([]);
const overlay = reactive({ open: false, title: "", sub: "", actions: [] });
const inputEl = ref(null);
let animation = 0;
let fallback = 0;

const board = computed(() => (mode.value === "pvp" ? match.value?.board : solo.value?.puzzle.board) ?? null);
const viewWidth = computed(() => (board.value ? (board.value.maxX - board.value.minX) * UNIT + PAD.left + PAD.right : 0));
const viewHeight = computed(() => (board.value ? (board.value.maxY - board.value.minY) * UNIT + PAD.top + PAD.bottom : 0));
const xTicks = computed(() => (board.value ? range(board.value.minX, board.value.maxX) : []));
const yTicks = computed(() => (board.value ? range(board.value.minY, board.value.maxY) : []));
const obstacles = computed(() => (mode.value === "pvp" ? match.value?.obstacles : solo.value?.obstacles) ?? new Set());
const obstaclePath = computed(() => {
  if (!board.value) return "";
  const half = board.value.cell / 2;
  const size = board.value.cell * UNIT;
  let d = "";
  for (const index of obstacles.value) {
    const c = cellCenter(board.value, index);
    d += `M${sx(c.x - half)} ${sy(c.y + half)}h${size}v${size}h${-size}z`;
  }
  return d;
});
const status = computed(() => (solo.value ? soloStatus(solo.value) : null));
const aliveTargets = computed(() => (solo.value ? solo.value.puzzle.targets.filter((t) => solo.value.alive.has(t.id)) : []));
const aliveUnits = computed(() => (match.value ? match.value.units.filter((u) => u.alive) : []));
const currentUnit = computed(() => (match.value ? (match.value.units.find((u) => u.id === shooterId.value) ?? null) : null));
const inputDisabled = computed(() => firing.value || overlay.open || (mode.value === "pvp" && !currentUnit.value));
const fireDisabled = computed(() => inputDisabled.value || expression.value.trim() === "");

function range(from, to) {
  const out = [];
  for (let v = from; v <= to; v++) out.push(v);
  return out;
}
function sx(x) {
  return PAD.left + (x - board.value.minX) * UNIT;
}
function sy(y) {
  return PAD.top + (board.value.maxY - y) * UNIT;
}
function pointsString(path) {
  return path.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
}
function playerName(player) {
  return player === 1 ? "玩家一" : "玩家二";
}

function soloRng() {
  return makeRng(props.seed == null ? null : `${props.seed}:function-runner:${effectiveDifficulty.value}`);
}

function resetShotView() {
  cancelAnimationFrame(animation);
  clearTimeout(fallback);
  firing.value = false;
  drawing.value = null;
  traces.value = [];
  error.value = "";
  expression.value = "";
  overlay.open = false;
}

function newPuzzle() {
  resetShotView();
  solo.value = createSoloGame(generateFunctionRunnerPuzzle(soloRng(), effectiveDifficulty.value));
  focusInput();
}

function retryPuzzle() {
  resetShotView();
  solo.value = createSoloGame(solo.value.puzzle);
  focusInput();
}

function newMatch() {
  resetShotView();
  match.value = generatePvpMatch(makeRng(Date.now()));
  lastUnit[1] = null;
  lastUnit[2] = null;
  shooterId.value = nextPvpUnit(match.value, 1, null)?.id ?? null;
  focusInput();
}

function setMode(next) {
  if (mode.value === next) return;
  mode.value = next;
  if (next === "pvp") newMatch();
  else newPuzzle();
}

function selectUnit(unit) {
  if (firing.value || overlay.open || unit.owner !== match.value.turn || !unit.alive) return;
  shooterId.value = unit.id;
  focusInput();
}

function fire() {
  if (fireDisabled.value) return;
  const outcome = mode.value === "pvp" ? firePvp(match.value, shooterId.value, expression.value) : fireSolo(solo.value, expression.value);
  if (!outcome.ok) {
    error.value = outcome.error;
    return;
  }
  error.value = "";
  animateShot(outcome.result.path, () => commit(outcome));
}

function animateShot(path, done) {
  const points = pointsString(path);
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  const pixels = length * UNIT;
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const seconds = reduced ? 0 : Math.min(SHOT_MAX_SECONDS, length / SHOT_SPEED);
  firing.value = true;
  drawing.value = { points, length: pixels, offset: seconds ? pixels : 0 };
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(animation);
    clearTimeout(fallback);
    drawing.value = null;
    firing.value = false;
    done();
  };
  if (!seconds) {
    finish();
    return;
  }
  const startedAt = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - startedAt) / (seconds * 1000));
    drawing.value = { points, length: pixels, offset: pixels * (1 - progress) };
    if (progress < 1) animation = requestAnimationFrame(tick);
    else finish();
  };
  animation = requestAnimationFrame(tick);
  // Frame callbacks pause in hidden tabs; a timer still settles the shot on time so the game never waits on one.
  fallback = setTimeout(finish, seconds * 1000 + 80);
}

function commit(outcome) {
  traces.value = [...traces.value, pointsString(outcome.result.path)].slice(-MAX_TRACES);
  if (mode.value === "pvp") {
    lastUnit[match.value.turn] = shooterId.value;
    match.value = outcome.match;
    shooterId.value = nextPvpUnit(match.value, match.value.turn, lastUnit[match.value.turn])?.id ?? null;
    if (match.value.winner) {
      openOverlay(`${playerName(match.value.winner)}獲勝`, `共 ${match.value.shots.length} 發`, [{ label: "再來一局", accent: true, run: newMatch }]);
    } else {
      expression.value = "";
      focusInput();
    }
    return;
  }
  solo.value = outcome.game;
  const next = soloStatus(solo.value);
  if (next.won) {
    openOverlay("全部命中", `用了 ${solo.value.shots.length} 發`, props.daily ? [{ label: "完成", disabled: true }] : [{ label: "下一題", accent: true, run: newPuzzle }]);
    emit("solved", {});
  } else if (next.lost) {
    const actions = [{ label: props.daily ? "重來" : "重來這題", accent: true, run: retryPuzzle }];
    if (!props.daily) actions.push({ label: "新題目", run: newPuzzle });
    openOverlay("次數用完", `還剩 ${next.remaining} 個目標`, actions);
  } else {
    focusInput(true);
  }
}

function openOverlay(title, sub, actions) {
  overlay.title = title;
  overlay.sub = sub;
  overlay.actions = actions;
  overlay.open = true;
}

function insert(text) {
  const el = inputEl.value;
  const value = expression.value;
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  expression.value = value.slice(0, start) + text + value.slice(end);
  nextTick(() => {
    el?.focus();
    el?.setSelectionRange(start + text.length, start + text.length);
  });
}

function focusInput(selectAll = false) {
  nextTick(() => {
    inputEl.value?.focus();
    if (selectAll) inputEl.value?.select();
  });
}

watch(expression, () => {
  error.value = "";
});
watch(
  () => props.seed,
  () => {
    if (mode.value === "solo") newPuzzle();
  },
);
watch(effectiveDifficulty, () => {
  if (mode.value === "solo") newPuzzle();
});
onMounted(newPuzzle);
onBeforeUnmount(() => {
  cancelAnimationFrame(animation);
  clearTimeout(fallback);
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="座標射擊" title-en="Function Runner">
      <template #actions>
        <button v-if="mode === 'pvp'" class="btn btn--accent" @click="newMatch">再來一局</button>
        <button v-else class="btn btn--accent" @click="newPuzzle">{{ daily ? "重來" : "新題目" }}</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <template v-if="mode === 'pvp' && match">
            <div class="chip">
              <span class="chip__label">玩家一</span>
              <span class="chip__value" :class="{ 'is-accent': match.turn === 1 }">{{ pvpAlive(match, 1).length }}</span>
            </div>
            <div class="chip">
              <span class="chip__label">玩家二</span>
              <span class="chip__value" :class="{ 'is-accent': match.turn === 2 }">{{ pvpAlive(match, 2).length }}</span>
            </div>
            <div class="chip">
              <span class="chip__label">回合</span>
              <span class="chip__value">{{ playerName(match.turn) }}</span>
            </div>
          </template>
          <template v-else-if="status">
            <div class="chip">
              <span class="chip__label">目標</span>
              <span class="chip__value is-accent">{{ status.remaining }}/{{ solo.puzzle.targets.length }}</span>
            </div>
            <div class="chip">
              <span class="chip__label">射擊</span>
              <span class="chip__value">{{ status.shotsLeft }}/{{ solo.puzzle.shots }}</span>
            </div>
            <div class="chip">
              <span class="chip__label">難度</span>
              <span class="chip__value">{{ getFunctionRunnerDifficulty(effectiveDifficulty).label }}</span>
            </div>
          </template>
        </div>

        <div class="board-wrap">
          <div v-if="board" class="function-board">
            <svg class="plane" :viewBox="`0 0 ${viewWidth} ${viewHeight}`" role="img" aria-label="座標平面">
              <g class="plane__grid">
                <line v-for="x in xTicks" :key="`v${x}`" :x1="sx(x)" :y1="sy(board.maxY)" :x2="sx(x)" :y2="sy(board.minY)" :class="{ 'is-axis': x === 0 }" />
                <line v-for="y in yTicks" :key="`h${y}`" :x1="sx(board.minX)" :y1="sy(y)" :x2="sx(board.maxX)" :y2="sy(y)" :class="{ 'is-axis': y === 0 }" />
              </g>
              <g class="plane__labels">
                <text v-for="x in xTicks.filter((v) => v % 2 === 0)" :key="`lx${x}`" :x="sx(x)" :y="viewHeight - 12" text-anchor="middle">{{ x }}</text>
                <text v-for="y in yTicks.filter((v) => v % 2 === 0 && v !== 0)" :key="`ly${y}`" :x="PAD.left - 10" :y="sy(y) + 4" text-anchor="end">{{ y }}</text>
              </g>
              <path class="plane__obstacles" :d="obstaclePath" />
              <polyline v-for="(points, i) in traces" :key="`trace${i}`" class="plane__trace" :points="points" />

              <template v-if="mode === 'pvp' && match">
                <g
                  v-for="unit in aliveUnits"
                  :key="unit.id"
                  class="plane__unit"
                  :class="{ 'is-hollow': unit.owner === 2, 'is-selected': unit.id === shooterId, 'is-selectable': unit.owner === match.turn && !firing }"
                  :transform="`translate(${sx(unit.x)} ${sy(unit.y)})`"
                  role="button"
                  :tabindex="unit.owner === match.turn ? 0 : -1"
                  :aria-label="`${playerName(unit.owner)}單位 (${unit.x}, ${unit.y})`"
                  :aria-pressed="unit.id === shooterId"
                  @click="selectUnit(unit)"
                  @keydown.enter.prevent="selectUnit(unit)"
                  @keydown.space.prevent="selectUnit(unit)"
                >
                  <circle class="plane__ring" r="17" />
                  <circle class="plane__dot" r="11" />
                  <text class="plane__coord" x="14" y="-14">({{ unit.x }}, {{ unit.y }})</text>
                </g>
              </template>
              <template v-else-if="solo">
                <g v-for="target in aliveTargets" :key="target.id" class="plane__target" :transform="`translate(${sx(target.x)} ${sy(target.y)})`">
                  <circle :r="TARGET_RADIUS * UNIT" />
                  <text class="plane__coord" x="14" y="-14">({{ target.x }}, {{ target.y }})</text>
                </g>
                <g class="plane__shooter" :transform="`translate(${sx(solo.puzzle.shooter.x)} ${sy(solo.puzzle.shooter.y)})`">
                  <circle class="plane__ring" r="17" />
                  <circle class="plane__dot" r="11" />
                </g>
              </template>

              <polyline v-if="drawing" class="plane__shot" :points="drawing.points" :style="{ strokeDasharray: drawing.length, strokeDashoffset: drawing.offset }" />
            </svg>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button v-for="action in overlay.actions" :key="action.label" class="btn" :class="{ 'btn--accent': action.accent }" :disabled="action.disabled" @click="action.run?.()">
                  {{ action.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <form class="fire" @submit.prevent="fire">
          <span v-if="mode === 'pvp' && currentUnit" class="fire__from">從 ({{ currentUnit.x }}, {{ currentUnit.y }}) 朝{{ match.turn === 1 ? "右" : "左" }}</span>
          <label class="fire__label" for="function-runner-input">f(x) =</label>
          <input
            id="function-runner-input"
            ref="inputEl"
            v-model="expression"
            class="fire__input"
            :class="{ 'is-invalid': error }"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="send"
            placeholder="例如 x^2/4 - 2x"
            :disabled="inputDisabled"
            @keydown.enter.prevent="fire"
          />
          <button class="btn btn--accent" type="submit" :disabled="fireDisabled">發射</button>
        </form>
        <div class="keys" aria-label="快速輸入">
          <button v-for="key in QUICK_KEYS" :key="key.label" type="button" :disabled="inputDisabled" @click="insert(key.text)">{{ key.label }}</button>
        </div>
        <p class="fire__error" role="alert">{{ error }}</p>
      </div>

      <aside class="panel">
        <div v-if="!daily" class="panel__group">
          <span class="panel__legend">模式</span>
          <div class="seg">
            <button :class="{ 'is-active': mode === 'solo' }" :aria-pressed="mode === 'solo'" @click="setMode('solo')">單人</button>
            <button :class="{ 'is-active': mode === 'pvp' }" :aria-pressed="mode === 'pvp'" @click="setMode('pvp')">雙人</button>
          </div>
        </div>
        <div v-if="mode === 'solo' && !daily" class="panel__group">
          <span class="panel__legend">難度</span>
          <div class="seg">
            <button v-for="d in FUNCTION_RUNNER_DIFFICULTIES" :key="d.key" :class="{ 'is-active': difficultyKey === d.key }" :aria-pressed="difficultyKey === d.key" @click="difficultyKey = d.key">
              {{ d.label }}
            </button>
          </div>
        </div>
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p v-if="mode === 'pvp'" class="hint">
            輪流射擊。點自己的單位當出發點，朝對手方向為 +x。曲線打到對方單位就消滅，穿過自己的單位不受影響，撞到障礙物會停下並炸開一小塊。先清光對方三個單位獲勝。
          </p>
          <p v-else class="hint">
            輸入 f(x)，曲線從出發點往右畫，經過目標點就消滅它，一發可以連中多個。曲線一律從出發點畫起，常數項會被抵銷。撞到障礙物會停下並炸開一小塊。次數用完前清光目標就過關。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">語法</span>
          <ul class="syntax">
            <li v-for="[code, note] in SYNTAX" :key="code">
              <code>{{ code }}</code>
              <span>{{ note }}</span>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.function-board {
  width: min(92vw, 720px);
  padding: 0.5rem;
  border-radius: var(--r-lg);
  background: var(--ink-950);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
}
.plane {
  display: block;
  width: 100%;
  height: auto;
}
.plane__grid line {
  stroke: rgba(255, 246, 232, 0.06);
  stroke-width: 1;
}
.plane__grid line.is-axis {
  stroke: rgba(255, 246, 232, 0.3);
  stroke-width: 1.5;
}
/* Font sizes are in SVG units (50 per board unit); the board shrinks to ~0.6× on desktop and ~0.35× on phones. */
.plane__labels text,
.plane__coord {
  fill: var(--text-faint);
  font-family: var(--font-body);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}
.plane__coord {
  fill: var(--text-dim);
  font-size: 21px;
}
@media (max-width: 640px) {
  .plane__labels text {
    font-size: 26px;
  }
  .plane__coord {
    font-size: 30px;
  }
}
.plane__obstacles {
  fill: var(--ink-500);
  shape-rendering: crispEdges;
}
.plane__trace {
  fill: none;
  stroke: var(--accent);
  stroke-opacity: 0.28;
  stroke-width: 2;
  stroke-linejoin: round;
}
.plane__shot {
  fill: none;
  stroke: var(--accent);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.plane__target circle {
  fill: var(--ink-950);
  stroke: var(--accent);
  stroke-width: 3;
}
.plane__dot {
  fill: var(--accent);
}
.plane__ring {
  fill: none;
  stroke: var(--accent);
  stroke-opacity: 0.35;
  stroke-width: 2;
}
.plane__unit .plane__ring {
  stroke-opacity: 0;
}
.plane__unit.is-hollow .plane__dot {
  fill: var(--ink-950);
  stroke: var(--accent);
  stroke-width: 3;
}
.plane__unit.is-selected .plane__ring,
.plane__unit:focus-visible .plane__ring {
  stroke-opacity: 0.9;
}
.plane__unit:focus-visible {
  outline: none;
}
.plane__unit.is-selectable {
  cursor: pointer;
}
.fire {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  width: min(92vw, 720px);
}
.fire__from {
  color: var(--text-dim);
  font-size: 0.9rem;
  white-space: nowrap;
}
.fire__label {
  color: var(--accent);
  font-weight: 700;
  white-space: nowrap;
}
.fire__input {
  flex: 1;
  min-width: 160px;
  min-height: 44px;
  padding: 0 0.8rem;
  border-radius: var(--r-sm);
  border: 1px solid var(--line-strong);
  background: var(--ink-950);
  color: var(--text);
  font: 500 1.05rem/1.2 var(--font-mono);
}
.fire__input::placeholder {
  color: var(--text-faint);
}
.fire__input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--glow-sm);
}
.fire__input.is-invalid {
  border-color: #ff5d6c;
}
.fire__input:disabled {
  opacity: 0.55;
}
.fire__error {
  min-height: 1.4em;
  margin: 0;
  color: #ff5d6c;
  font-size: 0.9rem;
}
.keys {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.35rem;
}
.keys button {
  min-width: 46px;
  min-height: 36px;
  padding: 0 0.6rem;
  border-radius: var(--r-xs);
  background: var(--ink-800);
  border: 1px solid var(--line);
  color: var(--text-dim);
  font-size: 0.95rem;
  cursor: pointer;
}
.keys button:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--accent);
}
.keys button:disabled {
  opacity: 0.45;
  cursor: default;
}
.syntax {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.88rem;
}
.syntax li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}
.syntax code {
  color: var(--text);
  font-family: var(--font-mono);
}
.syntax span {
  color: var(--text-faint);
  white-space: nowrap;
}
</style>
