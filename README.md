# 遊樂場 Playground — web mini-games

A collection of browser mini-games in Traditional Chinese, built with **Vue 3 + Nuxt 4**, statically generated and deployed to **GitHub Pages**. No accounts, no install.

Live: https://treeleaves30760.github.io/mini-games/

**44 games** plus a **Daily Challenge**, grouped on the home page:

| Group | Games |
| --- | --- |
| 邏輯 Logic | Sudoku, Minesweeper, Nonogram, Lights Out, Flood It, Binario, One Line, Shikaku, Arrow Out, Pipes, Hashi, Light Up, Tents |
| 棋類 Board (vs computer) | Gomoku (with Renju forbidden moves), Reversi, Chess, Shogi, Tic-Tac-Toe, Dots & Boxes |
| 數學 Math | 2048, 15 Puzzle, Make 24, Mastermind, KenKen, Equation Maze, Fraction Balance, Prime Hunter, Countdown Numbers, Function Runner |
| 文字 Word | Word Guess (5–8 letters, with meanings), Japanese Word Guess (hiragana, with meanings, examples and speech), Word Search |
| 記憶 Memory | Memory, Simon |
| 街機 Arcade | Snake, Tetris, Breakout, Match 3, Whack-a-Mole |
| 經典 Classic | Klotski, Tower of Hanoi, Sokoban, Maze, 3D Maze (Three.js) |

### Daily Challenge

`/daily` picks one game per day from a fixed rotation and seeds it with the date, so **everyone gets the same puzzle on the same day**. Solving it extends a streak kept in `localStorage`; the top bar shows the date, streak and a share button.

The pieces:

- `app/utils/rng.ts` — seeded RNG (`makeRng(seed)`, `todaySeed()`, `dayIndex()`).
- `app/composables/useDaily.ts` — the rotation list, today's pick, streak read/write.
- `app/pages/daily.vue` — renders today's game component with `seed` / `daily` props and provides the status to `GameTopbar`.

Any game can join the rotation by generating its puzzle with `makeRng(props.seed)`, hiding its difficulty controls when `daily` is true, and emitting `solved` on a win.

### Board-game AI

Chess and Shogi share one search design (`app/games/chess.ts`, `app/games/shogi.ts`): negamax with alpha-beta, iterative deepening, a transposition table, killer/history move ordering, and a capture-only quiescence search on the top two levels.

| Level | Depth | Quiescence | Typical reply |
| --- | --- | --- | --- |
| 輕量 | 1 ply | — | instant |
| 標準 | 2 ply | — | instant |
| 強化 | 3 ply | — | instant |
| 專家 | 4 ply | 4 ply | well under a second |
| 大師 | 5 ply | 6 ply | up to a few seconds in dense positions |

A node budget and a wall clock bound every search; whichever runs out first stops it and the deepest completed iteration is played. The search runs in a **Web Worker** (`app/workers/`) so the board stays responsive; `useBoardAI` falls back to the main thread where workers are unavailable.

Chess searches its own 0x88 board (verified against `chess.js` and published perft counts in `tests/games/chess.test.ts`) because generating moves through `chess.js` is too slow for deep search. Shogi keeps `tsshogi` as the rules authority.

### Function Runner

座標射擊 is a Graphwar-style shooter: you type `f(x)` and the curve `y = f(x) − f(0)` is fired from the origin, destroying every target it passes and stopping at the first obstacle, where it blasts a small crater. `app/utils/expression.ts` parses the input with a small recursive-descent parser (implicit multiplication, `^`, `sin`/`cos`/`tan`/`abs`/`sqrt`/`exp`/`ln`/`floor`, `pi`/`e`) — no `eval`. Puzzles are generated from hidden solution curves (lines, parabolas, sine waves, V shapes with friendly coefficients) and obstacles are kept clear of them, so every round is solvable within its shot budget; the tests fire the hidden curves through the real simulation for hundreds of seeds and three years of Daily dates. 雙人 is a hot-seat mode on one device: each side has three units, turns alternate, and `+x` always points at the opponent.

## Design

- **Dark, warm-neutral chrome; colour comes from the games.** Each game has one accent colour, used for its icon, its selected states and its primary button. Nothing else on the page is coloured.
- **Two typefaces.** Huninn (粉圓) for the site name, headings and game names; Noto Sans TC for everything functional, with tabular numerals for scores and timers.
- **Home page = the games.** A one-line lead, the daily strip, then every game as a tile (icon, name, one short line) grouped by category. No hero, no feature cards.
- **Game page = the board.** Shared top bar (back, title, actions), HUD chips, the board, and a side panel limited to controls, rules and keys.
- Motion only in response to actions; `prefers-reduced-motion` respected; keyboard, mouse and touch input everywhere.

## Tech stack

| Item | Choice |
| --- | --- |
| Framework | Vue 3 (`<script setup>`) + Nuxt 4 |
| Rendering | Static site generation (`nuxt generate`) |
| 3D | Three.js, imported on the client only |
| Styling | Plain CSS with design tokens (CSS variables), no UI library |
| Fonts | Huninn, Noto Sans TC (Google Fonts) |
| Tests | Vitest, covering the game logic in `app/games` and `app/utils` |
| Deployment | GitHub Pages via GitHub Actions |

## Local development

Requires Node.js 20+ and [pnpm](https://pnpm.io/).

```bash
pnpm install       # install dependencies
pnpm dev           # dev server (http://localhost:3000)
pnpm test          # run the logic tests
pnpm generate      # build the static site into .output/public
pnpm preview       # preview the production build
```

## Project structure

```
.
├── nuxt.config.ts                 # baseURL, github_pages preset, global CSS, fonts
├── app/
│   ├── app.vue                    # root: layout + page
│   ├── assets/css/                # tokens / base / ui (game shell) / home
│   ├── layouts/default.vue        # home layout (header / footer)
│   ├── components/
│   │   ├── GameCard.vue           # home-page game tile
│   │   ├── GameTopbar.vue         # shared game top bar (back / title / actions / daily status)
│   │   └── games/                 # one component per game (SnakeGame.vue, SudokuGame.vue, …)
│   ├── composables/
│   │   ├── useGames.ts            # game registry + home groups (single source of truth)
│   │   ├── useDaily.ts            # daily rotation, today's pick, streak storage
│   │   └── useBoardAI.ts          # worker bridge for the chess / shogi search
│   ├── games/                     # pure game logic per game (tested)
│   ├── pages/
│   │   ├── index.vue              # home
│   │   ├── daily.vue              # Daily Challenge
│   │   └── games/                 # one route per game
│   ├── utils/                     # rng.ts (seeded RNG), sudoku.ts (generator / solver), expression.ts (f(x) parser)
│   └── workers/                   # chess-ai.ts / shogi-ai.ts
├── tests/                         # Vitest suites for app/games and app/utils
├── public/favicon.svg
└── .github/workflows/deploy.yml   # GitHub Pages deployment
```

Components are registered without a directory prefix (`components: [{ path: '~/components', pathPrefix: false }]`), so `components/games/SnakeGame.vue` is used as `<SnakeGame/>`.

## Adding a game

1. Put the game logic in `app/games/<name>.ts` and a test in `tests/games/<name>.test.ts`.
2. Add a component under `app/components/games/`, e.g. `MyGame.vue`:
   - Root node: `<div class="game-page" :style="{ '--accent': '#your-colour' }">`.
   - Use the shared shell: `<GameTopbar title="中文名" title-en="English">` with buttons in its `#actions` slot, then `.stage` → `.stage__main` (HUD `.hud` / `.chip`, the board in `.board-wrap` with an `.overlay`) and an `<aside class="panel">` with `.panel__group` blocks (`.panel__legend` + controls or a `.hint`).
   - Keep the panel to controls, rules and keys. No tips, trivia or tech notes.
3. Add a page under `app/pages/games/` with `definePageMeta({ layout: false })`, a `useHead` title, and the component.
4. Add one entry to `GAMES` in `app/composables/useGames.ts`: `id`, `title`, `titleEn`, a `desc` of at most about ten characters, `accent`, `category` (one of `CATEGORIES`), `to`, and an inline SVG `icon` that uses `var(--accent)`. The home page picks it up.
5. To make it daily-ready: accept `seed` / `daily` props, build the puzzle with `makeRng(props.seed)`, regenerate in `watch(() => props.seed, …)`, emit `solved` on a win, hide difficulty controls when `daily` is true, then add its id to `DAILY_ROTATION` in `app/composables/useDaily.ts` and its component to `COMPONENTS` in `app/pages/daily.vue`.

For a Three.js game see `Maze3DGame.vue`: import Three inside `onMounted` (`await import('three')`) and release the renderer in `onBeforeUnmount`. For a packaged WebGL / pygbag build, drop it under `public/embeds/<game>/`, embed it with an `<iframe>` inside the game shell, and register it with `type: "iframe"`.

## Deploying to GitHub Pages

Pushing to `main` runs `.github/workflows/deploy.yml`: `pnpm install --frozen-lockfile` → `pnpm generate` → deploy. The base URL is derived from the repository name (`NUXT_APP_BASE_URL=/<repo>/`). First-time setup: **Settings → Pages → Source → GitHub Actions**. For a custom domain or a `<account>.github.io` repo, set `NUXT_APP_BASE_URL` to `/` in the workflow.

## License

MIT
