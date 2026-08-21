import { describe, it, expect } from "vitest";
import { isReservedAlias, RESERVED_ALIASES } from "../../src/utils/reservedAliases.js";

describe("isReservedAlias", () => {
  it("rejects every alias in the reserved set", () => {
    for (const alias of RESERVED_ALIASES) {
      expect(isReservedAlias(alias)).toBe(true);
    }
  });

  it("is case-insensitive — a route match doesn't care about case, so neither should this", () => {
    expect(isReservedAlias("API")).toBe(true);
    expect(isReservedAlias("Admin")).toBe(true);
    expect(isReservedAlias("HEALTHZ")).toBe(true);
  });

  it("allows an ordinary alias that doesn't collide with anything", () => {
    expect(isReservedAlias("my-cool-link")).toBe(false);
    expect(isReservedAlias("claude-code")).toBe(false);
  });
});
