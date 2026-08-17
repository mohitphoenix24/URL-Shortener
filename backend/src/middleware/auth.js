/**
 * @fileoverview Access-token authentication and role-based authorization
 * middleware. Verifies a `Bearer` access token from the `Authorization`
 * header only — the refresh token (cookie or body) never appears here,
 * that's `api/controllers/auth.controller.js`'s concern exclusively.
 * @author Mohit Sharma
 */

import { verifyAccessToken } from "../utils/jwt.js";
import { AppError } from "../utils/AppError.js";

/**
 * @param {import('express').Request} req
 * @returns {{id: string, email: string, role: string} | undefined} The
 *   authenticated user, or undefined if no valid Bearer token is present.
 */
function extractUser(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;

  try {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    return { id: payload.sub, email: payload.email, role: payload.role };
  } catch {
    return undefined;
  }
}

/**
 * Requires a valid access token. Populates `req.user` on success; responds
 * 401 otherwise. Use on any route that only makes sense for a logged-in
 * caller (the links dashboard, link mutation, `/auth/me`).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
export function requireAuth(req, res, next) {
  const user = extractUser(req);
  if (!user) {
    return next(AppError.unauthorized("Missing or invalid access token", "AUTH_REQUIRED"));
  }
  req.user = user;
  next();
}

/**
 * Populates `req.user` if a valid access token is present, but never
 * rejects the request otherwise — used where a route works for both
 * anonymous and authenticated callers but behaves differently for each
 * (e.g. `POST /api/v1/links`: anonymous creation is allowed, but an
 * authenticated caller's links get attributed to their account).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
export function optionalAuth(req, res, next) {
  req.user = extractUser(req);
  next();
}

/**
 * Restricts a route to specific roles. Must run after `requireAuth` (relies
 * on `req.user` already being populated).
 *
 * @param {...("user" | "admin")} allowedRoles
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized("Missing or invalid access token", "AUTH_REQUIRED"));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(AppError.forbidden("Insufficient permissions for this action", "FORBIDDEN_ROLE"));
    }
    next();
  };
}
