<script setup>
/* Shared top bar for every game page: back link, title, and the game's own
   action buttons (slot). When the page is the Daily Challenge, the daily
   page provides `dailyStatus` and the bar shows the date, streak and a
   share button instead of a floating widget over the game. */
defineProps({
  title: { type: String, required: true },
  titleEn: { type: String, default: "" },
});

const daily = inject("dailyStatus", null);
</script>

<template>
  <header class="topbar">
    <NuxtLink class="topbar__back" to="/" aria-label="回到遊樂場">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
      返回
    </NuxtLink>
    <div class="topbar__title">
      <h1>{{ title }}</h1>
      <span v-if="daily" class="topbar__daily">今日挑戰 {{ daily.dateLabel }}</span>
      <span v-else-if="titleEn" class="en">{{ titleEn }}</span>
    </div>
    <div class="topbar__spacer"></div>
    <div class="topbar__actions">
      <template v-if="daily">
        <span v-if="daily.streak" class="topbar__streak">連勝 {{ daily.streak }} 天</span>
        <button v-if="daily.doneToday" class="btn" @click="daily.share()">
          {{ daily.copied ? "已複製" : "分享成績" }}
        </button>
      </template>
      <slot name="actions" />
    </div>
  </header>
</template>
