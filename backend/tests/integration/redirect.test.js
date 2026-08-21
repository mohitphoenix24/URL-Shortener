import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app, resetDatabase, resetRedis, closeConnections } from "./helpers/testApp.js";
import { redis } from "../../src/config/redis.js";
import { registerUser } from "./helpers/auth.js";

beforeEach(async () => {
  await resetDatabase();
  await resetRedis();
});

afterAll(async () => {
  await closeConnections();
});

async function createLink(overrides = {}) {
  const res = await request(app).post("/api/v1/links").send({ longUrl: "https://example.com/redirect-target", ...overrides });
  return res.body.data;
}

describe("GET /:code", () => {
  it("redirects (302) to the link's longUrl", async () => {
    const link = await createLink();
    const res = await request(app).get(`/${link.shortCode}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(link.longUrl);
  });

  it("populates the Redis cache on a miss, and serves the identical result on the next request", async () => {
    const link = await createLink();

    await request(app).get(`/${link.shortCode}`);
    const cached = await redis.get(`link:${link.shortCode}`);
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached)).toMatchObject({ longUrl: link.longUrl, isActive: true });

    const second = await request(app).get(`/${link.shortCode}`);
    expect(second.status).toBe(302);
    expect(second.headers.location).toBe(link.longUrl);
  });

  it("returns 404 for an unknown code and populates the negative cache", async () => {
    const res = await request(app).get("/this-code-does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("LINK_NOT_FOUND");

    const negativeCached = await redis.get("link:this-code-does-not-exist:absent");
    expect(negativeCached).not.toBeNull();
  });

  it("returns 410 for an expired link", async () => {
    const { accessToken } = await registerUser(app);
    const created = await request(app)
      .post("/api/v1/links")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ longUrl: "https://example.com/soon-to-expire", expiresAt: new Date(Date.now() + 500).toISOString() });

    await new Promise((resolve) => setTimeout(resolve, 600));

    const res = await request(app).get(`/${created.body.data.shortCode}`);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("LINK_EXPIRED");
  });

  it("returns 403 for a disabled link", async () => {
    const { accessToken } = await registerUser(app);
    const created = await request(app).post("/api/v1/links").set("Authorization", `Bearer ${accessToken}`).send({ longUrl: "https://example.com/will-be-disabled" });
    await request(app).patch(`/api/v1/links/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`).send({ isActive: false });

    const res = await request(app).get(`/${created.body.data.shortCode}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("LINK_DISABLED");
  });

  it("cache invalidation: disabling a link via PATCH is reflected on the very next redirect, not served stale from cache", async () => {
    const { accessToken } = await registerUser(app);
    const created = await request(app).post("/api/v1/links").set("Authorization", `Bearer ${accessToken}`).send({ longUrl: "https://example.com/live-toggle" });
    const shortCode = created.body.data.shortCode;

    // Warm the positive cache.
    const before = await request(app).get(`/${shortCode}`);
    expect(before.status).toBe(302);

    await request(app).patch(`/api/v1/links/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`).send({ isActive: false });

    const after = await request(app).get(`/${shortCode}`);
    expect(after.status).toBe(403);
  });

  it("cache invalidation: deleting a link makes it 404, not still resolve from a stale positive cache entry", async () => {
    const { accessToken } = await registerUser(app);
    const created = await request(app).post("/api/v1/links").set("Authorization", `Bearer ${accessToken}`).send({ longUrl: "https://example.com/live-delete" });
    const shortCode = created.body.data.shortCode;

    await request(app).get(`/${shortCode}`); // warm the cache
    await request(app).delete(`/api/v1/links/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`);

    const res = await request(app).get(`/${shortCode}`);
    expect(res.status).toBe(404);
  });

  it("a negative cache entry from a lookup before creation doesn't shadow the link once it's created", async () => {
    const code = "not-yet-created";

    const miss = await request(app).get(`/${code}`);
    expect(miss.status).toBe(404);
    expect(await redis.get(`link:${code}:absent`)).not.toBeNull();

    await request(app).post("/api/v1/links").send({ longUrl: "https://example.com/just-created", customAlias: code });

    const hit = await request(app).get(`/${code}`);
    expect(hit.status).toBe(302);
    expect(hit.headers.location).toBe("https://example.com/just-created");
  });
});
