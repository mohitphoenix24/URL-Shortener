/**
 * @fileoverview Controls for the links table's filter/sort/pagination query
 * params — exists mainly to exercise the backend's `GET /api/v1/links`
 * filtering and sorting, not just its happy path.
 * @author Mohit Sharma
 */

/**
 * @param {object} props
 * @param {string} props.search
 * @param {(value: string) => void} props.onSearchChange
 * @param {"" | "true" | "false"} props.isActive
 * @param {(value: "" | "true" | "false") => void} props.onIsActiveChange
 * @param {string} props.sort
 * @param {(value: string) => void} props.onSortChange
 * @returns {JSX.Element}
 */
export function LinkFilters({ search, onSearchChange, isActive, onIsActiveChange, sort, onSortChange }) {
  return (
    <div className="link-filters">
      <input
        type="text"
        className="link-filters__search"
        placeholder="Search title or URL…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <select value={isActive} onChange={(e) => onIsActiveChange(e.target.value)}>
        <option value="">All statuses</option>
        <option value="true">Active only</option>
        <option value="false">Disabled only</option>
      </select>

      <select value={sort} onChange={(e) => onSortChange(e.target.value)}>
        <option value="createdAt:desc">Newest first</option>
        <option value="createdAt:asc">Oldest first</option>
        <option value="clickCount:desc">Most clicked</option>
        <option value="clickCount:asc">Least clicked</option>
        <option value="expiresAt:desc">Expiry, latest first</option>
      </select>
    </div>
  );
}
