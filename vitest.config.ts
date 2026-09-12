import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
    // Each worker gets its own embedded PostgreSQL and its own temporary directories, so the
    // files are safe to run side by side. Four keeps peak memory reasonable for the WASM engine.
    maxWorkers: 4,
    minWorkers: 1,
    fileParallelism: true,
  },
});
