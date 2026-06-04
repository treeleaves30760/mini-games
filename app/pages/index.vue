<script setup>
const { games, playable, total } = useGames();

const selectedCat = ref("全部");
const filtered = computed(() =>
  games.filter(
    (g) =>
      g.daily || selectedCat.value === "全部" || g.category === selectedCat.value
  )
);

// Only show category chips that actually have games behind them.
const cats = computed(() => {
  const present = new Set(games.filter((g) => !g.daily).map((g) => g.category));
  return CATEGORIES.filter((c) => c === "全部" || present.has(c));
});

useHead({
  title: "遊樂場 · Playground — 30+ 款網頁小遊戲與每日挑戰",
});
</script>

<template>
  <div>
    <!-- ===== Hero ===== -->
    <section class="hero wrap">
      <div class="hero-grid" aria-hidden="true"></div>
      <p class="eyebrow reveal">
        <span class="eyebrow__coin" aria-hidden="true">◉</span>
        Insert Coin · 30+ Mini Games
      </p>
      <h1 class="hero-title reveal d1">
        <span class="hero-title__marquee" data-text="PLAYGROUND">PLAYGROUND</span>
      </h1>
      <p class="hero-zh reveal d1">
        在瀏覽器裡，玩一場<span class="grad">好遊戲</span>。
      </p>
      <p class="hero-sub reveal d2">
        超過 30 款精選益智、解謎、棋類與街機小遊戲，以 Vue + Nuxt 打造、無需安裝，開啟即玩。
        還有<strong>每日挑戰</strong>——每天用當天日期生成一道全世界同題的關卡。
      </p>
      <div class="hero-meta reveal d3">
        <div class="hero-meta__item">
          <div class="num">{{ playable }}</div>
          <div class="lbl">款可立即遊玩</div>
        </div>
        <div class="hero-meta__item">
          <div class="num">1</div>
          <div class="lbl">道每日挑戰</div>
        </div>
        <div class="hero-meta__item">
          <div class="num">0</div>
          <div class="lbl">需要安裝</div>
        </div>
      </div>
      <div class="hero-cta reveal d3">
        <NuxtLink to="/daily" class="btn btn--accent hero-cta__daily">
          ▶ 今日挑戰
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
            stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </NuxtLink>
        <a href="#games" class="btn btn--ghost">瀏覽全部遊戲</a>
      </div>
    </section>

    <!-- ===== Game gallery ===== -->
    <section class="wrap" id="games">
      <div class="section-head">
        <h2><span class="section-head__kicker">Select Game</span>選一款開始</h2>
        <span class="count">{{ playable }} 款可玩</span>
      </div>

      <div class="cat-filter" role="tablist" aria-label="遊戲分類">
        <button
          v-for="c in cats"
          :key="c"
          class="cat-chip"
          :class="{ 'is-active': selectedCat === c }"
          role="tab"
          :aria-selected="selectedCat === c"
          @click="selectedCat = c"
        >
          {{ c }}
        </button>
      </div>

      <div class="gallery">
        <GameCard v-for="g in filtered" :key="g.id" :game="g" />
      </div>
    </section>

    <!-- ===== Extensibility ===== -->
    <section class="wrap" id="extend">
      <div class="section-head">
        <h2><span class="section-head__kicker">Built to Grow</span>為未來而生</h2>
        <span class="count">EXTENSIBLE BY DESIGN</span>
      </div>
      <div class="exts">
        <div class="ext">
          <div class="ext__icon" style="color: var(--acc-snake)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="8" height="8" rx="2" />
              <rect x="13" y="3" width="8" height="8" rx="2" />
              <rect x="3" y="13" width="8" height="8" rx="2" />
              <path d="M17 14.5v6M14 17.5h6" />
            </svg>
          </div>
          <h3>一個檔案新增遊戲</h3>
          <p>所有遊戲由 <code>composables/useGames.ts</code> 註冊表驅動，新增一筆資料、放入頁面即可上架。</p>
        </div>
        <div class="ext">
          <div class="ext__icon" style="color: var(--acc-2048)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M3 9h18M8 4v5" />
              <path d="m15 13 2 2-2 2" />
            </svg>
          </div>
          <h3>每日挑戰引擎</h3>
          <p>共用的種子亂數工具 <code>utils/rng.ts</code> 讓任何遊戲都能用日期生成「全世界同題」的關卡。</p>
        </div>
        <div class="ext">
          <div class="ext__icon" style="color: #5ce0c6">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linejoin="round">
              <path d="M12 2 L21 7 V17 L12 22 L3 17 V7 Z" />
              <path d="M12 12 V22 M12 12 L21 7 M12 12 L3 7" opacity="0.6" />
            </svg>
          </div>
          <h3>已支援 3D（Three.js）</h3>
          <p>立體迷宮已用 Three.js 實作；每款遊戲都是獨立 Vue 元件，可持續加入更多 WebGL 3D 遊戲。</p>
        </div>
        <div class="ext">
          <div class="ext__icon" style="color: var(--acc-oneline)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linejoin="round">
              <path d="M12 3 L21 8 L12 13 L3 8 Z" />
              <path d="M3 13 L12 18 L21 13" />
              <path d="M3 13 L3 13.5 M21 13 L21 13.5" />
            </svg>
          </div>
          <h3>統一設計系統</h3>
          <p>共用的設計 token 與遊戲外框，讓每款遊戲外觀一致、各自又有專屬主題色。</p>
        </div>
      </div>
    </section>
  </div>
</template>
