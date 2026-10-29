import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "api",
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    // Each test file builds and migrates its own database in beforeAll, which is slow under parallel load.
    hookTimeout: 60_000,
  },
});
