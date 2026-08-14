/**
 * @fileoverview Structured JSON logging via Pino, plus the AsyncLocalStorage
 * store that threads a per-request correlation ID through every log line
 * without having to pass a `req` object down through service/repository
 * layers that should never know HTTP exists (Roadmap Level 14).
 * @author Mohit Sharma
 */

import { AsyncLocalStorage } from "node:async_hooks";
import pino from "pino";
import { env, isProduction } from "./env.js";

/**
 * Per-request context store. `requestContext` middleware seeds it with a
 * correlation ID; any code running inside that request (however deep in the
 * call stack) can read it back via {@link getCorrelationId}.
 * @type {AsyncLocalStorage<{correlationId: string}>}
 */
export const requestContextStorage = new AsyncLocalStorage();

/**
 * Reads the correlation ID of the request currently in flight, if any.
 * @returns {string | undefined} The correlation ID, or undefined outside a request.
 */
export function getCorrelationId() {
  return requestContextStorage.getStore()?.correlationId;
}

/**
 * Application-wide Pino instance. Pretty-prints in development for
 * readability; emits raw JSON in production for log aggregators (ELK,
 * CloudWatch, etc.) to parse. Every line is auto-tagged with the current
 * request's correlation ID when one exists.
 * @type {import('pino').Logger}
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  transport: isProduction
    ? undefined
    : { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } },
  mixin() {
    const correlationId = getCorrelationId();
    return correlationId ? { correlationId } : {};
  },
});
