/**
 * @fileoverview Alias values a user is not allowed to claim as a custom
 * short code, because they'd collide with real routes on this API or with
 * paths the frontend serves. `GET /:code` is a single-segment catch-all
 * mounted after every other route, so these are already unreachable as
 * short codes in practice — this list turns that silent shadowing into an
 * explicit 409 at creation time instead of a confusing "my link doesn't
 * work" report later.
 * @author Mohit Sharma
 */

/** @type {ReadonlySet<string>} */
export const RESERVED_ALIASES = new Set([
  "api",
  "admin",
  "app",
  "healthz",
  "readyz",
  "metrics",
  "docs",
  "openapi",
  "static",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]);

/**
 * @param {string} alias
 * @returns {boolean} True if the alias is reserved and cannot be used.
 */
export function isReservedAlias(alias) {
  return RESERVED_ALIASES.has(alias.toLowerCase());
}
