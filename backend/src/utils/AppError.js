/**
 * @fileoverview The one error type services/controllers throw on purpose.
 * Carries an HTTP status code and a machine-readable code so the error
 * middleware can map it straight to a response without guessing intent from
 * a message string.
 * @author Mohit Sharma
 */

/**
 * A known, expected application error (as opposed to a bug). Throwing this
 * from anywhere in the request lifecycle produces a clean JSON error
 * response via `errorHandler` — no try/catch needed at the call site because
 * Express 5 forwards rejected promises to error middleware automatically.
 */
export class AppError extends Error {
  /**
   * @param {string} message - Human-readable message, safe to send to clients.
   * @param {number} statusCode - HTTP status code, e.g. 404, 409, 422.
   * @param {string} code - Stable machine-readable identifier, e.g. "LINK_NOT_FOUND".
   * @param {Record<string, *>} [details] - Optional extra context (e.g. validation issues).
   */
  constructor(message, statusCode, code, details) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // distinguishes "expected" errors from bugs in errorHandler
    Error.captureStackTrace?.(this, AppError);
  }

  /** @returns {AppError} 400 — the request itself is malformed. */
  static badRequest(message = "Bad request", code = "BAD_REQUEST", details) {
    return new AppError(message, 400, code, details);
  }

  /** @returns {AppError} 401 — missing/invalid credentials. */
  static unauthorized(message = "Unauthorized", code = "UNAUTHORIZED") {
    return new AppError(message, 401, code);
  }

  /** @returns {AppError} 403 — authenticated but not allowed to do this. */
  static forbidden(message = "Forbidden", code = "FORBIDDEN") {
    return new AppError(message, 403, code);
  }

  /** @returns {AppError} 404 — resource does not exist (or is hidden from this caller). */
  static notFound(message = "Not found", code = "NOT_FOUND") {
    return new AppError(message, 404, code);
  }

  /** @returns {AppError} 409 — request conflicts with current state (e.g. alias taken). */
  static conflict(message = "Conflict", code = "CONFLICT") {
    return new AppError(message, 409, code);
  }

  /** @returns {AppError} 410 — resource existed but is now permanently gone (e.g. expired link). */
  static gone(message = "Gone", code = "GONE") {
    return new AppError(message, 410, code);
  }

  /** @returns {AppError} 422 — well-formed request, semantically invalid. */
  static unprocessable(message = "Unprocessable entity", code = "UNPROCESSABLE_ENTITY", details) {
    return new AppError(message, 422, code, details);
  }

  /** @returns {AppError} 429 — caller is being rate limited. */
  static tooManyRequests(message = "Too many requests", code = "RATE_LIMITED") {
    return new AppError(message, 429, code);
  }
}
