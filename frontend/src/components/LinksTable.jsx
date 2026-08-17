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
    return <div className="links-table__empty">Loading links…</div>;
  }

  if (links.length === 0) {
    return <div className="links-table__empty">No links yet — shorten one above to get started.</div>;
  }

  return (
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
  );
}
