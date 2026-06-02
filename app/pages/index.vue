<script setup>
const { games, playable, total } = useGames();

useHead({
  title: "遊樂場 · Playground — 網頁小遊戲合輯",
});
</script>

<template>
  <div>
    <!-- ===== Hero ===== -->
    <section class="hero wrap">
      <p class="eyebrow reveal">Mini Games Collection · 小遊戲合輯</p>
      <h1 class="hero-title reveal d1">
        在瀏覽器裡，<br />玩一場<span class="grad">好遊戲</span>。
      </h1>
      <p class="hero-sub reveal d2">
        精選經典網頁小遊戲，以 Vue + Nuxt 打造、無需安裝，開啟即玩。
        介面簡潔現代，並為未來的 3D 與打包遊戲預留了擴充空間。
      </p>
      <div class="hero-meta reveal d3">
        <div class="hero-meta__item">
          <div class="num">{{ playable }}</div>
          <div class="lbl">款可立即遊玩</div>
        </div>
        <div class="hero-meta__item">
          <div class="num">{{ total }}</div>
          <div class="lbl">款規劃藍圖</div>
        </div>
        <div class="hero-meta__item">
          <div class="num">0</div>
          <div class="lbl">需要安裝</div>
        </div>
      </div>
    </section>

    <!-- ===== Game gallery ===== -->
    <section class="wrap" id="games">
      <div class="section-head">
        <h2>選一款開始</h2>
        <span class="count">{{ playable }} 款可玩 / {{ total }} 款規劃中</span>
      </div>
      <div class="gallery">
        <GameCard v-for="g in games" :key="g.id" :game="g" />
      </div>
    </section>

    <!-- ===== Extensibility ===== -->
    <section class="wrap" id="extend">
      <div class="section-head">
        <h2>為未來而生</h2>
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
          <div class="ext__icon" style="color: #c79bff">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linejoin="round">
              <path d="M21 8 L12 3 L3 8 L12 13 Z" />
              <path d="M3 8 V16 L12 21 L21 16 V8" />
              <path d="M12 13 V21" opacity="0.6" />
            </svg>
          </div>
          <h3>嵌入打包成品</h3>
          <p>Pygame（pygbag）或 Unity（WebGL）匯出的成品可放入 <code>public/</code>，以 iframe 內嵌遊玩。</p>
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
