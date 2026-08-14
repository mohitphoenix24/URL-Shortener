/**
 * @fileoverview Central router mount point. `app.js` imports only this file
 * — new resource routers are wired in here, not in `app.js` directly, so
 * `app.js` never needs to change as the API surface grows.
 * @author Mohit Sharma
 */

import { Router } from "express";
import { healthRouter } from "./health.routes.js";

export const router = Router();

// Health/readiness/metrics are mounted at the root, not under /api/v1 —
// orchestrators and Prometheus expect them at fixed, version-independent paths.
router.use(healthRouter);

// Phase 1+: router.use("/api/v1/links", linkRouter);
// Phase 2+: router.use("/api/v1/auth", authRouter);
// Phase 1+: router.use("/", redirectRouter);   // GET /:code
// Phase 4+: router.use("/api/v1/analytics", analyticsRouter);
