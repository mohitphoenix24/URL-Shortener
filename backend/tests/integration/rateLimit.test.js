import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app, resetDatabase, resetRedis, closeConnections } from "./helpers/testApp.js";
import { redis, REDIS_KEYS } from "../../src/config/redis.js";

beforeEach(async () => {
  await resetDatabase();
  await resetRedis();
});

afterAll(async () => {
  await closeConnections();
});

describe("token bucket Lua script (redis.rateLimitTokenBucket)", () => {
  it("starts full: the first request against a fresh bucket is allowed", async () => {
    const key = REDIS_KEYS.rateLimit("script-test-fresh");
    const [allowed] = await redis.rateLimitTokenBucket(key, 5, 1, Date.now(), 1);
    expect(allowed).toBe(1);
  });

  it("denies once the bucket is exhausted, with no time elapsed to refill it", async () => {
    const key = REDIS_KEYS.rateLimit("script-test-exhaust");
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      const [allowed] = await redis.rateLimitTokenBucket(key, 3, 1, now, 1);
      expect(allowed).toBe(1);
    }
    const [allowed, , retryAfterMs] = await redis.rateLimitTokenBucket(key, 3, 1, now, 1);
    expect(allowed).toBe(0);
    expect(retryAfterMs).toBeGreaterThan(0);
  });

  it("refills proportionally to elapsed time, capped at capacity", async () => {
    const key = REDIS_KEYS.rateLimit("script-test-refill");
    const start = Date.now();

    // Drain the bucket completely.
    for (let i = 0; i < 4; i++) {
      await redis.rateLimitTokenBucket(key, 4, 2, start, 1); // capacity 4, refill 2/sec
    }
    const [deniedImmediately] = await redis.rateLimitTokenBucket(key, 4, 2, start, 1);
    expect(deniedImmediately).toBe(0);

    // 1 simulated second later at 2 tokens/sec refill: exactly 2 tokens available.
    const oneSecondLater = start + 1000;
    const [allowedFirst] = await redis.rateLimitTokenBucket(key, 4, 2, oneSecondLater, 1);
    expect(allowedFirst).toBe(1);
    const [allowedSecond] = await redis.rateLimitTokenBucket(key, 4, 2, oneSecondLater, 1);
    expect(allowedSecond).toBe(1);
    const [deniedThird] = await redis.rateLimitTokenBucket(key, 4, 2, oneSecondLater, 1);
    expect(deniedThird).toBe(0);
  });

  it("two different bucket keys never affect each other (proves isolation, e.g. anon-by-IP vs auth-by-user)", async () => {
    const keyA = REDIS_KEYS.rateLimit("anon:1.2.3.4");
    const keyB = REDIS_KEYS.rateLimit("user:42");
    const now = Date.now();

    for (let i = 0; i < 2; i++) {
      await redis.rateLimitTokenBucket(keyA, 2, 1, now, 1);
    }
    const [aDenied] = await redis.rateLimitTokenBucket(keyA, 2, 1, now, 1);
    expect(aDenied).toBe(0);

    const [bAllowed] = await redis.rateLimitTokenBucket(keyB, 2, 1, now, 1);
    expect(bAllowed).toBe(1);
  });
});

describe("rate limiting at the HTTP layer", () => {
  it("POST /api/v1/auth/login: exactly RATE_LIMIT_ANON_CAPACITY (20) attempts succeed through to the auth check, then 429 with a Retry-After header", async () => {
    const attempts = [];
    for (let i = 0; i < 21; i++) {
      attempts.push(
        await request(app).post("/api/v1/auth/login").send({ email: "nobody@example.com", password: "wrong-password" })
      );
    }

    const first20 = attempts.slice(0, 20);
    const twentyFirst = attempts[20];

    expect(first20.every((res) => res.status === 401)).toBe(true);
    expect(twentyFirst.status).toBe(429);
    expect(twentyFirst.body.error.code).toBe("RATE_LIMITED");
    expect(twentyFirst.headers["retry-after"]).toBeDefined();
  });

  it("the anon-by-IP bucket and the auth-by-user bucket are independent — exhausting one doesn't touch the other", async () => {
    // Register BEFORE exhausting the anon bucket, so this token is obtained
    // cleanly and what's under test is only what happens *after*.
    const registerRes = await request(app).post("/api/v1/auth/register").send({ email: "unaffected@example.com", password: "password123" });
    expect(registerRes.status).toBe(201);
    const accessToken = registerRes.body.data.accessToken;

    // Exhaust the anon-by-IP bucket (login sits behind it — this IS the
    // login brute-force protection, see docs/decisions.md). All requests in
    // this suite share one loopback IP, so this reliably drains it.
    for (let i = 0; i < 21; i++) {
      await request(app).post("/api/v1/auth/login").send({ email: "nobody2@example.com", password: "wrong-password" });
    }
    const anonExhausted = await request(app).post("/api/v1/auth/login").send({ email: "nobody2@example.com", password: "wrong-password" });
    expect(anonExhausted.status).toBe(429);

    // /auth/me runs requireAuth (populates req.user) then the auth-by-user
    // tier, keyed by user id — a completely different bucket from the
    // anon-by-IP one just exhausted above, so this must still succeed.
    const meRes = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);
    expect(meRes.status).toBe(200);
  });
});
