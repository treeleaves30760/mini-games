<script setup>
/* 記憶序列 Simon — 4-pad deterministic flash sequence, WebAudio tones, undo history. */
import { buildSimonSequence, checkPress } from "~/games/simon";

const accent = "#59d99a";
const BEST_KEY = "playground.simon.best";
const SEQ_LEN = 30;
const DAILY_WIN_ROUND = 10;

const PADS = [
  { id: 0, label: "綠", color: "#4ade80", colorDim: "#166534", freq: 392 },  // G4
  { id: 1, label: "紅", color: "#f87171", colorDim: "#7f1d1d", freq: 329 },  // E4
  { id: 2, label: "黃", color: "#fde047", colorDim: "#713f12", freq: 261 },  // C4
  { id: 3, label: "藍", color: "#60a5fa", colorDim: "#1e3a5f", freq: 523 },  // C5
];

const props = defineProps({
  seed: { type: [String, Number], default: null },
  daily: { type: Boolean, default: false },
});
const emit = defineEmits(["solved"]);

// ---- state ----
const rng = makeRng(props.seed);
const sequence = ref([]);
const round = ref(0);       // current round (1-indexed, = sequence length being shown)
const inputIndex = ref(0);  // how far the player is through this round's input
const phase = ref("idle");  // idle | flashing | input | over | win
const activePad = ref(-1);  // which pad is currently lit (flash or player tap)
const score = ref(0);       // = max round reached
const best = ref(0);
const overlay = reactive({ open: false, title: "", sub: "" });
const reducedMotion = ref(false);

// ---- audio ----
let audioCtx = null;
function getAudio() {
  if (audioCtx) return audioCtx;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
  return audioCtx;
}
function playTone(freq, duration = 0.18) {
  const ctx = getAudio();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.28, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

// ---- sequence generation ----
function buildSequence() {
  sequence.value = buildSimonSequence(makeRng(props.seed), SEQ_LEN);
}

watch(() => props.seed, () => { buildSequence(); startGame(); });

// ---- timing helpers ----
let flashTimer = null;
function clearFlash() { clearTimeout(flashTimer); }

function flashSequence(upTo, onDone) {
  phase.value = "flashing";
  activePad.value = -1;
  let i = 0;
  const delay = reducedMotion.value ? 80 : 600;
  const padOn = reducedMotion.value ? 60 : 350;
  const padOff = reducedMotion.value ? 20 : 150;

  function next() {
    if (i >= upTo) {
      activePad.value = -1;
      flashTimer = setTimeout(() => { onDone(); }, 300);
      return;
    }
    activePad.value = sequence.value[i];
    playTone(PADS[sequence.value[i]].freq);
    flashTimer = setTimeout(() => {
      activePad.value = -1;
      flashTimer = setTimeout(() => {
        i++;
        next();
      }, padOff);
    }, padOn);
  }
  flashTimer = setTimeout(next, delay);
}

// ---- game flow ----
function startGame() {
  clearFlash();
  round.value = 1;
  inputIndex.value = 0;
  score.value = 0;
  overlay.open = false;
  phase.value = "idle";
  flashSequence(1, () => {
    phase.value = "input";
    inputIndex.value = 0;
  });
}

function tapPad(padId) {
  if (phase.value !== "input") return;
  // init AudioContext on first user gesture
  getAudio();
  activePad.value = padId;
  playTone(PADS[padId].freq, 0.22);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { activePad.value = -1; }, 250);

  const result = checkPress(sequence.value, round.value, inputIndex.value, padId);

  if (result.verdict === "wrong") {
    // wrong — game over
    phase.value = "over";
    const prev = best.value;
    if (score.value > prev) {
      best.value = score.value;
      localStorage.setItem(BEST_KEY, String(best.value));
    }
    overlay.title = "錯了！";
    overlay.sub = `答到第 ${round.value} 回合，得分 ${score.value}。最佳：${best.value}。`;
    overlay.open = true;
    emit("solved", { score: score.value });
    return;
  }

  inputIndex.value++;
  if (result.verdict === "round-complete") {
    // completed this round
    score.value = round.value;
    const prev = best.value;
    if (score.value > prev) {
      best.value = score.value;
      localStorage.setItem(BEST_KEY, String(best.value));
    }
    if (props.daily && round.value >= DAILY_WIN_ROUND) {
      phase.value = "win";
      overlay.title = "完成！";
      overlay.sub = `今日挑戰：${DAILY_WIN_ROUND} 回合全部正確！`;
      overlay.open = true;
      emit("solved", { score: score.value });
      return;
    }
    if (round.value >= SEQ_LEN) {
      phase.value = "win";
      overlay.title = "全部完成！";
      overlay.sub = `你記住了完整 ${SEQ_LEN} 步序列！`;
      overlay.open = true;
      emit("solved", { score: score.value });
      return;
    }
    round.value++;
    phase.value = "flashing";
    inputIndex.value = 0;
    flashTimer = setTimeout(() => {
      flashSequence(round.value, () => {
        phase.value = "input";
        inputIndex.value = 0;
      });
    }, 600);
  }
}

// ---- keyboard ----
const KEY_MAP = { "1": 0, "2": 1, "3": 2, "4": 3, "q": 0, "w": 1, "e": 2, "r": 3 };
function onKey(e) {
  const id = KEY_MAP[e.key.toLowerCase()];
  if (id !== undefined) { e.preventDefault(); tapPad(id); }
}

onMounted(() => {
  reducedMotion.value = matchMedia("(prefers-reduced-motion: reduce)").matches;
  try { best.value = +(localStorage.getItem(BEST_KEY) || 0); } catch (_) {}
  buildSequence();
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  clearFlash();
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div class="game-page" :style="{ '--accent': accent }">
    <GameTopbar title="記憶序列" title-en="Simon">
      <template #actions>
        <button class="btn btn--accent" @click="startGame">開始 / 重來</button>
      </template>
    </GameTopbar>

    <div class="stage">
      <div class="stage__main">
        <div class="hud">
          <div class="chip">
            <span class="chip__label">回合</span>
            <!-- min-width reserved so "—" → "30" doesn't jolt chip width -->
            <span class="chip__value is-accent simon-round-val">{{ phase === "idle" ? "—" : round }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">得分</span>
            <span class="chip__value is-accent simon-score-val">{{ score }}</span>
          </div>
          <div class="chip">
            <span class="chip__label">最佳</span>
            <span class="chip__value">{{ best }}</span>
          </div>
        </div>

        <div class="board-wrap">
          <div class="simon-ring" aria-label="記憶序列遊戲盤面">
            <button
              v-for="pad in PADS"
              :key="pad.id"
              class="simon-pad"
              :class="[
                `simon-pad--${pad.id}`,
                { 'is-active': activePad === pad.id, 'is-flashing': phase === 'flashing' }
              ]"
              :aria-label="`${pad.label}按鈕 (${pad.id + 1})`"
              :style="{
                '--pad-color': pad.color,
                '--pad-dim': pad.colorDim,
              }"
              :disabled="phase !== 'input'"
              @click="tapPad(pad.id)"
            />
            <!-- Center hub -->
            <div class="simon-hub">
              <span class="simon-hub__phase">
                <template v-if="phase === 'idle'">按「開始」</template>
                <template v-else-if="phase === 'flashing'">記住！</template>
                <template v-else-if="phase === 'input'">輸入中</template>
                <template v-else-if="phase === 'over'">錯！</template>
                <template v-else-if="phase === 'win'">完成！</template>
              </span>
              <span v-if="phase === 'input'" class="simon-hub__progress">
                {{ inputIndex }}/{{ round }}
              </span>
            </div>
          </div>

          <div class="overlay" :class="{ 'is-open': overlay.open }">
            <div class="overlay__card">
              <h2 class="overlay__title">{{ overlay.title }}</h2>
              <p class="overlay__sub">{{ overlay.sub }}</p>
              <div class="overlay__actions">
                <button v-if="!daily" class="btn btn--accent" @click="startGame">再玩一次</button>
                <template v-else>
                  <p class="hint">今日挑戰結束！</p>
                </template>
              </div>
            </div>
          </div>
        </div>

        <p class="simon-hint show-touch-only">點擊彩色格按順序複誦</p>
      </div>

      <aside class="panel">
        <div class="panel__group">
          <span class="panel__legend">玩法</span>
          <p class="hint">
            遊戲會依序閃爍彩色格，你需要按相同順序重複。<br />
            每回合序列加長一步，記錯即結束。
          </p>
        </div>
        <div class="panel__group">
          <span class="panel__legend">鍵盤操作</span>
          <p class="hint">
            <kbd>1</kbd>綠&nbsp;
            <kbd>2</kbd>紅&nbsp;
            <kbd>3</kbd>黃&nbsp;
            <kbd>4</kbd>藍<br />
            或 <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd>
          </p>
        </div>
        <div v-if="daily" class="panel__group">
          <span class="panel__legend">今日挑戰</span>
          <p class="hint">序列由今日日期生成。答對 {{ DAILY_WIN_ROUND }} 回合即完成！</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.simon-ring {
  position: relative;
  width: min(86vw, 60vh, 480px);
  height: min(86vw, 60vh, 480px);
  border-radius: 50%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 0;
  overflow: hidden;
  box-shadow: var(--shadow-2), 0 0 0 6px var(--ink-800), 0 0 0 7px var(--line);
  touch-action: none;
}
.simon-pad {
  position: relative;
  cursor: pointer;
  background: var(--pad-dim);
  transition: background var(--dur-fast) var(--ease), filter var(--dur-fast) var(--ease);
  border: none;
  outline: none;
}
.simon-pad:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: -4px;
  z-index: 2;
}
.simon-pad--0 { border-radius: 100% 0 0 0; }
.simon-pad--1 { border-radius: 0 100% 0 0; }
.simon-pad--2 { border-radius: 0 0 0 100%; }
.simon-pad--3 { border-radius: 0 0 100% 0; }

.simon-pad.is-active {
  background: var(--pad-color);
  filter: brightness(1.15) drop-shadow(0 0 18px var(--pad-color));
}
.simon-pad:not([disabled]):hover {
  background: color-mix(in oklab, var(--pad-color) 30%, var(--pad-dim));
}
.simon-pad[disabled] {
  cursor: not-allowed;
}

@keyframes padFlash {
  0%, 100% { filter: none; }
  50% { filter: brightness(1.3); }
}

.simon-hub {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 30%;
  height: 30%;
  border-radius: 50%;
  background: var(--ink-900);
  border: 3px solid var(--line);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 5;
  pointer-events: none;
  box-shadow: 0 0 0 6px var(--ink-800), var(--shadow-2);
}
.simon-hub__phase {
  font-family: var(--font-mono);
  font-size: clamp(0.52rem, 1.8vw, 0.75rem);
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  text-transform: uppercase;
  text-align: center;
  padding: 0 4px;
}
.simon-hub__progress {
  font-family: var(--font-mono);
  font-size: clamp(0.65rem, 2vw, 0.9rem);
  font-weight: 800;
  color: var(--accent);
  margin-top: 2px;
}
.simon-hint {
  font-size: 0.84rem;
  color: var(--text-faint);
  font-family: var(--font-mono);
  text-align: center;
}
/* Reserve chip width so "—" → "30" never shifts the HUD row */
.simon-round-val,
.simon-score-val {
  min-width: 2ch;
  display: inline-block;
  text-align: center;
}

/* Hover/active: no geometry change — use box-shadow inset only */
.simon-pad:not([disabled]):active {
  filter: brightness(1.25);
  box-shadow: inset 0 0 0 3px rgba(255,255,255,0.18);
}

@media (prefers-reduced-motion: reduce) {
  .simon-pad { transition: none; }
  .simon-pad.is-active { filter: none; }
}
</style>
