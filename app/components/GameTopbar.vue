<script setup>
defineProps({
  title: { type: String, required: true },
  titleEn: { type: String, default: "" },
});
</script>

<template>
  <header class="topbar">
    <NuxtLink class="topbar__back" to="/" aria-label="返回遊樂場">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
        stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
      返回
    </NuxtLink>
    <span class="topbar__dot"></span>
    <div class="topbar__title">
      <h1>{{ title }}</h1>
      <span v-if="titleEn" class="en">{{ titleEn }}</span>
    </div>
    <div class="topbar__spacer"></div>
    <div class="topbar__actions">
      <slot name="actions" />
    </div>
  </header>
</template>
