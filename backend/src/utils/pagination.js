/**
 * @fileoverview Shared helpers for paginated, sortable list endpoints
 * (Roadmap Level 4: "Pagination, Filtering, Sorting"). Centralised here so
 * every resource's `GET /` list route builds the same response envelope and
 * — critically — validates `ORDER BY` column names against a whitelist
 * instead of interpolating user input into SQL.
 * @author Mohit Sharma
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Normalizes raw `page`/`limit` query params into safe integers and the
 * `LIMIT`/`OFFSET` values a repository needs. Never trusts the caller's
 * numbers directly — clamps `limit` so a request can't ask for 50,000 rows.
 *
 * @param {{page?: string | number, limit?: string | number}} query
 * @returns {{page: number, limit: number, offset: number}}
 */
export function parsePagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(query.limit, 10) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Parses a `sort` query param like `"createdAt:desc"` or `"clickCount"`
 * into a validated `{ column, direction }`, checked against a caller-supplied
 * whitelist. SQL column/direction can't be parameterized with `$1` style
 * placeholders, so an unvalidated sort param is a direct SQL-injection
 * vector — this function is the only thing standing between a query string
 * and an `ORDER BY` clause.
 *
 * @param {string | undefined} sortParam - Raw query value, e.g. `"clickCount:desc"`.
 * @param {Record<string, string>} allowedColumns - Map of public sort key →
 *   actual SQL column, e.g. `{ createdAt: "created_at", clickCount: "click_count" }`.
 * @param {string} defaultKey - Public key to use when `sortParam` is absent or invalid.
 * @returns {{column: string, direction: "ASC" | "DESC"}}
 */
export function parseSort(sortParam, allowedColumns, defaultKey) {
  const [rawKey, rawDirection] = (sortParam ?? "").split(":");
  const key = allowedColumns[rawKey] ? rawKey : defaultKey;
  const direction = rawDirection?.toUpperCase() === "ASC" ? "ASC" : "DESC";
  return { column: allowedColumns[key], direction };
}

/**
 * Builds the pagination metadata block attached to every list response.
 *
 * @param {{page: number, limit: number, total: number}} params
 * @returns {{page: number, limit: number, total: number, totalPages: number, hasNext: boolean, hasPrev: boolean}}
 */
export function buildPaginationMeta({ page, limit, total }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
