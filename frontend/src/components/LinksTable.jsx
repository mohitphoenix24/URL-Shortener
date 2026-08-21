/**
 * @fileoverview The links management table — header row plus one
 * `LinkRow` per link, with empty/loading states handled explicitly rather
 * than left to render an empty `<table>`.
 * @author Mohit Sharma
 */

import { LinkRow } from "./LinkRow.jsx";

/**
 * @param {object} props
 * @param {import('../api/links.js').LinkDto[]} props.links
 * @param {boolean} props.loading
 * @param {(updated: import('../api/links.js').LinkDto) => void} props.onUpdated
 * @param {(id: string) => void} props.onDeleted
 * @returns {JSX.Element}
 */
export function LinksTable({ links, loading, onUpdated, onDeleted }) {
  if (loading) {
    return (
      <div className="links-table__wrapper" aria-busy="true" aria-label="Loading links">
        <table className="links-table">
          <tbody>
            {Array.from({ length: 4 }, (_, i) => (
              <tr className="link-row link-row--skeleton" key={i}>
                <td colSpan={7}>
                  <span className="skeleton-bar" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div className="links-table__empty">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <p>No links yet — shorten one above to get started.</p>
      </div>
    );
  }

  return (
    // Seven columns (including full destination URLs) routinely need more
    // width than the card has, at any viewport — not just the <640px case
    // the CSS used to handle. Scrolling the table horizontally inside its
    // own wrapper keeps the overflow contained; without it, the rightmost
    // column (Actions) bleeds past the card's padding instead of scrolling.
    <div className="links-table__wrapper">
      <table className="links-table">
        <thead>
          <tr>
            <th>Short link</th>
            <th>Destination</th>
            <th>Clicks</th>
            <th>Status</th>
            <th>Created</th>
            <th>Expires</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <LinkRow key={link.id} link={link} onUpdated={onUpdated} onDeleted={onDeleted} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
