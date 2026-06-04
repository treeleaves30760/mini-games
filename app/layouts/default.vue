<script setup>
const year = new Date().getFullYear();
</script>

<template>
  <div>
    <header class="site-head">
      <div class="wrap site-head__inner">
        <NuxtLink class="brand" to="/" aria-label="遊樂場 首頁">
          <span class="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="4" y="4" width="7" height="7" rx="2" />
              <rect x="13" y="4" width="7" height="7" rx="2" />
              <rect x="4" y="13" width="7" height="7" rx="2" />
              <rect x="13" y="13" width="7" height="7" rx="2" />
            </svg>
          </span>
          <span class="brand__text">
            <span class="brand__name">遊樂場</span>
            <span class="brand__en">Playground</span>
          </span>
        </NuxtLink>
        <nav class="site-nav">
          <a href="#games">遊戲</a>
          <a href="#extend" class="nav-hide">擴充</a>
          <a href="https://github.com/treeleaves30760/mini-games" target="_blank" rel="noopener">GitHub</a>
          <span class="site-credit nav-hide" aria-hidden="true">CREDIT <b>∞</b></span>
        </nav>
      </div>
    </header>

    <main>
      <slot />
    </main>

    <footer class="site-foot">
      <div class="wrap site-foot__inner">
        <p class="site-foot__tag">
          <span class="site-foot__star" aria-hidden="true">✦</span>
          © {{ year }} 遊樂場 · PLAYGROUND
        </p>
        <p class="site-foot__meta">
          以 Vue + Nuxt 打造，靜態部署於 GitHub Pages ·
          <a href="https://github.com/treeleaves30760/mini-games" target="_blank" rel="noopener">原始碼</a>
        </p>
      </div>
    </footer>
  </div>
</template>
