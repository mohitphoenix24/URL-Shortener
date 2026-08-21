/**
 * @fileoverview Central router mount point. `app.js` imports only this file
 * — new resource routers are wired in here, not in `app.js` directly, so
 * `app.js` never needs to change as the API surface grows.
 * @author Mohit Sharma
 */

import { Router } from "express";
import { healthRouter } from "./health.routes.js";
import { authRouter } from "./auth.routes.js";
import { linkRouter } from "./link.routes.js";
import { analyticsRouter } from "./analytics.routes.js";
import { docsRouter } from "./docs.routes.js";
import { redirectRouter } from "./redirect.routes.js";

export const router = Router();

// Health/readiness/metrics are mounted at the root, not under /api/v1 —
// orchestrators and Prometheus expect them at fixed, version-independent paths.
router.use(healthRouter);

router.use("/api/v1/auth", authRouter);
router.use("/api/v1/links", linkRouter);
router.use("/api/v1/analytics", analyticsRouter);

// /docs and /openapi, also at the root (not /api/v1) — same reasoning as
// health/metrics above, and both are reserved short-link aliases for
// exactly this reason (utils/reservedAliases.js).
router.use(docsRouter);

// MUST be last: GET /:code is a single-segment catch-all that would shadow
// any route registered after it (e.g. a future single-segment path).
router.use(redirectRouter);
