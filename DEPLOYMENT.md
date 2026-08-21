# Deploying to Render

`render.yaml` at the repo root is a [Render Blueprint](https://render.com/docs/blueprint-spec) —
one file defining every service this app needs (API, Postgres, Redis, static frontend). This doc is
the walkthrough: what the Blueprint sets up automatically, what you still have to do by hand, and —
important — a couple of things Render's own docs don't fully confirm, flagged so you're not caught
off guard by them mid-deploy.

## Why Render, not AWS

For this project specifically: the actual engineering the roadmap targets (Postgres internals, the
hand-written rate limiter, caching, auth) is already done. AWS would mostly add operational overhead
(VPC, RDS, ElastiCache, IAM, ALB) on top of that without teaching anything new about *this* codebase,
and it's easy to leave something running and get an unexpected bill. Render gets this stack live with
managed Postgres/Redis and no infrastructure to babysit — the right tradeoff for a solo portfolio
project at this traffic level. AWS is worth learning when you specifically need that experience or
need to scale past what a PaaS offers — neither applies here.

## What the Blueprint does

- **`url-shortener-api`** — the Express API, built from `backend/Dockerfile`. Render builds a
  Dockerfile through to its **last stage only** — there's no `docker build --target` equivalent —
  so this deploys the `runner` stage (lean, production-only dependencies), same as it would locally.
- **`url-shortener-db`** — managed Postgres. Its connection string is wired into the API
  automatically (`fromDatabase`).
- **`url-shortener-redis`** — managed Key Value (Redis-compatible), same auto-wiring
  (`fromService` → `REDIS_URL`).
- **`url-shortener-web`** — the Vite frontend, built and served as a static site (Render's native
  static hosting, not the `frontend/Dockerfile` — that Dockerfile still exists for the local
  `docker compose --profile full` path, see the main README).

Plans are set to `starter` (paid), not `free` — Render's **free Postgres is deleted 30 days after
creation**, which makes it a poor fit for anything meant to stay up as a live portfolio piece rather
than a short-lived demo. If you want to try the whole thing cheaply first, you can lower any `plan:`
in `render.yaml` to `free` and upgrade later — just know free Postgres has that 30-day clock,
free web services spin down after 15 minutes idle (a real user's first request after that eats a
cold-start delay), and free Key Value doesn't persist to disk on restart. That last one is actually
fine for this app specifically — the cache and rate limiter both fail open by design (see
`docs/decisions.md`), so a wiped Redis on restart is never a correctness problem, just a cold cache.

## First-time setup

1. **Connect the repo.** In the Render dashboard: New → Blueprint → connect this GitHub repo. Render
   reads `render.yaml` and shows you the services it's about to create.
2. **Sync.** Render provisions the database, Redis, API, and static site. The API will fail to boot
   the first time — expected, see the next step.
3. **Set the secrets.** `render.yaml` marks `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and
   `IP_HASH_SALT` as `sync: false` deliberately — Render leaves these blank rather than letting
   secret values live in the repo. In the API service's Environment tab, set each one (generate them
   the same way `backend/.env.example` suggests):
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` need 32+ characters, `IP_HASH_SALT` needs 16+ — the
   command above gives you 96 hex characters, comfortably over both.
4. **Run migrations — manually, once, and after any future migration.** This is the one place the
   deploy isn't fully automatic, and deliberately so rather than papered over: because Render can't
   target `backend/Dockerfile`'s `migrator` stage (see above), there's no equivalent of
   docker-compose's one-shot `migrate` service running automatically before the API starts. Instead,
   from your local machine, point at Render's Postgres and run the same command the local workflow
   uses:
   ```bash
   cd backend
   DATABASE_URL="<external connection string from the Render Postgres dashboard>" npm run migrate:up
   ```
   Do this once after the first deploy, and again any time a new migration is added to
   `backend/migrations/` before the corresponding code deploys.
5. **Redeploy the API** (or wait for the next auto-deploy) once secrets are set and migrations have
   run. `GET /healthz` and `GET /readyz` on the API's `.onrender.com` URL are the fastest way to
   confirm it's actually up.

## Two things to verify after your first deploy, not assume

Render's documentation didn't fully confirm these — they're written the most reasonable way based on
what *is* documented, but should be checked against the real deployed app rather than trusted blind:

- **`VITE_API_BASE_URL` reaching the static site's build.** Vite bakes `VITE_*` vars into the built
  JS at build time (`frontend/src/api/client.js`), not runtime. Render's docs confirm `envVars` work
  this way for a service's start command; whether a static site's `buildCommand` sees them the same
  way wasn't explicitly documented on the pages checked. After the first deploy, open the deployed
  frontend and confirm it's actually calling `url-shortener-api.onrender.com`, not
  `localhost:4500` (check the Network tab). If it's wrong, the fallback is hardcoding the real API
  URL directly in `render.yaml`'s `VITE_API_BASE_URL` value (which is already what's there by
  default) and triggering a manual rebuild.
- **`CORS_ORIGIN` and `APP_BASE_URL` matching your actual service names.** Both are written assuming
  the service names in `render.yaml` (`url-shortener-api`, `url-shortener-web`) are exactly what
  Render assigns — if you rename either service in the Render dashboard, or attach a custom domain,
  update `CORS_ORIGIN` on the API service to match, or every browser request from the frontend will
  fail CORS.

## Updating the deployed app

Render auto-deploys on every push to `main` by default (same branch CI already runs against — see
`.github/workflows/ci.yml`). A deploy that only changes application code needs nothing extra; a
deploy that adds a migration needs step 4 run again, ideally right before or right after that push.
