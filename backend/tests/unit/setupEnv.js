/**
 * @fileoverview Runs before every unit test file. Unit tests never touch
 * Postgres or Redis, but some of the pure modules they import (e.g.
 * `utils/hash.js`) import `config/env.js` transitively, and `env.js` calls
 * `process.exit(1)` if required variables are missing at import time (by
 * design — see its own fileoverview). This just needs to satisfy that
 * schema with well-shaped dummy values; nothing here needs to be a real
 * connection string or secret since no I/O happens in a unit test.
 * @author Mohit Sharma
 */

process.env.NODE_ENV ??= "test";
process.env.APP_BASE_URL ??= "http://localhost:4500";
process.env.DATABASE_URL ??= "postgresql://unit:unit@localhost:5432/unit_test_unused";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_ACCESS_SECRET ??= "unit-test-access-secret-at-least-32-characters-long";
process.env.JWT_REFRESH_SECRET ??= "unit-test-refresh-secret-at-least-32-characters-long";
process.env.IP_HASH_SALT ??= "unit-test-ip-hash-salt-16chars";
