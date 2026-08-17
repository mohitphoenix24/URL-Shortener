/**
 * @fileoverview Pure functions that turn a raw Postgres row (snake_case,
 * driver-native types) into the camelCase JSON shape the API returns. Kept
 * separate from both the repository (which should hand back exactly what
 * the database gave it) and the controller (which shouldn't need to know
 * column names), so the response shape can change without touching either.
 * @author Mohit Sharma
 */

import { env } from "../config/env.js";

/**
 * @param {object} row - A raw row from the `links` table.
 * @returns {object} The public API representation of a link.
 */
export function toLinkDto(row) {
  return {
    id: row.id,
    shortCode: row.short_code,
    shortUrl: `${env.APP_BASE_URL}/${row.short_code}`,
    longUrl: row.long_url,
    userId: row.user_id,
    title: row.title,
    expiresAt: row.expires_at,
    isActive: row.is_active,
    clickCount: Number(row.click_count),
    createdAt: row.created_at,
  };
}

/**
 * @param {object} row - A raw row from the `users` table.
 * @returns {object} The public API representation of a user — never
 *   includes `password_hash`, which is the whole point of having this
 *   function instead of returning the row directly.
 */
export function toUserDto(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  };
}
