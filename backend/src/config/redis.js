/**
 * @fileoverview Shared Redis client (ioredis). Used for three distinct
 * purposes that all reuse the same connection: cache-aside on the redirect
 * hot path, the token-bucket rate limiter's Lua script, and idempotency-key
 * storage. Each concern gets its own key prefix so they can be reasoned
 * about (and flushed) independently even though they share one client.
 * @author Mohit Sharma
 */

import Redis from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

/**
 * Shared Redis connection.
 * @type {import('ioredis').Redis}
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
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
