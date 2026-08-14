# Architecture

## Layering

```
HTTP  →  routes/  →  controllers/  →  services/  →  repositories/  →  Postgres
                          ↑              ↓
                     validators/       Redis
```

One-way dependency, enforced by directory, not just convention:

- **`api/routes/`** — Express routers. Wiring only: which path maps to which controller. No
  business logic, no SQL, no direct Redis/Postgres access.
- **`api/controllers/`** — translate HTTP ⇄ domain. Reads `req`, calls a service, shapes the
  response. Never imports from `repositories/` or touches SQL/Redis directly.
- **`api/validators/`** — Zod schemas per resource, applied at the controller boundary before a
  request reaches a service.
- **`services/`** — business rules: cache-aside policy, transaction boundaries, ownership checks.
  Never imports `express` and never sees `req`/`res` — this is what makes services independently
  unit-testable and, in principle, reusable outside HTTP (a CLI, a worker) without change.
- **`repositories/`** — the only layer allowed to contain a raw SQL string. One file per aggregate
  (`user`, `link`, `click`, `refreshToken`). Every exported function takes plain values in, returns
  plain rows out — no ORM entities, no hidden lazy-loading.
- **`middleware/`** — cross-cutting concerns that wrap every/some requests: auth, RBAC, rate
  limiting, request-context (correlation IDs), error handling.
- **`config/`** — the only place `process.env` is read (`config/env.js`), plus the shared Postgres
  pool, Redis client, logger, and Prometheus registry singletons that everything else imports.
- **`utils/`** — pure functions with no framework dependency: Base62 encode/decode, SSRF URL
  validation, the `AppError` type, hashing helpers.

## Request lifecycle

Every request passes through, in order: `requestContext` (correlation ID) → `helmet`/`cors`/
`compression` → JSON body parsing → `pino-http` access logging → HTTP metrics timer → the route
tree → (on no match) `notFound` → `errorHandler`.

Express 5's automatic forwarding of rejected promises to error middleware means a controller or
service can simply `throw new AppError(...)` or let an `await` reject — no `try/catch` boilerplate,
no `asyncHandler` wrapper needed at every route.

## Error handling

`AppError` (see `src/utils/AppError.js`) is the one error type thrown on purpose anywhere in the
call stack. It carries an HTTP status code and a stable machine-readable `code` string. The single
`errorHandler` middleware normalizes `AppError`, Zod validation errors, and Postgres unique-violation
errors into the same JSON shape, and treats anything else as an unexpected 500 — logged with a full
stack trace, never leaked to the client in production.

## Observability

Every request gets a correlation ID (reused from an inbound `X-Correlation-Id` header if present,
otherwise minted) stored in `AsyncLocalStorage`. Pino's `mixin()` hook reads it back automatically,
so any log line anywhere in the call stack for that request — including deep inside a
service/repository with no access to `req` — is tagged with it, without threading the ID through
every function signature. Full detail in `docs/decisions.md` and (once Phase 8 lands) the
Prometheus/Grafana notes below.

This document expands as later phases add the redirect hot path, auth flow, and rate-limiter
internals — see `docs/system-design.md` for those.
