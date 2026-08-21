import { describe, it, expect, vi, afterEach } from "vitest";
import { jitteredTtlSeconds } from "../../src/utils/jitter.js";

describe("jitteredTtlSeconds", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stays within base * (1 ± jitterRatio) across many draws", () => {
    const base = 3600;
    const ratio = 0.1;
    for (let i = 0; i < 200; i++) {
      const ttl = jitteredTtlSeconds(base, ratio);
      expect(ttl).toBeGreaterThanOrEqual(Math.floor(base * (1 - ratio)));
      expect(ttl).toBeLessThanOrEqual(Math.ceil(base * (1 + ratio)));
    }
  });

  it("produces varying values rather than always returning the base (proves jitter is applied)", () => {
    const values = new Set(Array.from({ length: 50 }, () => jitteredTtlSeconds(3600, 0.1)));
    expect(values.size).toBeGreaterThan(1);
  });

  it("never returns less than 1 second even for a tiny base with large jitter", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // pushes jitter to its most negative extreme
    expect(jitteredTtlSeconds(1, 0.9)).toBeGreaterThanOrEqual(1);
  });

  it("defaults jitterRatio to 0.1", () => {
    vi.spyOn(Math, "random").mockReturnValue(1); // most positive extreme: +jitterRatio
    expect(jitteredTtlSeconds(1000)).toBe(1100);
  });
});
