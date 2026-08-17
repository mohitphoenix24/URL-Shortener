/**
 * @fileoverview Minimal toast notification store. No context provider
 * needed — a module-level listener list is enough for a single-page test
 * harness and keeps this from turning into a dependency (react-toastify,
 * etc.) for something this small.
 * @author Mohit Sharma
 */

import { useEffect, useState } from "react";

/** @type {Array<(toasts: Array<{id: number, message: string, kind: string}>) => void>} */
const listeners = [];
/** @type {Array<{id: number, message: string, kind: "success" | "error"}>} */
let toasts = [];
let nextId = 1;

function emit() {
  for (const listener of listeners) listener(toasts);
}

/**
 * Queues a toast for display, auto-dismissed after `durationMs`.
 * @param {string} message
 * @param {"success" | "error"} [kind="success"]
 * @param {number} [durationMs=4000]
 * @returns {void}
 */
export function pushToast(message, kind = "success", durationMs = 4000) {
  const id = nextId++;
  toasts = [...toasts, { id, message, kind }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, durationMs);
}

/**
 * Subscribes a component to the current toast list.
 * @returns {Array<{id: number, message: string, kind: "success" | "error"}>}
 */
export function useToasts() {
  const [state, setState] = useState(toasts);
  useEffect(() => {
    listeners.push(setState);
    return () => listeners.splice(listeners.indexOf(setState), 1);
  }, []);
  return state;
}
