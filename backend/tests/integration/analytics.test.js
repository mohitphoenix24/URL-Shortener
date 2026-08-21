import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app, resetDatabase, resetRedis, closeConnections } from "./helpers/testApp.js";
import { registerUser } from "./helpers/auth.js";

beforeEach(async () => {
  await resetDatabase();
  await resetRedis();
});

afterAll(async () => {
  await closeConnections();
});

describe("GET /api/v1/analytics/links/:id", () => {
  it("aggregates real clicks: totals, referrers, device/browser/os breakdowns", async () => {
    const { accessToken } = await registerUser(app);
    const created = await request(app)
      .post("/api/v1/links")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ longUrl: "https://example.com/analytics-target" });
    const shortCode = created.body.data.shortCode;

    await request(app)
      .get(`/${shortCode}`)
      .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")
      .set("Referer", "https://twitter.com/foo");
    await request(app)
      .get(`/${shortCode}`)
      .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")
      .set("Referer", "https://google.com");
    await request(app)
      .get(`/${shortCode}`)
      .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36");

    // Click capture is fire-and-forget (never awaited by the redirect
    // response) — give the event loop a tick to let the writes land before
    // asserting on aggregates that depend on them.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const res = await request(app).get(`/api/v1/analytics/links/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalClicks).toBe(3);
    expect(res.body.data.topReferrers).toEqual(
      expect.arrayContaining([
        { referrer: "https://google.com", count: 1 },
        { referrer: "https://twitter.com/foo", count: 1 },
        { referrer: "direct", count: 1 },
      ])
    );
    expect(res.body.data.deviceBreakdown).toEqual(
      expect.arrayContaining([expect.objectContaining({ deviceType: "mobile" }), expect.objectContaining({ deviceType: "desktop" })])
    );
  });

  it("keeps links.click_count in sync with the actual click rows via GET /api/v1/links/:id", async () => {
    const { accessToken } = await registerUser(app);
    const created = await request(app).post("/api/v1/links").set("Authorization", `Bearer ${accessToken}`).send({ longUrl: "https://example.com/count-sync" });

    await request(app).get(`/${created.body.data.shortCode}`);
    await request(app).get(`/${created.body.data.shortCode}`);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const res = await request(app).get(`/api/v1/links/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(res.body.data.clickCount).toBe(2);
  });

  it("is owner-scoped — a different user gets 403", async () => {
    const owner = await registerUser(app, { email: "analytics-owner@example.com" });
    const stranger = await registerUser(app, { email: "analytics-stranger@example.com" });
    const created = await request(app).post("/api/v1/links").set("Authorization", `Bearer ${owner.accessToken}`).send({ longUrl: "https://example.com/private-stats" });

    const res = await request(app).get(`/api/v1/analytics/links/${created.body.data.id}`).set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for a nonexistent link", async () => {
    const { accessToken } = await registerUser(app);
    const res = await request(app).get("/api/v1/analytics/links/99999999").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it("rejects an out-of-range days query param with 422", async () => {
    const { accessToken } = await registerUser(app);
    const created = await request(app).post("/api/v1/links").set("Authorization", `Bearer ${accessToken}`).send({ longUrl: "https://example.com/range-test" });

    const res = await request(app)
      .get(`/api/v1/analytics/links/${created.body.data.id}?days=99999`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(422);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/analytics/links/1");
    expect(res.status).toBe(401);
  });
});
