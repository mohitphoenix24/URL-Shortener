import { describe, it, expect } from "vitest";
import { AppError } from "../../src/utils/AppError.js";

describe("AppError factories", () => {
  it.each([
    ["badRequest", 400],
    ["unauthorized", 401],
    ["forbidden", 403],
    ["notFound", 404],
    ["conflict", 409],
    ["gone", 410],
    ["unprocessable", 422],
    ["tooManyRequests", 429],
  ])("%s() produces status %i", (factory, statusCode) => {
    const err = AppError[factory]();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(statusCode);
    expect(err.isOperational).toBe(true);
  });

  it("carries a custom message and machine-readable code through", () => {
    const err = AppError.notFound("This short link does not exist", "LINK_NOT_FOUND");
    expect(err.message).toBe("This short link does not exist");
    expect(err.code).toBe("LINK_NOT_FOUND");
  });

  it("falls back to sensible defaults when no message/code is given", () => {
    const err = AppError.forbidden();
    expect(err.message).toBe("Forbidden");
    expect(err.code).toBe("FORBIDDEN");
  });

  it("attaches optional details (e.g. per-field validation issues)", () => {
    const details = { path: "longUrl", message: "must be a valid URL" };
    const err = AppError.unprocessable("Invalid input", "VALIDATION_ERROR", details);
    expect(err.details).toEqual(details);
  });

  it("has no details by default", () => {
    expect(AppError.notFound().details).toBeUndefined();
  });
});
