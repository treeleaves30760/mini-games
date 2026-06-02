<script setup>
const props = defineProps({
  game: { type: Object, required: true },
});

const layoutClass = computed(() => {
  return {
    feature: "card--feature",
    wide: "card--wide",
    normal: "",
  }[props.game.layout] || "";
});
</script>

<template>
  <!-- Coming-soon ghost card -->
  <article
    v-if="game.available === false"
    class="card card--ghost"
    :class="layoutClass"
    :style="{ '--accent': game.accent }"
    :aria-label="`${game.title}（即將推出）`"
  >
    <div class="card__tags">
      <span v-for="t in game.tags" :key="t" class="tag">{{ t }}</span>
    </div>
    <h3 class="card__title">
      {{ game.title }} <span class="en">{{ game.titleEn }}</span>
    </h3>
    <p class="card__desc">{{ game.desc }}</p>
  </article>

  <!-- Playable card -->
  <NuxtLink
    v-else
    class="card"
    :class="layoutClass"
    :to="game.to"
    :style="{ '--accent': game.accent }"
    :aria-label="`${game.title} — ${game.desc}`"
  >
    <div class="card__visual" v-html="game.icon" />
    <div class="card__tags">
      <span v-for="t in game.tags" :key="t" class="tag">{{ t }}</span>
    </div>
    <h3 class="card__title">
      {{ game.title }} <span class="en">{{ game.titleEn }}</span>
    </h3>
    <p class="card__desc">{{ game.desc }}</p>
    <span class="card__cta">
      開始遊戲
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
        stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </span>
  </NuxtLink>
</template>
