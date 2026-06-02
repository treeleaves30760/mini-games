# 遊樂場 Playground · 網頁小遊戲合輯

現代、簡潔、美觀的網頁小遊戲合輯，以 **Vue 3 + Nuxt 4** 打造，靜態產生（SSG）後部署於 **GitHub Pages**。

目前收錄：🐍 **貪食蛇 Snake**、🔢 **數獨 Sudoku**、✏️ **一筆畫 One Line**。
並為未來的 **3D（Three.js）** 與 **打包遊戲（Pygame / Unity）** 預留了擴充空間。

---

## ✨ 特色

- **純靜態、開箱即玩**：`nuxt generate` 產生純靜態檔案，免伺服器、免安裝。
- **單一註冊表驅動**：所有遊戲集中在 `app/composables/useGames.ts`，新增一筆資料就能上架。
- **統一設計系統**：共用設計 token（顏色、字體、間距）與遊戲外框，外觀一致、各遊戲又有專屬主題色。
- **響應式 + 行動裝置友善**：鍵盤、滑鼠、觸控（滑動 / 點擊 / D-pad）皆可操作。
- **無障礙細節**：語意化結構、`prefers-reduced-motion`、鍵盤操作支援。

## 🧱 技術棧

| 項目 | 採用 |
| --- | --- |
| 框架 | Vue 3（`<script setup>`）+ Nuxt 4 |
| 轉譯模式 | 靜態產生（SSG，`nuxt generate`） |
| 樣式 | 原生 CSS + 設計 token（CSS 變數），無 UI 套件 |
| 字體 | Bricolage Grotesque / Noto Sans TC / Space Mono（Google Fonts） |
| 部署 | GitHub Pages（GitHub Actions 自動化） |

## 🚀 本地開發

需求：Node.js 20 以上。

```bash
npm install        # 安裝相依套件
npm run dev        # 開發伺服器（http://localhost:3000）
npm run generate   # 產生靜態網站到 .output/public
npm run preview    # 預覽 production build
```

預覽靜態產出：

```bash
npm run generate
npx serve .output/public
```

## 📁 專案結構

```
.
├── nuxt.config.ts              # Nuxt 設定（baseURL、github_pages preset、全域 CSS、字體）
├── app/
│   ├── app.vue                 # 根元件（全域背景 + 版面 + 頁面）
│   ├── assets/css/             # 設計系統
│   │   ├── tokens.css          #   ‑ 設計 token（顏色 / 字體 / 間距 / 動態）
│   │   ├── base.css            #   ‑ reset、背景氛圍、按鈕、捲軸
│   │   ├── ui.css              #   ‑ 遊戲共用外框（top bar、HUD、面板、overlay…）
│   │   └── home.css            #   ‑ 首頁（hero、bento 卡片、頁尾）
│   ├── layouts/default.vue     # 首頁版面（站台 header / footer）
│   ├── components/
│   │   ├── AppBackground.vue   # 全域氛圍背景 + 顆粒質感
│   │   ├── GameCard.vue        # 首頁遊戲卡片
│   │   ├── GameTopbar.vue      # 遊戲頁共用頂部列（返回 / 標題 / 動作）
│   │   └── games/              # 各遊戲元件
│   │       ├── SnakeGame.vue
│   │       ├── SudokuGame.vue
│   │       └── OneLineGame.vue
│   ├── composables/useGames.ts # ⭐ 遊戲註冊表（單一資料來源）
│   ├── pages/
│   │   ├── index.vue           # 首頁（hero + 遊戲牆）
│   │   └── games/              # 每款遊戲一個路由
│   │       ├── snake.vue
│   │       ├── sudoku.vue
│   │       └── one-line.vue
│   └── utils/sudoku.ts         # 數獨產生器 / 解題器
├── public/favicon.svg
└── .github/workflows/deploy.yml # GitHub Pages 自動部署
```

## ➕ 如何新增一款遊戲

### A. 原生 Vue 遊戲（推薦）

1. 在 `app/components/games/` 新增元件，例如 `Game2048.vue`。
   - 用 `<div class="game-page" :style="{ '--accent': '#你的主題色' }">` 當根節點。
   - 放入 `<GameTopbar title="..." title-en="...">`、`.stage`、`.panel` 等共用外框。
2. 在 `app/pages/games/` 新增頁面 `2048.vue`：
   ```vue
   <script setup>
   definePageMeta({ layout: false });
   useHead({ title: "2048 · 遊樂場" });
   </script>
   <template><Game2048 /></template>
   ```
3. 在 `app/composables/useGames.ts` 的 `GAMES` 陣列加入一筆，並把 `available` 設為 `true`：
   ```ts
   {
     id: "2048", title: "2048", titleEn: "2048",
     desc: "滑動合併數字方塊，挑戰 2048。",
     tags: ["益智"], accent: "#c79bff",
     type: "native", to: "/games/2048", layout: "normal",
     available: true, icon: `<svg ...></svg>`,
   }
   ```
   首頁卡片牆會自動長出這張卡片。

### B. 3D 遊戲（Three.js）

安裝 `three`，在遊戲元件的 `onMounted` 內初始化場景、在 `onBeforeUnmount` 釋放資源即可，外框與註冊方式同上。

### C. 打包成品（Pygame / Unity）

1. 把匯出的 WebGL / pygbag 成品（含 `index.html`）放到 `public/embeds/<game>/`。
2. 做一個內嵌頁面，用 `<iframe>` 載入該資料夾，並套用 `GameTopbar` 外框。
3. 在註冊表加入該遊戲（`type: "iframe"`）。

> 因為已啟用 `github_pages` preset 並輸出 `.nojekyll`，`public/` 內的任何靜態檔都會原樣部署。

## 🌐 部署到 GitHub Pages

本專案已內建 GitHub Actions 工作流程（`.github/workflows/deploy.yml`）：推送到 `main` 後會自動 `npm ci` → `npm run generate` → 部署到 Pages。

**首次設定（只需一次）：**

1. 在 GitHub 建立一個 repository（建議名稱 `Mini-Games`，與本資料夾一致）。
2. 推送程式碼：
   ```bash
   git remote add origin https://github.com/<你的帳號>/Mini-Games.git
   git push -u origin main
   ```
3. 到 repo 的 **Settings → Pages → Build and deployment → Source**，選擇 **GitHub Actions**。
4. 等工作流程跑完，網站會在：`https://<你的帳號>.github.io/Mini-Games/`

**關於 base URL：**

- 工作流程會用 repo 名稱自動帶入 `NUXT_APP_BASE_URL=/<repo>/`（專案網站必要）。
- 若使用 **自訂網域** 或 repo 名為 `<你的帳號>.github.io`，請把 `deploy.yml` 中的 `NUXT_APP_BASE_URL` 改成 `/`。

## 📄 授權

MIT — 歡迎自由取用、修改、擴充。
