# Decisions

Short log of the choices that aren't obvious from the code, and why. Written for interview
prep as much as for future-me.

## Postgres + raw SQL instead of Mongo/ORM

The roadmap this project follows (`Backend Engineering Roadmap 2026`) lists relational-database
fundamentals — indexes, joins, transactions, isolation levels, normalization, `EXPLAIN ANALYZE` —
as a distinct skill level. Mongoose was already comfortable from prior MERN projects; it would not
have taught anything new. An ORM (Prisma) was also ruled out for the same reason: it generates the
SQL instead of making you write and tune it. Repositories (`src/repositories/`) are the only files
allowed to contain a SQL string, so the discipline is enforced by layout, not just convention.

## Base62 over a hash + collision retry

Short codes are `BIGSERIAL` primary keys Base62-encoded, not a hash of the URL with a
collision-check-and-retry loop. Collision-free by construction beats "usually unique, handle the
rare miss" — no wasted round trip, no retry logic to get wrong under load. The sequence start is
offset so codes don't begin at `"1"`. See `docs/system-design.md`.

## Hand-written token-bucket rate limiter, not `express-rate-limit`

The roadmap names "Rate Limiter (Token bucket algorithm, Redis)" as a system-design problem to
solve, not a library to install. `express-rate-limit` would satisfy the *requirement* while
skipping the *lesson*. The bucket refill/consume happens atomically in a Redis Lua script
(`scripts/rateLimit.lua`) — a single round trip, no read-then-write race condition.

## No message broker (BullMQ/Kafka) for click analytics

Explicitly scoped out. Click capture happens inline: the redirect responds first
(`res.redirect()`), then a click row is written fire-and-forget with its own error handler — so
redirect latency is never coupled to the analytics write, without needing a broker to get that
property. The service boundary is drawn so a queue producer could be dropped in later by changing
one function, but that swap is out of scope for this build.

## ESM + Express 5 over CommonJS + Express 4

Prior projects (`g-drive-clone`) used CommonJS and Express 4 with `asyncHandler` wrappers around
every async route handler to catch rejected promises. Express 5 forwards rejected promises to error
middleware automatically, which removes that wrapper entirely and is the direction the framework is
moving. ESM was chosen alongside it as the deliberate, permanent move off `require()`.

## `req.valid`, not overwriting `req.body`/`req.query`/`req.params`

Discovered while testing Phase 1's first `POST /api/v1/links` call: Express 5 turned `req.query`
into a getter-only property (re-derived from the URL on each access), so a validation middleware
that reassigns it — the natural way to write "parse then replace" — throws
`TypeError: Cannot set property query of #<IncomingMessage> which has only a getter`. Fixed by
having `middleware/validate.js` write parsed/coerced output to `req.valid[source]` instead of
overwriting the Express-owned property, for all three sources (`body`/`query`/`params`), for
consistency even though only `query` strictly required it. Full writeup in
`docs/system-design.md`.

## Frontend pulled forward from Phase 6 to Phase 1

The original plan built the frontend last (Phase 6), after auth/caching/analytics existed
server-side. In practice, testing a backend by hand with curl/Postman for five more phases is
worse than having a real UI to click through immediately — so a basic version was built right
after Phase 1 instead, covering only what Phase 1 exposes (no login, since there's nothing to log
into yet). It gets extended, not rebuilt, once Phase 2 adds auth and later phases add analytics.

## CSS class composition caught by actually looking at a screenshot

`ResultCard`'s copy button (`<CopyButton className="btn btn--primary" />`, combined with the
component's own `.copy-btn` class) rendered as **white text on a white background** — invisible,
but the element was there, correctly wired, and every functional test passed. Both `.copy-btn` and
`.btn--primary` declare `background`; same specificity, so the one later in the stylesheet
(`.copy-btn`, white) won — but only `.btn--primary` declares `color` (white), so nothing overrode
that. The bug was invisible to curl-based testing, invisible to "the button exists and is
clickable" checks, and only showed up by rendering the page in a real (headless) browser and
looking at the screenshot. Fixed by making `.copy-btn` declare every property it needs, including
ones that look redundant, and adding a dedicated `.copy-btn--primary` modifier instead of
composing two independently-designed button classes. Lesson: for UI work, "the test passed" and
"a human looking at a screenshot would notice something's wrong" are different bars — this repo's
own engineering guidelines call that out explicitly, and this is exactly the failure mode they're
about.

## Links table overflow: reported by the user, first fix was wrong, second fix addressed the cause

Flagged directly ("delete button is going out, look at it") with a screenshot showing the Delete
button and part of the Actions column bleeding past the card's right edge on a real desktop
browser. Root cause: the links table has seven columns — one holding full destination URLs — and
`.app__main`'s `max-width: 960px` simply didn't leave the card enough room for all of them at their
natural width.

The first fix was wrong in a way worth recording: wrapping the table in an `overflow-x: auto`
container with a `min-width` on the table stopped the *visual bleed*, but the `min-width` forced
horizontal scrolling even though scrolling was never the point — it just moved the Actions column
(Delete button, active toggle) behind an undiscoverable scrollbar instead of past the card edge.
Re-measuring after that "fix" (screenshot + a bounding-box check, not just eyeballing it) showed
the button was still effectively unreachable, just differently broken. The actual fix was to widen
`.app__main` to 1140px so the table fits without scrolling at all on an ordinary desktop viewport,
and keep the `overflow-x: auto` wrapper only as a fallback for genuinely narrow (mobile) viewports
— verified separately at 375px, where it correctly does scroll. Lesson: a fix that makes the
symptom stop being *visible* isn't the same as a fix that makes the underlying layout correct —
re-verify the actual thing the user complained about (can they click Delete?), not just that the
screenshot looks different.

## Dark mode: an inline pre-paint script, not a CSS-only or React-only toggle

Theme is decided in three layers, each covering a gap the other two leave: a tiny synchronous
`<script>` in `index.html`'s `<head>` reads `localStorage`/`prefers-color-scheme` and sets
`data-theme` on `<html>` *before* React ever loads, so there's no flash-of-wrong-theme on reload —
a React-only `useEffect` toggle would necessarily paint the default theme first, then flip, visibly.
`hooks/useTheme.js` owns changing it afterward (the toggle button) and keeps `localStorage` in sync.
`styles/index.css` defines the dark palette twice — once under `@media (prefers-color-scheme: dark)`
guarded by `:not([data-theme="light"])`, once under `[data-theme="dark"]` — so a user who never
touches the toggle still gets dark mode from their OS setting, and the toggle's explicit choice wins
in both directions once they do.

## Frontend polish pass: a real overflow bug the fullPage screenshot masked, then didn't

The hero section's decorative radial-gradient glow (`.hero::before`) is a fixed 640px wide, centered
under `left: 50%`. On any viewport narrower than that — every phone — it extends past the visible
edge on both sides. Verified directly with a 375px Playwright viewport:
`document.documentElement.scrollWidth` came back 508, not 375, meaning the page actually had
horizontal scroll on mobile despite looking fine in every desktop screenshot taken up to that point.

Two fix attempts, two different ways of being wrong. First (`overflow-x: hidden` on `body` alone)
*looked* like it worked in a screenshot but didn't: `fullPage: true` captures Playwright's underlying
*layout* geometry (CDP's content-size metrics), which doesn't shrink just because CSS `overflow`
visually clips it — only a viewport-sized (non-fullPage) screenshot, and a direct
`scrollWidth`/`clientWidth` comparison, reflect what a real browser actually renders and scrolls.
Second attempt, applying `overflow-x: hidden` to both `html` and `body` (measured correctly this
time — `scrollWidth` did equal `clientWidth`), broke something else instead: `.header`'s
`position: sticky` stopped sticking, scrolling away with the rest of the page. Any non-`visible`
`overflow` on an ancestor of a sticky element can do that, and `html`/`body` are ancestors of
*everything* — header included, even though the header has nothing to do with the glow. The actual
fix: `overflow: hidden` on `.hero` itself, which contains the glow (a child of `.hero`) without being
an ancestor of `.header` (a sibling section, not a parent) — clip only the box that needs clipping,
confirmed by re-checking both properties together afterward: sticky header still pins at `top: 0`
on scroll, and mobile `scrollWidth` still equals `clientWidth`.

## Docker: a `migrator` stage separate from `runner`, not one image that does both

`backend/Dockerfile` builds two independent runtime images from the same source: `runner` (the API
process, `npm ci --omit=dev`) and `migrator` (`node-pg-migrate up`, full `npm ci`). `node-pg-migrate`
is a devDependency precisely because the *running server* never calls it — only a one-off deploy
step does — so baking it into the image that stays up and serves traffic would ship tooling nothing
at runtime uses. `docker-compose.yml`'s `migrate` service runs once (`profiles: ["full"]`, no
`restart:` policy) and `api` waits on `service_completed_successfully` from it, so the API container
never starts against an unmigrated database — and never *auto*-migrates on its own boot either, which
matters once there's more than one replica: several instances racing to migrate on startup is a real
failure mode, an explicit one-shot step isn't.

## Docker Compose profiles: keeping the host `npm run dev` workflow and the fully-containerised one from colliding

`postgres`/`redis` have no `profiles:` (always started by plain `docker compose up -d`); `migrate`/
`api`/`web` are gated behind `profiles: ["full"]`. Without that gate, adding `api`/`web` as ordinary
services would mean `docker compose up -d` — the exact command Phase 0's "Getting started" already
tells a new clone to run — now also tries to bind ports 4500 and 5175, which the host-run
`npm run dev` processes from that same guide already own. The gate is what lets both workflows keep
being true at once: `docker compose up -d` for infra-only + host dev servers (fast reload), or
`docker compose --profile full up --build` for the whole stack, containerised.

## Three real bugs, caught only by actually running `--profile full`, not by writing the Dockerfiles carefully

Docker configs that merely *look* plausible are exactly the kind of thing that only fails the first
time someone really needs the container to boot — so before calling Phase 7 done, the full profile
was actually built and run, end to end, browser included. It surfaced three genuine bugs a careful
read of the Dockerfiles alone wouldn't have:

1. **`NODE_ENV` from the wrong source.** `api`'s `env_file: ./backend/.env` loads the *host* dev
   value (`NODE_ENV=development`, correct for `npm run dev`) — and Compose's `environment:` block
   only overrides `DATABASE_URL`/`REDIS_URL`, not `NODE_ENV`. `env_file` values apply before
   `environment:` overrides, so without an explicit `NODE_ENV: production` override too, the
   container crash-looped: `config/logger.js` tried to load the dev-only `pino-pretty` transport, a
   devDependency the lean `prod-deps` stage (`npm ci --omit=dev`) never installs.
2. **A missing `COPY`.** `backend/Dockerfile`'s `runner` stage copied `src/`, `package.json`, and
   `openapi.yaml`, but not `scripts/` — `config/redis.js` reads `scripts/rateLimit.lua` at startup to
   register the rate-limiter's Lua command, so the container crashed with `ENOENT` until that line
   was added.
3. **`localhost` resolving to the wrong stack.** Both `HEALTHCHECK`s used `wget http://localhost/...`.
   `nginx`'s (and, incidentally, could have affected Node's) container only listens on IPv4; when
   `localhost` resolved to the IPv6 loopback (`::1`) first, `wget` got "connection refused" against a
   port nothing was listening on there — even though the server was completely healthy and serving
   real 200s the whole time, visible in its own access log. Docker reported the container
   "unhealthy" regardless, because the healthcheck itself, not the server, was hitting the wrong
   address. Fixed by pinning both healthchecks to `127.0.0.1` explicitly rather than relying on
   `localhost` resolving predictably in every environment.

All three were invisible from reading the Dockerfile/compose YAML in isolation — each only showed up
as a real container failing to start or reporting unhealthy, confirmed by `docker logs` and
`docker inspect --format '{{json .State.Health}}'`, not by inspection.

## Observability: a pinned Grafana datasource uid, found by actually loading the dashboard

`observability/grafana/dashboards/url-shortener.json` hardcodes `"datasource": {"type": "prometheus",
"uid": "prometheus"}` in every panel — that's the normal way a provisioned dashboard references its
datasource without a human picking it from a dropdown. The datasource provisioning YAML, though,
didn't originally set an explicit `uid:` — Grafana generates a random one for an unpinned datasource
on every provisioning run, which the dashboard's hardcoded `"uid": "prometheus"` then can't resolve.

The failure mode this produces is the worst kind: not an error, a *blank panel*. No red banner, no
console error, no failed network request — Grafana just can't find the datasource for that panel and
renders nothing. Reading the dashboard JSON or the datasource YAML in isolation, both looked correct;
the mismatch only exists *between* them. Caught by actually logging into Grafana and looking at the
dashboard (first with real traffic already generated) rather than trusting that "the file parsed" or
"the container started" meant it worked — every panel was empty on the first real load. Fixed by
adding `uid: prometheus` to `observability/grafana/provisioning/datasources/datasource.yml`, matching
what the dashboard already hardcoded; re-verified with a fresh screenshot showing every panel
populated (cache hit ratio, rate-limit rejections by tier, the works).

The same "only running it end-to-end catches this" lesson as Phase 7's three Docker bugs — a
provisioning config and a dashboard file can each be independently well-formed and still not agree
with each other about an identifier, and nothing short of loading the actual page surfaces that.

## Hybrid JWT: stateless access token, stateful-revocable refresh token

The roadmap frames "Stateful Sessions vs Stateless JWT" as a choice, but production systems that
need *revocability* (logout, stolen-token response) usually don't pick one — they combine both.
Access tokens here are pure stateless JWTs: verified by signature alone, never touch Postgres, so
they're cheap to check on every request. Refresh tokens are ALSO signed JWTs, but every one issued
is additionally persisted (SHA-256 hashed, not bcrypt — see `utils/hash.js` for why) in
`refresh_tokens`, which is what makes them revocable at all. A bare JWT can't be "un-signed" early;
a JWT plus a DB row that says whether it's still valid can. `utils/jwt.js` and
`services/auth.service.js` carry the full reasoning inline.

## Refresh-token rotation with reuse detection, not just rotation

Every successful `/auth/refresh` call revokes the token it was given and issues a new one — so a
refresh token is single-use. The extra step: if a token that's already revoked gets presented
again, that's not "expired," it's a signal the token leaked and two parties (the real client and
whoever stole it) both tried to use it. The response is to revoke *every* active session for that
account, not just reject the one request — verified directly in testing: after a legitimate
rotation, replaying the old token correctly triggered `REFRESH_TOKEN_REUSED`, and the token from
the legitimate rotation was found revoked too, exactly as the "kill everything" response predicts.

## A real concurrent-refresh bug, caught by testing the actual browser reload — not theorized

Single-use refresh rotation (above) has a sharp edge on the client: if two requests to
`/auth/refresh` ever fire concurrently with the same cookie, the first rotates it and succeeds, the
second presents an already-rotated token and trips reuse detection — which revokes *every* session,
including the one the first call just legitimately created. This was designed against from the
start in `frontend/src/api/client.js`'s response interceptor (a shared in-flight promise so
concurrent 401s all await one refresh call, not one each).

What wasn't anticipated: `AuthContext`'s own startup effect — "try to silently restore a session
from the cookie on page load" — called the refresh endpoint *directly*, bypassing that same guard
entirely. React 19's `StrictMode` double-invokes effects in development specifically to surface
exactly this class of bug, and it did: reloading the page while logged in fired two real concurrent
`/auth/refresh` requests with the identical cookie, confirmed in the backend logs — one `200`, one
`401 REFRESH_TOKEN_REUSED` — and the session that had just been restored was immediately killed
again as a side effect. The page hung on "Checking session…" during Playwright verification, never
resolved either state.

This wasn't something a code review would have caught by inspection — the interceptor's dedup guard
*looked* like it covered "the refresh call," and it did, for the one call site that used it. The
bug was two call sites, only one deduplicated. Fixed by making `refreshSession()` in `client.js` the
single function anywhere in the frontend allowed to hit the endpoint — `api/auth.js`'s `refresh()`
now delegates to it instead of calling the endpoint itself, so there's structurally one dedup point
regardless of who's asking. Re-verified the same reload scenario afterward: session restores
cleanly, table populates, zero errors.

## Refresh token in an httpOnly cookie; access token in the JSON body

The refresh token never appears anywhere client-side JavaScript can read it — an XSS payload can't
exfiltrate what it can't access. It rides as an `httpOnly`, `SameSite=Lax` cookie scoped to
`/api/v1/auth` only (not `/`), so it isn't even attached to unrelated requests like `POST
/api/v1/links`. The access token, by contrast, IS returned in the body and is meant to be held in
memory only on the frontend (a React state variable, not `localStorage`) — short-lived (15m) by
design, so the exposure window if it did leak is small. `SameSite=Lax` is the CSRF mitigation here
rather than a separate double-submit token: it withholds the cookie on cross-site POSTs entirely,
which is sufficient for this project's scope and is the modern baseline recommendation. Locally,
frontend (`:5175`) and backend (`:4500`) differ only by port, which `SameSite` treats as the same
site — this needs revisiting if frontend and backend are ever deployed on genuinely different
registrable domains.

## Ownership rule: owner or admin, full stop — including for anonymous links

`assertOwnerOrAdmin` in `services/link.service.js` is one rule applied identically to reading,
updating, and deleting a single link: an admin may touch anything; a regular user may only touch a
link where `user_id` matches their own id. An anonymous (`user_id IS NULL`) link is *not*
manageable by "any logged-in user" — deliberately, since that would let any authenticated stranger
hijack or delete someone else's throwaway public link. It's owned by nobody, so — same as being
owned by someone else — only an admin can touch it. Verified directly: a non-owner, non-admin user
gets a 403 on an anonymous link exactly as they would on someone else's claimed link, while an
admin can read it fine.

This also means `GET /api/v1/links` (the list) and `GET /api/v1/links/:id` (a single link) both now
require authentication — there's no "public dashboard." That's a deliberate reading of "links
scoped to owner": Bitly and every real link-shortener product require login to see or manage your
links; only the redirect itself (`GET /:code`) stays fully public, because that's the one operation
that has to work for anyone clicking a shared link regardless of who they are.

## Login brute-force protection: the general rate limiter, not a bespoke one

`POST /api/v1/auth/login` has no rate limiting of its own — it sits behind the same anon-by-IP
token-bucket tier as `/register`, `/refresh`, `/logout`, and anonymous link creation
(`middleware/rateLimit.js`, Phase 3), rather than a bespoke ad-hoc limiter that would just
duplicate it. Verified directly: 25 rapid bad-password attempts from one IP got `401` for the
first 20 (`RATE_LIMIT_ANON_CAPACITY`) and `429 RATE_LIMITED` for the rest, with a computed
`Retry-After` header. Full design in `docs/system-design.md`.

## Testcontainers instead of a shared test database

Integration tests spin up real, disposable Postgres and Redis containers per run rather than
pointing at the dev database in `docker-compose.yml`. Tests that depend on manually-managed shared
state are not really integration tests — they're flaky reruns of whatever the DB happened to
contain last.

## One shared container pair for the whole integration run, not one per test file

Starting a fresh Postgres+Redis pair per test file would isolate perfectly but pay container-startup
cost dozens of times over. Instead, `tests/integration/globalSetup.js` starts one pair for the
entire `test:integration` run and hands the connection strings to every file via Vitest's
`provide`/`inject`; each test isolates by `TRUNCATE ... RESTART IDENTITY CASCADE` /
`FLUSHDB` in `beforeEach` rather than by container boundaries.

**A real cross-file race, caught by running the suite, not by reasoning about it.** The first full
run of the integration suite produced a cluster of failures with no obvious common cause: a
duplicate-email register that should 409 instead succeeded with 201; a login immediately after
register 500'd with a Postgres foreign-key violation on `refresh_tokens.user_id`; a redirect for a
link created two lines earlier 404'd. All different symptoms of the same thing: Vitest runs test
*files* in parallel by default, and every file was pointed at the same shared Postgres/Redis pair —
file B's `beforeEach` truncating `users` mid-flight while file A's request was still inserting a
refresh token for a user that had just ceased to exist. `test.fileParallelism: false` on the
integration project alone didn't fix it (parallelism scheduling turned out to happen at the root
Vitest instance, not per-workspace-project); pinning the project to `poolOptions.forks.singleFork:
true` did — one fork, one file at a time, full run went from 17 failures to 0. Left both settings in
`vitest.workspace.js` with this reasoning inline, since removing either looks like harmless cleanup
otherwise.

## Unit vs. integration as separate Vitest workspace projects, not one config

A single `vitest.config.js` with one `globalSetup` would force `npm run test:unit` to boot two
Docker containers it never touches, just because integration tests elsewhere in the same config
need them. `vitest.workspace.js` defines two projects with independent `globalSetup`/`setupFiles` —
unit tests stay Docker-free and millisecond-fast; only `--project integration` pays the
Testcontainers cost.
