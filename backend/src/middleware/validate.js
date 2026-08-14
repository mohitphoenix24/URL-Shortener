/**
 * @fileoverview Generic request-validation middleware factory. Wraps a Zod
 * schema so every route declares its validation as one line instead of
 * repeating `schema.parse(req.body)` + error handling in every controller.
 * A failed parse throws a `ZodError`, which `errorHandler` already knows how
 * to turn into a 422 with per-field details.
 *
 * Validated output is written to `req.valid[source]`, never back onto
 * `req.body`/`req.query`/`req.params` directly. Express 5 defines `req.query`
 * as a getter with no setter (it's re-derived from the URL on each access),
 * so `req.query = ...` throws a TypeError — `req.valid` sidesteps that
 * entirely and keeps "what the client sent" cleanly separate from "what we
 * validated" for every source, not just query.
 * @author Mohit Sharma
 */

/**
 * @param {import('zod').ZodType} schema
 * @param {"body" | "query" | "params"} [source="body"] - Which part of the request to validate.
 * @returns {import('express').RequestHandler} Middleware that parses
 *   `req[source]` and stores the result (type-coerced/defaulted) at
 *   `req.valid[source]` for the controller to read.
 */
export function validate(schema, source = "body") {
  return (req, res, next) => {
    const parsed = schema.parse(req[source]);
    req.valid ??= {};
    req.valid[source] = parsed;
    next();
  };
}
