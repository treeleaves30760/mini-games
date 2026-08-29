import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirror Nuxt's path aliases (~ and @ -> app/, ~~ and @@ -> project root) so the
// extracted pure-logic modules under app/games and app/utils import the same way
// in tests as they do in the components. Tests run in plain Node — the game logic
// is deliberately framework-free, so no Nuxt/Vue runtime is needed.
const app = fileURLToPath(new URL("./app", import.meta.url));
const root = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "~~": root,
      "@@": root,
      "~": app,
      "@": app,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    // Several suites prove solvability by running an exhaustive/independent
    // solver over hundreds of seeds (Hashi, Flood, Minesweeper, Make 24, …).
    // They finish in a second or two on their own, but v8 coverage
    // instrumentation slows them several-fold — well past Vitest's 5s default.
    testTimeout: 120000,
    coverage: {
      provider: "v8",
      // Coverage targets the framework-free pure-logic modules — the layer the
      // suite is designed to exercise. Vue SFCs and composables live outside it.
      include: ["app/games/**/*.ts", "app/utils/**/*.ts"],
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
