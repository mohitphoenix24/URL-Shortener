import { describe, it, expect } from "vitest";
import { encodeBase62, decodeBase62, isValidBase62, generateRandomBase62 } from "../../src/utils/base62.js";

describe("encodeBase62 / decodeBase62", () => {
  it("round-trips a range of ids, including the sequence offset boundary", () => {
    // 62^4 is the exact id the migration restarts the sequence at, chosen so
    // the first real link is already a 5-character code — see
    // docs/system-design.md. Worth pinning as a regression case on its own.
    const ids = [0n, 1n, 61n, 62n, 3843n, 14776336n, 999999999999n];
    for (const id of ids) {
      expect(decodeBase62(encodeBase62(id))).toBe(id);
    }
  });

  it("encodes 0 as the first alphabet character, not an empty string", () => {
    expect(encodeBase62(0n)).toBe("0");
  });

  it("encodes 62^4 as a 5-character code", () => {
    expect(encodeBase62(14776336n)).toHaveLength(5);
    expect(encodeBase62(14776336n)).toBe("10000");
  });

  it("accepts a plain number as well as a bigint, with identical output", () => {
    expect(encodeBase62(61)).toBe(encodeBase62(61n));
  });

  it("throws a RangeError for a negative id", () => {
    expect(() => encodeBase62(-1n)).toThrow(RangeError);
  });

  it("throws a TypeError decoding a character outside the Base62 alphabet", () => {
    expect(() => decodeBase62("abc!")).toThrow(TypeError);
  });
});

describe("isValidBase62", () => {
  it("accepts well-formed codes", () => {
    expect(isValidBase62("10000")).toBe(true);
    expect(isValidBase62("aZ9")).toBe(true);
  });

  it("rejects empty strings, non-strings, and codes with invalid characters", () => {
    expect(isValidBase62("")).toBe(false);
    expect(isValidBase62(undefined)).toBe(false);
    expect(isValidBase62("foo.bar")).toBe(false);
    expect(isValidBase62("has space")).toBe(false);
  });
});

describe("generateRandomBase62", () => {
  it("generates a code of the requested length using only Base62 characters", () => {
    const code = generateRandomBase62(8);
    expect(code).toHaveLength(8);
    expect(isValidBase62(code)).toBe(true);
  });

  it("defaults to length 8", () => {
    expect(generateRandomBase62()).toHaveLength(8);
  });

  it("is not deterministic across calls (no fixed seed)", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRandomBase62(8)));
    // 62^8 possibilities — 20 draws colliding would indicate something is
    // badly wrong (a fixed seed, a tiny effective alphabet), not bad luck.
    expect(codes.size).toBe(20);
  });
});
