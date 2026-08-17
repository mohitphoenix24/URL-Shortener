/**
 * @fileoverview Prev/next pagination controls, driven entirely by the
 * `pagination` block the backend returns — no page-count math is
 * duplicated on the frontend.
 * @author Mohit Sharma
 */

/**
 * @param {object} props
 * @param {{page: number, totalPages: number, total: number, hasNext: boolean, hasPrev: boolean}} props.pagination
 * @param {(page: number) => void} props.onPageChange
 * @returns {JSX.Element}
 */
export function Pagination({ pagination, onPageChange }) {
  const { page, totalPages, total, hasNext, hasPrev } = pagination;

  return (
    <div className="pagination">
      <span className="pagination__summary">
        {total} link{total === 1 ? "" : "s"} · page {page} of {totalPages}
      </span>
      <div className="pagination__controls">
        <button type="button" className="btn btn--ghost" disabled={!hasPrev} onClick={() => onPageChange(page - 1)}>
          ← Prev
        </button>
        <button type="button" className="btn btn--ghost" disabled={!hasNext} onClick={() => onPageChange(page + 1)}>
          Next →
        </button>
      </div>
    </div>
  );
}
