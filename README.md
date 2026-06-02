# 遊樂場 Playground · 網頁小遊戲合輯

現代、簡潔、美觀的網頁小遊戲合輯，以 **Vue 3 + Nuxt 4** 打造，靜態產生（SSG）後部署於 **GitHub Pages**。

線上版：https://treeleaves30760.github.io/mini-games/

目前收錄六款遊戲：

| 遊戲 | 說明 | 技術 |
| --- | --- | --- |
| 貪食蛇 Snake | 經典街機反應遊戲 | Canvas 2D |
| 數獨 Sudoku | 保證唯一解、三難度、即時偵錯 | 響應式 Vue |
| 一筆畫 One Line | 歐拉路徑關卡，一筆畫完所有線段 | 響應式 SVG |
| 2048 | 滑動合併數字方塊 | 響應式 Vue |
| 箭頭 Arrow Out | 點箭頭讓它滑出，前方淨空才走得掉 | 響應式 Vue |
| 立體迷宮 3D Maze | 第一人稱 3D 迷宮 + 小地圖 | Three.js / WebGL |

## 特色

- 純靜態、開箱即玩：`nuxt generate` 產生純靜態檔案，免伺服器、免安裝。
- 單一註冊表驅動：所有遊戲集中在 `app/composables/useGames.ts`，新增一筆資料就能上架。
- 統一設計系統：共用設計 token（顏色、字體、間距）與遊戲外框，外觀一致、各遊戲又有專屬主題色。
- 響應式 + 行動裝置友善：鍵盤、滑鼠、觸控（滑動 / 點擊 / D-pad）皆可操作。
- 無障礙細節：語意化結構、`prefers-reduced-motion`、鍵盤操作支援。

## 技術棧

| 項目 | 採用 |
| --- | --- |
| 框架 | Vue 3（`<script setup>`）+ Nuxt 4 |
| 轉譯模式 | 靜態產生（SSG，`nuxt generate`） |
| 3D | Three.js（僅在用戶端動態載入） |
| 樣式 | 原生 CSS + 設計 token（CSS 變數），無 UI 套件 |
| 字體 | Bricolage Grotesque / Noto Sans TC / Space Mono（Google Fonts） |
| 部署 | GitHub Pages（GitHub Actions 自動化） |

## 本地開發

需求：Node.js 20 以上。

```bash
npm install        # 安裝相依套件
npm run dev        # 開發伺服器（http://localhost:3000）
npm run generate   # 產生靜態網站到 .output/public
npm run preview    # 預覽 production build
```

預覽靜態產出：`npm run generate && npx serve .output/public`

## 專案結構

```
.
├── nuxt.config.ts                 # baseURL、github_pages preset、全域 CSS、字體、元件設定
├── app/
│   ├── app.vue                    # 根元件（全域背景 + 版面 + 頁面）
│   ├── assets/css/                # 設計系統：tokens / base / ui / home
│   ├── layouts/default.vue        # 首頁版面（站台 header / footer）
│   ├── components/
│   │   ├── AppBackground.vue      # 全域氛圍背景 + 顆粒質感
│   │   ├── GameCard.vue           # 首頁遊戲卡片
│   │   ├── GameTopbar.vue         # 遊戲頁共用頂部列（返回 / 標題 / 動作）
│   │   └── games/                 # 各遊戲元件
│   │       ├── SnakeGame.vue
│   │       ├── SudokuGame.vue
│   │       ├── OneLineGame.vue
│   │       ├── Game2048.vue
│   │       ├── ArrowsGame.vue
│   │       └── Maze3DGame.vue     # Three.js（onMounted 動態 import）
│   ├── composables/useGames.ts    # 遊戲註冊表（單一資料來源）
│   ├── pages/
│   │   ├── index.vue              # 首頁（hero + 遊戲牆）
│   │   └── games/                 # 每款遊戲一個路由（snake / sudoku / one-line / 2048 / arrows / maze-3d）
│   └── utils/sudoku.ts            # 數獨產生器 / 解題器
├── public/favicon.svg
└── .github/workflows/deploy.yml   # GitHub Pages 自動部署
```

說明：因為元件設定為 `components: [{ path: '~/components', pathPrefix: false }]`，
所以 `components/games/SnakeGame.vue` 的標籤就是 `<SnakeGame/>`（不帶資料夾前綴）。

## 如何新增一款遊戲

### A. 原生 Vue 遊戲（推薦）

1. 在 `app/components/games/` 新增元件，例如 `Game2048.vue`。
   - 用 `<div class="game-page" :style="{ '--accent': '#你的主題色' }">` 當根節點。
   - 放入 `<GameTopbar title="..." title-en="...">`、`.stage`、`.panel` 等共用外框。
2. 在 `app/pages/games/` 新增頁面，並設定 `definePageMeta({ layout: false })`、用 `useHead` 設定標題，模板放入你的遊戲元件。
3. 在 `app/composables/useGames.ts` 的 `GAMES` 陣列加入一筆，`available` 設為 `true`，附上 `to`、`accent`、`icon`。首頁卡片牆會自動長出這張卡片。

### B. 3D 遊戲（Three.js）

參考 `Maze3DGame.vue`：在 `onMounted` 內以 `await import('three')` 動態載入（確保只在用戶端執行、不影響 SSG），並在 `onBeforeUnmount` 釋放資源（`renderer.dispose()`、`cancelAnimationFrame`）。

### C. 打包成品（Pygame / Unity）

1. 把匯出的 WebGL / pygbag 成品（含 `index.html`）放到 `public/embeds/<game>/`。
2. 做一個內嵌頁面，用 `<iframe>` 載入該資料夾，套用 `GameTopbar` 外框。
3. 在註冊表加入該遊戲（`type: "iframe"`）。

因為已啟用 `github_pages` preset 並輸出 `.nojekyll`，`public/` 內的任何靜態檔都會原樣部署。

## 部署到 GitHub Pages

已內建 GitHub Actions 工作流程（`.github/workflows/deploy.yml`）：推送到 `main` 後會自動
`npm ci` → `npm run generate` → 部署到 Pages。base URL 由工作流程依 repo 名稱自動帶入
（`NUXT_APP_BASE_URL=/<repo>/`）。

首次需到 repo 的 **Settings → Pages → Source** 選擇 **GitHub Actions**。
若使用自訂網域，或 repo 名為 `<帳號>.github.io`，請把 `deploy.yml` 中的 `NUXT_APP_BASE_URL` 改成 `/`。

## 授權

MIT — 歡迎自由取用、修改、擴充。
