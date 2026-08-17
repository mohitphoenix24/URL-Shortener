/**
 * @fileoverview Signing and verification for both token types this app
 * issues. Access tokens are purely stateless (verified by signature alone,
 * never touch the database) — that's what makes them cheap to check on
 * every request. Refresh tokens are a hybrid: still a signed, stateless-
 * verifiable JWT, but ALSO persisted (hashed) in `refresh_tokens` so they
 * can be revoked and rotated — something a pure JWT can never support,
 * since a signature alone can't be "un-signed" early. See
 * `services/auth.service.js` for how the two checks combine on refresh.
 * @author Mohit Sharma
 */

import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";

/**
 * @typedef {object} AuthUser
 * @property {string | bigint} id
 * @property {string} email
 * @property {"user" | "admin"} role
 */

/**
 * Signs a short-lived access token. Payload is intentionally minimal (no
 * DB round trip needed to authorize a request) — `sub` is always coerced to
 * a string because bigint has no JSON representation and pg returns bigint
 * columns as strings anyway, so this keeps ids consistent everywhere.
 *
 * @param {AuthUser} user
 * @returns {string} A signed JWT, expires per `JWT_ACCESS_TTL`.
 */
export function signAccessToken(user) {
  return jwt.sign({ sub: String(user.id), email: user.email, role: user.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  });
}

/**
 * Signs a refresh token. Includes a random `jti` so two tokens issued in
 * the same second for the same user are still guaranteed distinct (and
 * therefore hash to distinct, independently-revocable rows).
 *
 * @param {AuthUser} user
 * @returns {{token: string, expiresAt: Date}} The signed JWT and its exact
 *   expiry as a Date, read back from the token's own `exp` claim so the DB
 *   record can never drift from what the token itself says.
 */
export function signRefreshToken(user) {
  const token = jwt.sign({ sub: String(user.id), jti: randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  });
  const { exp } = jwt.decode(token);
  return { token, expiresAt: new Date(exp * 1000) };
}

/**
 * @param {string} token
 * @returns {{sub: string, email: string, role: string}} The decoded payload.
 * @throws {import('jsonwebtoken').JsonWebTokenError | import('jsonwebtoken').TokenExpiredError}
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

/**
 * @param {string} token
 * @returns {{sub: string, jti: string}} The decoded payload.
 * @throws {import('jsonwebtoken').JsonWebTokenError | import('jsonwebtoken').TokenExpiredError}
 */
export function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}
