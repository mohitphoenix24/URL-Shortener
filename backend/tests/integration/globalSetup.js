/**
 * @fileoverview Runs ONCE for the whole `test:integration` run (not per test
 * file): starts one real Postgres and one real Redis container, runs every
 * migration against the fresh database, and hands the connection strings to
 * every test file via Vitest's `provide`/`inject` — the mechanism that
 * exists specifically for globalSetup-to-test-file data, since globalSetup
 * runs in its own process and can't just set `process.env` for the workers.
 *
 * One shared pair of containers (not one pair per test file) because
 * container startup dominates wall-clock time otherwise; test-to-test
 * isolation instead comes from truncating/flushing between tests — see
 * `tests/integration/helpers/reset.js`.
 * @author Mohit Sharma
 */

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer } from "@testcontainers/redis";
import { runner } from "node-pg-migrate";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @param {import('vitest/node').GlobalSetupContext} context */
export default async function setup({ provide }) {
  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer("postgres:16-alpine").withDatabase("url_shortener_test").start(),
    new RedisContainer("redis:7-alpine").start(),
  ]);

  const databaseUrl = postgres.getConnectionUri();
  const redisUrl = redis.getConnectionUrl();

  await runner({
    databaseUrl,
    dir: path.join(__dirname, "../../migrations"),
    migrationsTable: "pgmigrations",
    direction: "up",
    log: () => {}, // migration-runner logs would otherwise interleave with test output
  });

  provide("testDatabaseUrl", databaseUrl);
  provide("testRedisUrl", redisUrl);

  return async () => {
    await Promise.all([postgres.stop(), redis.stop()]);
  };
}
