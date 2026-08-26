import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

/**
 * Integration runs, kept out of `npm test` on purpose.
 *
 * These talk to a real database and write real rows. The default suite in
 * vitest.config.ts stays pure so it can run anywhere — in CI, on a fresh clone, with no
 * DATABASE_URL — and this config is opted into with `npm run test:integration`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.integration.ts"],
    // Fee schedules generate a charge per enrolled student, so these are not quick.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // The fixtures share one school; running files in parallel would interleave their
    // charge totals and make the report assertions flap.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
})
