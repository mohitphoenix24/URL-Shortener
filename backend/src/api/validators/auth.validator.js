/**
 * @fileoverview Zod schemas for the auth resource.
 * @author Mohit Sharma
 */

import { z } from "zod";

/**
 * Shared by register and login. `email` is lower-cased here even though
 * the `users.email` column is `CITEXT` (case-insensitive) at the database
 * level — normalizing at the edge means the JWT payload and every log line
 * downstream also stay consistent, not just equality comparisons in SQL.
 * `password` caps at 72 — bcrypt silently truncates anything past 72 bytes,
 * so a longer password would "work" at registration but behave as if only
 * its first 72 bytes mattered, which is a surprising, silent bug to leave
 * in place.
 */
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Must be a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password must be at most 72 characters"),
});

export const loginSchema = registerSchema;

/**
 * `POST /api/v1/auth/refresh` and `/logout` bodies. Both endpoints prefer
 * the refresh token from an httpOnly cookie (see `api/controllers/auth.controller.js`)
 * but accept it in the body too, for API clients that can't hold cookies
 * (curl, Postman without a cookie jar configured).
 */
export const refreshBodySchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .default({});
