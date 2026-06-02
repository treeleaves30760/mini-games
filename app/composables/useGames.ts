/* =========================================================================
   GAME REGISTRY — the single source of truth for the whole hub.
   Add a game by appending one entry here; the gallery renders itself.

   type      'native'   → a Nuxt route we built          (use `to`)
             'iframe'   → embedded build (Pygame/Unity/WASM) under public/
             'external' → opens an external URL in a new tab (use `to`)
   layout    'feature' (big) | 'wide' | 'normal' — bento sizing
   category  primary group, used by the home-page filter chips
   icon      inline SVG markup (uses var(--accent), injected with v-html)
   daily     true → the special "Daily Challenge" hub card (always shown)
   available false → renders as a dashed "coming soon" ghost card
   ========================================================================= */

export interface Game {
  id: string;
  title: string;
  titleEn: string;
  desc: string;
  tags: string[];
  accent: string;
  category?: string;
  type?: "native" | "iframe" | "external";
  to?: string;
  layout?: "feature" | "wide" | "normal";
  icon?: string;
  daily?: boolean;
  available?: boolean;
}

/* The ordered list of filter categories shown on the home page. */
export const CATEGORIES = [
  "全部",
  "邏輯",
  "棋類",
  "數字",
  "文字",
  "記憶",
  "街機",
  "迷宮",
  "經典",
] as const;

const GAMES: Game[] = [
  /* ===== Daily Challenge — the headline feature ===== */
  {
    id: "daily",
    title: "每日挑戰",
    titleEn: "Daily",
    desc: "每天用當天日期當種子碼生成一道題目，全世界同題。完成累積連勝，並可分享成績。",
    tags: ["每日", "挑戰", "連勝"],
    accent: "#ffd166",
    category: "每日",
    type: "native",
    to: "/daily",
    layout: "feature",
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
    desc: "經典街機反應遊戲。吃得越多，蛇越長、速度越快——別咬到自己或撞牆。",
    tags: ["經典", "反應", "單人"],
    accent: "#9ce85a",
    category: "街機",
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
    id: "tetris",
    title: "俄羅斯方塊",
    titleEn: "Tetris",
    desc: "經典落下方塊。旋轉、移動、消行，速度越來越快，挑戰你的反應與規劃。",
    tags: ["街機", "經典", "反應"],
    accent: "#4ea8de",
    category: "街機",
    type: "native",
    to: "/games/tetris",
    layout: "wide",
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
    desc: "操控擋板把球反彈上去，敲掉每一塊磚。別讓球掉下去！",
    tags: ["街機", "反應"],
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
    desc: "交換相鄰寶石，湊成三個以上同色就消除。有限步數內衝高分。",
    tags: ["消除", "休閒"],
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
    desc: "地鼠冒出來就敲！手腳要快、別打到炸彈，在時間內衝高分。",
    tags: ["反應", "休閒"],
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
    desc: "點箭頭讓它往所指方向滑出，但前方要淨空才走得掉。清空全場即過關。",
    tags: ["益智", "觀察"],
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
    desc: "在 9×9 方格中填入 1–9，行、列、宮格都不重複。三種難度，即時偵錯。",
    tags: ["益智", "邏輯"],
    accent: "#6aa6ff",
    category: "邏輯",
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
    id: "minesweeper",
    title: "踩地雷",
    titleEn: "Minesweeper",
    desc: "用數字推理出地雷的位置，翻開所有安全的格子。第一步永遠安全。",
    tags: ["益智", "邏輯", "經典"],
    accent: "#ff6b6b",
    category: "邏輯",
    type: "native",
    to: "/games/minesweeper",
    layout: "wide",
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
    desc: "依照行列旁的數字提示填滿方格，解開隱藏的像素圖案。",
    tags: ["益智", "邏輯", "圖像"],
    accent: "#5ec8d8",
    category: "邏輯",
    type: "native",
    to: "/games/nonogram",
    layout: "wide",
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
    desc: "點一格會連同上下左右一起切換。把全部的燈都關掉就過關。",
    tags: ["益智", "邏輯"],
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
    desc: "從左上角開始選色擴散，在有限步數內把整個盤面變成同一種顏色。",
    tags: ["益智", "策略"],
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
    desc: "每格填 0 或 1，同色不能連續三個，每行每列數量相等。純邏輯推理。",
    tags: ["益智", "邏輯"],
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
    desc: "一筆走完所有線段，每條只能畫一次。從簡單到燒腦的歐拉路徑關卡。",
    tags: ["益智", "路徑"],
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
    desc: "把方格切成長方形，每個長方形剛好框住一個數字，且格子數要等於那個數字。",
    tags: ["益智", "邏輯"],
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

  /* ===== Board games vs AI ===== */
  {
    id: "gomoku",
    title: "五子棋",
    titleEn: "Gomoku",
    desc: "在 15×15 棋盤上搶先連成五子。對手是會攻防的電腦 AI。",
    tags: ["棋類", "AI"],
    accent: "#d89b6a",
    category: "棋類",
    type: "native",
    to: "/games/gomoku",
    layout: "wide",
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
    desc: "夾住對方的棋子就翻面，終局子多者勝。和角落卡位的 AI 一決高下。",
    tags: ["棋類", "AI"],
    accent: "#57cc99",
    category: "棋類",
    type: "native",
    to: "/games/reversi",
    layout: "wide",
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
    id: "connect4",
    title: "四子棋",
    titleEn: "Connect Four",
    desc: "輪流投入棋子，搶先連成四子。對手是會算殺的 alpha-beta AI。",
    tags: ["棋類", "AI"],
    accent: "#ffcf5e",
    category: "棋類",
    type: "native",
    to: "/games/connect4",
    available: true,
    icon: `
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <rect x="14" y="22" width="92" height="84" rx="12" fill="var(--accent)" fill-opacity="0.16" stroke="var(--accent)" stroke-width="2.5"/>
        <g>
          <circle cx="34" cy="86" r="10" fill="var(--accent)"/>
          <circle cx="60" cy="86" r="10" fill="#ff5d6c"/>
          <circle cx="34" cy="62" r="10" fill="#ff5d6c"/>
          <circle cx="86" cy="86" r="10" fill="var(--accent)"/>
          <circle cx="60" cy="62" r="10" fill="var(--accent)"/>
        </g>
        <g fill="var(--ink-900)" opacity="0.45">
          <circle cx="86" cy="62" r="10"/><circle cx="34" cy="38" r="10"/>
          <circle cx="60" cy="38" r="10"/><circle cx="86" cy="38" r="10"/>
        </g>
      </svg>`,
  },
  {
    id: "tictactoe",
    title: "圈圈叉叉",
    titleEn: "Tic-Tac-Toe",
    desc: "經典井字遊戲。挑戰永不犯錯的 minimax AI，或找朋友雙人對戰。",
    tags: ["棋類", "AI", "雙人"],
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
    desc: "輪流連線，誰補上方格的第四邊就佔領它並再走一步。終局格子多者勝。",
    tags: ["棋類", "AI"],
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
    desc: "滑動合併相同的數字方塊，一路挑戰到 2048。",
    tags: ["益智", "數字"],
    accent: "#c79bff",
    category: "數字",
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
    id: "fifteen",
    title: "數字推盤",
    titleEn: "15 Puzzle",
    desc: "滑動數字方塊，把 1 到 15 依序排好。經典的滑塊益智遊戲。",
    tags: ["益智", "經典"],
    accent: "#c08cff",
    category: "數字",
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
    title: "24點",
    titleEn: "Make 24",
    desc: "用四個數字和加減乘除算出 24。每題都保證有解，動動你的心算。",
    tags: ["數字", "心算"],
    accent: "#ff9aa2",
    category: "數字",
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
    id: "mastermind",
    title: "猜數字",
    titleEn: "Mastermind",
    desc: "推理出四個不重複的數字。每次猜測都會回饋幾 A 幾 B，八次內破解。",
    tags: ["推理", "數字"],
    accent: "#b388ff",
    category: "數字",
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
    desc: "六次機會猜出五個字母的單字。綠色對位、黃色換位，靠回饋逐步逼近答案。",
    tags: ["文字", "推理"],
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
    id: "word-search",
    title: "找單字",
    titleEn: "Word Search",
    desc: "在字母方陣中圈出隱藏的單字，橫豎斜、正著反著都可能藏字。",
    tags: ["文字", "觀察"],
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
    desc: "翻開配對的卡片，圖案相同就留下。用最少的步數清空整副牌。",
    tags: ["記憶", "卡牌"],
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
    desc: "記住越來越長的燈光順序並重現它。看你能跟到第幾回合。",
    tags: ["記憶", "反應"],
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
    desc: "每天用種子生成一座迷宮。從左上走到右下發光的出口，路只有一條。",
    tags: ["益智", "路徑"],
    accent: "#62b6ff",
    category: "迷宮",
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
    desc: "以 Three.js 即時渲染的第一人稱迷宮，靠小地圖找到發光的出口。",
    tags: ["3D", "迷宮"],
    accent: "#5ce0c6",
    category: "迷宮",
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
    desc: "滑動方塊讓 2×2 的主將從出口脫困。經典的滑塊解謎，考驗你的步數。",
    tags: ["益智", "經典"],
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
    desc: "一次搬一個盤，大的不能疊在小的上。把整座塔移到最右邊的柱子。",
    tags: ["益智", "經典"],
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
    desc: "把每個箱子推到定點上，箱子只能推不能拉。一步走錯就得重來。",
    tags: ["益智", "路徑"],
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
