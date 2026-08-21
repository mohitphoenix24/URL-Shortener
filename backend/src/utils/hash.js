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

import { createHash, createHmac } from "node:crypto";
import { env } from "../config/env.js";

/**
 * @param {string} token - The raw token to hash (e.g. a signed refresh JWT).
 * @returns {string} Hex-encoded SHA-256 digest, suitable for a UNIQUE column lookup.
 */
export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Hashes a client IP for click analytics (`clicks.ip_hash`) — HMAC, not a
 * bare digest, because unlike a refresh token an IP is low-entropy (IPv4 is
 * only ~4 billion values): SHA-256(ip) alone would be trivially reversible
 * by brute force or a precomputed rainbow table, making "we don't store raw
 * IPs" a privacy claim in name only. Keying with a deployment-secret salt
 * (`IP_HASH_SALT`) closes that, while staying deterministic per IP — the
 * same visitor still hashes to the same value, which is what makes a
 * "unique visitors" count (`COUNT(DISTINCT ip_hash)`) possible at all.
 *
 * @param {string} ip
 * @returns {string} Hex-encoded HMAC-SHA256 digest.
 */
export function hashIp(ip) {
  return createHmac("sha256", env.IP_HASH_SALT).update(ip).digest("hex");
}
