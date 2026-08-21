/**
 * @fileoverview The redirect hot path: `GET /:code`. Deliberately the
 * thinnest controller in the app — this is the single most frequently hit
 * route in the whole system (every click on a shortened link comes through
 * here), so it does exactly one thing and gets out of the way.
 * @author Mohit Sharma
 */

import * as linkService from "../../services/link.service.js";
import * as analyticsService from "../../services/analytics.service.js";

/**
 * True if this request is a browser's own speculative prefetch of the URL
 * rather than a real navigation — e.g. Chrome's address-bar "Preload pages"
 * (chrome://settings/performance) fetches a pasted/typed URL before Enter is
 * pressed, then fetches it again for the actual navigation moments later.
 * Both are genuine, identical, uncached GETs (302 is deliberately
 * non-cacheable — see below), so nothing server-side can tell them apart
 * except this: browsers that prefetch mark the request with a `Sec-Purpose`
 * (current) or `Purpose` (legacy Firefox/older Chrome) header specifically
 * so a server CAN exclude it. Observed directly: two `clicks` rows ~0.3–0.5s
 * apart, identical ip_hash/UA, for a single pasted-URL navigation.
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function isPrefetchRequest(req) {
  const purpose = req.headers["sec-purpose"] ?? req.headers["purpose"] ?? "";
  return purpose.includes("prefetch") || purpose.includes("preview");
}

/**
 * GET /:code
 * Resolves a short code and issues a 302 redirect to its destination. 302
 * (not 301) is deliberate: a permanent redirect would let browsers cache
 * the mapping and skip this server entirely on repeat visits, which would
 * break click analytics and make a link's destination impossible to change
 * after the fact.
 *
 * Click capture happens *after* the redirect response is sent, and is never
 * awaited: `recordClick` catches its own errors, so a slow or failing
 * analytics write can never add latency to, or fail, this response — see
 * docs/decisions.md's "No message broker for click analytics."
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function redirect(req, res) {
  const { longUrl, linkId } = await linkService.resolveLink(req.params.code);
  res.redirect(302, longUrl);

  if (isPrefetchRequest(req)) return; // resolved and redirected normally; just not counted as a click

  analyticsService.recordClick({
    linkId,
    ip: req.ip,
    referrer: req.headers.referer,
    userAgent: req.headers["user-agent"],
    country: req.headers["cf-ipcountry"] ?? req.headers["x-country-code"],
  });
}
