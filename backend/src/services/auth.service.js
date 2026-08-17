/**
 * @fileoverview Business rules for registration, login, refresh-token
 * rotation (with reuse detection), and logout. Like every other service in
 * this app, never imports `express` and never sees `req`/`res`.
 *
 * The session model is a hybrid, deliberately: access tokens are pure
 * stateless JWTs (cheap to verify on every request, never touch Postgres);
 * refresh tokens are ALSO signed JWTs, but every one issued is persisted
 * (hashed) in `refresh_tokens` so it can be revoked — a capability a bare
 * JWT can never have, since a valid signature can't be "un-signed" early.
 * @author Mohit Sharma
 */

import bcrypt from "bcrypt";
import * as userRepository from "../repositories/user.repository.js";
import * as refreshTokenRepository from "../repositories/refreshToken.repository.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { hashToken } from "../utils/hash.js";
import { toUserDto } from "../utils/mappers.js";
import { AppError } from "../utils/AppError.js";

const BCRYPT_ROUNDS = 12;

/** @param {unknown} err @returns {boolean} True if it's a Postgres unique-violation. */
function isUniqueViolation(err) {
  return err?.code === "23505";
}

/**
 * Issues a fresh access+refresh pair for a user and persists the refresh
 * token (hashed). Shared by register, login, and refresh — every path that
 * ends in "the caller now has a valid session" goes through here, so the
 * issuance/storage logic exists in exactly one place.
 *
 * @async
 * @param {object} userRow - Raw `users` table row.
 * @returns {Promise<{user: object, accessToken: string, refreshToken: string, refreshTokenExpiresAt: Date}>}
 */
async function issueSession(userRow) {
  const accessToken = signAccessToken(userRow);
  const { token: refreshToken, expiresAt: refreshTokenExpiresAt } = signRefreshToken(userRow);

  await refreshTokenRepository.insertRefreshToken({
    userId: userRow.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshTokenExpiresAt,
  });

  return { user: toUserDto(userRow), accessToken, refreshToken, refreshTokenExpiresAt };
}

/**
 * Registers a new user and immediately logs them in (returns a session,
 * same as `login` would).
 *
 * @async
 * @param {{email: string, password: string}} input
 * @returns {Promise<{user: object, accessToken: string, refreshToken: string, refreshTokenExpiresAt: Date}>}
 * @throws {AppError} 409 if the email is already registered.
 */
export async function register({ email, password }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  let userRow;
  try {
    userRow = await userRepository.insertUser({ email, passwordHash });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw AppError.conflict("An account with this email already exists", "EMAIL_TAKEN");
    }
    throw err;
  }

  return issueSession(userRow);
}

/**
 * @async
 * @param {{email: string, password: string}} input
 * @returns {Promise<{user: object, accessToken: string, refreshToken: string, refreshTokenExpiresAt: Date}>}
 * @throws {AppError} 401 for a wrong email or password — deliberately the
 *   same message and code for both, so a failed login can't be used to
 *   enumerate which emails are registered.
 */
export async function login({ email, password }) {
  const userRow = await userRepository.findByEmail(email);
  const passwordMatches = userRow ? await bcrypt.compare(password, userRow.password_hash) : false;

  if (!userRow || !passwordMatches) {
    throw AppError.unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
  }

  return issueSession(userRow);
}

/**
 * Rotates a refresh token: verifies it, checks it against the database,
 * and — if valid — revokes it and issues a brand new access+refresh pair.
 * The old token can never be used again after this call succeeds.
 *
 * Reuse detection: if the presented token's hash matches a row that's
 * ALREADY revoked, that's not an expired-token situation (those get their
 * own check) — it means someone presented a token that was already rotated
 * away, which only happens if it leaked and both the legitimate client and
 * an attacker tried to use it. The response is to revoke every active
 * session for that user, not just reject this one request — the standard
 * "refresh token rotation with reuse detection" pattern.
 *
 * @async
 * @param {string | undefined} rawToken
 * @returns {Promise<{user: object, accessToken: string, refreshToken: string, refreshTokenExpiresAt: Date}>}
 * @throws {AppError} 401 for a missing, invalid, expired, unknown, or reused token.
 */
export async function refresh(rawToken) {
  if (!rawToken) {
    throw AppError.unauthorized("Refresh token required", "REFRESH_TOKEN_REQUIRED");
  }

  try {
    verifyRefreshToken(rawToken);
  } catch {
    throw AppError.unauthorized("Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
  }

  const tokenHash = hashToken(rawToken);
  const row = await refreshTokenRepository.findByTokenHash(tokenHash);

  if (!row) {
    throw AppError.unauthorized("Invalid refresh token", "INVALID_REFRESH_TOKEN");
  }

  if (row.revoked_at) {
    await refreshTokenRepository.revokeAllForUser(row.user_id);
    throw AppError.unauthorized(
      "This refresh token was already used — all sessions for this account have been revoked",
      "REFRESH_TOKEN_REUSED"
    );
  }

  // Defense in depth: the JWT's own `exp` claim already makes an expired
  // token fail `verifyRefreshToken` above, but checking the DB-stored
  // expiry too means the two sources of truth can never silently disagree.
  if (new Date(row.expires_at) < new Date()) {
    throw AppError.unauthorized("Refresh token expired", "REFRESH_TOKEN_EXPIRED");
  }

  const userRow = await userRepository.findById(row.user_id);
  if (!userRow) {
    throw AppError.unauthorized("Account no longer exists", "USER_NOT_FOUND");
  }

  await refreshTokenRepository.revokeById(row.id);
  return issueSession(userRow);
}

/**
 * Revokes a single refresh token. Silently succeeds even if the token is
 * missing, unknown, or already revoked — logout is idempotent by design,
 * and an error response here would leak whether a given token was ever
 * valid to whoever's asking.
 *
 * @async
 * @param {string | undefined} rawToken
 * @returns {Promise<void>}
 */
export async function logout(rawToken) {
  if (!rawToken) return;

  const row = await refreshTokenRepository.findByTokenHash(hashToken(rawToken));
  if (row && !row.revoked_at) {
    await refreshTokenRepository.revokeById(row.id);
  }
}
