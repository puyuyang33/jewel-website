import path from "node:path";

import { defineConfig } from "vitest/config";

const root = path.resolve(import.meta.dirname, "..", "..");

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [path.resolve(root, "vitest.setup.ts")],
    include: ["tests/component/**/*.test.{ts,tsx}"],
  },
});
