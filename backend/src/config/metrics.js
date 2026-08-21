/**
 * @fileoverview Prometheus metrics registry (Roadmap Level 14). Started in
 * Phase 0 with process defaults + generic HTTP metrics so `/metrics` is live
 * from day one; Phase 8 adds the business-specific ones (cache hit ratio,
 * rate-limit rejections, click-capture outcomes) to this same registry —
 * redirect latency specifically needed no new metric, since the generic
 * `httpRequestDuration` above already captures it labelled `route=":code"`.
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

/**
 * Redirect cache-aside outcomes (`services/link.service.js#getCacheEntries`).
 * Cache hit ratio is a `rate(...{result="hit"}) / rate(...)` query over this
 * in Grafana, not a gauge computed in-process — Prometheus is the one
 * source of truth for the ratio over any given time window, not the app.
 * @type {import('prom-client').Counter}
 */
export const cacheOperationsTotal = new client.Counter({
  name: "url_shortener_cache_operations_total",
  help: "Redirect cache-aside lookups, labelled by result",
  labelNames: ["result"], // hit | negative_hit | miss | error
  registers: [register],
});

/**
 * Requests the token-bucket rate limiter rejected (`middleware/rateLimit.js`),
 * labelled by which of the three tiers rejected it — the redirect hot path
 * tripping this is a very different signal than the anon/login tier
 * tripping it (the latter being, per docs/decisions.md, the actual
 * brute-force protection working as designed).
 * @type {import('prom-client').Counter}
 */
export const rateLimitRejectionsTotal = new client.Counter({
  name: "url_shortener_rate_limit_rejections_total",
  help: "Requests rejected by the rate limiter, labelled by tier",
  labelNames: ["tier"], // anon | auth | redirect
  registers: [register],
});

/**
 * Click-capture outcomes (`services/analytics.service.js#recordClick`).
 * That function already swallows its own errors so a failing analytics
 * write can never affect the redirect response (see its own docstring and
 * docs/decisions.md's "No message broker for click analytics") — which
 * means a failure there would otherwise be visible only in logs. This
 * makes "click capture is silently failing" something an alert can catch.
 * @type {import('prom-client').Counter}
 */
export const clicksRecordedTotal = new client.Counter({
  name: "url_shortener_clicks_recorded_total",
  help: "Click-capture attempts on the redirect hot path, labelled by outcome",
  labelNames: ["status"], // success | error
  registers: [register],
});
