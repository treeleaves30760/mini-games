<script setup>
/* 每日挑戰 Daily Challenge — each day a game is chosen by date and seeded with
   that date, so everyone in the world gets the same puzzle. Completing it
   extends your streak. Everything is computed CLIENT-SIDE in onMounted so the
   player's own local date is used (and there's no SSR hydration mismatch). */

definePageMeta({ layout: false });
useHead({ title: "每日挑戰 Daily · 遊樂場" });

// Explicit imports: Nuxt auto-imported components can't be resolved by name at
// runtime (the compiler wires <Tag> up at build time), so for dynamic <component
// :is> we import the rotation games directly and map them by id.
import MinesweeperGame from "~/components/games/MinesweeperGame.vue";
import WordGuessGame from "~/components/games/WordGuessGame.vue";
import NonogramGame from "~/components/games/NonogramGame.vue";
import LightsOutGame from "~/components/games/LightsOutGame.vue";
import BinarioGame from "~/components/games/BinarioGame.vue";
import Maze2dGame from "~/components/games/Maze2dGame.vue";
import FifteenGame from "~/components/games/FifteenGame.vue";
import MastermindGame from "~/components/games/MastermindGame.vue";
import FloodGame from "~/components/games/FloodGame.vue";
import TwentyFourGame from "~/components/games/TwentyFourGame.vue";
import WordSearchGame from "~/components/games/WordSearchGame.vue";
import MemoryGame from "~/components/games/MemoryGame.vue";
import PipesGame from "~/components/games/PipesGame.vue";
import HashiGame from "~/components/games/HashiGame.vue";
import AkariGame from "~/components/games/AkariGame.vue";
import TentsGame from "~/components/games/TentsGame.vue";

const { games } = useGames();

/* Curated rotation of seed-deterministic games that have a clear win state.
   dayIndex % length picks today's game. */
const ROTATION = [
  { id: "minesweeper", comp: MinesweeperGame },
  { id: "wordle", comp: WordGuessGame },
  { id: "nonogram", comp: NonogramGame },
  { id: "lights-out", comp: LightsOutGame },
  { id: "binario", comp: BinarioGame },
  { id: "maze2d", comp: Maze2dGame },
  { id: "fifteen", comp: FifteenGame },
  { id: "mastermind", comp: MastermindGame },
  { id: "flood", comp: FloodGame },
  { id: "twenty-four", comp: TwentyFourGame },
  { id: "word-search", comp: WordSearchGame },
  { id: "memory", comp: MemoryGame },
  { id: "pipes", comp: PipesGame },
  { id: "hashi", comp: HashiGame },
  { id: "akari", comp: AkariGame },
  { id: "tents", comp: TentsGame },
];

const STORE_KEY = "playground.daily";

const COMP_MAP = Object.fromEntries(ROTATION.map((r) => [r.id, r.comp]));

const ready = ref(false);
const seed = ref("");
const dateLabel = ref("");
const todayGame = ref(null); // the matching registry entry
const comp = shallowRef(null);

const streak = ref(0);
const best = ref(0);
const doneToday = ref(false);
const justSolved = ref(false);
const copied = ref(false);

const accent = computed(() => todayGame.value?.accent || "#ffd166");

function shiftDate(days) {
  const x = new Date();
  x.setDate(x.getDate() + days);
  return x;
}
function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
  } catch (_) {
    return {};
  }
}
function saveStore(s) {
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
}

onMounted(() => {
  const today = todaySeed();
  const yest = todaySeed(shiftDate(-1));
  seed.value = today;

  const di = dayIndex();
  const pick = ROTATION[((di % ROTATION.length) + ROTATION.length) % ROTATION.length];
  todayGame.value = games.find((g) => g.id === pick.id) || null;
  comp.value = COMP_MAP[pick.id];

  const [, mm, dd] = today.split("-");
  dateLabel.value = `${mm}/${dd}`;

  const s = loadStore();
  best.value = s.best || 0;
  if (s.lastDate === today) {
    doneToday.value = true;
    streak.value = s.streak || 1;
  } else if (s.lastDate === yest) {
    streak.value = s.streak || 0; // alive — finish today to extend it
  } else {
    streak.value = 0; // broken or first time
  }

  ready.value = true;
});

function onSolved() {
  if (doneToday.value) return;
  const today = todaySeed();
  const yest = todaySeed(shiftDate(-1));
  const s = loadStore();
  const next = s.lastDate === yest ? (s.streak || 0) + 1 : 1;
  const best2 = Math.max(s.best || 0, next);
  saveStore({ lastDate: today, streak: next, best: best2 });
  streak.value = next;
  best.value = best2;
  doneToday.value = true;
  justSolved.value = true;
}

async function share() {
  const title = todayGame.value ? `${todayGame.value.title}` : "每日挑戰";
  const text =
    `🎮 遊樂場・每日挑戰 ${seed.value}\n` +
    `今日題目：${title} ✅\n` +
    `🔥 連勝 ${streak.value} 天（最佳 ${best.value}）`;
  try {
    if (navigator.share) {
      await navigator.share({ text });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      copied.value = true;
      setTimeout(() => (copied.value = false), 1800);
    }
  } catch (_) {
    /* user cancelled share — ignore */
  }
}
</script>

<template>
  <div class="daily-root" :style="{ '--accent': accent }">
    <!-- The chosen game renders its own full chrome (topbar etc.) -->
    <component
      :is="comp"
      v-if="ready && comp"
      :key="seed"
      :seed="seed"
      daily
      @solved="onSolved"
    />

    <div v-else class="daily-loading">
      <div class="daily-spinner" aria-hidden="true" />
      <p>正在準備今天的挑戰…</p>
    </div>

    <!-- Floating daily status pill (teleported so it sits above the game UI) -->
    <Teleport v-if="ready" to="body">
      <div class="daily-pill" :class="{ 'is-done': doneToday, 'is-pop': justSolved }" :style="{ '--accent': accent }">
        <NuxtLink class="daily-pill__home" to="/" aria-label="回遊樂場">◀</NuxtLink>
        <div class="daily-pill__main">
          <span class="daily-pill__date">🗓 {{ dateLabel }} 每日挑戰</span>
          <span class="daily-pill__game">{{ todayGame?.title || "" }}</span>
        </div>
        <span class="daily-pill__streak" :title="`最佳連勝 ${best} 天`">
          🔥 {{ doneToday ? streak : streak || "—" }}
        </span>
        <button v-if="doneToday" class="daily-pill__share" @click="share">
          {{ copied ? "已複製 ✓" : "分享" }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.daily-root {
  min-height: 100dvh;
}

.daily-loading {
  min-height: 100dvh;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 1rem;
  color: var(--text-dim);
  font-family: var(--font-mono);
}
.daily-spinner {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 3px solid var(--line);
  border-top-color: var(--accent);
  animation: dailySpin 0.8s linear infinite;
}
@keyframes dailySpin {
  to {
    transform: rotate(360deg);
  }
}

/* Floating pill — teleported to <body>, so styles must be robust on their own.
   Scoped styles still apply because Vue keeps the scope id on teleported nodes. */
.daily-pill {
  position: fixed;
  top: max(0.7rem, env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.45rem 0.55rem 0.45rem 0.6rem;
  border-radius: var(--r-pill);
  background: color-mix(in oklab, var(--ink-800) 88%, transparent);
  border: 1px solid color-mix(in oklab, var(--accent) 38%, var(--line));
  box-shadow: var(--shadow-2), 0 0 0 1px color-mix(in oklab, var(--accent) 14%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  max-width: calc(100vw - 1.4rem);
}
.daily-pill.is-done {
  border-color: color-mix(in oklab, var(--accent) 60%, transparent);
}
.daily-pill.is-pop {
  animation: dailyPop 0.5s var(--ease-out);
}
@keyframes dailyPop {
  0% {
    transform: translateX(-50%) scale(0.9);
  }
  50% {
    transform: translateX(-50%) scale(1.06);
  }
  100% {
    transform: translateX(-50%) scale(1);
  }
}
.daily-pill__home {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: 50%;
  background: var(--ink-700);
  border: 1px solid var(--line);
  color: var(--text-dim);
  font-size: 0.7rem;
}
.daily-pill__home:hover {
  color: var(--text);
  border-color: var(--accent);
}
.daily-pill__main {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
  min-width: 0;
}
.daily-pill__date {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.04em;
  color: var(--text-faint);
  white-space: nowrap;
}
.daily-pill__game {
  font-family: var(--font-display);
  font-size: 0.92rem;
  font-weight: 800;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.daily-pill__streak {
  font-family: var(--font-mono);
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--accent);
  flex: none;
  padding-inline: 0.1rem;
}
.daily-pill__share {
  flex: none;
  padding: 0.4rem 0.8rem;
  border-radius: var(--r-pill);
  background: var(--accent);
  color: var(--accent-ink);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  transition: filter var(--dur-fast) var(--ease);
}
.daily-pill__share:hover {
  filter: brightness(1.08);
}
</style>
