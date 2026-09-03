<script setup>
const year = new Date().getFullYear();
const repo = "https://github.com/treeleaves30760/mini-games";
</script>

<template>
  <div>
    <header class="site-head">
      <div class="wrap site-head__inner">
        <NuxtLink class="brand" to="/">遊樂場</NuxtLink>
        <nav class="site-nav" aria-label="網站">
          <NuxtLink to="/daily">今日挑戰</NuxtLink>
          <a :href="repo" target="_blank" rel="noopener">GitHub</a>
        </nav>
      </div>
    </header>

    <main>
      <slot />
    </main>

    <footer class="site-foot">
      <div class="wrap site-foot__inner">
        <span>© {{ year }} 遊樂場</span>
        <span>原始碼在 <a :href="repo" target="_blank" rel="noopener">GitHub</a>，MIT 授權</span>
      </div>
    </footer>
  </div>
</template>
