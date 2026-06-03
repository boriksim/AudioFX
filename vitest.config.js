// Vitest config — Node environment with jsdom for DOM-touching code,
// and a single-file setup that polyfills the Web Audio API stubs we need.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./test/setup.js"],
    include: ["test/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["core/**/*.js", "effects/**/*.js", "src/**/*.js"],
      exclude: ["**/*.html"],
    },
  },
});
