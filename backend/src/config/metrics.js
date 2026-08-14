/**
 * @fileoverview Prometheus metrics registry (Roadmap Level 14). Started in
 * Phase 0 with process defaults + generic HTTP metrics so `/metrics` is live
 * from day one; business-specific metrics (cache hit ratio, rate-limit
 * rejections, redirect latency) are added to this same registry in Phase 8
 * without touching any call site outside this file.
 * @author Mohit Sharma
 */

import client from "prom-client";

/**
 * The one registry the whole app writes into.
 * @type {import('prom-client').Registry}
 */
export const register = new client.Registry();

client.collectDefaultMetrics({ register, prefix: "url_shortener_" });

/**
 * Records HTTP request count and latency, labelled by method/route/status.
 * Route (not raw path) is used as a label to avoid unbounded cardinality
 * from path params like short codes or ids.
 * @type {import('prom-client').Histogram}
 */
export const httpRequestDuration = new client.Histogram({
  name: "url_shortener_http_request_duration_seconds",
  help: "HTTP request duration in seconds, labelled by method/route/status_code",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});
