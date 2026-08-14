/**
 * @fileoverview PostgreSQL connection pool — the single `pg.Pool` shared by
 * every repository. Repositories are the only files allowed to import
 * `query`/`getClient` from here; services and controllers never see SQL.
 * @author Mohit Sharma
 */

import pg from "pg";
import { env } from "./env.js";
import { logger } from "./logger.js";

const { Pool } = pg;

/**
 * Shared connection pool. Sized modestly for local/dev; tune `max` per
 * deployment target's connection limits (e.g. Neon free tier, RDS instance
 * class) rather than raising it blindly.
 * @type {import('pg').Pool}
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  // Fired for errors on idle clients (e.g. the DB restarting) — must be
  // handled or an unhandled 'error' event crashes the whole process.
  logger.error({ err }, "Unexpected error on idle Postgres client");
});

/**
 * Runs a parameterized SQL query against the pool.
 *
 * This is the ONLY function in the codebase that should ever see a raw SQL
 * string outside of `migrations/` — every query in `repositories/` goes
 * through here so slow-query logging and instrumentation live in one place.
 *
 * @async
 * @param {string} text - SQL text with `$1, $2, ...` placeholders.
 * @param {Array<*>} [params] - Positional parameters for the placeholders.
 * @returns {Promise<import('pg').QueryResult>} The raw pg query result.
 */
export async function query(text, params = []) {
  const start = performance.now();
  const result = await pool.query(text, params);
  const durationMs = performance.now() - start;
  if (durationMs > 200) {
    logger.warn({ text, durationMs: Math.round(durationMs) }, "Slow query");
  }
  return result;
}

/**
 * Checks out a dedicated client from the pool for multi-statement
 * transactions (BEGIN/COMMIT/ROLLBACK). Callers MUST release the client in a
 * `finally` block — a leaked client starves the pool.
 *
 * @async
 * @returns {Promise<import('pg').PoolClient>} A checked-out client.
 *
 * @example
 * const client = await getClient();
 * try {
 *   await client.query("BEGIN");
 *   await client.query("UPDATE ...", [...]);
 *   await client.query("COMMIT");
 * } catch (err) {
 *   await client.query("ROLLBACK");
 *   throw err;
 * } finally {
 *   client.release();
 * }
 */
export async function getClient() {
  return pool.connect();
}

/**
 * Verifies the pool can reach Postgres. Used by the `/readyz` liveness probe.
 * @async
 * @returns {Promise<boolean>} True if `SELECT 1` succeeds.
 */
export async function pingDatabase() {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (err) {
    logger.error({ err }, "Database ping failed");
    return false;
  }
}

/**
 * Gracefully closes the pool. Called during SIGTERM shutdown so in-flight
 * queries finish before the process exits.
 * @async
 * @returns {Promise<void>}
 */
export async function closeDatabase() {
  await pool.end();
}
