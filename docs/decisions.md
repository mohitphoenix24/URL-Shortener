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

## Testcontainers instead of a shared test database

Integration tests spin up real, disposable Postgres and Redis containers per run rather than
pointing at the dev database in `docker-compose.yml`. Tests that depend on manually-managed shared
state are not really integration tests — they're flaky reruns of whatever the DB happened to
contain last.
