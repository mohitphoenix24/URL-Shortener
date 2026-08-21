/**
 * @fileoverview All SQL for the `clicks` table and the analytics aggregate
 * queries derived from it. `services/analytics.service.js` is the only
 * caller. See `migrations/*_init-schema.sql` for the table itself — Phase 0
 * created it ahead of time so this phase is purely "write the queries," no
 * schema change needed.
 * @author Mohit Sharma
 */

import { query, getClient } from "../config/db.js";

/**
 * Records one click and increments the parent link's denormalized counter
 * in the same transaction, so `links.click_count` can never drift from
 * `COUNT(*) FROM clicks WHERE link_id = ...`. Both writes are cheap and
 * local to one row each, so the transaction is short-lived — this isn't the
 * kind of multi-second transaction that would tie up a pool connection.
 *
 * @async
 * @param {object} params
 * @param {bigint | string} params.linkId
 * @param {string | null} params.ipHash
 * @param {string | null} params.country
 * @param {string | null} params.referrer
 * @param {string | null} params.deviceType
 * @param {string | null} params.browser
 * @param {string | null} params.os
 * @returns {Promise<object>} The inserted click row.
 */
export async function recordClick({ linkId, ipHash, country, referrer, deviceType, browser, os }) {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO clicks (link_id, ip_hash, country, referrer, device_type, browser, os)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [linkId, ipHash, country, referrer, deviceType, browser, os]
    );
    await client.query(`UPDATE links SET click_count = click_count + 1 WHERE id = $1`, [linkId]);
    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Total clicks and distinct visitors (by `ip_hash`) for a link within the
 * last `sinceDays` days. One query for both so they're always consistent
 * with each other (same WHERE clause, same instant).
 *
 * @async
 * @param {bigint | string} linkId
 * @param {number} sinceDays
 * @returns {Promise<{total: number, uniqueVisitors: number}>}
 */
export async function getClickStats(linkId, sinceDays) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total, COUNT(DISTINCT ip_hash)::int AS unique_visitors
     FROM clicks
     WHERE link_id = $1 AND clicked_at >= now() - make_interval(days => $2::int)`,
    [linkId, sinceDays]
  );
  return { total: rows[0].total, uniqueVisitors: rows[0].unique_visitors };
}

/**
 * Daily click counts for a link within the last `sinceDays` days, oldest
 * first — the time series a "clicks over time" chart wants.
 *
 * @async
 * @param {bigint | string} linkId
 * @param {number} sinceDays
 * @returns {Promise<Array<{day: string, count: number}>>}
 */
export async function getClicksByDay(linkId, sinceDays) {
  const { rows } = await query(
    `SELECT date_trunc('day', clicked_at)::date AS day, COUNT(*)::int AS count
     FROM clicks
     WHERE link_id = $1 AND clicked_at >= now() - make_interval(days => $2::int)
     GROUP BY day
     ORDER BY day ASC`,
    [linkId, sinceDays]
  );
  return rows;
}

/**
 * Most common referrers for a link within the last `sinceDays` days, busiest
 * first. A direct visit (no `Referer` header) groups under `"direct"` rather
 * than `NULL` so it shows up as its own labelled bucket instead of vanishing
 * from a `GROUP BY`.
 *
 * @async
 * @param {bigint | string} linkId
 * @param {number} sinceDays
 * @param {number} limit
 * @returns {Promise<Array<{referrer: string, count: number}>>}
 */
export async function getTopReferrers(linkId, sinceDays, limit) {
  const { rows } = await query(
    `SELECT COALESCE(referrer, 'direct') AS referrer, COUNT(*)::int AS count
     FROM clicks
     WHERE link_id = $1 AND clicked_at >= now() - make_interval(days => $2::int)
     GROUP BY referrer
     ORDER BY count DESC
     LIMIT $3`,
    [linkId, sinceDays, limit]
  );
  return rows;
}

/** Columns `getBreakdown` is allowed to group by — see its own doc for why. */
export const BREAKDOWN_COLUMNS = Object.freeze(["device_type", "browser", "os"]);

/**
 * Click counts for a link grouped by one column, busiest first — used for
 * the device/browser/os breakdowns. `column` is interpolated directly
 * because a `$n` placeholder can only bind a value, never an identifier;
 * this is safe only because every call site in this codebase passes one of
 * the fixed literals in {@link BREAKDOWN_COLUMNS}, never a caller-supplied
 * string — there is no HTTP-reachable path where `column` originates from
 * request input.
 *
 * @async
 * @param {bigint | string} linkId
 * @param {number} sinceDays
 * @param {"device_type" | "browser" | "os"} column
 * @returns {Promise<Array<{value: string | null, count: number}>>}
 */
export async function getBreakdown(linkId, sinceDays, column) {
  const { rows } = await query(
    `SELECT ${column} AS value, COUNT(*)::int AS count
     FROM clicks
     WHERE link_id = $1 AND clicked_at >= now() - make_interval(days => $2::int)
     GROUP BY ${column}
     ORDER BY count DESC`,
    [linkId, sinceDays]
  );
  return rows;
}
