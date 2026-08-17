/**
 * @fileoverview All SQL for the `users` table. `services/auth.service.js`
 * is the only caller — nothing else in the app should need to touch a user
 * row directly.
 * @author Mohit Sharma
 */

import { query } from "../config/db.js";

/**
 * @async
 * @param {{email: string, passwordHash: string}} params
 * @returns {Promise<object>} The inserted row.
 * @throws {Error} Postgres error with `code === "23505"` if the email is already registered.
 */
export async function insertUser({ email, passwordHash }) {
  const { rows } = await query(`INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *`, [
    email,
    passwordHash,
  ]);
  return rows[0];
}

/**
 * Looks up a user by email. `email` is a `CITEXT` column, so this is
 * case-insensitive by design at the database level — no `LOWER()` needed here.
 *
 * @async
 * @param {string} email
 * @returns {Promise<object | undefined>}
 */
export async function findByEmail(email) {
  const { rows } = await query(`SELECT * FROM users WHERE email = $1`, [email]);
  return rows[0];
}

/**
 * @async
 * @param {string | bigint} id
 * @returns {Promise<object | undefined>}
 */
export async function findById(id) {
  const { rows } = await query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0];
}
