/**
 * @fileoverview Two test "projects" with genuinely different needs, not one
 * config trying to serve both: unit tests are pure, fast, and must never
 * touch Docker; integration tests need real Postgres/Redis (via
 * Testcontainers — see tests/integration/globalSetup.js) and a correspondingly
 * longer timeout for container startup. A single shared `globalSetup` would
 * force every `npm run test:unit` invocation to boot two containers it
 * never uses, which defeats the entire point of having a separate unit tier.
 * @author Mohit Sharma
 */

import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "unit",
      include: ["tests/unit/**/*.test.js"],
      environment: "node",
      setupFiles: ["./tests/unit/setupEnv.js"],
    },
  },
  {
    test: {
      name: "integration",
      include: ["tests/integration/**/*.test.js"],
      environment: "node",
      pool: "forks",
      // Every test file shares ONE Postgres/Redis pair (see globalSetup.js) —
      // isolation between tests comes from truncating/flushing in beforeEach,
      // not from separate containers. Running files in parallel would let one
      // file's TRUNCATE wipe data another file has mid-flight (this was
      // caught directly: cross-file races produced sporadic 500s, 404s on
      // links that were just created, and rate-limit counters reset out from
      // under an in-progress test). `fileParallelism: false` alone wasn't
      // enough to stop it in a workspace project (parallelism is scheduled at
      // the root Vitest instance, not per-project) — pinning every file to a
      // single fork is what actually serializes them.
      fileParallelism: false,
      poolOptions: {
        forks: {
          singleFork: true,
        },
      },
      // Real container startup + migrations can comfortably exceed the 5s
      // default, especially cold (image not yet pulled) on a first run.
      testTimeout: 30_000,
      hookTimeout: 60_000,
      globalSetup: ["./tests/integration/globalSetup.js"],
      setupFiles: ["./tests/integration/setupEnv.js"],
    },
  },
]);
