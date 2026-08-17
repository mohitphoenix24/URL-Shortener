/**
 * @fileoverview The "here's your shortened link" banner shown right below
 * the hero form after a successful create — the Bitly pattern of surfacing
 * the result immediately instead of making the user scroll to find it in
 * the table.
 * @author Mohit Sharma
 */

import { CopyButton } from "./CopyButton.jsx";

/**
 * @param {object} props
 * @param {import('../api/links.js').LinkDto} props.link
 * @param {() => void} props.onDismiss
 * @returns {JSX.Element}
 */
export function ResultCard({ link, onDismiss }) {
  return (
    <div className="result-card">
      <div className="result-card__info">
        <span className="result-card__label">Your shortened link</span>
        <a className="result-card__url" href={link.shortUrl} target="_blank" rel="noreferrer">
          {link.shortUrl}
        </a>
        <span className="result-card__original" title={link.longUrl}>
          → {link.longUrl}
        </span>
      </div>
      <div className="result-card__actions">
        <CopyButton text={link.shortUrl} className="copy-btn--primary" />
        <button type="button" className="btn btn--ghost" onClick={onDismiss}>
          ✕
        </button>
      </div>
    </div>
  );
}
