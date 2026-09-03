<script setup>
const { games, playable } = useGames();

/* Games grouped by category, in CATEGORIES order. */
const groups = computed(() =>
  CATEGORIES.map((name) => ({
    name,
    games: games.filter((g) => !g.daily && g.available !== false && g.category === name),
  })).filter((g) => g.games.length)
);

/* Today's challenge depends on the visitor's date, so it is filled in after
   mount; the static page shows a neutral strip until then. */
const dailyEntry = games.find((g) => g.daily);
const today = ref(null);
onMounted(() => {
  const status = readDailyStatus();
  today.value = { status, game: games.find((g) => g.id === status.gameId) || null };
});
const dailyAccent = computed(() => today.value?.game?.accent || dailyEntry?.accent || "#8ab4ff");
const dailyIcon = computed(() => today.value?.game?.icon || dailyEntry?.icon || "");

useHead({ title: "遊樂場：網頁小遊戲" });
</script>

<template>
  <div class="wrap">
    <section class="lead">
      <h1>{{ playable }} 款在瀏覽器裡直接玩的小遊戲。</h1>
    </section>

    <NuxtLink to="/daily" class="daily" :style="{ '--accent': dailyAccent }">
      <span class="daily__icon" aria-hidden="true" v-html="dailyIcon" />
      <span class="daily__text">
        <span class="daily__label">今日挑戰<span v-if="today" class="daily__date">{{ today.status.dateLabel }}</span></span>
        <span class="daily__game">{{ today?.game?.title || "今天的題目" }}</span>
        <span class="daily__meta">
          <template v-if="today?.status.doneToday">今天已完成，連勝 {{ today.status.streak }} 天。</template>
          <template v-else-if="today?.status.streak">全世界同一題。連勝 {{ today.status.streak }} 天，今天完成可以延續。</template>
          <template v-else>每天一題，全世界同一題。完成就累積連勝。</template>
        </span>
      </span>
      <span class="daily__cta btn btn--accent">{{ today?.status.doneToday ? "再看一次" : "開始" }}</span>
    </NuxtLink>

    <section v-for="grp in groups" :key="grp.name" class="group">
      <h2 class="group__title">
        {{ grp.name }}<span class="group__count">{{ grp.games.length }} 款</span>
      </h2>
      <div class="tiles">
        <GameCard v-for="g in grp.games" :key="g.id" :game="g" />
      </div>
    </section>
  </div>
</template>
