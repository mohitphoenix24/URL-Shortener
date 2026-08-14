/**
 * @fileoverview Routes for the links resource — wiring only. Each route
 * validates its input against a Zod schema before the controller ever runs.
 * @author Mohit Sharma
 */

import { Router } from "express";
import { validate } from "../../middleware/validate.js";
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
  validate(createLinkQuerySchema, "query"),
  validate(createLinkSchema, "body"),
  linkController.createLink
);

linkRouter.get("/", validate(listLinksQuerySchema, "query"), linkController.listLinks);

linkRouter.get("/:id", validate(linkIdParamSchema, "params"), linkController.getLink);

linkRouter.patch(
  "/:id",
  validate(linkIdParamSchema, "params"),
  validate(updateLinkSchema, "body"),
  linkController.updateLink
);

linkRouter.delete("/:id", validate(linkIdParamSchema, "params"), linkController.deleteLink);
