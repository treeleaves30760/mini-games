# Playground — Web Mini-Games Collection

A modern, clean, and polished collection of web mini-games, built with **Vue 3 + Nuxt 4**, statically generated (SSG) and deployed to **GitHub Pages**.

Live demo: https://treeleaves30760.github.io/mini-games/

It currently features **35 games** plus a **Daily Challenge**, grouped by category:

| Category | Games |
| --- | --- |
| Logic | Sudoku, Minesweeper, Nonogram, Lights Out, Flood It, Binario, One Line, Shikaku, Arrow Out, Pipes, Hashi, Light Up, Tents |
| Board (vs AI) | Gomoku (with Renju forbidden-move rules), Reversi, Tic-Tac-Toe, Dots & Boxes |
| Numbers | 2048, 15 Puzzle, Make 24 (variable target), Mastermind |
| Word | Word Guess, Word Search |
| Memory | Memory, Simon |
| Arcade | Snake, Tetris, Breakout, Match 3, Whack-a-Mole |
| Maze | Maze, 3D Maze (Three.js) |
| Classic | Klotski, Tower of Hanoi, Sokoban |

### Daily Challenge

`/daily` uses **the current date as a seed** every day to pick one game from a curated, reproducible set of puzzles and generate that day's challenge — so **every player in the world gets the same puzzle on the same day**. Completing it extends your **streak**, and you can share your result with one tap.

The core is the shared seeded-RNG utility `app/utils/rng.ts` (`makeRng(seed)` / `todaySeed()`). Any game can join the daily rotation simply by using it in place of `Math.random`, accepting `seed` / `daily` props, and emitting `solved` when the player wins.

## Features

- **Pure static, instant play**: `nuxt generate` produces fully static files — no server, no install.
- **Daily challenge engine**: a date seed generates a "same puzzle worldwide" level, with streaks tracked locally in the browser.
- **Single registry-driven gallery**: every game lives in `app/composables/useGames.ts`; add one entry to ship it, and the home page provides category filtering.
- **Unified design system**: shared design tokens (colors, fonts, spacing) and a common game shell give a consistent look while each game keeps its own accent color.
- **Responsive and mobile-friendly**: keyboard, mouse, and touch (swipe / tap / D-pad) input are all supported.
- **Accessibility details**: semantic structure, `prefers-reduced-motion`, and keyboard operation support.

## Tech Stack

| Item | Choice |
| --- | --- |
| Framework | Vue 3 (`<script setup>`) + Nuxt 4 |
| Render mode | Static site generation (SSG, `nuxt generate`) |
| 3D | Three.js (dynamically imported on the client only) |
| Styling | Native CSS + design tokens (CSS variables), no UI library |
| Fonts | Bricolage Grotesque / Noto Sans TC / Space Mono (Google Fonts) |
| Deployment | GitHub Pages (automated via GitHub Actions) |

## Local Development

Requirements: Node.js 20 or later and [pnpm](https://pnpm.io/).

```bash
pnpm install       # install dependencies
pnpm dev           # dev server (http://localhost:3000)
pnpm generate      # generate the static site into .output/public
pnpm preview       # preview the production build
```

Preview the static output: `pnpm generate && pnpm dlx serve .output/public`

## Project Structure

```
.
├── nuxt.config.ts                 # baseURL, github_pages preset, global CSS, fonts, component config
├── app/
│   ├── app.vue                    # root component (global background + layout + page)
│   ├── assets/css/                # design system: tokens / base / ui / home
│   ├── layouts/default.vue        # home layout (site header / footer)
│   ├── components/
│   │   ├── AppBackground.vue      # global ambient background + grain texture
│   │   ├── GameCard.vue           # home-page game card
│   │   ├── GameTopbar.vue         # shared game-page top bar (back / title / actions)
│   │   └── games/                 # 35 game components (SnakeGame.vue, SudokuGame.vue,
│   │                              #   MinesweeperGame.vue, GomokuGame.vue ... Maze3DGame.vue)
│   ├── composables/useGames.ts    # game registry + categories (single source of truth)
│   ├── pages/
│   │   ├── index.vue              # home page (hero + category filter + game wall)
│   │   ├── daily.vue              # Daily Challenge (date-picked game, seeded, streak tracking)
│   │   └── games/                 # one route per game (snake / sudoku / minesweeper / gomoku ...)
│   └── utils/
│       ├── sudoku.ts              # Sudoku generator / solver
│       └── rng.ts                 # seeded RNG (makeRng / todaySeed) — the basis of the Daily Challenge
├── public/favicon.svg
└── .github/workflows/deploy.yml   # GitHub Pages automatic deployment
```

Note: because the component config is set to `components: [{ path: '~/components', pathPrefix: false }]`, the tag for `components/games/SnakeGame.vue` is simply `<SnakeGame/>` (no directory prefix).

## How to Add a Game

### A. Native Vue game (recommended)

1. Add a component under `app/components/games/`, e.g. `Game2048.vue`.
   - Use `<div class="game-page" :style="{ '--accent': '#your-accent' }">` as the root node.
   - Include the shared shell: `<GameTopbar title="..." title-en="...">`, `.stage`, `.panel`, etc.
2. Add a page under `app/pages/games/`, set `definePageMeta({ layout: false })`, set the title with `useHead`, and place your game component in the template.
3. Add one entry to the `GAMES` array in `app/composables/useGames.ts` with `available: true`, along with `to`, `accent`, `category`, and `icon`. The home-page card wall grows the new card automatically.

> **Make a game daily-ready**: accept `seed` / `daily` props, generate the puzzle with `const rng = makeRng(props.seed)` (replacing `Math.random`), regenerate via `watch(() => props.seed, ...)`, and emit `solved` on a win (`emit('solved', {...})`). When `daily` is true, hide difficulty/new-puzzle controls. Finally, add it to the `ROTATION` in `app/pages/daily.vue`.

### B. 3D game (Three.js)

See `Maze3DGame.vue`: dynamically load Three.js inside `onMounted` with `await import('three')` (ensuring it runs only on the client and does not affect SSG), and release resources in `onBeforeUnmount` (`renderer.dispose()`, `cancelAnimationFrame`).

### C. Packaged build (Pygame / Unity)

1. Place the exported WebGL / pygbag build (including its `index.html`) under `public/embeds/<game>/`.
2. Create an embed page that loads the folder with an `<iframe>` and applies the `GameTopbar` shell.
3. Add the game to the registry (`type: "iframe"`).

Because the `github_pages` preset is enabled and outputs `.nojekyll`, any static file under `public/` is deployed as-is.

## Deploying to GitHub Pages

A GitHub Actions workflow is included (`.github/workflows/deploy.yml`): pushing to `main` automatically runs `pnpm install --frozen-lockfile` → `pnpm generate` → deploy to Pages. The base URL is derived from the repository name by the workflow (`NUXT_APP_BASE_URL=/<repo>/`).

First-time setup: go to the repo's **Settings → Pages → Source** and select **GitHub Actions**.

If you use a custom domain, or the repo is named `<account>.github.io`, change `NUXT_APP_BASE_URL` in `deploy.yml` to `/`.

## License

MIT — free to use, modify, and extend.
