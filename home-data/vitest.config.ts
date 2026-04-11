/**
 * Vitest config dedicated to the home-data subproject. The root vitest
 * config restricts `include` to `tests/**`, so home-data tests need their
 * own config when run via `npx vitest run -c home-data/vitest.config.ts`.
 *
 * Tests can also be run individually:
 *   npx vitest run -c home-data/vitest.config.ts home-data/vgcpast/parse-replay.test.ts
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["home-data/**/*.test.ts"],
    root: process.cwd(),
  },
});
