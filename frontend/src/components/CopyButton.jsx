/**
 * @fileoverview Small "Copy" button using the Clipboard API, with a brief
 * "Copied!" state instead of a toast — copying is frequent enough that a
 * toast per click would be noisy.
 * @author Mohit Sharma
 */

import { useState } from "react";

/**
 * @param {object} props
 * @param {string} props.text - The text to copy.
 * @param {string} [props.className]
 * @returns {JSX.Element}
 */
export function CopyButton({ text, className = "" }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className={`copy-btn ${className}`} onClick={handleCopy}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
