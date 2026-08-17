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

## Login brute-force protection: deferred to Phase 3, not duplicated here

`POST /api/v1/auth/login` has no rate limiting of its own. That's not an oversight — Phase 3 adds a
hand-written Redis token-bucket rate limiter as a piece of general request-handling infrastructure,
and login will sit behind it like every other endpoint once it exists, rather than getting a
bespoke ad-hoc limiter now that would just get replaced.

## Testcontainers instead of a shared test database

Integration tests spin up real, disposable Postgres and Redis containers per run rather than
pointing at the dev database in `docker-compose.yml`. Tests that depend on manually-managed shared
state are not really integration tests — they're flaky reruns of whatever the DB happened to
contain last.
