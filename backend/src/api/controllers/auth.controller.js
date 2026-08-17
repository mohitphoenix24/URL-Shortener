/**
 * @fileoverview HTTP-facing handlers for auth. The refresh token never
 * appears in a JSON response body — it's set as an httpOnly cookie so
 * client-side JavaScript can never read it (the standard defense against
 * an XSS payload exfiltrating it). The access token, by contrast, IS
 * returned in the body: it's short-lived, and the frontend is expected to
 * hold it in memory only (never localStorage) — see
 * `frontend/src/context/AuthContext.jsx`.
 * @author Mohit Sharma
 */

import * as authService from "../../services/auth.service.js";
import { isProduction } from "../../config/env.js";

const REFRESH_COOKIE_NAME = "refreshToken";
// Scoped to /api/v1/auth (not "/") so the browser only ever attaches this
// cookie to auth requests — it's simply not sent on, say, GET /:code or
// POST /api/v1/links, shrinking the set of endpoints that need to think
// about it at all.
const REFRESH_COOKIE_PATH = "/api/v1/auth";

/**
 * @param {import('express').Response} res
 * @param {string} token
 * @param {Date} expiresAt
 * @returns {void}
 */
function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    // "lax" (not "strict") so the cookie still rides along on a top-level
    // GET navigation to this site, while still being withheld from
    // cross-site POSTs — the standard baseline CSRF mitigation for a
    // same-site-in-practice setup like this one (frontend and backend
    // differ only by port locally, which SameSite treats as the same site).
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

/** @param {import('express').Response} res @returns {void} */
function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

/**
 * Reads the refresh token from wherever the caller sent it: the cookie
 * (browser clients) or the body (curl/Postman, which can't easily hold a
 * cookie jar across separate commands).
 * @param {import('express').Request} req
 * @returns {string | undefined}
 */
function extractRefreshToken(req) {
  return req.cookies?.[REFRESH_COOKIE_NAME] || req.valid?.body?.refreshToken;
}

/**
 * POST /api/v1/auth/register
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function register(req, res) {
  const { email, password } = req.valid.body;
  const { user, accessToken, refreshToken, refreshTokenExpiresAt } = await authService.register({ email, password });
  setRefreshCookie(res, refreshToken, refreshTokenExpiresAt);
  res.status(201).json({ data: { user, accessToken } });
}

/**
 * POST /api/v1/auth/login
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function login(req, res) {
  const { email, password } = req.valid.body;
  const { user, accessToken, refreshToken, refreshTokenExpiresAt } = await authService.login({ email, password });
  setRefreshCookie(res, refreshToken, refreshTokenExpiresAt);
  res.status(200).json({ data: { user, accessToken } });
}

/**
 * POST /api/v1/auth/refresh
 * Rotates the refresh token and issues a new access token. The old refresh
 * token is invalidated as part of this call — a client that calls refresh
 * twice with the same token will see the second call rejected (and, per
 * the reuse-detection design, every other session on the account revoked).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function refresh(req, res) {
  const { user, accessToken, refreshToken, refreshTokenExpiresAt } = await authService.refresh(extractRefreshToken(req));
  setRefreshCookie(res, refreshToken, refreshTokenExpiresAt);
  res.status(200).json({ data: { user, accessToken } });
}

/**
 * POST /api/v1/auth/logout
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function logout(req, res) {
  await authService.logout(extractRefreshToken(req));
  clearRefreshCookie(res);
  res.status(204).send();
}

/**
 * GET /api/v1/auth/me — returns the caller's own identity as encoded in
 * their access token. Requires `requireAuth` to have run first.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {void}
 */
export function me(req, res) {
  res.status(200).json({ data: req.user });
}
