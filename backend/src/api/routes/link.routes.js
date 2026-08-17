/**
 * @fileoverview Routes for the links resource — wiring only. Each route
 * validates its input against a Zod schema before the controller ever runs.
 *
 * Auth: `POST /` uses `optionalAuth` (anonymous creation stays allowed);
 * every other route requires `requireAuth` — the dashboard, single-link
 * reads, updates, and deletes are all owner-scoped (see
 * `services/link.service.js`'s `assertOwnerOrAdmin`).
 * @author Mohit Sharma
 */

import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { requireAuth, optionalAuth } from "../../middleware/auth.js";
import * as linkController from "../controllers/link.controller.js";
import {
  createLinkSchema,
  createLinkQuerySchema,
  listLinksQuerySchema,
  linkIdParamSchema,
  updateLinkSchema,
} from "../validators/link.validator.js";

export const linkRouter = Router();

linkRouter.post(
  "/",
  optionalAuth,
  validate(createLinkQuerySchema, "query"),
  validate(createLinkSchema, "body"),
  linkController.createLink
);

linkRouter.get("/", requireAuth, validate(listLinksQuerySchema, "query"), linkController.listLinks);

linkRouter.get("/:id", requireAuth, validate(linkIdParamSchema, "params"), linkController.getLink);

linkRouter.patch(
  "/:id",
  requireAuth,
  validate(linkIdParamSchema, "params"),
  validate(updateLinkSchema, "body"),
  linkController.updateLink
);

linkRouter.delete("/:id", requireAuth, validate(linkIdParamSchema, "params"), linkController.deleteLink);
