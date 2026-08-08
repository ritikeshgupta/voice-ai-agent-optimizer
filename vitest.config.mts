import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Isolated in-memory DB per test file -- see tests/db.test.ts.
    env: {
      DATABASE_PATH: ":memory:",
    },
    server: {
      // Vite's builtin-module externalization list predates node:sqlite; force it external
      // instead of letting Vite try (and fail) to bundle it.
      deps: {
        external: [/^node:/],
      },
    },
  },
});
