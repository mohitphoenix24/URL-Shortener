/**
 * @fileoverview All SQL for the `links` table lives here and nowhere else.
 * Every exported function takes plain JS values in and returns plain
 * objects/rows out — no ORM entities, no lazy-loading, no hidden queries.
 * `services/link.service.js` is the only caller.
 * @author Mohit Sharma
 */

import { query } from "../config/db.js";

/**
 * Pulls the next value from the `links` id sequence *before* inserting, so
 * the row's Base62 short code (derived from this id) is known ahead of the
 * INSERT and can be written in the same statement — one round trip instead
 * of insert-then-update. Sequences are non-transactional in Postgres: a
 * value pulled here is never reused even if the caller aborts, which can
 * leave small gaps in `id`. That's expected and harmless — ids only need to
 * be unique, not contiguous.
 *
 * @async
 * @returns {Promise<bigint>} The next id from `links_id_seq`.
 */
export async function nextLinkId() {
  const { rows } = await query("SELECT nextval('links_id_seq') AS id");
  return BigInt(rows[0].id);
}

/**
 * Inserts a new link row with an explicit id and short code (see
 * {@link nextLinkId}).
 *
 * @async
 * @param {object} params
 * @param {bigint} params.id
 * @param {string} params.shortCode
 * @param {string} params.longUrl
 * @param {bigint | null} [params.userId] - Null for anonymous, unclaimed links.
 * @param {string | null} [params.title]
 * @param {Date | null} [params.expiresAt]
 * @returns {Promise<object>} The inserted row.
 * @throws {Error} Postgres error with `code === "23505"` if `shortCode` is already taken.
 */
export async function insertLink({ id, shortCode, longUrl, userId = null, title = null, expiresAt = null }) {
  const { rows } = await query(
    `INSERT INTO links (id, short_code, long_url, user_id, title, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id.toString(), shortCode, longUrl, userId, title, expiresAt]
  );
  return rows[0];
}

/**
 * Looks up a link by its short code for the redirect hot path. Excludes
 * soft-deleted rows; does NOT filter on `is_active`/`expires_at` — the
 * service layer decides how to respond to an inactive/expired-but-existing
 * link (403/410) versus a truly unknown code (404).
 *
 * @async
 * @param {string} shortCode
 * @returns {Promise<object | undefined>} The row, or undefined if no match.
 */
export async function findActiveByShortCode(shortCode) {
  const { rows } = await query(`SELECT * FROM links WHERE short_code = $1 AND deleted_at IS NULL`, [shortCode]);
  return rows[0];
}

/**
 * @async
 * @param {bigint | string} id
 * @returns {Promise<object | undefined>} The row, or undefined if not found or soft-deleted.
 */
export async function findById(id) {
  const { rows } = await query(`SELECT * FROM links WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return rows[0];
}

/**
 * Paginated, filterable, sortable link listing. Total count is fetched with
 * a second query using the same WHERE clause so the two can never drift out
 * of sync with each other.
 *
 * @async
 * @param {object} params
 * @param {number} params.limit
 * @param {number} params.offset
 * @param {string} params.sortColumn - Already validated against a whitelist by the caller (see utils/pagination.js).
 * @param {"ASC" | "DESC"} params.sortDirection
 * @param {boolean} [params.isActive] - Optional filter; omitted means "any".
 * @param {string} [params.search] - Optional ILIKE match against title/long_url.
 * @param {bigint | string} [params.userId] - Optional owner filter.
 * @returns {Promise<{rows: object[], total: number}>}
 */
export async function listLinks({ limit, offset, sortColumn, sortDirection, isActive, search, userId }) {
  const conditions = ["deleted_at IS NULL"];
  const params = [];

  if (isActive !== undefined) {
    params.push(isActive);
    conditions.push(`is_active = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(title ILIKE $${params.length} OR long_url ILIKE $${params.length})`);
  }
  if (userId !== undefined) {
    params.push(userId);
    conditions.push(`user_id = $${params.length}`);
  }

  const whereClause = conditions.join(" AND ");

  // sortColumn/sortDirection are interpolated directly because placeholders
  // can't parameterize identifiers — safe ONLY because the caller validated
  // them against a fixed whitelist (see utils/pagination.js:parseSort).
  const listParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT * FROM links
     WHERE ${whereClause}
     ORDER BY ${sortColumn} ${sortDirection}
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  const { rows: countRows } = await query(`SELECT COUNT(*)::int AS total FROM links WHERE ${whereClause}`, params);

  return { rows, total: countRows[0].total };
}

/**
 * Partially updates a link. Only the fields present in `fields` are
 * changed — callers should omit keys they don't want to touch rather than
 * passing `undefined` (which this function treats as "not provided").
 *
 * @async
 * @param {bigint | string} id
 * @param {{title?: string | null, expiresAt?: Date | null, isActive?: boolean}} fields
 * @returns {Promise<object | undefined>} The updated row, or undefined if not found/deleted.
 */
export async function updateById(id, fields) {
  const setClauses = [];
  const params = [];

  for (const [column, value] of Object.entries({
    title: fields.title,
    expires_at: fields.expiresAt,
    is_active: fields.isActive,
  })) {
    if (value === undefined) continue;
    params.push(value);
    setClauses.push(`${column} = $${params.length}`);
  }

  if (setClauses.length === 0) return findById(id);

  params.push(id);
  const { rows } = await query(
    `UPDATE links SET ${setClauses.join(", ")}
     WHERE id = $${params.length} AND deleted_at IS NULL
     RETURNING *`,
    params
  );
  return rows[0];
}

/**
 * Soft-deletes a link (sets `deleted_at`) rather than removing the row, so
 * its `short_code` can never be reissued and its click history survives for
 * historical analytics.
 *
 * @async
 * @param {bigint | string} id
 * @returns {Promise<boolean>} True if a row was deleted, false if it was already gone.
 */
export async function softDeleteById(id) {
  const { rowCount } = await query(`UPDATE links SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return rowCount > 0;
}
