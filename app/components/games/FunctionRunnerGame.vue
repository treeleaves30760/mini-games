<script setup>
import {
  FUNCTION_RUNNER_DIFFICULTIES,
  evaluateFunction,
  functionRunnerStatus,
  generateFunctionRunnerPuzzle,
} from "~/games/function-runner";

const accent = "#fb7185";

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

const difficultyKey = ref("normal");
const effectiveDifficulty = computed(() => (props.daily ? "hard" : difficultyKey.value));
const puzzle = ref(null);
const coeffs = reactive({ a: 0, b: 0, c: 0 });
const won = ref(false);
const overlay = reactive({ open: false, title: "", sub: "" });

const status = computed(() => (puzzle.value ? functionRunnerStatus(puzzle.value, coeffs) : { hits: 0, blocked: 0, solved: false }));
const coeffList = computed(() => (puzzle.value?.kind === "quadratic" ? ["a", "b", "c"] : ["b", "c"]));
const formula = computed(() => {
  if (!puzzle.value) return "";
  if (puzzle.value.kind === "line") return `y = ${coeffs.b}x ${coeffs.c < 0 ? "-" : "+"} ${Math.abs(coeffs.c)}`;
  return `y = ${coeffs.a}x² ${coeffs.b < 0 ? "-" : "+"} ${Math.abs(coeffs.b)}x ${coeffs.c < 0 ? "-" : "+"} ${Math.abs(coeffs.c)}`;
});
const samples = computed(() => {
  if (!puzzle.value) return "";
  const points = [];
  const step = 0.25;
  for (let x = -puzzle.value.range; x <= puzzle.value.range + 0.001; x += step) {
    const y = evaluateFunction(puzzle.value.kind, coeffs, x);
    if (Math.abs(y) <= puzzle.value.range * 1.35) points.push(toSvgPoint({ x, y }));
  }
  return points.join(" ");
});

function rng() {
  return makeRng(props.seed == null ? null : `${props.seed}:function-runner:${effectiveDifficulty.value}`);
}

function generate() {
  puzzle.value = generateFunctionRunnerPuzzle(rng(), effectiveDifficulty.value);
  coeffs.a = 0;
  coeffs.b = 0;
  coeffs.c = 0;
  won.value = false;
  overlay.open = false;
}

watch(() => props.seed, generate);
watch(effectiveDifficulty, generate);

function adjust(key, delta) {
  if (!puzzle.value || won.value) return;
  const limit = puzzle.value.kind === "quadratic" && key === "a" ? 3 : 8;
  coeffs[key] = Math.max(-limit, Math.min(limit, coeffs[key] + delta));
  checkWin();
}

function toSvgPoint(point) {
  if (!puzzle.value) return "0,0";
  const r = puzzle.value.range;
  const x = 50 + (point.x / r) * 44;
  const y = 50 - (point.y / r) * 44;
  return `${x},${y}`;
}

function axisTicks() {
  if (!puzzle.value) return [];
  const ticks = [];
  for (let v = -puzzle.value.range; v <= puzzle.value.range; v++) ticks.push(v);
  return ticks;
}

function checkWin() {
  nextTick(() => {
    if (!status.value.solved) return;
    won.value = true;
    overlay.title = "函數命中！";
    overlay.sub = `${formula.value} 通過所有目標點。`;
    overlay.open = true;
    emit("solved", {});
  });
}

onMounted(generate);
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="座標射擊" title-en="Function Runner">
      <template #actions>
        <button class="btn btn--accent" @click="generate">新題目</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">命中</span>
            <span class="chip__value is-accent">{{ status.hits }}/{{ puzzle?.targets.length || 0 }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">阻擋</span>
            <span class="chip__value">{{ status.blocked }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">函數</span>
            <span class="chip__value">{{ puzzle?.kind === "quadratic" ? "2次" : "直線" }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div v-if="puzzle" class="function-board">
            <svg class="plane" viewBox="0 0 100 100" role="img" :aria-label="formula">
              <g class="plane__grid">
                <line
                  v-for="t in axisTicks()"
                  :key="`v-${t}`"
                  :x1="50 + (t / puzzle.range) * 44"
                  y1="6"
                  :x2="50 + (t / puzzle.range) * 44"
                  y2="94"
                />
                <line
                  v-for="t in axisTicks()"
                  :key="`h-${t}`"
                  x1="6"
                  :y1="50 - (t / puzzle.range) * 44"
                  x2="94"
                  :y2="50 - (t / puzzle.range) * 44"
                />
              </g>
              <g class="plane__axis">
                <line x1="6" y1="50" x2="94" y2="50" />
                <line x1="50" y1="6" x2="50" y2="94" />
              </g>
              <polyline v-if="samples" class="plane__curve" :points="samples" />
              <g v-for="point in puzzle.blockers" :key="`b-${point.x}-${point.y}`" class="plane__blocker" :transform="`translate(${toSvgPoint(point)})`">
                <line x1="-1.7" y1="-1.7" x2="1.7" y2="1.7" />
                <line x1="-1.7" y1="1.7" x2="1.7" y2="-1.7" />
              </g>
              <circle
                v-for="point in puzzle.targets"
                :key="`t-${point.x}-${point.y}`"
                class="plane__target"
                :class="{ 'is-hit': evaluateFunction(puzzle.kind, coeffs, point.x) === point.y }"
                :cx="toSvgPoint(point).split(',')[0]"
                :cy="toSvgPoint(point).split(',')[1]"
                r="2.1"
              />
            </svg>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button v-if="!props.daily" class="btn btn--accent" @click="generate">下一題</button>
                <button v-else class="btn" disabled>完成</button>
              </div>
            </div>
          </div>
        </div>

        <div class="formula">{{ formula }}</div>
      </div>

      <aside class="panel">
        <div v-if="!props.daily" class="panel__group">
          <span class="panel__legend">難度</span>
          <div class="seg">
            <button
              v-for="d in FUNCTION_RUNNER_DIFFICULTIES"
              :key="d.key"
              :class="{ 'is-active': difficultyKey === d.key }"
              :aria-pressed="difficultyKey === d.key"
              @click="difficultyKey = d.key"
            >
              {{ d.label }}
            </button>
          </div>
        </div>
        <div class="panel__group">
          <span class="panel__legend">係數</span>
          <div v-for="key in coeffList" :key="key" class="coeff-row">
            <span>{{ key }}</span>
            <button :aria-label="`${key} 減一`" @click="adjust(key, -1)">−</button>
            <strong>{{ coeffs[key] }}</strong>
            <button :aria-label="`${key} 加一`" @click="adjust(key, 1)">+</button>
          </div>
        </div>
        <div class="panel__group">
          <span class="panel__legend">目標點</span>
          <p class="hint">
            調整係數，讓曲線通過所有亮點；若有叉號阻擋點，曲線不能穿過它們。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.function-board {
  width: min(90vw, 66vh, 580px);
  aspect-ratio: 1;
  padding: 0.75rem;
  border-radius: var(--r-lg);
  background: radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--accent) 10%, var(--ink-900)), var(--ink-950));
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
}
.plane {
  width: 100%;
  height: 100%;
}
.plane__grid line {
  stroke: rgba(255, 255, 255, 0.07);
  stroke-width: 0.22;
}
.plane__axis line {
  stroke: rgba(255, 255, 255, 0.28);
  stroke-width: 0.45;
}
.plane__curve {
  fill: none;
  stroke: var(--accent);
  stroke-width: 1.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 4px var(--accent));
}
.plane__target {
  fill: var(--ink-950);
  stroke: var(--accent);
  stroke-width: 0.9;
}
.plane__target.is-hit {
  fill: var(--accent);
}
.plane__blocker line {
  stroke: #ff5d6c;
  stroke-width: 0.8;
  stroke-linecap: round;
}
.formula {
  width: min(90vw, 580px);
  min-height: 48px;
  display: grid;
  place-items: center;
  padding: 0.75rem 1rem;
  border-radius: var(--r-md);
  border: 1px solid var(--line);
  background: var(--ink-900);
  color: var(--accent);
  font-family: var(--font-mono);
  font-weight: 800;
}
.coeff-row {
  display: grid;
  grid-template-columns: 28px 44px 1fr 44px;
  align-items: center;
  gap: 0.5rem;
}
.coeff-row span {
  font-family: var(--font-mono);
  color: var(--accent);
  font-weight: 900;
}
.coeff-row strong {
  min-height: 42px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--ink-950);
  border: 1px solid var(--line);
  font-family: var(--font-mono);
}
.coeff-row button {
  min-height: 42px;
  border-radius: 8px;
  background: var(--ink-800);
  border: 1px solid var(--line);
  color: var(--text);
  font-weight: 900;
  cursor: pointer;
}
.coeff-row button:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
