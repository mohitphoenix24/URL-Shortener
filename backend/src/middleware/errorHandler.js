/**
 * @fileoverview Central error-handling middleware. Every error in the
 * request lifecycle — thrown `AppError`s, rejected promises from async route
 * handlers (Express 5 forwards these automatically), Zod validation
 * failures, unexpected bugs — ends up here exactly once.
 * @author Mohit Sharma
 */

import { ZodError } from "zod";
import { AppError } from "../utils/AppError.js";
import { logger } from "../config/logger.js";
import { isProduction } from "../config/env.js";

/**
 * Normalizes any thrown value into `{ statusCode, code, message, details }`.
 * @param {unknown} err
 * @returns {{statusCode: number, code: string, message: string, details?: *}}
 */
function normalize(err) {
  if (err instanceof AppError) {
    return { statusCode: err.statusCode, code: err.code, message: err.message, details: err.details };
  }

  if (err instanceof ZodError) {
    return {
      statusCode: 422,
      code: "VALIDATION_ERROR",
      message: "Request failed validation",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }

  // Postgres unique_violation surfaced without going through a repository's
  // own duplicate check (defense in depth for race conditions).
  if (err?.code === "23505") {
    return { statusCode: 409, code: "CONFLICT", message: "Resource already exists" };
  }

  return { statusCode: 500, code: "INTERNAL_ERROR", message: "Something went wrong" };
}

/**
 * Express error-handling middleware (note the 4-arg signature — required for
 * Express to recognise it as such).
 *
 * @param {unknown} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 * @returns {void}
 */
export function errorHandler(err, req, res, _next) {
  const { statusCode, code, message, details } = normalize(err);

  const logPayload = { err, statusCode, code, method: req.method, url: req.originalUrl };
  if (statusCode >= 500) {
    logger.error(logPayload, "Unhandled error");
  } else {
    logger.warn(logPayload, "Request error");
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      // Stack traces are a debugging aid for us, never for API consumers in prod.
      ...(!isProduction && statusCode >= 500 && err instanceof Error ? { stack: err.stack } : {}),
    },
  });
}
