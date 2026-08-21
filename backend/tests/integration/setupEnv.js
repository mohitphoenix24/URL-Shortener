/**
 * @fileoverview Runs before each integration test FILE's own imports (via
 * Vitest `setupFiles`), which is what makes this safe: `process.env` is
 * populated here before anything in this file imports `../../src/app.js`,
 * so by the time `config/env.js`/`config/db.js`/`config/redis.js` load and
 * read `process.env`, they see the real Testcontainers connection strings
 * from `globalSetup.js` — never the values (if any) sitting in a real
 * `.env` on this machine.
 *
 * Rate-limit capacities are left at their realistic `.env.example` defaults
 * deliberately (not inflated) — most test files stay comfortably under
 * them, and `rateLimit.test.js` exercises the real limit on purpose. Redis
 * is flushed before every test (see `helpers/reset.js`) so usage never
 * accumulates across files sharing the one container.
 * @author Mohit Sharma
 */

import { inject } from "vitest";

process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.APP_BASE_URL = "http://localhost:4500";
process.env.CORS_ORIGIN = "http://localhost:5175";
process.env.DATABASE_URL = inject("testDatabaseUrl");
process.env.REDIS_URL = inject("testRedisUrl");
process.env.JWT_ACCESS_SECRET = "integration-test-access-secret-at-least-32-chars";
process.env.JWT_REFRESH_SECRET = "integration-test-refresh-secret-at-least-32-chars";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL = "7d";
process.env.IP_HASH_SALT = "integration-test-ip-hash-salt-16";
process.env.RATE_LIMIT_ANON_CAPACITY = "20";
process.env.RATE_LIMIT_ANON_REFILL_PER_SEC = "0.33";
process.env.RATE_LIMIT_AUTH_CAPACITY = "100";
process.env.RATE_LIMIT_AUTH_REFILL_PER_SEC = "1.5";
process.env.RATE_LIMIT_REDIRECT_CAPACITY = "300";
process.env.RATE_LIMIT_REDIRECT_REFILL_PER_SEC = "5";
process.env.LINK_CACHE_TTL_SECONDS = "3600";
process.env.LINK_NEGATIVE_CACHE_TTL_SECONDS = "60";
process.env.ANALYTICS_DEFAULT_RANGE_DAYS = "30";
process.env.ANALYTICS_MAX_RANGE_DAYS = "365";
