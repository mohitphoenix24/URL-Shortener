/**
 * @fileoverview Shared Axios instance for talking to the URL Shortener API.
 * Every API call in this app goes through here so error handling stays in
 * one place — components deal with a plain `{ message, code, details }`
 * shape, never raw Axios/HTTP error internals.
 * @author Mohit Sharma
 */

import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4500";

/**
 * The shared HTTP client. `withCredentials` is on ahead of Phase 2 (refresh
 * tokens will ride as an httpOnly cookie) — harmless no-op until then since
 * this API sets no cookies yet.
 * @type {import('axios').AxiosInstance}
 */
export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 10_000,
});

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
  (error) => Promise.reject(normalizeError(error))
);
