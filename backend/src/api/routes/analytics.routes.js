/**
 * @fileoverview Routes for the analytics resource — wiring only. Every route
 * requires auth and is owner-scoped, so it uses the same auth-by-user rate
 * limit tier as the rest of the authenticated links surface.
 * @author Mohit Sharma
 */

import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimitAuthByUser } from "../../middleware/rateLimit.js";
import * as analyticsController from "../controllers/analytics.controller.js";
import { linkIdParamSchema } from "../validators/link.validator.js";
import { linkAnalyticsQuerySchema } from "../validators/analytics.validator.js";

export const analyticsRouter = Router();

analyticsRouter.get(
  "/links/:id",
  requireAuth,
  rateLimitAuthByUser,
  validate(linkIdParamSchema, "params"),
  validate(linkAnalyticsQuerySchema, "query"),
  analyticsController.getLinkAnalytics
);
