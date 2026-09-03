/* =========================================================================
   GAME REGISTRY — the single source of truth for the whole hub.
   Add a game by appending one entry here; the home page renders itself.

   type      'native'   → a Nuxt route we built          (use `to`)
             'iframe'   → embedded build (Pygame/Unity/WASM) under public/
             'external' → opens an external URL in a new tab (use `to`)
   category  the group the game is listed under on the home page
   desc      one short line (≤ 14 characters) shown on the home tile
   icon      inline SVG markup (uses var(--accent), injected with v-html)
   daily     true → the Daily Challenge entry (rendered as the daily strip)
   available false → hidden from the home page
   ========================================================================= */

export interface Game {
  id: string;
  title: string;
  titleEn: string;
  desc: string;
  accent: string;
  category?: string;
  type?: "native" | "iframe" | "external";
  to?: string;
  icon?: string;
  daily?: boolean;
  available?: boolean;
}

/* Home-page groups, in display order. */
export const CATEGORIES = [
  "邏輯",
  "棋類",
  "數學",
  "文字",
  "記憶",
  "街機",
  "經典",
] as const;

const GAMES: Game[] = [
  /* ===== Daily Challenge — the headline feature ===== */
  {
    id: "daily",
    title: "每日挑戰",
    titleEn: "Daily",
    desc: "每天一題，全世界同一題。完成就累積連勝。",
    accent: "#ffd166",
    category: "每日",
    type: "native",
    to: "/daily",
    daily: true,
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="14" y="20" width="92" height="86" rx="14" stroke="var(--accent)" stroke-width="3" opacity="0.5"/>
        <path d="M14 42 H106" stroke="var(--accent)" stroke-width="3" opacity="0.5"/>
        <rect x="34" y="12" width="8" height="20" rx="4" fill="var(--accent)"/>
        <rect x="78" y="12" width="8" height="20" rx="4" fill="var(--accent)"/>
        <g fill="var(--accent)" opacity="0.25">
          <rect x="26" y="52" width="14" height="14" rx="4"/>
          <rect x="80" y="52" width="14" height="14" rx="4"/>
          <rect x="26" y="74" width="14" height="14" rx="4"/>
        </g>
        <path d="M70 78 l5.5 11.2 12.3 1.8 -8.9 8.7 2.1 12.3 -11-5.8 -11 5.8 2.1 -12.3 -8.9 -8.7 12.3 -1.8z"
              fill="var(--accent)"/>
      </svg>`,
  },

  /* ===== Arcade / reflex ===== */
  {
    id: "snake",
    title: "貪食蛇",
    titleEn: "Snake",
    desc: "吃果實變長，別撞到自己",
    accent: "#9ce85a",
    category: "街機",
    type: "native",
    to: "/games/snake",
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
    id: "tetris",
    title: "俄羅斯方塊",
    titleEn: "Tetris",
    desc: "消行加速拚高分",
    accent: "#4ea8de",
    category: "街機",
    type: "native",
    to: "/games/tetris",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g fill="var(--accent)">
          <rect x="20" y="20" width="22" height="22" rx="4"/>
          <rect x="42" y="20" width="22" height="22" rx="4" opacity="0.85"/>
          <rect x="64" y="20" width="22" height="22" rx="4" opacity="0.7"/>
          <rect x="42" y="42" width="22" height="22" rx="4" opacity="0.55"/>
        </g>
        <g fill="var(--text-faint)" opacity="0.5">
          <rect x="20" y="76" width="22" height="22" rx="4"/>
          <rect x="64" y="76" width="22" height="22" rx="4"/>
          <rect x="86" y="76" width="22" height="22" rx="4"/>
        </g>
      </svg>`,
  },
  {
    id: "breakout",
    title: "打磚塊",
    titleEn: "Breakout",
    desc: "反彈球敲光所有磚塊",
    accent: "#ff6f91",
    category: "街機",
    type: "native",
    to: "/games/breakout",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g fill="var(--accent)">
          <rect x="16" y="20" width="26" height="12" rx="4"/>
          <rect x="46" y="20" width="26" height="12" rx="4" opacity="0.8"/>
          <rect x="76" y="20" width="26" height="12" rx="4" opacity="0.6"/>
          <rect x="31" y="36" width="26" height="12" rx="4" opacity="0.8"/>
          <rect x="61" y="36" width="26" height="12" rx="4" opacity="0.6"/>
        </g>
        <circle cx="60" cy="74" r="7" fill="var(--accent)"/>
        <rect x="40" y="96" width="40" height="9" rx="4.5" fill="var(--text)"/>
      </svg>`,
  },
  {
    id: "match3",
    title: "寶石消除",
    titleEn: "Match 3",
    desc: "三個同色連線就消除",
    accent: "#f072a9",
    category: "街機",
    type: "native",
    to: "/games/match3",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g stroke="var(--accent)" stroke-width="3" stroke-linejoin="round">
          <path d="M30 24 l12 12 -12 12 -12-12z" fill="var(--accent)" fill-opacity="0.85"/>
          <path d="M60 24 l12 12 -12 12 -12-12z" fill="var(--accent)" fill-opacity="0.55"/>
          <path d="M90 24 l12 12 -12 12 -12-12z" fill="var(--accent)" fill-opacity="0.85"/>
        </g>
        <g fill="var(--text-faint)" opacity="0.5">
          <circle cx="30" cy="78" r="11"/>
          <rect x="49" y="67" width="22" height="22" rx="6"/>
          <path d="M90 66 l11 22 -22 0z"/>
        </g>
      </svg>`,
  },
  {
    id: "whack",
    title: "打地鼠",
    titleEn: "Whack-a-Mole",
    desc: "三十秒內敲地鼠",
    accent: "#a0c15a",
    category: "街機",
    type: "native",
    to: "/games/whack",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <ellipse cx="48" cy="86" rx="34" ry="14" fill="var(--text-faint)" opacity="0.35"/>
        <path d="M30 82 a18 20 0 0 1 36 0 z" fill="var(--accent)"/>
        <circle cx="42" cy="70" r="3" fill="#0a0b0f"/>
        <circle cx="54" cy="70" r="3" fill="#0a0b0f"/>
        <ellipse cx="48" cy="78" rx="5" ry="3.5" fill="#0a0b0f" opacity="0.5"/>
        <rect x="84" y="20" width="26" height="16" rx="5" transform="rotate(45 97 28)" fill="var(--text)"/>
        <rect x="92" y="34" width="9" height="30" rx="4" transform="rotate(45 97 28)" fill="var(--text)" opacity="0.7"/>
      </svg>`,
  },
  {
    id: "arrows",
    title: "箭頭",
    titleEn: "Arrow Out",
    desc: "依序把箭頭滑出盤面",
    accent: "#9aa6ff",
    category: "邏輯",
    type: "native",
    to: "/games/arrows",
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

  /* ===== Logic / deduction grids ===== */
  {
    id: "sudoku",
    title: "數獨",
    titleEn: "Sudoku",
    desc: "行列宮格填一到九",
    accent: "#6aa6ff",
    category: "邏輯",
    type: "native",
    to: "/games/sudoku",
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
    id: "minesweeper",
    title: "踩地雷",
    titleEn: "Minesweeper",
    desc: "靠數字推出地雷位置",
    accent: "#ff6b6b",
    category: "邏輯",
    type: "native",
    to: "/games/minesweeper",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g stroke="var(--text-faint)" stroke-width="1.4" opacity="0.6">
          <path d="M40 12v96M72 12v96M12 40h96M12 72h96"/>
        </g>
        <circle cx="60" cy="60" r="20" fill="var(--accent)"/>
        <g stroke="var(--accent)" stroke-width="5" stroke-linecap="round">
          <path d="M60 30v-12M60 102v-12M30 60H18M102 60H90M39 39l-8-8M89 89l-8-8M81 39l8-8M31 89l8-8"/>
        </g>
        <circle cx="53" cy="53" r="5" fill="#0a0b0f" opacity="0.5"/>
        <g fill="var(--text)" font-family="'Space Mono', ui-monospace, monospace" font-size="18" font-weight="700" text-anchor="middle">
          <text x="26" y="30">1</text><text x="94" y="30" fill="var(--accent)">3</text><text x="26" y="98">2</text>
        </g>
      </svg>`,
  },
  {
    id: "nonogram",
    title: "數織",
    titleEn: "Nonogram",
    desc: "依提示填出像素圖",
    accent: "#5ec8d8",
    category: "邏輯",
    type: "native",
    to: "/games/nonogram",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g fill="var(--text-faint)" font-family="'Space Mono', ui-monospace, monospace" font-size="13" font-weight="700">
          <text x="40" y="22">2</text><text x="58" y="22">1</text><text x="80" y="22">3</text>
          <text x="14" y="48">1 1</text><text x="20" y="74">3</text><text x="20" y="100">2</text>
        </g>
        <g stroke="var(--text-faint)" stroke-width="1.2" opacity="0.6">
          <path d="M36 28h72M36 54h72M36 80h72M36 106h72M36 28v78M62 28v78M88 28v78"/>
        </g>
        <g fill="var(--accent)">
          <rect x="37" y="29" width="24" height="24" rx="3"/>
          <rect x="63" y="55" width="24" height="24" rx="3"/>
          <rect x="89" y="55" width="18" height="24" rx="3"/>
          <rect x="37" y="81" width="24" height="24" rx="3" opacity="0.8"/>
        </g>
      </svg>`,
  },
  {
    id: "lights-out",
    title: "關燈",
    titleEn: "Lights Out",
    desc: "把所有燈關掉",
    accent: "#ffd45e",
    category: "邏輯",
    type: "native",
    to: "/games/lights-out",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="16" y="16" width="26" height="26" rx="6" fill="var(--accent)"/>
        <rect x="47" y="16" width="26" height="26" rx="6" fill="var(--ink-600)"/>
        <rect x="78" y="16" width="26" height="26" rx="6" fill="var(--accent)"/>
        <rect x="16" y="47" width="26" height="26" rx="6" fill="var(--ink-600)"/>
        <rect x="47" y="47" width="26" height="26" rx="6" fill="var(--accent)"/>
        <rect x="78" y="47" width="26" height="26" rx="6" fill="var(--ink-600)"/>
        <rect x="16" y="78" width="26" height="26" rx="6" fill="var(--accent)"/>
        <rect x="47" y="78" width="26" height="26" rx="6" fill="var(--ink-600)"/>
        <rect x="78" y="78" width="26" height="26" rx="6" fill="var(--accent)"/>
      </svg>`,
  },
  {
    id: "flood",
    title: "色彩擴散",
    titleEn: "Flood It",
    desc: "在步數內染成同色",
    accent: "#ff9f43",
    category: "邏輯",
    type: "native",
    to: "/games/flood",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <defs><clipPath id="fl"><rect x="14" y="14" width="92" height="92" rx="14"/></clipPath></defs>
        <g clip-path="url(#fl)">
          <rect x="14" y="14" width="92" height="92" fill="var(--ink-700)"/>
          <path d="M14 14 H106 V44 L14 84 Z" fill="var(--accent)"/>
          <path d="M14 84 L106 44 V70 L14 104 Z" fill="var(--accent)" opacity="0.6"/>
          <circle cx="40" cy="40" r="9" fill="#0a0b0f" opacity="0.25"/>
        </g>
        <rect x="14" y="14" width="92" height="92" rx="14" stroke="var(--accent)" stroke-width="2.5" opacity="0.5"/>
      </svg>`,
  },
  {
    id: "binario",
    title: "二進位",
    titleEn: "Binario",
    desc: "零一各半不能三連",
    accent: "#7ed957",
    category: "邏輯",
    type: "native",
    to: "/games/binario",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="12" y="12" width="96" height="96" rx="12" stroke="var(--accent)" stroke-width="2.5" opacity="0.5"/>
        <g font-family="'Space Mono', ui-monospace, monospace" font-size="26" font-weight="700" text-anchor="middle">
          <text x="36" y="46" fill="var(--accent)">0</text>
          <text x="72" y="46" fill="var(--text)">1</text>
          <text x="36" y="86" fill="var(--text)">1</text>
          <text x="72" y="86" fill="var(--accent)">0</text>
        </g>
      </svg>`,
  },
  {
    id: "one-line",
    title: "一筆畫",
    titleEn: "One Line",
    desc: "每條線只走一次",
    accent: "#ffb057",
    category: "邏輯",
    type: "native",
    to: "/games/one-line",
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
    desc: "把盤面切成長方形",
    accent: "#34d399",
    category: "邏輯",
    type: "native",
    to: "/games/shikaku",
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
    id: "pipes",
    title: "水管",
    titleEn: "Pipes",
    desc: "旋轉水管接通水源",
    accent: "#34c7c0",
    category: "邏輯",
    type: "native",
    to: "/games/pipes",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g stroke="var(--text-faint)" stroke-width="2" opacity="0.35">
          <path d="M12 12 H108 V108 H12 Z M12 60 H108 M60 12 V108"/>
        </g>
        <g stroke="var(--accent)" stroke-width="9" stroke-linecap="round">
          <path d="M60 18 V60 H102"/>
          <path d="M18 60 H60"/>
          <path d="M60 60 V102"/>
        </g>
        <circle cx="60" cy="60" r="12" fill="var(--accent)"/>
        <circle cx="60" cy="60" r="4.5" fill="var(--ink-900)"/>
      </svg>`,
  },
  {
    id: "hashi",
    title: "數橋",
    titleEn: "Hashi",
    desc: "依數字在島間架橋",
    accent: "#9d8cff",
    category: "邏輯",
    type: "native",
    to: "/games/hashi",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g stroke="var(--accent)" stroke-width="3" opacity="0.75">
          <path d="M30 26 H90 M30 34 H90"/>
          <path d="M30 30 V90"/>
          <path d="M86 30 V90 M94 30 V90"/>
        </g>
        <g fill="var(--ink-900)" stroke="var(--accent)" stroke-width="3.5">
          <circle cx="30" cy="30" r="15"/>
          <circle cx="90" cy="30" r="15"/>
          <circle cx="30" cy="90" r="15"/>
          <circle cx="90" cy="90" r="15"/>
        </g>
        <g fill="var(--text)" font-family="'Space Mono', ui-monospace, monospace" font-size="17" font-weight="700" text-anchor="middle">
          <text x="30" y="36">3</text><text x="90" y="36" fill="var(--accent)">3</text>
          <text x="30" y="96">1</text><text x="90" y="96">2</text>
        </g>
      </svg>`,
  },
  {
    id: "akari",
    title: "照明",
    titleEn: "Light Up",
    desc: "放燈泡照亮每一格",
    accent: "#ffc24b",
    category: "邏輯",
    type: "native",
    to: "/games/akari",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="12" y="12" width="24" height="24" rx="5" fill="var(--ink-600)"/>
        <text x="24" y="31" font-family="'Space Mono', ui-monospace, monospace" font-size="16" font-weight="700" text-anchor="middle" fill="var(--accent)">1</text>
        <rect x="84" y="84" width="24" height="24" rx="5" fill="var(--ink-600)"/>
        <g stroke="var(--accent)" stroke-width="5" stroke-linecap="round">
          <path d="M60 26 V14 M60 106 V94 M26 60 H14 M106 60 H94 M38 38 l-9 -9 M91 91 l-9 -9 M82 38 l9 -9 M38 82 l-9 9"/>
        </g>
        <circle cx="60" cy="60" r="18" fill="var(--accent)"/>
        <circle cx="54" cy="54" r="5" fill="#fff" opacity="0.5"/>
      </svg>`,
  },
  {
    id: "tents",
    title: "帳篷",
    titleEn: "Tents",
    desc: "樹旁紮營，不相鄰",
    accent: "#5bb368",
    category: "邏輯",
    type: "native",
    to: "/games/tents",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g fill="var(--text-faint)" font-family="'Space Mono', ui-monospace, monospace" font-size="14" font-weight="700" text-anchor="middle">
          <text x="40" y="20">1</text><text x="84" y="20" fill="var(--accent)">1</text>
        </g>
        <g transform="translate(40 66)">
          <path d="M0 -28 L16 0 L-16 0 Z" fill="var(--accent)" fill-opacity="0.4" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
          <path d="M0 -12 L15 16 L-15 16 Z" fill="var(--accent)" fill-opacity="0.4" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
          <rect x="-4" y="16" width="8" height="14" rx="2" fill="var(--text-faint)"/>
        </g>
        <g transform="translate(84 66)">
          <path d="M0 -24 L22 24 L-22 24 Z" fill="var(--accent)" fill-opacity="0.85" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
          <path d="M0 -24 V24" stroke="var(--ink-900)" stroke-width="3"/>
          <path d="M0 24 L9 6" stroke="var(--ink-900)" stroke-width="2.5"/>
        </g>
      </svg>`,
  },

  {
    id: "flow",
    title: "連線",
    titleEn: "Flow",
    desc: "同色相連，填滿全格",
    accent: "#4fc3f7",
    category: "邏輯",
    type: "native",
    to: "/games/flow",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g stroke="var(--text-faint)" stroke-width="1.2" opacity="0.5">
          <path d="M14 14h92v92H14zM14 37h92M14 60h92M14 83h92M37 14v92M60 14v92M83 14v92"/>
        </g>
        <path d="M25.5 25.5 H71.5 V71.5 H94.5" stroke="var(--accent)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <circle cx="25.5" cy="25.5" r="8" fill="var(--accent)"/>
        <circle cx="94.5" cy="71.5" r="8" fill="var(--accent)"/>
        <path d="M25.5 94.5 H48.5 V48.5" stroke="var(--text-dim)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <circle cx="25.5" cy="94.5" r="8" fill="var(--text-dim)"/>
        <circle cx="48.5" cy="48.5" r="8" fill="var(--text-dim)"/>
      </svg>`,
  },
  {
    id: "rush-hour",
    title: "停車場",
    titleEn: "Rush Hour",
    desc: "挪開車輛，讓紅車離場",
    accent: "#ef6b6b",
    category: "邏輯",
    type: "native",
    to: "/games/rush-hour",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="12" y="12" width="96" height="96" rx="10" stroke="var(--text-faint)" stroke-width="2" opacity="0.6"/>
        <path d="M108 44 V76" stroke="var(--ink-900)" stroke-width="4"/>
        <rect x="18" y="18" width="14" height="44" rx="4" fill="var(--ink-500)"/>
        <rect x="70" y="18" width="14" height="28" rx="4" fill="var(--ink-500)"/>
        <rect x="86" y="18" width="14" height="60" rx="4" fill="var(--ink-500)"/>
        <rect x="18" y="86" width="44" height="14" rx="4" fill="var(--ink-500)"/>
        <rect x="54" y="66" width="14" height="34" rx="4" fill="var(--ink-500)"/>
        <rect x="36" y="50" width="30" height="14" rx="4" fill="var(--accent)"/>
        <path d="M102 57 h10 m-4 -4 l4 4 -4 4" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
  },
  {
    id: "water-sort",
    title: "倒水",
    titleEn: "Water Sort",
    desc: "把每種顏色倒進同一管",
    accent: "#4ecdc4",
    category: "邏輯",
    type: "native",
    to: "/games/water-sort",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g stroke="var(--text-faint)" stroke-width="2.5">
          <path d="M22 22 v60 a12 12 0 0 0 24 0 V22"/>
          <path d="M74 22 v60 a12 12 0 0 0 24 0 V22"/>
        </g>
        <path d="M25 66 v16 a9 9 0 0 0 18 0 V66z" fill="var(--accent)"/>
        <path d="M25 50 h18 v16 H25z" fill="var(--text-dim)"/>
        <path d="M25 34 h18 v16 H25z" fill="var(--accent)"/>
        <path d="M77 66 v16 a9 9 0 0 0 18 0 V66z" fill="var(--text-dim)"/>
        <path d="M77 50 h18 v16 H77z" fill="var(--text-dim)"/>
        <path d="M52 40 c6 -4 12 -4 18 0" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M66 36 l5 4 -5 4" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
  },
  {
    id: "skyscrapers",
    title: "摩天樓",
    titleEn: "Skyscrapers",
    desc: "從邊上數得到幾棟樓",
    accent: "#a78bfa",
    category: "邏輯",
    type: "native",
    to: "/games/skyscrapers",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g fill="var(--text-faint)" font-family="'Space Mono', ui-monospace, monospace" font-size="13" font-weight="700" text-anchor="middle">
          <text x="14" y="102">3</text><text x="42" y="22">2</text><text x="68" y="22">1</text><text x="94" y="22">2</text>
        </g>
        <rect x="30" y="76" width="22" height="30" rx="2" fill="var(--accent)" fill-opacity="0.45"/>
        <rect x="56" y="34" width="22" height="72" rx="2" fill="var(--accent)"/>
        <rect x="82" y="56" width="22" height="50" rx="2" fill="var(--accent)" fill-opacity="0.7"/>
        <g stroke="var(--ink-900)" stroke-width="2" opacity="0.6">
          <path d="M60 44h14M60 54h14M60 64h14M60 74h14M60 84h14M60 94h14M86 66h14M86 76h14M86 86h14M86 96h14M34 86h14M34 96h14"/>
        </g>
        <path d="M24 106 H108" stroke="var(--text-faint)" stroke-width="2"/>
      </svg>`,
  },
  {
    id: "rullo",
    title: "數字開關",
    titleEn: "Rullo",
    desc: "關掉數字，湊出目標和",
    accent: "#e8a33d",
    category: "邏輯",
    type: "native",
    to: "/games/rullo",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g font-family="'Space Mono', ui-monospace, monospace" font-size="15" font-weight="700" text-anchor="middle">
          <rect x="14" y="14" width="24" height="24" rx="5" fill="var(--ink-600)"/><text x="26" y="31" fill="var(--text)">4</text>
          <rect x="42" y="14" width="24" height="24" rx="5" fill="var(--ink-800)"/><text x="54" y="31" fill="var(--text-faint)">7</text>
          <rect x="70" y="14" width="24" height="24" rx="5" fill="var(--ink-600)"/><text x="82" y="31" fill="var(--text)">2</text>
          <rect x="14" y="42" width="24" height="24" rx="5" fill="var(--ink-800)"/><text x="26" y="59" fill="var(--text-faint)">5</text>
          <rect x="42" y="42" width="24" height="24" rx="5" fill="var(--ink-600)"/><text x="54" y="59" fill="var(--text)">3</text>
          <rect x="70" y="42" width="24" height="24" rx="5" fill="var(--ink-600)"/><text x="82" y="59" fill="var(--text)">9</text>
          <rect x="14" y="70" width="24" height="24" rx="5" fill="var(--ink-600)"/><text x="26" y="87" fill="var(--text)">6</text>
          <rect x="42" y="70" width="24" height="24" rx="5" fill="var(--ink-600)"/><text x="54" y="87" fill="var(--text)">1</text>
          <rect x="70" y="70" width="24" height="24" rx="5" fill="var(--ink-800)"/><text x="82" y="87" fill="var(--text-faint)">8</text>
          <text x="106" y="31" fill="var(--accent)">6</text><text x="106" y="59" fill="var(--accent)">12</text><text x="106" y="87" fill="var(--accent)">7</text>
          <text x="26" y="112" fill="var(--accent)">10</text><text x="54" y="112" fill="var(--accent)">4</text><text x="82" y="112" fill="var(--accent)">11</text>
        </g>
      </svg>`,
  },
  {
    id: "untangle",
    title: "解結",
    titleEn: "Untangle",
    desc: "拖動點，讓線不再交叉",
    accent: "#8fd3a0",
    category: "邏輯",
    type: "native",
    to: "/games/untangle",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g stroke="var(--text-faint)" stroke-width="2.5" stroke-linecap="round">
          <path d="M24 30 L96 90 M96 30 L24 90 M24 30 L60 18 L96 30 M24 90 L60 104 L96 90 M60 18 L60 104"/>
        </g>
        <path d="M24 30 L96 90 M96 30 L24 90" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
        <g fill="var(--ink-600)" stroke="var(--accent)" stroke-width="3">
          <circle cx="24" cy="30" r="7"/><circle cx="96" cy="30" r="7"/><circle cx="24" cy="90" r="7"/><circle cx="96" cy="90" r="7"/>
          <circle cx="60" cy="18" r="7"/><circle cx="60" cy="104" r="7"/>
        </g>
      </svg>`,
  },
  /* ===== Board games vs AI ===== */
  {
    id: "gomoku",
    title: "五子棋",
    titleEn: "Gomoku",
    desc: "先連成五子者勝",
    accent: "#d89b6a",
    category: "棋類",
    type: "native",
    to: "/games/gomoku",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g stroke="var(--text-faint)" stroke-width="1.5" opacity="0.7">
          <path d="M24 24h72M24 48h72M24 72h72M24 96h72M24 24v72M48 24v72M72 24v72M96 24v72"/>
        </g>
        <circle cx="24" cy="48" r="9" fill="#0a0b0f" stroke="var(--text-faint)" stroke-width="1.5"/>
        <circle cx="48" cy="48" r="9" fill="#0a0b0f" stroke="var(--text-faint)" stroke-width="1.5"/>
        <circle cx="72" cy="48" r="9" fill="#0a0b0f" stroke="var(--text-faint)" stroke-width="1.5"/>
        <circle cx="48" cy="72" r="9" fill="var(--accent)"/>
        <circle cx="72" cy="24" r="9" fill="var(--accent)"/>
        <circle cx="96" cy="72" r="9" fill="var(--accent)"/>
      </svg>`,
  },
  {
    id: "reversi",
    title: "黑白棋",
    titleEn: "Reversi",
    desc: "夾住翻面，子多者勝",
    accent: "#57cc99",
    category: "棋類",
    type: "native",
    to: "/games/reversi",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="12" y="12" width="96" height="96" rx="12" fill="var(--accent)" fill-opacity="0.12" stroke="var(--accent)" stroke-width="2.5" opacity="0.7"/>
        <g stroke="var(--text-faint)" stroke-width="1.2" opacity="0.5">
          <path d="M36 12v96M60 12v96M84 12v96M12 36h96M12 60h96M12 84h96"/>
        </g>
        <circle cx="48" cy="48" r="11" fill="#0a0b0f" stroke="var(--text-faint)" stroke-width="1"/>
        <circle cx="72" cy="48" r="11" fill="var(--text)"/>
        <circle cx="48" cy="72" r="11" fill="var(--text)"/>
        <circle cx="72" cy="72" r="11" fill="#0a0b0f" stroke="var(--text-faint)" stroke-width="1"/>
      </svg>`,
  },
  {
    id: "chess",
    title: "西洋棋",
    titleEn: "Chess",
    desc: "五級電腦對手",
    accent: "#f2c94c",
    category: "棋類",
    type: "native",
    to: "/games/chess",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="16" y="16" width="88" height="88" rx="10" fill="var(--accent)" fill-opacity="0.12" stroke="var(--accent)" stroke-width="2.4"/>
        <g opacity="0.55">
          <rect x="16" y="16" width="22" height="22" fill="var(--accent)" fill-opacity="0.45"/>
          <rect x="60" y="16" width="22" height="22" fill="var(--accent)" fill-opacity="0.45"/>
          <rect x="38" y="38" width="22" height="22" fill="var(--accent)" fill-opacity="0.45"/>
          <rect x="82" y="38" width="22" height="22" fill="var(--accent)" fill-opacity="0.45"/>
          <rect x="16" y="60" width="22" height="22" fill="var(--accent)" fill-opacity="0.45"/>
          <rect x="60" y="60" width="22" height="22" fill="var(--accent)" fill-opacity="0.45"/>
          <rect x="38" y="82" width="22" height="22" fill="var(--accent)" fill-opacity="0.45"/>
          <rect x="82" y="82" width="22" height="22" fill="var(--accent)" fill-opacity="0.45"/>
        </g>
        <g fill="var(--text)" font-family="Georgia, serif" font-size="36" font-weight="700" text-anchor="middle">
          <text x="38" y="54">♞</text>
          <text x="82" y="93" fill="var(--accent)">♕</text>
        </g>
      </svg>`,
  },
  {
    id: "shogi",
    title: "將棋",
    titleEn: "Shogi",
    desc: "有持駒打入的將棋",
    accent: "#ff7a59",
    category: "棋類",
    type: "native",
    to: "/games/shogi",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="14" y="14" width="92" height="92" rx="10" fill="var(--accent)" fill-opacity="0.12" stroke="var(--accent)" stroke-width="2.4"/>
        <g stroke="var(--text-faint)" stroke-width="1.2" opacity="0.55">
          <path d="M32 14v92M50 14v92M68 14v92M86 14v92M14 32h92M14 50h92M14 68h92M14 86h92"/>
        </g>
        <g transform="translate(34 34)">
          <path d="M16 0 L30 8 L27 38 L3 38 L0 8 Z" fill="var(--text)" opacity="0.92"/>
          <text x="15" y="27" font-family="'Noto Sans TC', sans-serif" font-size="18" font-weight="800" text-anchor="middle" fill="#18110c">歩</text>
        </g>
        <g transform="translate(64 62) rotate(180 16 19)">
          <path d="M16 0 L30 8 L27 38 L3 38 L0 8 Z" fill="var(--accent)"/>
          <text x="15" y="27" font-family="'Noto Sans TC', sans-serif" font-size="18" font-weight="800" text-anchor="middle" fill="#18110c">玉</text>
        </g>
      </svg>`,
  },
  {
    id: "tictactoe",
    title: "圈圈叉叉",
    titleEn: "Tic-Tac-Toe",
    desc: "對戰不犯錯的電腦",
    accent: "#6aa6ff",
    category: "棋類",
    type: "native",
    to: "/games/tictactoe",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g stroke="var(--text-faint)" stroke-width="4" stroke-linecap="round">
          <path d="M48 18v84M76 18v84M18 48h84M18 76h84"/>
        </g>
        <g stroke="var(--accent)" stroke-width="6" stroke-linecap="round">
          <path d="M24 24 L40 40 M40 24 L24 40"/>
          <path d="M82 82 L98 98 M98 82 L82 98"/>
        </g>
        <circle cx="89" cy="33" r="11" fill="none" stroke="var(--text)" stroke-width="6"/>
        <circle cx="33" cy="89" r="11" fill="none" stroke="var(--text)" stroke-width="6"/>
      </svg>`,
  },
  {
    id: "dots-boxes",
    title: "點格棋",
    titleEn: "Dots & Boxes",
    desc: "補第四邊佔領格子",
    accent: "#ff8fa3",
    category: "棋類",
    type: "native",
    to: "/games/dots-boxes",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="28" y="28" width="64" height="64" rx="6" fill="var(--accent)" fill-opacity="0.18"/>
        <g stroke="var(--accent)" stroke-width="5" stroke-linecap="round">
          <path d="M28 28h32M28 28v32"/>
        </g>
        <g stroke="var(--text-faint)" stroke-width="4" stroke-linecap="round" opacity="0.6">
          <path d="M60 60h32M92 60v32"/>
        </g>
        <g fill="var(--text)">
          <circle cx="28" cy="28" r="6"/><circle cx="60" cy="28" r="6"/><circle cx="92" cy="28" r="6"/>
          <circle cx="28" cy="60" r="6"/><circle cx="60" cy="60" r="6"/><circle cx="92" cy="60" r="6"/>
          <circle cx="28" cy="92" r="6"/><circle cx="60" cy="92" r="6"/><circle cx="92" cy="92" r="6"/>
        </g>
      </svg>`,
  },

  /* ===== Numbers / deduction ===== */
  {
    id: "2048",
    title: "2048",
    titleEn: "2048",
    desc: "滑動合併到 2048",
    accent: "#c79bff",
    category: "數學",
    type: "native",
    to: "/games/2048",
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
    id: "fifteen",
    title: "數字推盤",
    titleEn: "15 Puzzle",
    desc: "滑塊排好一到十五",
    accent: "#c08cff",
    category: "數學",
    type: "native",
    to: "/games/fifteen",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="10" y="10" width="100" height="100" rx="12" fill="var(--accent)" fill-opacity="0.12" stroke="var(--accent)" stroke-width="2" opacity="0.6"/>
        <g font-family="'Space Mono', ui-monospace, monospace" font-size="20" font-weight="700" text-anchor="middle">
          <rect x="18" y="18" width="40" height="40" rx="8" fill="var(--accent)" fill-opacity="0.5"/>
          <text x="38" y="45" fill="#0a0b0f">1</text>
          <rect x="62" y="18" width="40" height="40" rx="8" fill="var(--accent)" fill-opacity="0.35"/>
          <text x="82" y="45" fill="#0a0b0f">2</text>
          <rect x="18" y="62" width="40" height="40" rx="8" fill="var(--accent)" fill-opacity="0.25"/>
          <text x="38" y="89" fill="var(--text)">3</text>
        </g>
      </svg>`,
  },
  {
    id: "twenty-four",
    title: "24 點",
    titleEn: "Make 24",
    desc: "四個數字算出目標",
    accent: "#ff9aa2",
    category: "數學",
    type: "native",
    to: "/games/twenty-four",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <text x="60" y="74" font-family="'Bricolage Grotesque', sans-serif" font-size="56" font-weight="800" text-anchor="middle" fill="var(--accent)">24</text>
        <g stroke="var(--text-faint)" stroke-width="5" stroke-linecap="round" opacity="0.8">
          <path d="M22 26h16M30 18v16"/>
          <path d="M84 30h16"/>
          <path d="M86 98h16"/>
        </g>
        <circle cx="94" cy="90" r="2.6" fill="var(--text-faint)"/>
        <circle cx="94" cy="106" r="2.6" fill="var(--text-faint)"/>
      </svg>`,
  },
  {
    id: "kenken",
    title: "算術數獨",
    titleEn: "KenKen",
    desc: "有算式區塊的數獨",
    accent: "#2dd4bf",
    category: "數學",
    type: "native",
    to: "/games/kenken",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="12" y="12" width="96" height="96" rx="12" stroke="var(--accent)" stroke-width="3" opacity="0.65"/>
        <g stroke="var(--text-faint)" stroke-width="1.6" opacity="0.6">
          <path d="M36 12v96M60 12v96M84 12v96M12 36h96M12 60h96M12 84h96"/>
        </g>
        <g fill="var(--accent)" font-family="'Space Mono', ui-monospace, monospace" font-weight="800">
          <text x="19" y="31" font-size="14">7+</text>
          <text x="66" y="31" font-size="14">2÷</text>
          <text x="19" y="78" font-size="14">12×</text>
        </g>
        <g fill="var(--text)" font-family="'Space Mono', ui-monospace, monospace" font-size="24" font-weight="800" text-anchor="middle">
          <text x="48" y="58">3</text>
          <text x="84" y="94" fill="var(--accent)">4</text>
        </g>
      </svg>`,
  },
  {
    id: "equation-maze",
    title: "等式迷宮",
    titleEn: "Equation Maze",
    desc: "走出等於目標的算式",
    accent: "#f59e0b",
    category: "數學",
    type: "native",
    to: "/games/equation-maze",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g stroke="var(--accent)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 82 H42 V58 H66 V36 H96"/>
        </g>
        <g fill="var(--ink-900)" stroke="var(--accent)" stroke-width="3">
          <rect x="12" y="72" width="22" height="22" rx="6"/>
          <rect x="36" y="48" width="22" height="22" rx="6"/>
          <rect x="60" y="26" width="22" height="22" rx="6"/>
          <rect x="84" y="26" width="22" height="22" rx="6"/>
        </g>
        <g fill="var(--text)" font-family="'Space Mono', ui-monospace, monospace" font-size="15" font-weight="900" text-anchor="middle">
          <text x="23" y="88">8</text><text x="47" y="64">×</text><text x="71" y="42">3</text><text x="95" y="42">=</text>
        </g>
      </svg>`,
  },
  {
    id: "fraction-balance",
    title: "分數天平",
    titleEn: "Fraction Balance",
    desc: "選分數卡湊出目標",
    accent: "#a78bfa",
    category: "數學",
    type: "native",
    to: "/games/fraction-balance",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <path d="M60 18 V94 M28 94 H92" stroke="var(--text-faint)" stroke-width="5" stroke-linecap="round"/>
        <path d="M24 44 H96" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"/>
        <path d="M34 44 L22 76 H46 Z M86 44 L74 76 H98 Z" fill="var(--accent)" fill-opacity="0.2" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/>
        <g fill="var(--text)" font-family="'Space Mono', ui-monospace, monospace" font-size="15" font-weight="900" text-anchor="middle">
          <text x="34" y="70">3/4</text>
          <text x="86" y="70">1/2</text>
        </g>
      </svg>`,
  },
  {
    id: "prime-hunter",
    title: "質數獵人",
    titleEn: "Prime Hunter",
    desc: "找出符合條件的數",
    accent: "#84cc16",
    category: "數學",
    type: "native",
    to: "/games/prime-hunter",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g fill="var(--accent)" fill-opacity="0.22" stroke="var(--accent)" stroke-width="2.5">
          <rect x="16" y="16" width="26" height="26" rx="7"/>
          <rect x="47" y="16" width="26" height="26" rx="7"/>
          <rect x="78" y="16" width="26" height="26" rx="7"/>
          <rect x="16" y="47" width="26" height="26" rx="7"/>
          <rect x="47" y="47" width="26" height="26" rx="7"/>
          <rect x="78" y="47" width="26" height="26" rx="7"/>
        </g>
        <g fill="var(--text)" font-family="'Space Mono', ui-monospace, monospace" font-size="16" font-weight="900" text-anchor="middle">
          <text x="29" y="35">7</text><text x="60" y="35" fill="var(--accent)">11</text><text x="91" y="35">12</text>
          <text x="29" y="66">21</text><text x="60" y="66">25</text><text x="91" y="66" fill="var(--accent)">31</text>
        </g>
        <path d="M28 92 H92" stroke="var(--accent)" stroke-width="6" stroke-linecap="round"/>
      </svg>`,
  },
  {
    id: "countdown",
    title: "倒數數字",
    titleEn: "Countdown Numbers",
    desc: "用數字卡湊出三位數",
    accent: "#38bdf8",
    category: "數學",
    type: "native",
    to: "/games/countdown",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="16" y="18" width="88" height="84" rx="14" stroke="var(--accent)" stroke-width="3" opacity="0.7"/>
        <text x="60" y="54" font-family="'Space Mono', ui-monospace, monospace" font-size="26" font-weight="900" text-anchor="middle" fill="var(--accent)">532</text>
        <g fill="var(--text-faint)" font-family="'Space Mono', ui-monospace, monospace" font-size="14" font-weight="900" text-anchor="middle">
          <text x="32" y="82">75</text><text x="58" y="82">6</text><text x="82" y="82">×</text>
        </g>
      </svg>`,
  },
  {
    id: "function-runner",
    title: "座標射擊",
    titleEn: "Function Runner",
    desc: "寫函式擊中目標點",
    accent: "#fb7185",
    category: "數學",
    type: "native",
    to: "/games/function-runner",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g stroke="var(--text-faint)" stroke-width="1.5" opacity="0.55">
          <path d="M18 60h84M60 18v84M30 18v84M90 18v84M18 30h84M18 90h84"/>
        </g>
        <path d="M20 92 C38 76 44 36 60 36 C76 36 82 76 100 92" stroke="var(--accent)" stroke-width="5" stroke-linecap="round" fill="none"/>
        <g fill="var(--ink-900)" stroke="var(--accent)" stroke-width="4">
          <circle cx="38" cy="72" r="6"/><circle cx="60" cy="36" r="6"/><circle cx="82" cy="72" r="6"/>
        </g>
      </svg>`,
  },
  {
    id: "mastermind",
    title: "猜數字",
    titleEn: "Mastermind",
    desc: "幾A幾B猜四位數",
    accent: "#b388ff",
    category: "數學",
    type: "native",
    to: "/games/mastermind",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g font-family="'Space Mono', ui-monospace, monospace" font-size="22" font-weight="700" text-anchor="middle">
          <rect x="16" y="40" width="40" height="40" rx="10" fill="var(--accent)" fill-opacity="0.25"/>
          <text x="36" y="68" fill="var(--accent)">7</text>
          <rect x="64" y="40" width="40" height="40" rx="10" fill="var(--accent)" fill-opacity="0.25"/>
          <text x="84" y="68" fill="var(--text)">?</text>
        </g>
        <g>
          <circle cx="30" cy="98" r="6" fill="var(--accent)"/>
          <circle cx="50" cy="98" r="6" fill="var(--accent)"/>
          <circle cx="70" cy="98" r="6" fill="none" stroke="var(--text-faint)" stroke-width="2"/>
          <circle cx="90" cy="98" r="6" fill="none" stroke="var(--text-faint)" stroke-width="2"/>
        </g>
        <g><circle cx="36" cy="24" r="5" fill="var(--accent)"/><circle cx="56" cy="24" r="5" fill="var(--text)"/><circle cx="76" cy="24" r="5" fill="var(--accent)"/></g>
      </svg>`,
  },

  /* ===== Word ===== */
  {
    id: "wordle",
    title: "猜詞",
    titleEn: "Word Guess",
    desc: "六次猜出英文單字",
    accent: "#6ad0a0",
    category: "文字",
    type: "native",
    to: "/games/wordle",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g font-family="'Space Mono', ui-monospace, monospace" font-size="26" font-weight="700" text-anchor="middle">
          <rect x="14" y="32" width="40" height="40" rx="8" fill="var(--accent)"/>
          <text x="34" y="61" fill="#0a0b0f">W</text>
          <rect x="58" y="32" width="40" height="40" rx="8" fill="var(--ink-600)" stroke="var(--text-faint)" stroke-width="1.5"/>
          <text x="78" y="61" fill="var(--text)">O</text>
          <rect x="36" y="78" width="40" height="40" rx="8" fill="#d9a441"/>
          <text x="56" y="107" fill="#0a0b0f">R</text>
        </g>
      </svg>`,
  },
  {
    id: "jp-wordle",
    title: "日語猜詞",
    titleEn: "Japanese Word Guess",
    desc: "猜假名，順便學單字",
    accent: "#ff7ea6",
    category: "文字",
    type: "native",
    to: "/games/jp-wordle",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g font-family="'Bricolage Grotesque','Noto Sans JP',sans-serif" font-size="30" font-weight="800" text-anchor="middle">
          <rect x="14" y="30" width="42" height="42" rx="9" fill="var(--accent)"/>
          <text x="35" y="62" fill="#0a0b0f">あ</text>
          <rect x="62" y="30" width="42" height="42" rx="9" fill="var(--ink-600)" stroke="var(--text-faint)" stroke-width="1.5"/>
          <text x="83" y="62" fill="var(--text)">い</text>
          <rect x="38" y="78" width="42" height="42" rx="9" fill="#f6c453"/>
          <text x="59" y="110" fill="#0a0b0f">う</text>
        </g>
      </svg>`,
  },
  {
    id: "word-search",
    title: "找單字",
    titleEn: "Word Search",
    desc: "在字母陣裡圈單字",
    accent: "#f6c453",
    category: "文字",
    type: "native",
    to: "/games/word-search",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g font-family="'Space Mono', ui-monospace, monospace" font-size="17" font-weight="700" fill="var(--text-faint)" text-anchor="middle">
          <text x="28" y="32">C</text><text x="52" y="32">A</text><text x="76" y="32">T</text><text x="100" y="32">Q</text>
          <text x="28" y="58">X</text><text x="52" y="58" fill="var(--accent)">D</text><text x="76" y="58">M</text><text x="100" y="58">E</text>
          <text x="28" y="84">P</text><text x="52" y="84">R</text><text x="76" y="84" fill="var(--accent)">O</text><text x="100" y="84">L</text>
          <text x="28" y="110">S</text><text x="52" y="110">K</text><text x="76" y="110">N</text><text x="100" y="110" fill="var(--accent)">G</text>
        </g>
        <rect x="42" y="44" width="68" height="22" rx="11" transform="rotate(34 76 55)" fill="none" stroke="var(--accent)" stroke-width="3"/>
      </svg>`,
  },

  /* ===== Memory ===== */
  {
    id: "memory",
    title: "記憶翻牌",
    titleEn: "Memory",
    desc: "翻開配對的卡片",
    accent: "#ff7a9c",
    category: "記憶",
    type: "native",
    to: "/games/memory",
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
  {
    id: "simon",
    title: "記憶序列",
    titleEn: "Simon",
    desc: "記住並重現燈光順序",
    accent: "#59d99a",
    category: "記憶",
    type: "native",
    to: "/games/simon",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <path d="M60 60 L60 14 A46 46 0 0 0 14 60 Z" fill="var(--accent)"/>
        <path d="M60 60 L14 60 A46 46 0 0 0 60 106 Z" fill="var(--text)" opacity="0.5"/>
        <path d="M60 60 L60 106 A46 46 0 0 0 106 60 Z" fill="var(--accent)" opacity="0.45"/>
        <path d="M60 60 L106 60 A46 46 0 0 0 60 14 Z" fill="var(--text)" opacity="0.25"/>
        <circle cx="60" cy="60" r="16" fill="var(--ink-900)"/>
      </svg>`,
  },

  /* ===== Maze ===== */
  {
    id: "maze2d",
    title: "迷宮",
    titleEn: "Maze",
    desc: "從入口走到出口",
    accent: "#62b6ff",
    category: "經典",
    type: "native",
    to: "/games/maze2d",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g stroke="var(--accent)" stroke-width="5" stroke-linecap="square" opacity="0.85">
          <path d="M14 14 H106 V106 H14 Z"/>
          <path d="M14 38 H78 M40 38 V82 M40 82 H106 M64 14 V62 M64 62 H88 M88 62 V106 M14 62 H28"/>
        </g>
        <circle cx="24" cy="24" r="7" fill="var(--text)"/>
        <circle cx="97" cy="97" r="8" fill="var(--accent)"/>
      </svg>`,
  },
  {
    id: "maze3d",
    title: "立體迷宮",
    titleEn: "3D Maze",
    desc: "第一人稱走迷宮",
    accent: "#5ce0c6",
    category: "經典",
    type: "native",
    to: "/games/maze-3d",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" stroke="var(--accent)" stroke-width="4"
        stroke-linejoin="round" aria-hidden="true">
        <path d="M60 16 L102 40 L102 84 L60 108 L18 84 L18 40 Z"/>
        <path d="M60 60 L60 16 M60 60 L102 40 M60 60 L18 40" opacity="0.45"/>
        <circle cx="80" cy="62" r="6" fill="var(--accent)" stroke="none"/>
      </svg>`,
  },

  /* ===== Classic puzzles ===== */
  {
    id: "klotski",
    title: "華容道",
    titleEn: "Klotski",
    desc: "讓曹操從出口脫困",
    accent: "#f4a261",
    category: "經典",
    type: "native",
    to: "/games/klotski",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="14" y="10" width="92" height="100" rx="10" stroke="var(--accent)" stroke-width="2.5" opacity="0.5"/>
        <rect x="40" y="16" width="40" height="40" rx="7" fill="var(--accent)"/>
        <rect x="20" y="16" width="18" height="40" rx="6" fill="var(--accent)" fill-opacity="0.4"/>
        <rect x="82" y="16" width="18" height="40" rx="6" fill="var(--accent)" fill-opacity="0.4"/>
        <rect x="40" y="58" width="40" height="18" rx="6" fill="var(--accent)" fill-opacity="0.55"/>
        <rect x="20" y="58" width="18" height="40" rx="6" fill="var(--accent)" fill-opacity="0.4"/>
        <rect x="82" y="58" width="18" height="40" rx="6" fill="var(--accent)" fill-opacity="0.4"/>
      </svg>`,
  },
  {
    id: "hanoi",
    title: "河內塔",
    titleEn: "Tower of Hanoi",
    desc: "把整座塔搬到右邊",
    accent: "#4dd4ac",
    category: "經典",
    type: "native",
    to: "/games/hanoi",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <path d="M10 98 H110" stroke="var(--accent)" stroke-width="4" stroke-linecap="round"/>
        <g stroke="var(--text-faint)" stroke-width="4" stroke-linecap="round" opacity="0.7">
          <path d="M30 96 V46M60 96 V46M90 96 V46"/>
        </g>
        <g fill="var(--accent)">
          <rect x="10" y="84" width="40" height="12" rx="6"/>
          <rect x="14" y="70" width="32" height="12" rx="6" opacity="0.8"/>
          <rect x="18" y="56" width="24" height="12" rx="6" opacity="0.6"/>
        </g>
      </svg>`,
  },
  {
    id: "sokoban",
    title: "推箱子",
    titleEn: "Sokoban",
    desc: "把箱子推到定點",
    accent: "#e8a87c",
    category: "經典",
    type: "native",
    to: "/games/sokoban",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="48" y="20" width="24" height="24" rx="4" fill="none" stroke="var(--accent)" stroke-width="3" stroke-dasharray="4 4"/>
        <rect x="46" y="56" width="32" height="32" rx="5" fill="var(--accent)" fill-opacity="0.3" stroke="var(--accent)" stroke-width="3"/>
        <path d="M46 56 L78 88 M78 56 L46 88" stroke="var(--accent)" stroke-width="2.5" opacity="0.6"/>
        <g stroke="var(--text)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="26" cy="74" r="9" fill="none"/>
          <path d="M30 100 V108 M22 100 V108"/>
        </g>
        <path d="M62 50 V44 M58 48 l4-4 4 4" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
  },
];

export function useGames() {
  const games = GAMES;
  // Counts reflect actual playable games — the Daily hub is a mode, not a game.
  const realGames = games.filter((g) => !g.daily);
  const playable = computed(
    () => realGames.filter((g) => g.available !== false).length
  );
  const total = realGames.length;
  return { games, playable, total };
}
