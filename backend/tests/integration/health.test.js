import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app, closeConnections } from "./helpers/testApp.js";

afterAll(async () => {
  await closeConnections();
});

describe("GET /healthz", () => {
  it("returns 200 without checking any dependency", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /readyz", () => {
  it("returns 200 with both dependencies reported up against the real Testcontainers", async () => {
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready", dependencies: { postgres: "up", redis: "up" } });
  });
});

describe("GET /metrics", () => {
  it("returns Prometheus text-format output", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toContain("url_shortener_");
  });
});
