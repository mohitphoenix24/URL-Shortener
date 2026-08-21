import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { hashToken, hashIp } from "../../src/utils/hash.js";

describe("hashToken", () => {
  it("is deterministic for the same input", () => {
    expect(hashToken("some-refresh-token")).toBe(hashToken("some-refresh-token"));
  });

  it("produces a 64-character hex string (SHA-256)", () => {
    expect(hashToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different digests for different inputs", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
  });

  it("never returns the raw input", () => {
    expect(hashToken("super-secret-token")).not.toContain("super-secret-token");
  });
});

describe("hashIp", () => {
  it("is deterministic for the same IP — required for COUNT(DISTINCT ip_hash) to mean anything", () => {
    expect(hashIp("203.0.113.42")).toBe(hashIp("203.0.113.42"));
  });

  it("produces a 64-character hex string (HMAC-SHA256)", () => {
    expect(hashIp("203.0.113.42")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different digests for different IPs", () => {
    expect(hashIp("203.0.113.42")).not.toBe(hashIp("203.0.113.43"));
  });

  it("is not the same as an unsalted SHA-256 of the IP — proves the salt is actually applied", () => {
    const bareSha256 = createHash("sha256").update("203.0.113.42").digest("hex");
    expect(hashIp("203.0.113.42")).not.toBe(bareSha256);
  });
});
