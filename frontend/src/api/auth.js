/**
 * @fileoverview Wrappers around every `/api/v1/auth` endpoint. Like
 * `api/links.js`, this file only knows how to talk to the API — session
 * state lives in `context/AuthContext.jsx`.
 * @author Mohit Sharma
 */

import { apiClient, refreshSession } from "./client.js";

/**
 * @typedef {object} AuthUser
 * @property {string} id
 * @property {string} email
 * @property {"user" | "admin"} role
 */

/**
 * Registers a new account and starts a session in the same call — the
 * backend logs you in immediately on successful registration. The refresh
 * token is set as an httpOnly cookie by the backend; only the access token
 * comes back here.
 *
 * @async
 * @param {{email: string, password: string}} credentials
 * @returns {Promise<{user: AuthUser, accessToken: string}>}
 */
export async function register(credentials) {
  const { data } = await apiClient.post("/api/v1/auth/register", credentials);
  return data.data;
}

/**
 * @async
 * @param {{email: string, password: string}} credentials
 * @returns {Promise<{user: AuthUser, accessToken: string}>}
 */
export async function login(credentials) {
  const { data } = await apiClient.post("/api/v1/auth/login", credentials);
  return data.data;
}

/**
 * Exchanges the httpOnly refresh cookie for a new access token (and a
 * rotated refresh cookie, set automatically by the response). Used both to
 * restore a session on page load and by the response interceptor in
 * `api/client.js` when an access token expires mid-session — both callers
 * go through `refreshSession()`'s single shared in-flight promise rather
 * than calling the endpoint directly, since the refresh token is single-
 * use and two concurrent calls would trip the backend's reuse-detection
 * against each other (see the comment on `refreshSession` for how this was
 * actually caught in testing, not just theorized).
 *
 * @async
 * @returns {Promise<{user: AuthUser, accessToken: string}>}
 */
export async function refresh() {
  return refreshSession();
}

/**
 * @async
 * @returns {Promise<void>}
 */
export async function logout() {
  await apiClient.post("/api/v1/auth/logout");
}
