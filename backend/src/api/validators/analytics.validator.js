/**
 * @fileoverview Zod schemas for the analytics resource.
 * @author Mohit Sharma
 */

import { z } from "zod";
import { env } from "../../config/env.js";

/** `GET /api/v1/analytics/links/:id` query — how many days back to look. */
export const linkAnalyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(env.ANALYTICS_MAX_RANGE_DAYS).default(env.ANALYTICS_DEFAULT_RANGE_DAYS),
});
