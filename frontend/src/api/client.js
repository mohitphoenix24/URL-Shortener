/**
 * @fileoverview Shared Axios instance for talking to the URL Shortener API.
 * Every API call in this app goes through here so error handling — and, as
 * of Phase 2, auth — stays in one place — components deal with a plain
 * `{ message, code, details }` error shape, never raw Axios/HTTP internals.
 * @author Mohit Sharma
 */

import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4500";

/**
 * The shared HTTP client. `withCredentials` is required for the refresh-
 * token cookie to be sent on `/api/v1/auth/*` requests at all — without it,
 * the browser silently withholds cross-origin cookies even with a matching
 * CORS policy.
 * @type {import('axios').AxiosInstance}
 */
export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 10_000,
});

/**
 * The current access token, held in memory only (never localStorage — an
 * XSS payload can read localStorage, but not a plain JS closure variable
 * that isn't attached to `window`). `context/AuthContext.jsx` is the only
 * code that should call the setter; everything else just benefits from it
 * being attached to requests automatically below.
 * @type {string | null}
 */
let accessToken = null;

/** @param {string | null} token */
export function setAccessToken(token) {
  accessToken = token;
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/**
 * Called once, by `AuthContext`, when a refresh ultimately fails (no
 * session to restore, or a mid-session refresh came back rejected) — lets
 * the UI drop back to a logged-out state without this module needing to
 * know anything about React.
 * @type {(() => void) | null}
 */
let onSessionExpired = null;

/** @param {() => void} callback */
export function setOnSessionExpired(callback) {
  onSessionExpired = callback;
}

/**
 * Ensures at most one `/auth/refresh` call is EVER in flight at a time,
 * app-wide — this is the ONLY function anywhere in the frontend allowed to
 * call the refresh endpoint; `api/auth.js`'s `refresh()` and
 * `AuthContext`'s startup session-restore both delegate here rather than
 * hitting the endpoint themselves. That's not a style preference: the
 * backend's refresh token is single-use (rotated on every call, see
 * docs/decisions.md), so two independent, undeduplicated calls firing at
 * the same moment — which genuinely happens, e.g. React 19 StrictMode
 * double-invoking an effect in development — present the SAME cookie
 * twice. The first succeeds and rotates it; the second, now presenting an
 * already-rotated token, trips the backend's reuse-detection and revokes
 * *every* session on the account, including the one the first call just
 * legitimately created. Caught exactly this happening in manual testing
 * before centralizing the call here.
 * @type {Promise<{accessToken: string}> | null}
 */
let refreshPromise = null;

/**
 * @returns {Promise<{user: object, accessToken: string}>}
 */
export function refreshSession() {
  refreshPromise ??= apiClient
    .post("/api/v1/auth/refresh")
    .then((res) => res.data.data)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

/**
 * Normalizes any Axios error into the shape the backend actually sends:
 * `{ error: { code, message, details } }`. Network failures (backend not
 * running, CORS misconfigured, etc.) get a synthetic code so the UI can
 * still show something sensible instead of a blank error.
 *
 * @param {import('axios').AxiosError} error
 * @returns {{message: string, code: string, details?: unknown, status?: number}}
 */
function normalizeError(error) {
  const payload = error.response?.data?.error;
  if (payload) {
    return { message: payload.message, code: payload.code, details: payload.details, status: error.response.status };
  }
  if (error.request) {
    return { message: "Could not reach the API — is the backend running?", code: "NETWORK_ERROR" };
  }
  return { message: error.message || "Unexpected error", code: "UNKNOWN_ERROR" };
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthRoute = originalRequest?.url?.startsWith("/api/v1/auth/");

    // A 401 from a non-auth route means the access token expired mid-session
    // (it's a normal 15-minute event, not an error state) — try exactly once
    // to silently refresh and replay the original request before giving up.
    // `_retried` prevents a refreshed-but-still-401 response from looping.
    if (error.response?.status === 401 && !isAuthRoute && !originalRequest._retried) {
      originalRequest._retried = true;
      try {
        const { accessToken: newToken } = await refreshSession();
        setAccessToken(newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch {
        setAccessToken(null);
        onSessionExpired?.();
        return Promise.reject(normalizeError(error));
      }
    }

    return Promise.reject(normalizeError(error));
  }
);
