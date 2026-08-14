/**
 * @fileoverview Assigns (or propagates) a correlation ID for every incoming
 * request and runs the rest of the request inside an AsyncLocalStorage
 * context, so any log line emitted anywhere during that request — including
 * deep inside a service or repository with no access to `req` — is
 * automatically tagged with it (Roadmap Level 14: "tracking a request across
 * services").
 * @author Mohit Sharma
 */

import { randomUUID } from "node:crypto";
import { requestContextStorage } from "../config/logger.js";

const CORRELATION_HEADER = "x-correlation-id";

/**
 * Express middleware. Reuses an inbound `X-Correlation-Id` header if present
 * (so a request can be traced across service boundaries later), otherwise
 * mints a new UUID. Echoes the ID back on the response for client-side
 * bug reports.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
export function requestContext(req, res, next) {
  const correlationId = req.headers[CORRELATION_HEADER] || randomUUID();
  req.correlationId = correlationId;
  res.setHeader("X-Correlation-Id", correlationId);

  requestContextStorage.run({ correlationId }, () => next());
}
