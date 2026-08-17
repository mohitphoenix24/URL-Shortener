/**
 * @fileoverview Small debounce hook so the search filter doesn't fire an API
 * request on every keystroke.
 * @author Mohit Sharma
 */

import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` of
 * no further changes.
 *
 * @template T
 * @param {T} value
 * @param {number} [delayMs=400]
 * @returns {T}
 */
export function useDebouncedValue(value, delayMs = 400) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
