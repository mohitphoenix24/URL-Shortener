/**
 * @fileoverview Light/dark theme, persisted to localStorage and applied via
 * a `data-theme` attribute on `<html>` (which `styles/index.css` keys its
 * dark-mode variable overrides off). The actual *first paint* theme is set
 * by a tiny inline script in `index.html` (before React ever loads) so
 * there's no flash of the wrong theme on load — this hook only owns
 * changing it afterward and keeping the toggle button in sync.
 * @author Mohit Sharma
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "theme";

/** @returns {"light" | "dark"} Whatever index.html's inline script already applied, or the OS preference as a fallback. */
function getInitialTheme() {
  if (typeof document !== "undefined" && document.documentElement.dataset.theme) {
    return document.documentElement.dataset.theme;
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * @returns {{theme: "light" | "dark", toggleTheme: () => void}}
 */
export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* private-mode/localStorage-disabled — theme still applies for this session, just doesn't persist */
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  return { theme, toggleTheme };
}
