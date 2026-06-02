/* =========================================================================
   GAME REGISTRY — the single source of truth for the whole hub.
   Add a game by appending one entry here; the gallery renders itself.

   type      'native'   → a Nuxt route we built          (use `to`)
             'iframe'   → embedded build (Pygame/Unity/WASM) under public/
             'external' → opens an external URL in a new tab (use `to`)
   layout    'feature' (big) | 'wide' | 'normal' — bento sizing
   icon      inline SVG markup (uses var(--accent), injected with v-html)
   available false → renders as a dashed "coming soon" ghost card
   ========================================================================= */

export interface Game {
  id: string;
  title: string;
  titleEn: string;
  desc: string;
  tags: string[];
  accent: string;
  type?: "native" | "iframe" | "external";
  to?: string;
  layout?: "feature" | "wide" | "normal";
  icon?: string;
  available?: boolean;
}

const GAMES: Game[] = [
  {
    id: "snake",
    title: "貪食蛇",
    titleEn: "Snake",
    desc: "經典街機反應遊戲。吃得越多，蛇越長、速度越快——別咬到自己或撞牆。",
    tags: ["經典", "反應", "單人"],
    accent: "#9ce85a",
    type: "native",
    to: "/games/snake",
    layout: "feature",
    available: true,
    icon: `
      <svg viewBox="0 0 200 150" fill="none" aria-hidden="true">
        <g stroke="var(--accent)" stroke-width="3" opacity="0.18">
          <path d="M20 30h160M20 60h160M20 90h160M20 120h160M40 10v130M70 10v130M100 10v130M130 10v130M160 10v130"/>
        </g>
        <g fill="var(--accent)">
          <rect x="22" y="92" width="26" height="26" rx="7"/>
          <rect x="52" y="92" width="26" height="26" rx="7"/>
          <rect x="52" y="62" width="26" height="26" rx="7"/>
          <rect x="52" y="32" width="26" height="26" rx="7"/>
          <rect x="82" y="32" width="26" height="26" rx="7"/>
          <rect x="112" y="32" width="26" height="26" rx="7"/>
        </g>
        <g>
          <rect x="112" y="32" width="26" height="26" rx="8" fill="var(--accent)"/>
          <circle cx="130" cy="40" r="3.2" fill="#0a0b0f"/>
        </g>
        <g>
          <circle cx="158" cy="105" r="13" fill="#ff5d6c"/>
          <path d="M158 92c0-5 3-8 7-8-1 4-3 7-7 8z" fill="var(--accent)"/>
        </g>
      </svg>`,
  },
  {
    id: "sudoku",
    title: "數獨",
    titleEn: "Sudoku",
    desc: "在 9×9 方格中填入 1–9，行、列、宮格都不重複。三種難度，即時偵錯。",
    tags: ["益智", "邏輯"],
    accent: "#6aa6ff",
    type: "native",
    to: "/games/sudoku",
    layout: "wide",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="6" y="6" width="108" height="108" rx="12" stroke="var(--accent)" stroke-width="2.5" opacity="0.5"/>
        <g stroke="var(--text-faint)" stroke-width="1.5">
          <path d="M40 10v100M80 10v100M10 40h100M10 80h100"/>
        </g>
        <g stroke="var(--accent)" stroke-width="3" opacity="0.9" stroke-linecap="round">
          <path d="M43 10v100M83 10v100M10 43h100M10 83h100"/>
        </g>
        <g fill="var(--text)" font-family="'Space Mono', ui-monospace, monospace" font-size="20" font-weight="700" text-anchor="middle">
          <text x="23" y="32">5</text>
          <text x="63" y="32" fill="var(--accent)">3</text>
          <text x="103" y="72">8</text>
          <text x="23" y="112" fill="var(--accent)">1</text>
          <text x="63" y="72">7</text>
          <text x="103" y="32">9</text>
        </g>
      </svg>`,
  },
  {
    id: "one-line",
    title: "一筆畫",
    titleEn: "One Line",
    desc: "一筆走完所有線段，每條只能畫一次。從簡單到燒腦的歐拉路徑關卡。",
    tags: ["益智", "路徑"],
    accent: "#ffb057",
    type: "native",
    to: "/games/one-line",
    layout: "wide",
    available: true,
    icon: `
      <svg viewBox="0 0 140 120" fill="none" aria-hidden="true">
        <path d="M25 95 L25 45 L70 15 L115 45 L115 95 L25 95 L115 45 M115 95 L25 45"
              stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <g fill="var(--ink-900)" stroke="var(--accent)" stroke-width="3.5">
          <circle cx="25" cy="95" r="8"/>
          <circle cx="25" cy="45" r="8"/>
          <circle cx="70" cy="15" r="8"/>
          <circle cx="115" cy="45" r="8"/>
          <circle cx="115" cy="95" r="8"/>
        </g>
      </svg>`,
  },

  /* ---- Future games (ghost cards advertise the roadmap & extensibility) ---- */
  {
    id: "memory",
    title: "記憶翻牌",
    titleEn: "Memory",
    desc: "翻開配對的卡片，考驗你的記憶力。",
    tags: ["即將推出"],
    accent: "#ff7a9c",
    layout: "normal",
    available: false,
  },
  {
    id: "2048",
    title: "2048",
    titleEn: "2048",
    desc: "滑動合併數字方塊，挑戰 2048。",
    tags: ["即將推出"],
    accent: "#c79bff",
    layout: "normal",
    available: false,
  },
  {
    id: "maze3d",
    title: "立體迷宮",
    titleEn: "3D Maze · Three.js",
    desc: "以 Three.js 打造的第一人稱 3D 迷宮，展示 3D 遊戲擴充能力。",
    tags: ["3D", "即將推出"],
    accent: "#5ce0c6",
    layout: "normal",
    available: false,
  },
];

export function useGames() {
  const games = GAMES;
  const playable = computed(() => games.filter((g) => g.available !== false).length);
  const total = games.length;
  return { games, playable, total };
}
