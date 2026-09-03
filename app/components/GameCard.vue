<script setup>
/* One game on the home page: icon, name, English name, one-line description. */
defineProps({
  game: { type: Object, required: true },
});
</script>

<template>
  <NuxtLink
    class="tile"
    :to="game.to"
    :style="{ '--accent': game.accent }"
    :aria-label="`${game.title}，${game.desc}`"
  >
    <span class="tile__icon" aria-hidden="true" v-html="game.icon" />
    <span class="tile__name">
      {{ game.title }}
      <span class="tile__en">{{ game.titleEn }}</span>
    </span>
    <span class="tile__desc">{{ game.desc }}</span>
  </NuxtLink>
</template>
