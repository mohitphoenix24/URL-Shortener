import { describe, it, expect, vi, beforeEach } from "vitest";

// `assertSafeUrl` does a real DNS lookup for any non-IP-literal hostname —
// mocking `node:dns/promises` is what makes the "resolves to a private IP"
// and "resolves to a public IP" cases deterministic and network-independent
// instead of depending on what some real hostname happens to resolve to
// right now. Must be declared before importing the module under test.
vi.mock("node:dns/promises", () => ({
  default: { lookup: vi.fn() },
  lookup: vi.fn(),
}));

import dns from "node:dns/promises";
import { assertSafeUrl, isPrivateIP } from "../../src/utils/urlSafety.js";
import { AppError } from "../../src/utils/AppError.js";

beforeEach(() => {
  vi.mocked(dns.lookup).mockReset();
});

describe("isPrivateIP", () => {
  it.each([
    "127.0.0.1", // loopback
    "10.0.0.1", // RFC1918
    "172.16.0.1",
    "192.168.1.1",
    "169.254.1.1", // link-local
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "255.255.255.255",
  ])("flags %s (IPv4) as private", (ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34"])("does not flag %s (IPv4) as private", (ip) => {
    expect(isPrivateIP(ip)).toBe(false);
  });

  it.each([
    "::1", // loopback
    "::", // unspecified
    "fe80::1", // link-local
    "fd00::1", // unique local (ULA)
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:10.0.0.1", // IPv4-mapped RFC1918
  ])("flags %s (IPv6) as private", (ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it("does not flag a public IPv6 address as private", () => {
    expect(isPrivateIP("2606:4700:4700::1111")).toBe(false);
  });

  it("returns false for a string that isn't an IP literal at all", () => {
    expect(isPrivateIP("example.com")).toBe(false);
  });
});

describe("assertSafeUrl", () => {
  it("rejects a malformed URL", async () => {
    await expect(assertSafeUrl("not a url")).rejects.toMatchObject({ code: "INVALID_URL", statusCode: 422 });
  });

  it("rejects an empty or non-string longUrl", async () => {
    await expect(assertSafeUrl("")).rejects.toMatchObject({ code: "INVALID_URL" });
  });

  it("rejects a URL longer than 2048 characters", async () => {
    const longUrl = `https://example.com/${"a".repeat(2048)}`;
    await expect(assertSafeUrl(longUrl)).rejects.toMatchObject({ code: "URL_TOO_LONG" });
  });

  it("rejects a disallowed protocol", async () => {
    await expect(assertSafeUrl("ftp://example.com/file")).rejects.toMatchObject({ code: "INVALID_URL_PROTOCOL" });
    await expect(assertSafeUrl("javascript:alert(1)")).rejects.toMatchObject({ code: "INVALID_URL_PROTOCOL" });
  });

  it("rejects localhost and *.localhost without needing a DNS lookup", async () => {
    await expect(assertSafeUrl("http://localhost/admin")).rejects.toMatchObject({
      code: "URL_TARGETS_PRIVATE_NETWORK",
    });
    await expect(assertSafeUrl("http://foo.localhost/admin")).rejects.toMatchObject({
      code: "URL_TARGETS_PRIVATE_NETWORK",
    });
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it("rejects a literal private IP in the hostname without a DNS lookup", async () => {
    await expect(assertSafeUrl("http://127.0.0.1/")).rejects.toMatchObject({ code: "URL_TARGETS_PRIVATE_NETWORK" });
    await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data/")).rejects.toMatchObject({
      code: "URL_TARGETS_PRIVATE_NETWORK",
    });
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it("accepts a literal public IP without a DNS lookup", async () => {
    await expect(assertSafeUrl("http://8.8.8.8/")).resolves.toBeUndefined();
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it("rejects a hostname that resolves (DNS rebinding) to a private IP", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(assertSafeUrl("https://evil-rebind.example.com/")).rejects.toMatchObject({
      code: "URL_TARGETS_PRIVATE_NETWORK",
    });
  });

  it("accepts a hostname that resolves only to public IPs", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    await expect(assertSafeUrl("https://example.com/")).resolves.toBeUndefined();
  });

  it("rejects when even one of several resolved addresses is private", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);
    await expect(assertSafeUrl("https://multi-homed.example.com/")).rejects.toMatchObject({
      code: "URL_TARGETS_PRIVATE_NETWORK",
    });
  });

  it("rejects a hostname that fails to resolve at all", async () => {
    vi.mocked(dns.lookup).mockRejectedValue(Object.assign(new Error("not found"), { code: "ENOTFOUND" }));
    await expect(assertSafeUrl("https://this-domain-does-not-exist.invalid/")).rejects.toMatchObject({
      code: "URL_HOST_UNRESOLVABLE",
    });
  });

  it("every rejection is an AppError with statusCode 422", async () => {
    vi.mocked(dns.lookup).mockRejectedValue(new Error("boom"));
    const err = await assertSafeUrl("https://unresolvable.invalid/").catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(422);
  });
});
