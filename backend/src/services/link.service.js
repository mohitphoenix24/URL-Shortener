/**
 * @fileoverview Business rules for links: creation (with its three code
 * generation strategies), redirection resolution, listing, updates, and
 * deletion. This layer never imports `express` and never sees `req`/`res` —
 * it can be unit-tested (or reused by a future CLI/worker) without an HTTP
 * server. Redis cache-aside for the redirect hot path lives here too (see
 * `resolveLink`) — Redis is a business-rule concern the same way Postgres
 * is, not something the controller should know about.
 * @author Mohit Sharma
 */

import * as linkRepository from "../repositories/link.repository.js";
import { encodeBase62, generateRandomBase62 } from "../utils/base62.js";
import { assertSafeUrl } from "../utils/urlSafety.js";
import { isReservedAlias } from "../utils/reservedAliases.js";
import { parsePagination, parseSort, buildPaginationMeta } from "../utils/pagination.js";
import { jitteredTtlSeconds } from "../utils/jitter.js";
import { toLinkDto } from "../utils/mappers.js";
import { AppError } from "../utils/AppError.js";
import { LINK_SORT_COLUMNS } from "../api/validators/link.validator.js";
import { redis, REDIS_KEYS } from "../config/redis.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { cacheOperationsTotal } from "../config/metrics.js";

const RANDOM_CODE_LENGTH = 8;
const RANDOM_CODE_MAX_ATTEMPTS = 5;

/** @param {unknown} err @returns {boolean} True if it's a Postgres unique-violation. */
function isUniqueViolation(err) {
  return err?.code === "23505";
}

/**
 * Enforces ownership for read/update/delete of a single link: admins may
 * touch anything; a regular user may only touch a link where
 * `link.user_id` matches their own id. An anonymous (unclaimed, `user_id
 * IS NULL`) link belongs to nobody in particular, so — same as a link
 * owned by someone else — only an admin can manage it. This single rule is
 * what "links scoped to owner" means in practice everywhere below.
 *
 * Exported (not module-private) because `services/analytics.service.js`
 * applies the identical rule to reading a link's click analytics — "who can
 * touch this link" and "who can see this link's stats" are the same
 * question, so they share one implementation rather than two copies that
 * could drift apart.
 *
 * @param {object} linkRow - Raw `links` table row.
 * @param {{id: string, role: string}} user - The authenticated caller (always present — every
 *   route that calls this runs behind `requireAuth`).
 * @returns {void}
 * @throws {AppError} 403 if the caller isn't the owner or an admin.
 */
export function assertOwnerOrAdmin(linkRow, user) {
  if (user.role === "admin") return;
  if (linkRow.user_id !== null && String(linkRow.user_id) === String(user.id)) return;
  throw AppError.forbidden("You do not have permission to access this link", "LINK_FORBIDDEN");
}

/**
 * Only the fields the redirect hot path needs — a cache hit never carries
 * columns that don't matter here (title, click_count, timestamps, ...).
 * @param {object} row - A raw `links` table row.
 * @returns {string} JSON-serialized cache payload.
 */
function serializeCachedLink(row) {
  return JSON.stringify({
    linkId: row.id,
    longUrl: row.long_url,
    expiresAt: row.expires_at,
    isActive: row.is_active,
  });
}

/**
 * Applies the same expired/disabled/ok decision whether the link came from
 * Postgres or the cache. Expiry is time-based and can't be proactively
 * invalidated the way an update/delete can, so it's re-checked against the
 * clock on every call rather than baked into the cached payload.
 *
 * @param {{longUrl: string, linkId: string | number, expiresAt: string | Date | null, isActive: boolean}} link
 * @returns {{longUrl: string, linkId: string | number}}
 * @throws {AppError} 410 if expired, 403 if disabled.
 */
function evaluateResolvedLink(link) {
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    throw AppError.gone("This short link has expired", "LINK_EXPIRED");
  }
  if (!link.isActive) {
    throw AppError.forbidden("This short link has been disabled", "LINK_DISABLED");
  }
  return { longUrl: link.longUrl, linkId: link.linkId };
}

/**
 * Reads both the positive and negative cache entries for a code in one
 * round trip (`MGET`). Redis being unreachable fails open — treated as a
 * double miss so the caller falls through to Postgres — rather than
 * failing the request; caching is a performance optimization, not a
 * correctness dependency.
 *
 * @async
 * @param {string} shortCode
 * @returns {Promise<{positive: object | null, negative: boolean}>}
 */
async function getCacheEntries(shortCode) {
  try {
    const [positive, negative] = await redis.mget(REDIS_KEYS.link(shortCode), REDIS_KEYS.linkNegative(shortCode));
    const result = positive ? "hit" : negative !== null ? "negative_hit" : "miss";
    cacheOperationsTotal.inc({ result });
    return { positive: positive ? JSON.parse(positive) : null, negative: negative !== null };
  } catch (err) {
    cacheOperationsTotal.inc({ result: "error" });
    logger.error({ err, shortCode }, "Link cache read failed; falling back to Postgres");
    return { positive: null, negative: false };
  }
}

/**
 * Populates the positive cache with a jittered TTL, so a large batch of
 * links cached around the same moment don't all expire in the same instant
 * and stampede Postgres together.
 *
 * @async
 * @param {string} shortCode
 * @param {object} row - A raw `links` table row.
 * @returns {Promise<void>}
 */
async function cachePositive(shortCode, row) {
  try {
    await redis.set(REDIS_KEYS.link(shortCode), serializeCachedLink(row), "EX", jitteredTtlSeconds(env.LINK_CACHE_TTL_SECONDS));
  } catch (err) {
    logger.error({ err, shortCode }, "Link cache write failed");
  }
}

/**
 * Caches "this code doesn't exist" with its own, much shorter TTL — protects
 * Postgres from repeated lookups of a code that's typo'd or was never
 * created, without risking a legitimately new link being shadowed by a
 * stale negative entry for very long.
 *
 * @async
 * @param {string} shortCode
 * @returns {Promise<void>}
 */
async function cacheNegative(shortCode) {
  try {
    await redis.set(REDIS_KEYS.linkNegative(shortCode), "1", "EX", jitteredTtlSeconds(env.LINK_NEGATIVE_CACHE_TTL_SECONDS));
  } catch (err) {
    logger.error({ err, shortCode }, "Link negative-cache write failed");
  }
}

/**
 * Clears both cache entries for a code. Called after any write that could
 * make a cached entry stale: an update/delete invalidates a positive entry
 * that would otherwise keep serving the old `long_url`/`is_active`; a create
 * invalidates a negative entry a prior lookup of the same (not-yet-taken)
 * code might have left behind.
 *
 * @async
 * @param {string} shortCode
 * @returns {Promise<void>}
 */
async function bustLinkCache(shortCode) {
  try {
    await redis.del(REDIS_KEYS.link(shortCode), REDIS_KEYS.linkNegative(shortCode));
  } catch (err) {
    logger.error({ err, shortCode }, "Link cache invalidation failed");
  }
}

/**
 * Creates a new short link. Three code-generation strategies, in priority
 * order:
 *
 * 1. `customAlias` provided → use it verbatim (already validated as
 *    3-32 safe characters and checked against the reserved list).
 * 2. `mode === "random"` → an unguessable random Base62 code, retried a
 *    handful of times on the (statistically tiny) chance of a collision.
 * 3. Default → `encodeBase62(id)`, which cannot collide by construction
 *    because Postgres guarantees `id` is unique — no retry loop needed.
 *
 * @async
 * @param {object} input
 * @param {string} input.longUrl
 * @param {"auto" | "random"} input.mode
 * @param {string} [input.customAlias]
 * @param {string} [input.title]
 * @param {Date} [input.expiresAt]
 * @param {string} [input.userId] - Owner id (from the access token's `sub` claim), if the request was authenticated. Anonymous otherwise.
 * @returns {Promise<object>} The created link, API-shaped.
 * @throws {AppError} 422 for an unsafe/malformed `longUrl`, 409 if `customAlias` is taken or reserved.
 */
export async function createLink({ longUrl, mode, customAlias, title, expiresAt, userId }) {
  await assertSafeUrl(longUrl);

  if (customAlias) {
    if (isReservedAlias(customAlias)) {
      throw AppError.conflict(`"${customAlias}" is a reserved word and can't be used as an alias`, "ALIAS_RESERVED");
    }
    const id = await linkRepository.nextLinkId();
    try {
      const row = await linkRepository.insertLink({ id, shortCode: customAlias, longUrl, userId, title, expiresAt });
      await bustLinkCache(customAlias); // clears any stale negative entry from a lookup before this alias existed
      return toLinkDto(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw AppError.conflict(`Alias "${customAlias}" is already taken`, "ALIAS_TAKEN");
      }
      throw err;
    }
  }

  if (mode === "random") {
    for (let attempt = 1; attempt <= RANDOM_CODE_MAX_ATTEMPTS; attempt++) {
      const id = await linkRepository.nextLinkId();
      const shortCode = generateRandomBase62(RANDOM_CODE_LENGTH);
      try {
        const row = await linkRepository.insertLink({ id, shortCode, longUrl, userId, title, expiresAt });
        await bustLinkCache(shortCode);
        return toLinkDto(row);
      } catch (err) {
        if (!isUniqueViolation(err) || attempt === RANDOM_CODE_MAX_ATTEMPTS) throw err;
        // Extremely unlikely with 62^8 possibilities — retry with a fresh code.
      }
    }
  }

  // Default: deterministic, collision-free by construction.
  const id = await linkRepository.nextLinkId();
  const shortCode = encodeBase62(id);
  const row = await linkRepository.insertLink({ id, shortCode, longUrl, userId, title, expiresAt });
  await bustLinkCache(shortCode); // clears a stale negative entry if this (sequential) code was probed before it existed
  return toLinkDto(row);
}

/**
 * Resolves a short code to its destination for the redirect handler —
 * cache-aside: check Redis first, fall back to Postgres on a miss and
 * populate the cache for next time. A jittered TTL on both the positive and
 * negative entries prevents a synchronized wave of expirations from all
 * hitting Postgres at once. Redis being down degrades to "every request hits
 * Postgres," not an outage — see {@link getCacheEntries}.
 *
 * @async
 * @param {string} shortCode
 * @returns {Promise<{longUrl: string, linkId: string}>}
 * @throws {AppError} 404 unknown code, 410 expired, 403 disabled.
 */
export async function resolveLink(shortCode) {
  const { positive, negative } = await getCacheEntries(shortCode);

  if (positive) {
    return evaluateResolvedLink(positive);
  }
  if (negative) {
    throw AppError.notFound("This short link does not exist", "LINK_NOT_FOUND");
  }

  const link = await linkRepository.findActiveByShortCode(shortCode);
  if (!link) {
    await cacheNegative(shortCode);
    throw AppError.notFound("This short link does not exist", "LINK_NOT_FOUND");
  }

  await cachePositive(shortCode, link);
  return evaluateResolvedLink({
    longUrl: link.long_url,
    linkId: link.id,
    expiresAt: link.expires_at,
    isActive: link.is_active,
  });
}

/**
 * @async
 * @param {object} query - Already-validated query params (see `listLinksQuerySchema`).
 * @param {string} [ownerUserId] - When provided, restricts results to this owner (omitted → unscoped, used for an admin's "all links" view).
 * @returns {Promise<{data: object[], pagination: object}>}
 */
export async function listLinks(query, ownerUserId) {
  const { page, limit, offset } = parsePagination(query);
  const { column: sortColumn, direction: sortDirection } = parseSort(query.sort, LINK_SORT_COLUMNS, "createdAt");

  const { rows, total } = await linkRepository.listLinks({
    limit,
    offset,
    sortColumn,
    sortDirection,
    isActive: query.isActive,
    search: query.search,
    userId: ownerUserId,
  });

  return { data: rows.map(toLinkDto), pagination: buildPaginationMeta({ page, limit, total }) };
}

/**
 * @async
 * @param {bigint} id
 * @param {{id: string, role: string}} user
 * @returns {Promise<object>} The link, API-shaped.
 * @throws {AppError} 404 if not found or soft-deleted, 403 if not the owner or an admin.
 */
export async function getLinkById(id, user) {
  const row = await linkRepository.findById(id);
  if (!row) throw AppError.notFound("Link not found", "LINK_NOT_FOUND");
  assertOwnerOrAdmin(row, user);
  return toLinkDto(row);
}

/**
 * Fetches the link first so ownership can be checked before the mutation —
 * one extra SELECT versus folding `user_id = $n` into the UPDATE's WHERE
 * clause directly. The combined-WHERE version would close a theoretical
 * (and here harmless) TOCTOU gap between the check and the write; this
 * version keeps the ownership rule as one explicit, readable statement
 * shared by get/update/delete instead of duplicated across three SQL
 * strings. A deliberate readability-over-micro-optimization tradeoff.
 *
 * @async
 * @param {bigint} id
 * @param {{title?: string | null, expiresAt?: Date | null, isActive?: boolean}} fields
 * @param {{id: string, role: string}} user
 * @returns {Promise<object>} The updated link, API-shaped.
 * @throws {AppError} 404 if not found or soft-deleted, 403 if not the owner or an admin.
 */
export async function updateLink(id, fields, user) {
  const existing = await linkRepository.findById(id);
  if (!existing) throw AppError.notFound("Link not found", "LINK_NOT_FOUND");
  assertOwnerOrAdmin(existing, user);

  const row = await linkRepository.updateById(id, fields);
  // Invalidate rather than update-in-place: simpler than keeping the cache
  // payload in sync field-by-field, and the next redirect just repopulates it.
  await bustLinkCache(existing.short_code);
  return toLinkDto(row);
}

/**
 * @async
 * @param {bigint} id
 * @param {{id: string, role: string}} user
 * @returns {Promise<void>}
 * @throws {AppError} 404 if not found or already deleted, 403 if not the owner or an admin.
 */
export async function deleteLink(id, user) {
  const existing = await linkRepository.findById(id);
  if (!existing) throw AppError.notFound("Link not found", "LINK_NOT_FOUND");
  assertOwnerOrAdmin(existing, user);

  await linkRepository.softDeleteById(id);
  await bustLinkCache(existing.short_code);
}
