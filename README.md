# URL Shortener

A production-shaped URL shortener built to learn backend engineering properly, not to finish a
tutorial. Author: **Mohit Sharma**.

This project deliberately deviates from a "standard MERN" build: the database is **PostgreSQL with
raw SQL**, not MongoDB. Mongo is the part already known; SQL — indexes, joins, transactions,
isolation levels, `EXPLAIN ANALYZE`, normalization — is the actual skill gap this project targets.

Rate limiting and the short-code generator are hand-written rather than pulled from npm, because
those *are* the lesson (see [`docs/system-design.md`](docs/system-design.md)).

## Stack

- **Runtime:** Node.js (ESM), Express 5
- **Database:** PostgreSQL 16, raw SQL via `pg`, versioned migrations via `node-pg-migrate`
- **Cache / rate limiting:** Redis 7 via `ioredis`, atomic Lua token-bucket script
- **Auth:** JWT access + refresh (rotation), bcrypt password hashing, RBAC
- **Validation:** Zod (requests *and* startup env config)
- **Observability:** Pino structured logs with correlation IDs, `prom-client` metrics, Prometheus + Grafana
- **Testing:** Vitest + Supertest (unit + API), Testcontainers (real Postgres/Redis in integration tests)
- **Ops:** Docker, docker-compose, GitHub Actions CI
- **Frontend:** React + Vite — a functional test harness for the API, not a design exercise

## Architecture

Strict one-way dependency:

```
HTTP → routes → controllers → services → repositories → Postgres
                    ↑             ↓
               validators       Redis
```

- `routes/` — wiring only, no logic
- `controllers/` — HTTP in/out, never touches SQL
- `services/` — business rules, caching, transactions; never touches `req`/`res`
- `repositories/` — the only layer allowed to contain a SQL string
- `middleware/` — auth, rate limiting, request context, error handling

Full design notes live in [`docs/architecture.md`](docs/architecture.md),
[`docs/query-tuning.md`](docs/query-tuning.md), and [`docs/system-design.md`](docs/system-design.md).

## Ports

Chosen to avoid clashing with other local services already running on this machine.

| Service | Port |
|---|---|
| API | 4500 |
| Postgres | 5435 |
| Redis | 6381 |
| Vite UI | 5175 |
| Prometheus | 9091 |
| Grafana | 3001 |

## Getting started

```bash
# 1. Infra
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env      # then fill in JWT secrets — see comment in the file
npm install
npm run migrate:up
npm run dev

# 3. Frontend
cd ../frontend
cp .env.example .env
npm install
npm run dev      # → http://localhost:5175
```

## API quick reference

### Auth (Phase 2)

```bash
# Register (also logs you in) — sets an httpOnly refresh-token cookie, returns an access token
curl -c cookies.txt -XPOST localhost:4500/api/v1/auth/register \
  -H 'content-type: application/json' -d '{"email":"you@example.com","password":"password123"}'

curl -c cookies.txt -XPOST localhost:4500/api/v1/auth/login \
  -H 'content-type: application/json' -d '{"email":"you@example.com","password":"password123"}'

# Rotate: old refresh token is invalidated, a new access+refresh pair is issued
curl -b cookies.txt -c cookies.txt -XPOST localhost:4500/api/v1/auth/refresh

curl -XPOST localhost:4500/api/v1/auth/me -H "Authorization: Bearer $ACCESS_TOKEN"
curl -b cookies.txt -XPOST localhost:4500/api/v1/auth/logout
```

### Links (Phase 1 core, now owner-scoped)

`POST /links` still allows anonymous creation (unclaimed — `userId: null`); every other links
route now requires `Authorization: Bearer <accessToken>`, and `GET/PATCH/DELETE /:id` are
owner-scoped (403 for anyone else, admin excepted). The redirect itself (`GET /:code`) stays fully
public — that has to work for anyone clicking a shared link.

```bash
curl -XPOST localhost:4500/api/v1/links \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'content-type: application/json' \
  -d '{"longUrl":"https://github.com/mohitphoenix24","title":"My GitHub"}'

# Custom alias instead of an auto-generated code
curl -XPOST localhost:4500/api/v1/links \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'content-type: application/json' \
  -d '{"longUrl":"https://anthropic.com","customAlias":"claude-code"}'

# Unguessable random code instead of the default sequential one
curl -XPOST "localhost:4500/api/v1/links?mode=random" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'content-type: application/json' -d '{"longUrl":"https://nodejs.org"}'

curl -i localhost:4500/10000                        # follow the redirect — no auth needed
curl "localhost:4500/api/v1/links?page=1&limit=20&sort=clickCount:desc&isActive=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
curl -XPATCH localhost:4500/api/v1/links/14776336 -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'content-type: application/json' -d '{"isActive":false}'
curl -XDELETE localhost:4500/api/v1/links/14776336 -H "Authorization: Bearer $ACCESS_TOKEN"
```

## Frontend (basic UI, functional test harness)

Bitly-style: one hero input to shorten a URL, a result card with copy-to-clipboard, and a
management table below (search, filter by status, sort, paginate, toggle active, delete) that
exercises every `/api/v1/links` endpoint. Deliberately basic design for now, revisited later; see
[`frontend/src/App.jsx`](frontend/src/App.jsx) for the whole flow in one place.

**Auth (Phase 2):** a combined login/register panel replaces the links table for a logged-out
visitor; the shorten form itself still works either way (anonymous creation is a supported
backend case). A session survives a page reload via the httpOnly refresh cookie — no login
prompt flashes on refresh — and the access token is held only in memory (a JS closure in
`api/client.js`, never `localStorage`), re-attached to every request automatically. See
[`docs/decisions.md`](docs/decisions.md) for a real concurrency bug this surfaced (and fixed) in
the refresh flow.

## Verifying it's alive

```bash
curl -s http://localhost:4500/healthz     # process liveness
curl -s http://localhost:4500/readyz      # dependency readiness (Postgres + Redis)
curl -s http://localhost:4500/metrics     # Prometheus scrape target
```

## Testing

```bash
npm test              # unit + integration (spins real Postgres/Redis via Testcontainers)
npm run test:unit
npm run test:integration
```

## Project status

Built in phases, each one committed working end-to-end. See
[`docs/decisions.md`](docs/decisions.md) for the reasoning behind each major choice.

- [x] Phase 0 — Foundation (env validation, logging, error handling, health checks, Docker infra)
- [x] Phase 1 — Core shortener (Base62, CRUD, redirect, SSRF guard)
- [x] Phase 1 UI — basic React/Vite frontend covering everything Phase 1 exposes (pulled forward
      from Phase 6)
- [x] Phase 2 — Auth & ownership (JWT rotation + reuse detection, RBAC) + frontend login/register,
      session persistence across reload
- [ ] Phase 3 — Redis cache-aside + hand-written rate limiter
- [ ] Phase 4 — Click analytics
- [ ] Phase 5 — Tests & API docs (OpenAPI/Swagger, Postman)
- [ ] Phase 6 — Frontend polish pass (real design)
- [ ] Phase 7 — Docker & CI/CD
- [ ] Phase 8 — Observability (Prometheus/Grafana) & deploy

## License

MIT
