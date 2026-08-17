/**
 * @fileoverview Business rules for links: creation (with its three code
 * generation strategies), redirection resolution, listing, updates, and
 * deletion. This layer never imports `express` and never sees `req`/`res` —
 * it can be unit-tested (or reused by a future CLI/worker) without an HTTP
 * server. Caching (Phase 3) will be added here, transparently, without
 * changing this file's public shape.
 * @author Mohit Sharma
 */

import * as linkRepository from "../repositories/link.repository.js";
import { encodeBase62, generateRandomBase62 } from "../utils/base62.js";
import { assertSafeUrl } from "../utils/urlSafety.js";
import { isReservedAlias } from "../utils/reservedAliases.js";
import { parsePagination, parseSort, buildPaginationMeta } from "../utils/pagination.js";
import { toLinkDto } from "../utils/mappers.js";
import { AppError } from "../utils/AppError.js";
import { LINK_SORT_COLUMNS } from "../api/validators/link.validator.js";

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
 * @param {object} linkRow - Raw `links` table row.
 * @param {{id: string, role: string}} user - The authenticated caller (always present — every
 *   route that calls this runs behind `requireAuth`).
 * @returns {void}
 * @throws {AppError} 403 if the caller isn't the owner or an admin.
 */
function assertOwnerOrAdmin(linkRow, user) {
  if (user.role === "admin") return;
  if (linkRow.user_id !== null && String(linkRow.user_id) === String(user.id)) return;
  throw AppError.forbidden("You do not have permission to access this link", "LINK_FORBIDDEN");
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
  return toLinkDto(row);
}

/**
 * Resolves a short code to its destination for the redirect handler.
 *
 * No caching yet (Phase 3 adds Redis cache-aside here transparently) — every
 * call hits Postgres directly.
 *
 * @async
 * @param {string} shortCode
 * @returns {Promise<{longUrl: string, linkId: string}>}
 * @throws {AppError} 404 unknown code, 410 expired, 403 disabled.
 */
export async function resolveLink(shortCode) {
  const link = await linkRepository.findActiveByShortCode(shortCode);
  if (!link) {
    throw AppError.notFound("This short link does not exist", "LINK_NOT_FOUND");
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    throw AppError.gone("This short link has expired", "LINK_EXPIRED");
  }
  if (!link.is_active) {
    throw AppError.forbidden("This short link has been disabled", "LINK_DISABLED");
  }
  return { longUrl: link.long_url, linkId: link.id };
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
}
