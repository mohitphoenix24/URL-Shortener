/**
 * @fileoverview Zod schemas for the links resource. These run at the
 * controller boundary (via `middleware/validate.js`) before a request is
 * allowed anywhere near a service — services can therefore trust their
 * inputs are already well-formed and never re-validate shape themselves.
 * @author Mohit Sharma
 */

import { z } from "zod";

/** Public sort keys → actual SQL columns, shared with the controller. */
export const LINK_SORT_COLUMNS = Object.freeze({
  createdAt: "created_at",
  clickCount: "click_count",
  expiresAt: "expires_at",
});

/**
 * `POST /api/v1/links` body. `longUrl` gets a first-pass shape check here
 * (is it URL-shaped at all); the deeper SSRF/protocol/DNS check happens
 * separately in `utils/urlSafety.js` because that check is async and
 * network-bound, which doesn't belong in a synchronous Zod parse.
 */
export const createLinkSchema = z.object({
  longUrl: z.string().trim().min(1).max(2048).url("longUrl must be a valid URL"),
  customAlias: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_-]{3,32}$/, "customAlias must be 3-32 characters: letters, numbers, - or _")
    .optional(),
  title: z.string().trim().max(200).optional(),
  // `.refine` (not `.min(new Date(), ...)`) because `new Date()` inside
  // `.min()` would be evaluated once, when this schema object is built at
  // module load time — every request after boot would be compared against
  // that frozen "now". `.refine`'s callback runs fresh on every `.parse()`.
  expiresAt: z.coerce
    .date()
    .refine((date) => date > new Date(), { message: "expiresAt must be in the future" })
    .optional(),
});

/** `POST /api/v1/links?mode=random|auto` query. */
export const createLinkQuerySchema = z.object({
  mode: z.enum(["auto", "random"]).default("auto"),
});

/** `GET /api/v1/links` query — pagination, sort, and filters. */
export const listLinksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  // NOT z.coerce.boolean() — that coerces via JS truthiness, so the string
  // "false" (non-empty) would become `true`. Query params only ever arrive
  // as strings, so we match against the literal values instead.
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  search: z.string().trim().max(200).optional(),
});

/** `:id` route param, shared by GET/PATCH/DELETE single-link routes. */
export const linkIdParamSchema = z.object({
  id: z.coerce.bigint({ invalid_type_error: "id must be a positive integer" }).positive(),
});

/** `PATCH /api/v1/links/:id` body — every field optional, only provided keys are changed. */
export const updateLinkSchema = z
  .object({
    title: z.string().trim().max(200).nullable().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field must be provided" });
