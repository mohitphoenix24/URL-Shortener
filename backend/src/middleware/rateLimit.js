/**
 * @fileoverview Hand-written Redis token-bucket rate limiting (Roadmap: "Rate
 * Limiter, Token bucket algorithm, Redis" as a system-design problem to
 * solve, not a library to install — see docs/decisions.md). The bucket
 * arithmetic itself lives entirely in scripts/rateLimit.lua and runs
 * atomically on the Redis server; this file is just the Express-facing
 * wrapper plus the three capacity/refill tiers the app uses.
 * @author Mohit Sharma
 */

import { redis, REDIS_KEYS } from "../config/redis.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/AppError.js";

/** @param {import('express').Request} req @returns {string} */
function clientIp(req) {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

/**
 * Builds an Express middleware backed by one token-bucket tier.
 *
 * @param {object} params
 * @param {number} params.capacity - Max tokens (i.e. the burst size).
 * @param {number} params.refillPerSec - Tokens added per second (the sustained rate).
 * @param {(req: import('express').Request) => string} params.keyFn - Derives the bucket's
 *   identity from the request (e.g. by IP or by user id) — separate identities get separate buckets.
 * @returns {import('express').RequestHandler}
 */
export function rateLimiter({ capacity, refillPerSec, keyFn }) {
  return async function rateLimit(req, res, next) {
    const key = REDIS_KEYS.rateLimit(keyFn(req));

    let result;
    try {
      result = await redis.rateLimitTokenBucket(key, capacity, refillPerSec, Date.now(), 1);
    } catch (err) {
      // Redis being unreachable shouldn't take the whole API down with it —
      // fail open, but log loudly since "rate limiting is silently off" is
      // exactly the kind of thing that should be visible, not swallowed.
      logger.error({ err, key }, "Rate limiter Redis call failed; failing open");
      return next();
    }

    const [allowed, , retryAfterMs] = result;
    if (!allowed) {
      res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000));
      return next(AppError.tooManyRequests("Too many requests — please slow down", "RATE_LIMITED"));
    }
    next();
  };
}

/**
 * For unauthenticated/sensitive traffic, keyed by IP: auth endpoints
 * (register/login/refresh/logout — see docs/decisions.md's "Login
 * brute-force protection" note) and anonymous link creation.
 */
export const rateLimitAnonByIp = rateLimiter({
  capacity: env.RATE_LIMIT_ANON_CAPACITY,
  refillPerSec: env.RATE_LIMIT_ANON_REFILL_PER_SEC,
  keyFn: (req) => `anon:${clientIp(req)}`,
});

/** For authenticated traffic, keyed by user id: every requireAuth-gated links route, `/auth/me`. */
export const rateLimitAuthByUser = rateLimiter({
  capacity: env.RATE_LIMIT_AUTH_CAPACITY,
  refillPerSec: env.RATE_LIMIT_AUTH_REFILL_PER_SEC,
  keyFn: (req) => `user:${req.user.id}`,
});

/**
 * For the redirect hot path only (`GET /:code`), keyed by IP. Deliberately
 * its own tier with a much higher capacity/refill than the others — this
 * route is hit on every click on every shared link, by design, not abuse.
 */
export const rateLimitRedirect = rateLimiter({
  capacity: env.RATE_LIMIT_REDIRECT_CAPACITY,
  refillPerSec: env.RATE_LIMIT_REDIRECT_REFILL_PER_SEC,
  keyFn: (req) => `redirect:${clientIp(req)}`,
});

/**
 * `POST /api/v1/links` allows both anonymous and authenticated callers
 * (`optionalAuth`), so it can't be wired to a single fixed tier ahead of
 * time — this picks anon-by-IP or auth-by-user per request based on whether
 * `optionalAuth` (which must run first) populated `req.user`.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
export function rateLimitLinksCreate(req, res, next) {
  const limiter = req.user ? rateLimitAuthByUser : rateLimitAnonByIp;
  return limiter(req, res, next);
}
