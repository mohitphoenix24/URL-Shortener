import { describe, it, expect } from "vitest";
import { parsePagination, parseSort, buildPaginationMeta } from "../../src/utils/pagination.js";

describe("parsePagination", () => {
  it("defaults to page 1, limit 20 when nothing is provided", () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, offset: 0 });
    expect(parsePagination()).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it("computes offset from page and limit", () => {
    expect(parsePagination({ page: "3", limit: "10" })).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  it("clamps limit to 100 even if a larger value is requested", () => {
    expect(parsePagination({ limit: "50000" }).limit).toBe(100);
  });

  it("clamps page to at least 1 for zero, negative, or garbage input", () => {
    expect(parsePagination({ page: "0" }).page).toBe(1);
    expect(parsePagination({ page: "-5" }).page).toBe(1);
    expect(parsePagination({ page: "not-a-number" }).page).toBe(1);
  });

  it("clamps a negative limit to 1", () => {
    expect(parsePagination({ limit: "-10" }).limit).toBe(1);
  });

  it("treats limit=0 as absent (falls back to the default) rather than clamping to 1", () => {
    // `Number.parseInt(query.limit, 10) || DEFAULT_LIMIT` treats a parsed 0
    // as falsy, same as a missing/unparseable value — this is existing
    // behavior of parsePagination, documented here rather than silently
    // assumed, since "0" reads like it should clamp the same way "-10" does.
    expect(parsePagination({ limit: "0" }).limit).toBe(20);
  });
});

describe("parseSort", () => {
  const ALLOWED = { createdAt: "created_at", clickCount: "click_count" };

  it("parses a valid 'key:direction' string", () => {
    expect(parseSort("clickCount:asc", ALLOWED, "createdAt")).toEqual({ column: "click_count", direction: "ASC" });
  });

  it("defaults direction to DESC when omitted", () => {
    expect(parseSort("clickCount", ALLOWED, "createdAt")).toEqual({ column: "click_count", direction: "DESC" });
  });

  it("falls back to the default key when the sort key isn't in the whitelist", () => {
    // This is the actual security property under test: an unrecognised key
    // must never reach the caller's SQL — only whitelisted columns can.
    expect(parseSort("dropTableUsers", ALLOWED, "createdAt")).toEqual({ column: "created_at", direction: "DESC" });
  });

  it("falls back to the default key when sortParam is undefined", () => {
    expect(parseSort(undefined, ALLOWED, "createdAt")).toEqual({ column: "created_at", direction: "DESC" });
  });

  it("treats any direction other than 'asc' (case-insensitive) as DESC", () => {
    expect(parseSort("createdAt:ASC", ALLOWED, "createdAt").direction).toBe("ASC");
    expect(parseSort("createdAt:garbage", ALLOWED, "createdAt").direction).toBe("DESC");
  });
});

describe("buildPaginationMeta", () => {
  it("computes totalPages, hasNext, hasPrev for a middle page", () => {
    expect(buildPaginationMeta({ page: 2, limit: 10, total: 35 })).toEqual({
      page: 2,
      limit: 10,
      total: 35,
      totalPages: 4,
      hasNext: true,
      hasPrev: true,
    });
  });

  it("reports hasNext: false on the last page and hasPrev: false on the first", () => {
    expect(buildPaginationMeta({ page: 1, limit: 10, total: 5 })).toMatchObject({ hasNext: false, hasPrev: false });
    expect(buildPaginationMeta({ page: 4, limit: 10, total: 35 })).toMatchObject({ hasNext: false, hasPrev: true });
  });

  it("reports totalPages: 1 (not 0) when there are zero results", () => {
    expect(buildPaginationMeta({ page: 1, limit: 20, total: 0 })).toMatchObject({ totalPages: 1, hasNext: false });
  });
});
