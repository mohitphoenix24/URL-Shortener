/**
 * @fileoverview Small display-formatting helpers shared by table/row components.
 * @author Mohit Sharma
 */

/**
 * @param {string | null} isoDate
 * @returns {string} A short locale date, or "—" if null.
 */
export function formatDate(isoDate) {
  if (!isoDate) return "—";
  return new Date(isoDate).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * @param {string} text
 * @param {number} [maxLength=48]
 * @returns {string} `text` unchanged, or truncated with an ellipsis.
 */
export function truncate(text, maxLength = 48) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 * @param {string | null} expiresAt
 * @returns {boolean} True if `expiresAt` is a timestamp in the past.
 */
export function isExpired(expiresAt) {
  return Boolean(expiresAt) && new Date(expiresAt) < new Date();
}
