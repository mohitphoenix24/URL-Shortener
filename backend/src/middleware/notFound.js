/**
 * @fileoverview Catch-all for requests that matched no route at all (as
 * opposed to a route that legitimately raises a 404 AppError, e.g. an
 * unknown short code). Must be registered after every other route.
 * @author Mohit Sharma
 */

import { AppError } from "../utils/AppError.js";

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
export function notFound(req, res, next) {
  next(AppError.notFound(`No route: ${req.method} ${req.originalUrl}`, "ROUTE_NOT_FOUND"));
}
