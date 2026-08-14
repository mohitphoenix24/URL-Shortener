/**
 * @fileoverview SSRF (Server-Side Request Forgery) guard for user-submitted
 * long URLs (Roadmap Level 6: "Mitigating ... CORS" and general injection
 * defenses). A URL shortener is a classic SSRF vector: nothing in this app
 * ever *fetches* the target URL server-side, but validating it defensively
 * anyway matters because (a) a future feature easily could (link previews,
 * favicon fetching, health checks) and (b) rejecting obviously-malicious
 * targets (internal metadata endpoints, loopback services) at creation time
 * is cheap and prevents this API from being used as an open redirector into
 * a private network.
 *
 * The check has two layers: the literal hostname/IP in the URL, and — since
 * an attacker can point a public domain at a private IP via DNS ("DNS
 * rebinding") — the IP(s) that hostname actually resolves to right now.
 * @author Mohit Sharma
 */

import dns from "node:dns/promises";
import net from "node:net";
import { AppError } from "./AppError.js";

const MAX_URL_LENGTH = 2048;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * IPv4 ranges that must never be a redirect target: loopback, private LAN
 * space, link-local, CGNAT, documentation/test ranges, multicast, and
 * reserved space. Each entry is [network, prefixLength].
 * @type {Array<[string, number]>}
 */
const PRIVATE_IPV4_RANGES = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
  ["255.255.255.255", 32],
];

/** @param {string} ipv4 @returns {number} */
function ipv4ToInt(ipv4) {
  return ipv4.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

/** @param {string} ip @returns {boolean} */
function isPrivateIPv4(ip) {
  const ipInt = ipv4ToInt(ip);
  return PRIVATE_IPV4_RANGES.some(([network, prefixLength]) => {
    const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
    return (ipInt & mask) === (ipv4ToInt(network) & mask);
  });
}

/** @param {string} ip @returns {boolean} */
function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase();

  if (normalized === "::1" || normalized === "::") return true; // loopback / unspecified
  if (normalized.startsWith("fe80:")) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // fc00::/7 unique local (ULA)

  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — unwrap and re-check as IPv4, since
  // this is exactly how an attacker would smuggle a private IPv4 target
  // through an IPv6-shaped hostname.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);

  return false;
}

/**
 * Checks whether an IP literal (v4 or v6) falls in a private/reserved/loopback range.
 * @param {string} ip
 * @returns {boolean}
 */
export function isPrivateIP(ip) {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return false; // not an IP literal at all
}

/**
 * Validates a user-submitted long URL is safe to store and eventually
 * redirect to. Throws on anything unsafe or malformed; resolves silently on
 * success.
 *
 * @async
 * @param {string} rawUrl - The URL as submitted by the client.
 * @returns {Promise<void>}
 * @throws {AppError} 422 for malformed/disallowed URLs, or a target that
 *   resolves to a private/internal address.
 */
export async function assertSafeUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    throw AppError.unprocessable("longUrl is required", "INVALID_URL");
  }
  if (rawUrl.length > MAX_URL_LENGTH) {
    throw AppError.unprocessable(`longUrl exceeds ${MAX_URL_LENGTH} characters`, "URL_TOO_LONG");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw AppError.unprocessable("longUrl is not a valid URL", "INVALID_URL");
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw AppError.unprocessable(`Protocol "${parsed.protocol}" is not allowed — use http or https`, "INVALID_URL_PROTOCOL");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw AppError.unprocessable("URLs pointing to localhost are not allowed", "URL_TARGETS_PRIVATE_NETWORK");
  }

  // If the hostname is itself a literal IP, check it directly — no DNS
  // lookup needed (and dns.lookup() would just hand it back unchanged).
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw AppError.unprocessable("URLs pointing to private/internal addresses are not allowed", "URL_TARGETS_PRIVATE_NETWORK");
    }
    return;
  }

  let resolved;
  try {
    resolved = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw AppError.unprocessable(`longUrl's host "${hostname}" could not be resolved`, "URL_HOST_UNRESOLVABLE");
  }

  if (resolved.some(({ address }) => isPrivateIP(address))) {
    throw AppError.unprocessable("URLs that resolve to a private/internal address are not allowed", "URL_TARGETS_PRIVATE_NETWORK");
  }
}
