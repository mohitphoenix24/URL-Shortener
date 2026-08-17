/**
 * @fileoverview All SQL for the `refresh_tokens` table — the persisted
 * half of the refresh-token hybrid described in `utils/jwt.js`. Rows are
 * never deleted, only marked `revoked_at`, so a reused (already-rotated)
 * token can still be recognized as reuse rather than looking like "unknown
 * token" (see `services/auth.service.js`'s reuse-detection branch).
 * @author Mohit Sharma
 */

import { query } from "../config/db.js";

/**
 * @async
 * @param {{userId: string | bigint, tokenHash: string, expiresAt: Date}} params
 * @returns {Promise<object>} The inserted row.
 */
export async function insertRefreshToken({ userId, tokenHash, expiresAt }) {
  const { rows } = await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING *`,
    [userId, tokenHash, expiresAt]
  );
  return rows[0];
}

/**
 * @async
 * @param {string} tokenHash
 * @returns {Promise<object | undefined>}
 */
export async function findByTokenHash(tokenHash) {
  const { rows } = await query(`SELECT * FROM refresh_tokens WHERE token_hash = $1`, [tokenHash]);
  return rows[0];
}

/**
 * Marks a single token row revoked (used on logout and on rotation, where
 * the old token is revoked the instant a new one is issued).
 * @async
 * @param {string | bigint} id
 * @returns {Promise<void>}
 */
export async function revokeById(id) {
  await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [id]);
}

/**
 * Revokes every active token for a user — the "kill all sessions" response
 * to detected refresh-token reuse (a strong signal of token theft), and
 * generally useful for a future "log out everywhere" feature.
 * @async
 * @param {string | bigint} userId
 * @returns {Promise<void>}
 */
export async function revokeAllForUser(userId) {
  await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
}
