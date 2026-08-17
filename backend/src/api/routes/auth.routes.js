/**
 * @fileoverview Routes for the auth resource — wiring only.
 * @author Mohit Sharma
 */

import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import * as authController from "../controllers/auth.controller.js";
import { registerSchema, loginSchema, refreshBodySchema } from "../validators/auth.validator.js";

export const authRouter = Router();

authRouter.post("/register", validate(registerSchema, "body"), authController.register);
authRouter.post("/login", validate(loginSchema, "body"), authController.login);
authRouter.post("/refresh", validate(refreshBodySchema, "body"), authController.refresh);
authRouter.post("/logout", validate(refreshBodySchema, "body"), authController.logout);
authRouter.get("/me", requireAuth, authController.me);
