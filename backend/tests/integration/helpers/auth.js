/**
 * @fileoverview Shared helper for the one thing almost every integration
 * test needs before it can do anything else: a logged-in user. Kept in one
 * place so a change to the register response shape only needs updating here.
 * @author Mohit Sharma
 */

import request from "supertest";
import { pool } from "../../../src/config/db.js";

let counter = 0;

/**
 * Registers a fresh user (unique email per call, so tests can call this
 * repeatedly within one file without colliding) and returns everything a
 * test typically needs.
 *
 * @async
 * @param {import('express').Express} app
 * @param {{email?: string, password?: string}} [overrides]
 * @returns {Promise<{user: object, accessToken: string, refreshCookie: string}>}
 */
export async function registerUser(app, overrides = {}) {
  counter += 1;
  const email = overrides.email ?? `test-user-${counter}-${Date.now()}@example.com`;
  const password = overrides.password ?? "password123";

  const res = await request(app).post("/api/v1/auth/register").send({ email, password });
  if (res.status !== 201) {
    throw new Error(`registerUser helper failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const refreshCookie = res.headers["set-cookie"]?.[0];
  return { user: res.body.data.user, accessToken: res.body.data.accessToken, refreshCookie };
}

/**
 * Promotes a user straight to `admin` via a direct SQL update — there is no
 * self-service admin grant in the API (by design, see docs/decisions.md),
 * so tests reach past the HTTP layer the same way a real operator would.
 *
 * @async
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function promoteToAdmin(userId) {
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);
}
