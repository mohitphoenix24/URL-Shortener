/**
 * @fileoverview HTTP-facing handlers for the analytics resource.
 * @author Mohit Sharma
 */

import * as analyticsService from "../../services/analytics.service.js";

/**
 * GET /api/v1/analytics/links/:id
 * Owner-scoped (same rule as the links resource — see
 * `services/link.service.js`'s `assertOwnerOrAdmin`, reused via
 * `services/analytics.service.js`).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function getLinkAnalytics(req, res) {
  const { days } = req.valid.query;
  const analytics = await analyticsService.getLinkAnalytics(req.valid.params.id, req.user, days);
  res.status(200).json({ data: analytics });
}
