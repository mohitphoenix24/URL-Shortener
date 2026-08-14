/**
 * @fileoverview The redirect hot path: `GET /:code`. Deliberately the
 * thinnest controller in the app — this is the single most frequently hit
 * route in the whole system (every click on a shortened link comes through
 * here), so it does exactly one thing and gets out of the way.
 * @author Mohit Sharma
 */

import * as linkService from "../../services/link.service.js";

/**
 * GET /:code
 * Resolves a short code and issues a 302 redirect to its destination. 302
 * (not 301) is deliberate: a permanent redirect would let browsers cache
 * the mapping and skip this server entirely on repeat visits, which would
 * break click analytics (Phase 4) and make a link's destination impossible
 * to change after the fact.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function redirect(req, res) {
  const { longUrl } = await linkService.resolveLink(req.params.code);
  res.redirect(302, longUrl);
}
