/**
 * @fileoverview The single-segment catch-all redirect route (`GET /:code`).
 * Mounted at the application root and MUST be registered after every other
 * router (see `api/routes/index.js`) — Express matches routes in
 * registration order, and `/:code` would otherwise shadow real routes like
 * `/healthz` that are also a single path segment.
 * @author Mohit Sharma
 */

import { Router } from "express";
import { rateLimitRedirect } from "../../middleware/rateLimit.js";
import * as redirectController from "../controllers/redirect.controller.js";

export const redirectRouter = Router();

redirectRouter.get("/:code", rateLimitRedirect, redirectController.redirect);
