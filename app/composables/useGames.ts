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
  {
    id: "shikaku",
    title: "四角",
    titleEn: "Shikaku",
    desc: "把方格切成長方形，每個長方形剛好框住一個數字，且格子數要等於那個數字。",
    tags: ["益智", "邏輯"],
    accent: "#34d399",
    type: "native",
    to: "/games/shikaku",
    layout: "wide",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="6" y="6" width="108" height="108" rx="12" stroke="var(--accent)" stroke-width="2.5" opacity="0.45"/>
        <g stroke="var(--text-faint)" stroke-width="1.2" opacity="0.7">
          <path d="M33 8v104M60 8v104M87 8v104M8 33h104M8 60h104M8 87h104"/>
        </g>
        <rect x="63" y="36" width="48" height="48" rx="9"
              fill="var(--accent)" fill-opacity="0.2" stroke="var(--accent)" stroke-width="2.6"/>
        <rect x="10" y="63" width="22" height="48" rx="8"
              fill="var(--accent)" fill-opacity="0.14" stroke="var(--accent)" stroke-width="2.2"/>
        <g fill="var(--text)" font-family="'Space Mono', ui-monospace, monospace" font-size="20" font-weight="700" text-anchor="middle">
          <text x="20" y="30">4</text>
          <text x="87" y="67" fill="var(--accent)">9</text>
          <text x="21" y="93">2</text>
        </g>
      </svg>`,
  },

  {
    id: "2048",
    title: "2048",
    titleEn: "2048",
    desc: "滑動合併相同的數字方塊，一路挑戰到 2048。",
    tags: ["益智", "數字"],
    accent: "#c79bff",
    type: "native",
    to: "/games/2048",
    layout: "wide",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="10" y="10" width="46" height="46" rx="10" fill="var(--accent)" fill-opacity="0.25"/>
        <rect x="64" y="10" width="46" height="46" rx="10" fill="var(--accent)" fill-opacity="0.45"/>
        <rect x="10" y="64" width="46" height="46" rx="10" fill="var(--accent)" fill-opacity="0.7"/>
        <rect x="64" y="64" width="46" height="46" rx="10" fill="var(--accent)"/>
        <g font-family="'Space Mono', ui-monospace, monospace" font-weight="700" text-anchor="middle">
          <text x="33" y="40" font-size="18" fill="var(--text)">2</text>
          <text x="87" y="40" font-size="18" fill="var(--text)">4</text>
          <text x="33" y="94" font-size="18" fill="#0a0b0f">8</text>
          <text x="87" y="93" font-size="15" fill="#0a0b0f">16</text>
        </g>
      </svg>`,
  },
  {
    id: "arrows",
    title: "箭頭",
    titleEn: "Arrow Out",
    desc: "點箭頭讓它往所指方向滑出，但前方要淨空才走得掉。清空全場即過關。",
    tags: ["益智", "觀察"],
    accent: "#9aa6ff",
    type: "native",
    to: "/games/arrows",
    layout: "wide",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" stroke="var(--accent)" stroke-width="6"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M30 80 V40 M18 52 L30 40 L42 52"/>
        <path d="M56 32 H98 M86 20 L98 32 L86 44"/>
        <path d="M72 56 V96 M60 84 L72 96 L84 84"/>
        <path d="M104 76 H66 M78 64 L66 76 L78 88"/>
      </svg>`,
  },
  {
    id: "maze3d",
    title: "立體迷宮",
    titleEn: "3D Maze",
    desc: "以 Three.js 即時渲染的第一人稱迷宮，靠小地圖找到發光的出口。",
    tags: ["3D", "迷宮"],
    accent: "#5ce0c6",
    type: "native",
    to: "/games/maze-3d",
    layout: "wide",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" stroke="var(--accent)" stroke-width="4"
        stroke-linejoin="round" aria-hidden="true">
        <path d="M60 16 L102 40 L102 84 L60 108 L18 84 L18 40 Z"/>
        <path d="M60 60 L60 16 M60 60 L102 40 M60 60 L18 40" opacity="0.45"/>
        <circle cx="80" cy="62" r="6" fill="var(--accent)" stroke="none"/>
      </svg>`,
  },

  {
    id: "memory",
    title: "記憶翻牌",
    titleEn: "Memory",
    desc: "翻牌配對，記住每張卡的位置，用最少步數翻出所有成對的卡片。",
    tags: ["記憶", "配對"],
    accent: "#ff7a9c",
    type: "native",
    to: "/games/memory",
    layout: "wide",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g transform="rotate(-8 40 60)">
          <rect x="16" y="26" width="46" height="64" rx="10" fill="var(--ink-700)" stroke="var(--accent)" stroke-width="2.4"/>
          <g fill="var(--accent)" fill-opacity="0.5">
            <circle cx="30" cy="44" r="3.4"/><circle cx="48" cy="44" r="3.4"/>
            <circle cx="30" cy="60" r="3.4"/><circle cx="48" cy="60" r="3.4"/>
            <circle cx="39" cy="74" r="3.4"/>
          </g>
        </g>
        <g transform="rotate(9 82 62)">
          <rect x="58" y="28" width="48" height="66" rx="11" fill="var(--accent)" fill-opacity="0.16" stroke="var(--accent)" stroke-width="2.6"/>
          <path d="M82 46 l8 15 -8 15 -8 -15 z" fill="var(--accent)"/>
        </g>
      </svg>`,
  },
];

export function useGames() {
  const games = GAMES;
  const playable = computed(() => games.filter((g) => g.available !== false).length);
  const total = games.length;
  return { games, playable, total };
}
