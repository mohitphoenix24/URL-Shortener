/**
 * @fileoverview Shared Redis client (ioredis). Used for three distinct
 * purposes that all reuse the same connection: cache-aside on the redirect
 * hot path, the token-bucket rate limiter's Lua script, and idempotency-key
 * storage. Each concern gets its own key prefix so they can be reasoned
 * about (and flushed) independently even though they share one client.
 * @author Mohit Sharma
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Redis from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Shared Redis connection.
 * @type {import('ioredis').Redis}
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

// Registers `redis.rateLimitTokenBucket(key, capacity, refillPerSec, nowMs,
// requested)` as a first-class command. ioredis caches the script's SHA and
// transparently falls back to EVAL (then re-caches) on a NOSCRIPT reply, so
// callers never touch EVAL/EVALSHA directly. See scripts/rateLimit.lua for
// why this needs to be one atomic server-side script rather than app-side
// GET-then-SET.
redis.defineCommand("rateLimitTokenBucket", {
  numberOfKeys: 1,
  lua: readFileSync(path.join(__dirname, "../../scripts/rateLimit.lua"), "utf8"),
});

redis.on("error", (err) => {
  logger.error({ err }, "Redis connection error");
});

redis.on("connect", () => {
  logger.info("Redis connected");
});

/** Key prefixes — keeping them centralised avoids typo'd collisions between features. */
export const REDIS_KEYS = Object.freeze({
  /** @param {string} code */
  link: (code) => `link:${code}`,
  /** @param {string} code */
  linkNegative: (code) => `link:${code}:absent`,
  /** @param {string} bucketId */
  rateLimit: (bucketId) => `ratelimit:{${bucketId}}`,
  /** @param {string} key */
  idempotency: (key) => `idempotency:${key}`,
});

/**
 * Verifies Redis is reachable. Used by the `/readyz` liveness probe.
 * @async
 * @returns {Promise<boolean>} True if `PING` succeeds.
 */
export async function pingRedis() {
  try {
    const pong = await redis.ping();
    return pong === "PONG";
  } catch (err) {
    logger.error({ err }, "Redis ping failed");
    return false;
  }
}

/**
 * Gracefully closes the Redis connection during SIGTERM shutdown.
 * @async
 * @returns {Promise<void>}
 */
export async function closeRedis() {
  await redis.quit();
}
