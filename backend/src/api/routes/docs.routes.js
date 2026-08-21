/**
 * @fileoverview API documentation: an interactive Swagger UI at `/docs`, and
 * the raw OpenAPI document as JSON at `/openapi` for tooling (Postman's
 * "import from URL", codegen, etc.) that wants the spec itself rather than
 * the UI. Both are already in `utils/reservedAliases.js`'s reserved-word
 * list, since a custom short link at either path would otherwise be
 * silently shadowed by these routes (same reasoning as `/healthz`,
 * `/metrics`, ...) — see `api/routes/index.js` for why this router is
 * mounted before the redirect catch-all.
 *
 * The spec is parsed from `openapi.yaml` once at startup, not per-request —
 * it's static within a running process, so there's no reason to re-read and
 * re-parse the file on every hit to `/docs` or `/openapi`.
 * @author Mohit Sharma
 */

import { Router } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import swaggerUi from "swagger-ui-express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const openapiDocument = parse(readFileSync(path.join(__dirname, "../../../openapi.yaml"), "utf8"));

export const docsRouter = Router();

docsRouter.get("/openapi", (req, res) => {
  res.json(openapiDocument);
});

// swagger-ui-express's HTML page bootstraps itself with an inline <script>
// and inline <style> — `helmet()`'s app-wide default CSP (script-src 'self',
// no 'unsafe-inline') blocks both, which would render this page blank with
// CSP violations in the console. Overriding the header only on this path
// (via `res.setHeader`, which replaces rather than appends to whatever
// helmet already set) keeps the strict default everywhere else in the app.
docsRouter.use(
  "/docs",
  (req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    );
    next();
  },
  swaggerUi.serve,
  swaggerUi.setup(openapiDocument)
);
