/**
 * @fileoverview QR code for a short link, rendered client-side (no backend
 * endpoint needed — the short URL is all a QR code encodes). Lets the user
 * pick the code's color from a preset palette or a custom picker, Bitly's
 * QR customizer being the reference point, and download the result as a
 * PNG.
 * @author Mohit Sharma
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeCanvas } from "qrcode.react";

const PRESET_COLORS = [
  { label: "Black", value: "#16181d" },
  { label: "Orange", value: "#ea580c" },
  { label: "Blue", value: "#2563eb" },
  { label: "Green", value: "#15803d" },
  { label: "Purple", value: "#7c3aed" },
  { label: "Red", value: "#dc2626" },
];

/**
 * @param {object} props
 * @param {import('../api/links.js').LinkDto} props.link
 * @param {() => void} props.onClose
 * @returns {JSX.Element}
 */
export function QRCodeModal({ link, onClose }) {
  const [color, setColor] = useState(PRESET_COLORS[0].value);
  const canvasRef = useRef(null);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  function handleDownload() {
    const canvas = canvasRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link_ = document.createElement("a");
    link_.href = canvas.toDataURL("image/png");
    link_.download = `${link.shortCode}-qr.png`;
    link_.click();
  }

  const isCustomColor = !PRESET_COLORS.some((preset) => preset.value === color);

  // Portaled to document.body — this can be triggered from inside a <tr>
  // (LinkRow's actions cell), and a <tr> can only validly contain <td>/<th>
  // as direct children. Rendering the overlay in-place there would be
  // invalid HTML the browser silently "fixes" by relocating it, which is
  // not something to depend on.
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel qr-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h3 className="qr-modal__title">QR code</h3>
        <p className="qr-modal__subtitle">Scans straight to {link.shortUrl}</p>

        <div className="qr-modal__preview" ref={canvasRef}>
          <QRCodeCanvas value={link.shortUrl} size={200} fgColor={color} bgColor="#ffffff" level="M" marginSize={2} />
        </div>

        <div className="qr-modal__colors">
          <span className="qr-modal__colors-label">Color</span>
          <div className="qr-modal__swatches">
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`qr-swatch ${color === preset.value ? "qr-swatch--selected" : ""}`}
                style={{ background: preset.value }}
                aria-label={preset.label}
                aria-pressed={color === preset.value}
                onClick={() => setColor(preset.value)}
              />
            ))}
            <label
              className={`qr-swatch qr-swatch--custom ${isCustomColor ? "qr-swatch--selected" : ""}`}
              style={isCustomColor ? { background: color } : undefined}
              aria-label="Custom color"
            >
              {!isCustomColor && (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              )}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-hidden="true" />
            </label>
          </div>
        </div>

        <button type="button" className="btn btn--primary qr-modal__download" onClick={handleDownload}>
          Download PNG
        </button>
      </div>
    </div>,
    document.body
  );
}
