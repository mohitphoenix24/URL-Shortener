/**
 * @fileoverview Startup environment validation. Every piece of runtime
 * configuration flows through this file and nowhere else — no other module is
 * allowed to read `process.env` directly. That keeps config typo-proof: a
 * missing or malformed variable fails loudly at boot instead of silently
 * misbehaving three requests later in production.
 * @author Mohit Sharma
 */

import "dotenv/config";
import { z } from "zod";

/**
 * Accepts a Go-style duration string ("15m", "7d", "30s") because that is
 * what `jsonwebtoken`'s `expiresIn` option expects verbatim.
 * @type {import('zod').ZodType<string>}
 */
const durationString = z
  .string()
  .regex(/^\d+[smhd]$/, "expected a duration like '15m', '7d', '30s'");

// Render auto-injects RENDER_EXTERNAL_URL (a full https:// URL) into every
// web service — exactly what APP_BASE_URL means (see utils/mappers.js's
// toLinkDto). Only fall back to it when APP_BASE_URL isn't explicitly set,
// so local dev (which sets APP_BASE_URL in .env, no RENDER_EXTERNAL_URL)
// is unaffected.
if (!process.env.APP_BASE_URL && process.env.RENDER_EXTERNAL_URL) {
  process.env.APP_BASE_URL = process.env.RENDER_EXTERNAL_URL;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4500),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  APP_BASE_URL: z.string().url(),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL: durationString.default("15m"),
  JWT_REFRESH_TTL: durationString.default("7d"),

  CORS_ORIGIN: z.string().min(1).default("http://localhost:5175"),

  RATE_LIMIT_ANON_CAPACITY: z.coerce.number().positive().default(20),
  RATE_LIMIT_ANON_REFILL_PER_SEC: z.coerce.number().positive().default(0.33),
  RATE_LIMIT_AUTH_CAPACITY: z.coerce.number().positive().default(100),
  RATE_LIMIT_AUTH_REFILL_PER_SEC: z.coerce.number().positive().default(1.5),
  RATE_LIMIT_REDIRECT_CAPACITY: z.coerce.number().positive().default(300),
  RATE_LIMIT_REDIRECT_REFILL_PER_SEC: z.coerce.number().positive().default(5),

  LINK_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  LINK_NEGATIVE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),

  // Salts the IP hash click analytics stores (see utils/hash.js). Without a
  // secret salt, SHA-256(ip) would be reversible by brute force — IPv4 is
  // only ~4 billion values, trivial to rainbow-table — which would make
  // "we don't store raw IPs" a privacy claim in name only.
  IP_HASH_SALT: z.string().min(16, "IP_HASH_SALT must be at least 16 characters"),

  ANALYTICS_DEFAULT_RANGE_DAYS: z.coerce.number().int().positive().default(30),
  ANALYTICS_MAX_RANGE_DAYS: z.coerce.number().int().positive().default(365),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast and loud — a bad .env should never let the process limp into a
  // partially-configured "running" state.
  console.error("❌ Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`   - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

/**
 * Fully validated, typed, defaulted application configuration.
 * Import this instead of touching `process.env` anywhere else in the codebase.
 * @type {Readonly<z.infer<typeof envSchema>>}
 */
export const env = Object.freeze(parsed.data);

/** @type {boolean} */
export const isProduction = env.NODE_ENV === "production";
/** @type {boolean} */
export const isTest = env.NODE_ENV === "test";
