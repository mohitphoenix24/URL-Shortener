/**
 * @fileoverview Renders whatever toasts `useToasts` currently holds, fixed
 * to the bottom-right of the viewport.
 * @author Mohit Sharma
 */

import { useToasts } from "../hooks/useToasts.js";

/**
 * @returns {JSX.Element}
 */
export function ToastStack() {
  const toasts = useToasts();

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
