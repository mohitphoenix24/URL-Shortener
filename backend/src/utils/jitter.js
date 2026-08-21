/**
 * @fileoverview A single helper for jittering cache TTLs, used wherever a
 * large number of keys would otherwise be written with the exact same TTL
 * and could all expire in the same instant — the classic cache-stampede
 * setup, where a synchronized wave of misses all hit Postgres at once.
 * Spreading expirations out smooths that into a trickle instead.
 * @author Mohit Sharma
 */

/**
 * @param {number} baseSeconds - The nominal TTL.
 * @param {number} [jitterRatio] - Fraction of `baseSeconds` to randomize by, e.g. 0.1 = ±10%.
 * @returns {number} A TTL in seconds, randomized within `baseSeconds * (1 ± jitterRatio)`.
 */
export function jitteredTtlSeconds(baseSeconds, jitterRatio = 0.1) {
  const spread = baseSeconds * jitterRatio;
  const jitter = (Math.random() * 2 - 1) * spread;
  return Math.max(1, Math.round(baseSeconds + jitter));
}
