/**
 * @fileoverview A single row in the links table: the short/long URL pair,
 * click count, an active/disabled toggle wired straight to `PATCH
 * /api/v1/links/:id`, and delete. Each row owns its own in-flight state so
 * one row's toggle/delete never disables the whole table.
 * @author Mohit Sharma
 */

import { useState } from "react";
import { updateLink, deleteLink } from "../api/links.js";
import { pushToast } from "../hooks/useToasts.js";
import { formatDate, truncate, isExpired } from "../utils/format.js";
import { CopyButton } from "./CopyButton.jsx";

/**
 * @param {object} props
 * @param {import('../api/links.js').LinkDto} props.link
 * @param {(updated: import('../api/links.js').LinkDto) => void} props.onUpdated
 * @param {(id: string) => void} props.onDeleted
 * @returns {JSX.Element}
 */
export function LinkRow({ link, onUpdated, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const expired = isExpired(link.expiresAt);

  async function handleToggleActive() {
    setBusy(true);
    try {
      const updated = await updateLink(link.id, { isActive: !link.isActive });
      onUpdated(updated);
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${link.shortCode}"? This can't be undone from the UI.`)) return;
    setBusy(true);
    try {
      await deleteLink(link.id);
      onDeleted(link.id);
      pushToast(`Deleted "${link.shortCode}"`, "success");
    } catch (err) {
      pushToast(err.message, "error");
      setBusy(false);
    }
  }

  return (
    <tr className={busy ? "link-row link-row--busy" : "link-row"}>
      <td>
        <div className="link-row__short">
          <a href={link.shortUrl} target="_blank" rel="noreferrer">
            /{link.shortCode}
          </a>
          <CopyButton text={link.shortUrl} className="copy-btn--inline" />
        </div>
        {link.title && <div className="link-row__title">{link.title}</div>}
      </td>
      <td>
        <span className="link-row__long" title={link.longUrl}>
          {truncate(link.longUrl)}
        </span>
      </td>
      <td className="link-row__clicks">{link.clickCount}</td>
      <td>
        <span className={`badge ${expired ? "badge--expired" : link.isActive ? "badge--active" : "badge--disabled"}`}>
          {expired ? "Expired" : link.isActive ? "Active" : "Disabled"}
        </span>
      </td>
      <td className="link-row__date">{formatDate(link.createdAt)}</td>
      <td className="link-row__date">{formatDate(link.expiresAt)}</td>
      <td>
        <div className="link-row__actions">
          <label className="switch">
            <input type="checkbox" checked={link.isActive} disabled={busy} onChange={handleToggleActive} />
            <span className="switch__track" />
          </label>
          <button type="button" className="btn btn--danger-ghost" disabled={busy} onClick={handleDelete}>
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
