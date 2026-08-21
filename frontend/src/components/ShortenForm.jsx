/**
 * @fileoverview The Bitly-style hero form: one big input for the long URL,
 * with the rarer options (custom alias, title, expiry, random-code mode)
 * tucked behind a "Customize" toggle so the common case stays a single
 * field + button.
 * @author Mohit Sharma
 */

import { useState } from "react";
import { createLink } from "../api/links.js";
import { pushToast } from "../hooks/useToasts.js";

/**
 * @param {object} props
 * @param {(link: import('../api/links.js').LinkDto) => void} props.onCreated - Called with the newly created link.
 * @returns {JSX.Element}
 */
export function ShortenForm({ onCreated }) {
  const [longUrl, setLongUrl] = useState("");
  const [customAlias, setCustomAlias] = useState("");
  const [title, setTitle] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [randomMode, setRandomMode] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /** @param {React.FormEvent} event */
  async function handleSubmit(event) {
    event.preventDefault();
    if (!longUrl.trim()) return;

    setSubmitting(true);
    try {
      const link = await createLink({
        longUrl: longUrl.trim(),
        customAlias: customAlias.trim() || undefined,
        title: title.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        mode: randomMode ? "random" : "auto",
      });

      onCreated(link);
      pushToast(`Shortened → ${link.shortUrl}`, "success");
      setLongUrl("");
      setCustomAlias("");
      setTitle("");
      setExpiresAt("");
    } catch (err) {
      const detail = err.details?.[0]?.message;
      pushToast(detail ? `${err.message}: ${detail}` : err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="shorten-form" onSubmit={handleSubmit}>
      <div className="shorten-form__main">
        <input
          type="text"
          className="shorten-form__input"
          placeholder="Paste a long URL to shorten"
          value={longUrl}
          onChange={(e) => setLongUrl(e.target.value)}
          required
        />
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? "Shortening…" : "Shorten"}
        </button>
      </div>

      <button
        type="button"
        className="shorten-form__advanced-toggle"
        aria-expanded={showAdvanced}
        onClick={() => setShowAdvanced((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="6" x2="20" y2="6" />
          <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
          <line x1="4" y1="18" x2="20" y2="18" />
          <circle cx="11" cy="18" r="2" fill="currentColor" stroke="none" />
        </svg>
        {showAdvanced ? "Hide options" : "Customize your link"}
        <svg
          className="shorten-form__advanced-toggle-chevron"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {showAdvanced && (
        <div className="shorten-form__advanced">
          <label className="field">
            <span className="field__label">Custom alias</span>
            <input
              type="text"
              placeholder="e.g. my-launch"
              value={customAlias}
              onChange={(e) => setCustomAlias(e.target.value)}
              disabled={randomMode}
            />
          </label>

          <label className="field">
            <span className="field__label">Title</span>
            <input type="text" placeholder="Optional note" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className="field">
            <span className="field__label">Expires at</span>
            <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </label>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={randomMode}
              onChange={(e) => setRandomMode(e.target.checked)}
              disabled={Boolean(customAlias.trim())}
            />
            <span>Unguessable random code (ignored if a custom alias is set)</span>
          </label>
        </div>
      )}
    </form>
  );
}
