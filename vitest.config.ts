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
