/**
 * @fileoverview Liveness and readiness probes, plus the Prometheus scrape
 * endpoint. Deliberately routes-only with logic inline here (not pushed to a
 * controller/service) because there is no business logic to separate — this
 * is infrastructure plumbing, not a domain concern.
 * @author Mohit Sharma
 */

import { Router } from "express";
import { pingDatabase } from "../../config/db.js";
import { pingRedis } from "../../config/redis.js";
import { register } from "../../config/metrics.js";

export const healthRouter = Router();

/**
 * GET /healthz — process liveness only. Always 200 if the process is
 * running and able to respond; does NOT check dependencies. Used by
 * orchestrators to decide "should I restart this container?".
 */
healthRouter.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});

/**
 * GET /readyz — dependency readiness. Checks Postgres and Redis are both
 * reachable before reporting 200. Used by orchestrators/load balancers to
 * decide "should traffic be routed to this instance yet?".
 */
healthRouter.get("/readyz", async (req, res) => {
  const [dbOk, redisOk] = await Promise.all([pingDatabase(), pingRedis()]);
  const ready = dbOk && redisOk;

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    dependencies: { postgres: dbOk ? "up" : "down", redis: redisOk ? "up" : "down" },
  });
});

/**
 * GET /metrics — Prometheus text-format scrape target.
 */
healthRouter.get("/metrics", async (req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.send(await register.metrics());
});
