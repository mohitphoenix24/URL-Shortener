/**
 * @fileoverview One-stop import for every integration test file: the real
 * Express `app` (imported only after `setupEnv.js` has pointed `config/env.js`
 * at the Testcontainers instances — see that file's own comment for why
 * import order matters here), plus per-test isolation helpers.
 *
 * Isolation strategy: one Postgres/Redis pair is shared across the whole
 * `test:integration` run (see `globalSetup.js`), so tests isolate from each
 * other by wiping state before each test runs rather than by paying for a
 * fresh container every time — `TRUNCATE ... RESTART IDENTITY CASCADE` resets
 * every table (and its `BIGSERIAL` sequence) to empty, and `FLUSHDB` clears
 * every cache/rate-limit key. Restarting identity means generated ids/short
 * codes won't match the `14776336`-offset sequence the real migration sets
 * up (that offset resets to Postgres's default of 1) — tests never assert a
 * specific code value, only that whatever code the API returns round-trips
 * correctly, so this doesn't matter here.
 * @author Mohit Sharma
 */

import { app } from "../../../src/app.js";
import { pool, closeDatabase } from "../../../src/config/db.js";
import { redis, closeRedis } from "../../../src/config/redis.js";

export { app };

/**
 * @async
 * @returns {Promise<void>}
 */
export async function resetDatabase() {
  await pool.query("TRUNCATE TABLE clicks, refresh_tokens, links, users RESTART IDENTITY CASCADE");
}

/**
 * @async
 * @returns {Promise<void>}
 */
export async function resetRedis() {
  await redis.flushdb();
}

/**
 * Closes the pool/connection this test file opened, so its forked process
 * doesn't hold either open past the file's own tests.
 * @async
 * @returns {Promise<void>}
 */
export async function closeConnections() {
  await Promise.all([closeDatabase(), closeRedis()]);
}
