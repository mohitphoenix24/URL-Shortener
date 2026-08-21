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

  analyticsService.recordClick({
    linkId,
    ip: req.ip,
    referrer: req.headers.referer,
    userAgent: req.headers["user-agent"],
    country: req.headers["cf-ipcountry"] ?? req.headers["x-country-code"],
  });
}
