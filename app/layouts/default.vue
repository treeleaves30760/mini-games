<script setup>
const year = new Date().getFullYear();
</script>

<template>
  <div>
    <header class="site-head">
      <div class="wrap" style="display: flex; align-items: center; justify-content: space-between; padding-block: 0">
        <NuxtLink class="brand" to="/" aria-label="遊樂場 首頁">
          <span class="brand__mark">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="4" width="7" height="7" rx="2" />
              <rect x="13" y="4" width="7" height="7" rx="2" />
              <rect x="4" y="13" width="7" height="7" rx="2" />
              <rect x="13" y="13" width="7" height="7" rx="2" />
            </svg>
          </span>
          遊樂場 <span class="en">Playground</span>
        </NuxtLink>
        <nav class="site-nav">
          <a href="#games">遊戲</a>
          <a href="#extend" class="nav-hide">擴充</a>
          <a href="https://github.com/treeleaves30760/mini-games" target="_blank" rel="noopener">GitHub</a>
        </nav>
      </div>
    </header>

    <main>
      <slot />
    </main>

    <footer class="site-foot">
      <div class="wrap">
        <p>© {{ year }} 遊樂場 Playground · 以 Vue + Nuxt 打造的靜態網站</p>
        <p>
          Built for GitHub Pages ·
          <a href="https://github.com/treeleaves30760/mini-games" target="_blank" rel="noopener">原始碼</a>
        </p>
      </div>
    </footer>
  </div>
</template>
