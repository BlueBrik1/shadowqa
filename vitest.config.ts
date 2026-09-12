import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The embedded PostgreSQL is warmed before the first test so its boot is never charged to a
    // test's own budget; the timeouts below still leave room for a busy machine.
    setupFiles: ["tests/warm-engine.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Each worker gets its own engine and its own temporary directories, so files are safe side by
    // side. Three keeps the suite quick without oversubscribing a machine that is also building.
    maxWorkers: 3,
    minWorkers: 1,
    fileParallelism: true,
  },
});
