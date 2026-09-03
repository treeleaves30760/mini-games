<script setup>
/* Daily Challenge — one game per day, seeded with the date, so everyone gets
   the same puzzle. Solving it extends the streak kept in localStorage.
   Date-dependent work happens in onMounted so the visitor's local date is
   used and the static HTML never disagrees with the client. */

definePageMeta({ layout: false });
useHead({ title: "每日挑戰 · 遊樂場" });

// Explicit imports: <component :is> needs the component objects at runtime,
// which Nuxt's compile-time auto-import cannot provide for dynamic tags.
import MinesweeperGame from "~/components/games/MinesweeperGame.vue";
import WordGuessGame from "~/components/games/WordGuessGame.vue";
import JpWordGuessGame from "~/components/games/JpWordGuessGame.vue";
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
import KenKenGame from "~/components/games/KenKenGame.vue";
import EquationMazeGame from "~/components/games/EquationMazeGame.vue";
import FractionBalanceGame from "~/components/games/FractionBalanceGame.vue";
import PrimeHunterGame from "~/components/games/PrimeHunterGame.vue";
import CountdownGame from "~/components/games/CountdownGame.vue";
import FunctionRunnerGame from "~/components/games/FunctionRunnerGame.vue";

const COMPONENTS = {
  minesweeper: MinesweeperGame,
  wordle: WordGuessGame,
  "jp-wordle": JpWordGuessGame,
  nonogram: NonogramGame,
  "lights-out": LightsOutGame,
  binario: BinarioGame,
  maze2d: Maze2dGame,
  fifteen: FifteenGame,
  mastermind: MastermindGame,
  flood: FloodGame,
  "twenty-four": TwentyFourGame,
  "word-search": WordSearchGame,
  memory: MemoryGame,
  pipes: PipesGame,
  hashi: HashiGame,
  akari: AkariGame,
  tents: TentsGame,
  kenken: KenKenGame,
  "equation-maze": EquationMazeGame,
  "fraction-balance": FractionBalanceGame,
  "prime-hunter": PrimeHunterGame,
  countdown: CountdownGame,
  "function-runner": FunctionRunnerGame,
};

const { games } = useGames();

const ready = ref(false);
const comp = shallowRef(null);
const todayGame = ref(null);

/* Provided to <GameTopbar> inside the game so the bar can show the date,
   streak and share button. */
const status = reactive({
  seed: "",
  dateLabel: "",
  streak: 0,
  best: 0,
  doneToday: false,
  copied: false,
  share,
});
provide("dailyStatus", status);

const accent = computed(() => todayGame.value?.accent || "#8ab4ff");

function applyStatus(s) {
  status.seed = s.seed;
  status.dateLabel = s.dateLabel;
  status.streak = s.streak;
  status.best = s.best;
  status.doneToday = s.doneToday;
}

onMounted(() => {
  const s = readDailyStatus();
  applyStatus(s);
  todayGame.value = games.find((g) => g.id === s.gameId) || null;
  comp.value = COMPONENTS[s.gameId];
  ready.value = true;
});

function onSolved() {
  if (status.doneToday) return;
  applyStatus(markDailySolved());
}

async function share() {
  const title = todayGame.value ? todayGame.value.title : "每日挑戰";
  const text =
    `遊樂場 每日挑戰 ${status.seed}\n` +
    `${title} 完成\n` +
    `連勝 ${status.streak} 天，最佳 ${status.best} 天`;
  try {
    if (navigator.share) {
      await navigator.share({ text });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      status.copied = true;
      setTimeout(() => (status.copied = false), 1800);
    }
  } catch {
    /* the user closed the share sheet */
  }
}
</script>

<template>
  <div class="daily-root" :style="{ '--accent': accent }">
    <component
      :is="comp"
      v-if="ready && comp"
      :key="status.seed"
      :seed="status.seed"
      daily
      @solved="onSolved"
    />
    <div v-else class="daily-loading">
      <div class="daily-spinner" aria-hidden="true" />
      <p>載入今天的題目</p>
    </div>
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
}
.daily-spinner {
  width: 36px;
  height: 36px;
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
</style>
