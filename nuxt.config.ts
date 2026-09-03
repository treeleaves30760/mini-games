// https://nuxt.com/docs/api/configuration/nuxt-config

// Base URL for GitHub Pages project sites (e.g. "/mini-games/").
// Set via the NUXT_APP_BASE_URL env var at build time (the deploy workflow
// derives it from the repository name). Defaults to "/" for local dev.
const baseURL = process.env.NUXT_APP_BASE_URL || "/";

export default defineNuxtConfig({
  compatibilityDate: "2026-06-02",
  ssr: true,
  devtools: { enabled: false },

  app: {
    baseURL,
    head: {
      htmlAttrs: { lang: "zh-Hant" },
      title: "遊樂場：網頁小遊戲",
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        {
          name: "description",
          content:
            "四十多款在瀏覽器裡直接玩的小遊戲：數獨、踩地雷、數織、五子棋、西洋棋、將棋、2048、貪食蛇，還有每天一題的每日挑戰。",
        },
        { name: "theme-color", content: "#141317" },
      ],
      link: [
        { rel: "icon", type: "image/svg+xml", href: `${baseURL}favicon.svg` },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Huninn&family=Noto+Sans+TC:wght@400;500;700&display=swap",
        },
      ],
    },
  },

  css: [
    "~/assets/css/tokens.css",
    "~/assets/css/base.css",
    "~/assets/css/ui.css",
    "~/assets/css/home.css",
  ],

  // Keep component filenames as their tag names (no directory prefix),
  // so components/games/SnakeGame.vue is <SnakeGame/>, not <GamesSnakeGame/>.
  components: [{ path: "~/components", pathPrefix: false }],

  // Static hosting on GitHub Pages: adds .nojekyll + 404.html on `nuxt generate`.
  nitro: {
    preset: "github_pages",
  },
});
