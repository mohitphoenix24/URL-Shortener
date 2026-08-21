/**
 * @fileoverview Routes for the auth resource — wiring only.
 *
 * Rate limiting: every route not yet behind `requireAuth` sits behind the
 * anon-by-IP tier (see docs/decisions.md's "Login brute-force protection" —
 * this is that protection, applied uniformly rather than as a bespoke
 * per-route limiter). `/me` is already authenticated, so it uses the
 * auth-by-user tier instead.
 * @author Mohit Sharma
 */

import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimitAnonByIp, rateLimitAuthByUser } from "../../middleware/rateLimit.js";
import * as authController from "../controllers/auth.controller.js";
import { registerSchema, loginSchema, refreshBodySchema } from "../validators/auth.validator.js";

export const authRouter = Router();

authRouter.post("/register", rateLimitAnonByIp, validate(registerSchema, "body"), authController.register);
authRouter.post("/login", rateLimitAnonByIp, validate(loginSchema, "body"), authController.login);
authRouter.post("/refresh", rateLimitAnonByIp, validate(refreshBodySchema, "body"), authController.refresh);
authRouter.post("/logout", rateLimitAnonByIp, validate(refreshBodySchema, "body"), authController.logout);
authRouter.get("/me", requireAuth, rateLimitAuthByUser, authController.me);
