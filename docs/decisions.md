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

## Testcontainers instead of a shared test database

Integration tests spin up real, disposable Postgres and Redis containers per run rather than
pointing at the dev database in `docker-compose.yml`. Tests that depend on manually-managed shared
state are not really integration tests — they're flaky reruns of whatever the DB happened to
contain last.
