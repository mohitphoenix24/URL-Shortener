/**
 * @fileoverview Hashing for high-entropy secrets (refresh tokens) —
 * distinct from `bcrypt`, which is used for passwords elsewhere. Passwords
 * are low-entropy and human-chosen, so bcrypt's deliberate slowness defends
 * against offline brute-forcing a stolen hash. A refresh token is a
 * cryptographically random 100+ bit JWT — brute-forcing it is already
 * infeasible, so bcrypt's cost would only slow down every legitimate
 * refresh call for no security benefit. A fast, deterministic SHA-256
 * digest is the correct tool here: it still means a stolen database dump
 * doesn't hand over usable tokens, without the throughput cost.
 * @author Mohit Sharma
 */

import { createHash } from "node:crypto";

/**
 * @param {string} token - The raw token to hash (e.g. a signed refresh JWT).
 * @returns {string} Hex-encoded SHA-256 digest, suitable for a UNIQUE column lookup.
 */
export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
