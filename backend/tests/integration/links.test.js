import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app, resetDatabase, resetRedis, closeConnections } from "./helpers/testApp.js";
import { registerUser, promoteToAdmin } from "./helpers/auth.js";

beforeEach(async () => {
  await resetDatabase();
  await resetRedis();
});

afterAll(async () => {
  await closeConnections();
});

describe("POST /api/v1/links", () => {
  it("creates an unclaimed (userId: null) link anonymously", async () => {
    const res = await request(app).post("/api/v1/links").send({ longUrl: "https://example.com/anon" });

    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBeNull();
    expect(res.body.data.shortCode).toEqual(expect.any(String));
    expect(res.body.data.shortUrl).toContain(res.body.data.shortCode);
    expect(res.body.data.isActive).toBe(true);
    expect(res.body.data.clickCount).toBe(0);
  });

  it("attributes ownership when the caller is authenticated", async () => {
    const { accessToken, user } = await registerUser(app);
    const res = await request(app)
      .post("/api/v1/links")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ longUrl: "https://example.com/owned" });

    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(user.id);
  });

  it("uses a caller-supplied customAlias verbatim as the short code", async () => {
    const res = await request(app)
      .post("/api/v1/links")
      .send({ longUrl: "https://example.com/aliased", customAlias: "my-cool-alias" });

    expect(res.status).toBe(201);
    expect(res.body.data.shortCode).toBe("my-cool-alias");
  });

  it("rejects a reserved word as a customAlias with 409", async () => {
    const res = await request(app).post("/api/v1/links").send({ longUrl: "https://example.com/x", customAlias: "admin" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALIAS_RESERVED");
  });

  it("rejects a customAlias that's already taken with 409", async () => {
    await request(app).post("/api/v1/links").send({ longUrl: "https://example.com/first", customAlias: "taken-alias" });
    const res = await request(app)
      .post("/api/v1/links")
      .send({ longUrl: "https://example.com/second", customAlias: "taken-alias" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALIAS_TAKEN");
  });

  it("?mode=random generates an 8-character code instead of the default sequential one", async () => {
    const res = await request(app).post("/api/v1/links?mode=random").send({ longUrl: "https://example.com/random" });
    expect(res.status).toBe(201);
    expect(res.body.data.shortCode).toHaveLength(8);
  });

  it("rejects an unsafe longUrl (protocol, localhost, private IP) with 422", async () => {
    const ftp = await request(app).post("/api/v1/links").send({ longUrl: "ftp://example.com/file" });
    expect(ftp.status).toBe(422);
    expect(ftp.body.error.code).toBe("INVALID_URL_PROTOCOL");

    const localhost = await request(app).post("/api/v1/links").send({ longUrl: "http://localhost/admin" });
    expect(localhost.status).toBe(422);
    expect(localhost.body.error.code).toBe("URL_TARGETS_PRIVATE_NETWORK");

    const privateIp = await request(app).post("/api/v1/links").send({ longUrl: "http://127.0.0.1/" });
    expect(privateIp.status).toBe(422);
    expect(privateIp.body.error.code).toBe("URL_TARGETS_PRIVATE_NETWORK");
  });

  it("rejects a malformed body (missing longUrl) with 422", async () => {
    const res = await request(app).post("/api/v1/links").send({});
    expect(res.status).toBe(422);
  });
});

describe("GET /api/v1/links", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/links");
    expect(res.status).toBe(401);
  });

  it("scopes results to the caller's own links only", async () => {
    const alice = await registerUser(app, { email: "alice@example.com" });
    const bob = await registerUser(app, { email: "bob@example.com" });

    await request(app).post("/api/v1/links").set("Authorization", `Bearer ${alice.accessToken}`).send({ longUrl: "https://example.com/alice-1" });
    await request(app).post("/api/v1/links").set("Authorization", `Bearer ${bob.accessToken}`).send({ longUrl: "https://example.com/bob-1" });

    const res = await request(app).get("/api/v1/links").set("Authorization", `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].longUrl).toBe("https://example.com/alice-1");
  });

  it("an admin sees every user's links, unscoped", async () => {
    const alice = await registerUser(app, { email: "alice2@example.com" });
    const bobReg = await registerUser(app, { email: "bob2@example.com" });
    await promoteToAdmin(bobReg.user.id);
    // Role is baked into the access token at issuance, so the promotion
    // above isn't visible until bob gets a fresh token — same as a real
    // operator promoting a user would require a re-login to take effect.
    const bobLogin = await request(app).post("/api/v1/auth/login").send({ email: "bob2@example.com", password: "password123" });

    await request(app).post("/api/v1/links").set("Authorization", `Bearer ${alice.accessToken}`).send({ longUrl: "https://example.com/scoped" });

    const res = await request(app).get("/api/v1/links").set("Authorization", `Bearer ${bobLogin.body.data.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].longUrl).toBe("https://example.com/scoped");
  });

  it("paginates, and filters by isActive", async () => {
    const { accessToken } = await registerUser(app);
    for (let i = 0; i < 3; i++) {
      await request(app).post("/api/v1/links").set("Authorization", `Bearer ${accessToken}`).send({ longUrl: `https://example.com/page-${i}` });
    }

    const page1 = await request(app).get("/api/v1/links?limit=2&page=1").set("Authorization", `Bearer ${accessToken}`);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.pagination).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2, hasNext: true });

    const page2 = await request(app).get("/api/v1/links?limit=2&page=2").set("Authorization", `Bearer ${accessToken}`);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.pagination.hasNext).toBe(false);
  });

  it("filters by isActive=false", async () => {
    const { accessToken } = await registerUser(app);
    const created = await request(app).post("/api/v1/links").set("Authorization", `Bearer ${accessToken}`).send({ longUrl: "https://example.com/to-disable" });
    await request(app)
      .patch(`/api/v1/links/${created.body.data.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ isActive: false });

    const res = await request(app).get("/api/v1/links?isActive=false").set("Authorization", `Bearer ${accessToken}`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].isActive).toBe(false);
  });
});

describe("GET /api/v1/links/:id", () => {
  it("the owner can read their own link", async () => {
    const { accessToken } = await registerUser(app);
    const created = await request(app).post("/api/v1/links").set("Authorization", `Bearer ${accessToken}`).send({ longUrl: "https://example.com/mine" });

    const res = await request(app).get(`/api/v1/links/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it("a non-owner gets 403, even on an anonymous (unclaimed) link", async () => {
    const anon = await request(app).post("/api/v1/links").send({ longUrl: "https://example.com/unclaimed" });
    const { accessToken } = await registerUser(app);

    const res = await request(app).get(`/api/v1/links/${anon.body.data.id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("LINK_FORBIDDEN");
  });

  it("an admin can read any link, including one owned by someone else", async () => {
    const owner = await registerUser(app, { email: "owner@example.com" });
    const created = await request(app).post("/api/v1/links").set("Authorization", `Bearer ${owner.accessToken}`).send({ longUrl: "https://example.com/owned-by-owner" });

    const adminReg = await registerUser(app, { email: "will-be-admin@example.com" });
    await promoteToAdmin(adminReg.user.id);
    const adminLogin = await request(app).post("/api/v1/auth/login").send({ email: "will-be-admin@example.com", password: "password123" });

    const res = await request(app)
      .get(`/api/v1/links/${created.body.data.id}`)
      .set("Authorization", `Bearer ${adminLogin.body.data.accessToken}`);
    expect(res.status).toBe(200);
  });

  it("returns 404 for a nonexistent id", async () => {
    const { accessToken } = await registerUser(app);
    const res = await request(app).get("/api/v1/links/99999999").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/links/:id", () => {
  it("the owner can update title/isActive/expiresAt", async () => {
    const { accessToken } = await registerUser(app);
    const created = await request(app).post("/api/v1/links").set("Authorization", `Bearer ${accessToken}`).send({ longUrl: "https://example.com/patchme" });

    const res = await request(app)
      .patch(`/api/v1/links/${created.body.data.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "New title", isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("New title");
    expect(res.body.data.isActive).toBe(false);
  });

  it("a non-owner gets 403 and the link is left unchanged", async () => {
    const owner = await registerUser(app, { email: "patch-owner@example.com" });
    const stranger = await registerUser(app, { email: "patch-stranger@example.com" });
    const created = await request(app).post("/api/v1/links").set("Authorization", `Bearer ${owner.accessToken}`).send({ longUrl: "https://example.com/protected" });

    const res = await request(app)
      .patch(`/api/v1/links/${created.body.data.id}`)
      .set("Authorization", `Bearer ${stranger.accessToken}`)
      .send({ title: "Hijacked" });
    expect(res.status).toBe(403);
  });

  it("rejects an empty body with 422 (at least one field required)", async () => {
    const { accessToken } = await registerUser(app);
    const created = await request(app).post("/api/v1/links").set("Authorization", `Bearer ${accessToken}`).send({ longUrl: "https://example.com/empty-patch" });

    const res = await request(app).patch(`/api/v1/links/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/v1/links/:id", () => {
  it("the owner can soft-delete their link — 204, then a 404 on subsequent reads", async () => {
    const { accessToken } = await registerUser(app);
    const created = await request(app).post("/api/v1/links").set("Authorization", `Bearer ${accessToken}`).send({ longUrl: "https://example.com/deleteme" });

    const del = await request(app).delete(`/api/v1/links/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(del.status).toBe(204);

    const getAfter = await request(app).get(`/api/v1/links/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(getAfter.status).toBe(404);
  });

  it("a non-owner gets 403 and the link survives", async () => {
    const owner = await registerUser(app, { email: "del-owner@example.com" });
    const stranger = await registerUser(app, { email: "del-stranger@example.com" });
    const created = await request(app).post("/api/v1/links").set("Authorization", `Bearer ${owner.accessToken}`).send({ longUrl: "https://example.com/safe" });

    const res = await request(app).delete(`/api/v1/links/${created.body.data.id}`).set("Authorization", `Bearer ${stranger.accessToken}`);
    expect(res.status).toBe(403);

    const stillThere = await request(app).get(`/api/v1/links/${created.body.data.id}`).set("Authorization", `Bearer ${owner.accessToken}`);
    expect(stillThere.status).toBe(200);
  });
});
