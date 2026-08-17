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

## API quick reference (Phase 1)

No auth yet (Phase 2) — every link created right now is anonymous.

```bash
# Create a short link
curl -XPOST localhost:4500/api/v1/links \
  -H 'content-type: application/json' \
  -d '{"longUrl":"https://github.com/mohitphoenix24","title":"My GitHub"}'

# Custom alias instead of an auto-generated code
curl -XPOST localhost:4500/api/v1/links \
  -H 'content-type: application/json' \
  -d '{"longUrl":"https://anthropic.com","customAlias":"claude-code"}'

# Unguessable random code instead of the default sequential one
curl -XPOST "localhost:4500/api/v1/links?mode=random" \
  -H 'content-type: application/json' -d '{"longUrl":"https://nodejs.org"}'

curl -i localhost:4500/10000                        # follow the redirect
curl "localhost:4500/api/v1/links?page=1&limit=20&sort=clickCount:desc&isActive=true"
curl -XPATCH localhost:4500/api/v1/links/14776336 -H 'content-type: application/json' -d '{"isActive":false}'
curl -XDELETE localhost:4500/api/v1/links/14776336   # soft delete
```

## Frontend (basic UI, functional test harness)

Bitly-style: one hero input to shorten a URL, a result card with copy-to-clipboard, and a
management table below (search, filter by status, sort, paginate, toggle active, delete) that
exercises every `/api/v1/links` endpoint. No auth UI yet — that's added alongside Phase 2's backend
auth. Deliberately basic design for now, revisited later; see
[`frontend/src/App.jsx`](frontend/src/App.jsx) for the whole flow in one place.

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
      from Phase 6; auth UI still lands with Phase 2)
- [ ] Phase 2 — Auth & ownership (JWT rotation, RBAC)
- [ ] Phase 3 — Redis cache-aside + hand-written rate limiter
- [ ] Phase 4 — Click analytics
- [ ] Phase 5 — Tests & API docs (OpenAPI/Swagger, Postman)
- [ ] Phase 6 — Frontend polish pass (real design, auth screens)
- [ ] Phase 7 — Docker & CI/CD
- [ ] Phase 8 — Observability (Prometheus/Grafana) & deploy

## License

MIT
