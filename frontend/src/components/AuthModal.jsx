/**
 * @fileoverview Overlay wrapper around `AuthPanel`, opened from the header's
 * "Log in" / "Sign up" buttons instead of the form living inline in the
 * page at all times. Closes on Escape, on backdrop click, or once
 * login/register succeeds.
 * @author Mohit Sharma
 */

import { useEffect } from "react";
import { AuthPanel } from "./AuthPanel.jsx";

/**
 * @param {object} props
 * @param {"login" | "register"} props.mode
 * @param {() => void} props.onClose
 * @returns {JSX.Element}
 */
export function AuthModal({ mode, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    // Prevent the page behind the modal from scrolling while it's open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <AuthPanel initialMode={mode} onSuccess={onClose} />
      </div>
    </div>
  );
}
