/**
 * @fileoverview Typed-in-spirit wrappers around every `/api/v1/links`
 * endpoint the backend exposes. Nothing here holds state or touches the
 * DOM — components own that; this file only knows how to talk to the API.
 * @author Mohit Sharma
 */

import { apiClient } from "./client.js";

/**
 * @typedef {object} LinkDto
 * @property {string} id
 * @property {string} shortCode
 * @property {string} shortUrl
 * @property {string} longUrl
 * @property {string | null} userId
 * @property {string | null} title
 * @property {string | null} expiresAt
 * @property {boolean} isActive
 * @property {number} clickCount
 * @property {string} createdAt
 */

/**
 * Creates a new short link.
 *
 * @async
 * @param {object} payload
 * @param {string} payload.longUrl
 * @param {string} [payload.customAlias]
 * @param {string} [payload.title]
 * @param {string} [payload.expiresAt] - ISO datetime string.
 * @param {"auto" | "random"} [payload.mode="auto"]
 * @returns {Promise<LinkDto>}
 */
export async function createLink({ longUrl, customAlias, title, expiresAt, mode = "auto" }) {
  const body = { longUrl };
  if (customAlias) body.customAlias = customAlias;
  if (title) body.title = title;
  if (expiresAt) body.expiresAt = expiresAt;

  const { data } = await apiClient.post("/api/v1/links", body, { params: { mode } });
  return data.data;
}

/**
 * Fetches a paginated, filterable, sortable page of links.
 *
 * @async
 * @param {object} params
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @param {string} [params.sort] - e.g. "createdAt:desc", "clickCount:asc".
 * @param {boolean} [params.isActive]
 * @param {string} [params.search]
 * @returns {Promise<{data: LinkDto[], pagination: {page: number, limit: number, total: number, totalPages: number, hasNext: boolean, hasPrev: boolean}}>}
 */
export async function listLinks(params) {
  const { data } = await apiClient.get("/api/v1/links", { params });
  return data;
}

/**
 * @async
 * @param {string} id
 * @param {{title?: string | null, expiresAt?: string | null, isActive?: boolean}} fields
 * @returns {Promise<LinkDto>}
 */
export async function updateLink(id, fields) {
  const { data } = await apiClient.patch(`/api/v1/links/${id}`, fields);
  return data.data;
}

/**
 * Soft-deletes a link.
 * @async
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteLink(id) {
  await apiClient.delete(`/api/v1/links/${id}`);
}
