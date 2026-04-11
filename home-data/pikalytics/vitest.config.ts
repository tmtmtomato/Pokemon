/**
 * Local Vitest config for the Pikalytics fetcher/parser tests.
 *
 * The repository-wide `vitest.config.ts` only includes `tests/**`, but the
 * Pikalytics test fixture lives next to the parser source under
 * `home-data/pikalytics/`. This local config lets the test be run via:
 *
 *   npx vitest run --config home-data/pikalytics/vitest.config.ts
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["home-data/pikalytics/**/*.test.ts"],
  },
});
