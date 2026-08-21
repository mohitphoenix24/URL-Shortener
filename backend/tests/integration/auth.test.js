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

describe("POST /api/v1/auth/register", () => {
  it("creates an account and logs it in — 201, a user, an access token, and a refresh cookie", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "new-user@example.com", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: "new-user@example.com", role: "user" });
    expect(res.body.data.user.password_hash).toBeUndefined();
    expect(res.body.data.accessToken).toEqual(expect.any(String));

    const cookie = res.headers["set-cookie"][0];
    expect(cookie).toMatch(/^refreshToken=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/i);
  });

  it("rejects a duplicate email with 409", async () => {
    await registerUser(app, { email: "dupe@example.com" });
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "dupe@example.com", password: "password123" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("treats email as case-insensitive (CITEXT) for the duplicate check", async () => {
    await registerUser(app, { email: "CaseTest@Example.com" });
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "casetest@example.com", password: "password123" });

    expect(res.status).toBe(409);
  });

  it("rejects a malformed email or too-short password with 422", async () => {
    const badEmail = await request(app).post("/api/v1/auth/register").send({ email: "not-an-email", password: "password123" });
    expect(badEmail.status).toBe(422);

    const shortPassword = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "ok@example.com", password: "short" });
    expect(shortPassword.status).toBe(422);
  });
});

describe("POST /api/v1/auth/login", () => {
  it("logs in with correct credentials", async () => {
    await registerUser(app, { email: "login-test@example.com", password: "correct-password" });
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "login-test@example.com", password: "correct-password" });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it("rejects a wrong password with 401 INVALID_CREDENTIALS", async () => {
    await registerUser(app, { email: "wrong-pw@example.com", password: "correct-password" });
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "wrong-pw@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an unknown email with the identical 401/message as a wrong password — no user-enumeration signal", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "does-not-exist@example.com", password: "whatever123" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("rotates the refresh token and issues a new access token", async () => {
    const { refreshCookie } = await registerUser(app);
    const res = await request(app).post("/api/v1/auth/refresh").set("Cookie", refreshCookie).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    const newCookie = res.headers["set-cookie"][0];
    expect(newCookie).not.toBe(refreshCookie);
  });

  it("accepts the refresh token in the body instead of a cookie (curl/Postman use case)", async () => {
    const registerRes = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "body-refresh@example.com", password: "password123" });
    const rawCookie = registerRes.headers["set-cookie"][0];
    const rawToken = rawCookie.match(/refreshToken=([^;]+)/)[1];

    const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: rawToken });
    expect(res.status).toBe(200);
  });

  it("rejects a missing refresh token with 401", async () => {
    const res = await request(app).post("/api/v1/auth/refresh").send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("REFRESH_TOKEN_REQUIRED");
  });

  it("detects reuse of an already-rotated token and revokes every session for that account", async () => {
    const { refreshCookie } = await registerUser(app, { email: "reuse-test@example.com" });

    // First rotation succeeds and is legitimate.
    const first = await request(app).post("/api/v1/auth/refresh").set("Cookie", refreshCookie).send({});
    expect(first.status).toBe(200);
    const rotatedCookie = first.headers["set-cookie"][0];

    // Replaying the now-stale original token is the attack signature.
    const replay = await request(app).post("/api/v1/auth/refresh").set("Cookie", refreshCookie).send({});
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("REFRESH_TOKEN_REUSED");

    // The legitimately-rotated token must ALSO be dead now — "kill everything," not "reject this one request."
    const afterReuse = await request(app).post("/api/v1/auth/refresh").set("Cookie", rotatedCookie).send({});
    expect(afterReuse.status).toBe(401);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("revokes the presented token and is idempotent on a second call", async () => {
    const { refreshCookie } = await registerUser(app);

    const first = await request(app).post("/api/v1/auth/logout").set("Cookie", refreshCookie).send({});
    expect(first.status).toBe(204);

    // Logout is deliberately idempotent — no error even though this token is already revoked.
    const second = await request(app).post("/api/v1/auth/logout").set("Cookie", refreshCookie).send({});
    expect(second.status).toBe(204);
  });

  it("clears the refresh cookie", async () => {
    const { refreshCookie } = await registerUser(app);
    const res = await request(app).post("/api/v1/auth/logout").set("Cookie", refreshCookie).send({});
    const clearedCookie = res.headers["set-cookie"][0];
    expect(clearedCookie).toMatch(/refreshToken=;/);
  });

  it("a logged-out session's refresh token can no longer be used to refresh", async () => {
    const { refreshCookie } = await registerUser(app);
    await request(app).post("/api/v1/auth/logout").set("Cookie", refreshCookie).send({});

    const res = await request(app).post("/api/v1/auth/refresh").set("Cookie", refreshCookie).send({});
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns the caller's identity from their access token", async () => {
    const { accessToken, user } = await registerUser(app, { email: "me-test@example.com" });
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: "me-test@example.com", role: "user" });
    expect(res.body.data.id).toBe(user.id);
  });

  it("rejects a missing or invalid access token with 401", async () => {
    const missing = await request(app).get("/api/v1/auth/me");
    expect(missing.status).toBe(401);

    const invalid = await request(app).get("/api/v1/auth/me").set("Authorization", "Bearer not-a-real-token");
    expect(invalid.status).toBe(401);
  });
});
