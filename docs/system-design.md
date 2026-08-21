# System Design Notes

## Short-code generation

Short codes are **Base62(id)**, not a hash or a random string with a collision check. `links.id`
is a Postgres `BIGSERIAL` — the database already guarantees it's unique — so encoding it can never
produce a duplicate. No "generate, check if taken, retry" loop exists in the default path at all.

The generation order matters: the app pulls the next value from `links_id_seq` **first**
(`SELECT nextval('links_id_seq')`), encodes it to Base62, and inserts the row with both the id and
the short code already known — one INSERT, not an insert-then-update. See
[`repositories/link.repository.js`](../backend/src/repositories/link.repository.js) `nextLinkId()`.

**Sequence offset.** The migration restarts the sequence at `62^4 = 14,776,336`
(`migrations/*_init-schema.sql`), so the very first link is already a 5-character code (`"10000"`)
instead of `"1"`, `"2"`, `"3"`... which would look unfinished and be trivially guessable/enumerable.

Verified empirically: id `14776336` (i.e. `62^4` exactly) encodes to `"10000"` — five characters,
confirming the offset does what it's meant to.

**Two other creation modes**, both handled in `services/link.service.js`:

- **`customAlias`** (body field) — the user's own string is used as the short code verbatim.
  Checked against a reserved-word list ([`utils/reservedAliases.js`](../backend/src/utils/reservedAliases.js):
  `api`, `admin`, `healthz`, `metrics`, `docs`, ...) before insert, and the database's `UNIQUE`
  constraint on `short_code` is the real backstop — a duplicate is caught as Postgres error `23505`
  and turned into a `409 ALIAS_TAKEN`.
- **`?mode=random`** (query param) — an unguessable code via `crypto.randomInt` per character
  (not `randomBytes` + modulo, which would introduce modulo bias). Collisions are astronomically
  unlikely at 8 characters (62⁸ ≈ 218 trillion combinations) but handled anyway: on a unique
  violation, retry up to 5 times with a fresh random code.

**A real gap, observed and explained.** Postgres sequences are *not* transactional — a value pulled
by `nextval()` is never returned even if the statement that used it fails. During manual testing, a
duplicate-`customAlias` request consumed sequence value `14776338` and then failed its INSERT (alias
already taken); the *next* successful link got `14776339`, leaving a permanent gap at `14776338`.
This is expected, harmless (ids only need to be unique, not contiguous), and exactly what the code
comment in `nextLinkId()` predicts.

## Redirect hot path (Phase 3: Redis cache-aside)

```
GET /:code
  1. MGET link:<code>, link:<code>:absent           (one round trip, both keys)
  2. positive hit  → skip Postgres entirely, go to step 5
  3. negative hit  → 404 (LINK_NOT_FOUND), skip Postgres entirely
  4. miss both     → SELECT * FROM links WHERE short_code = $1 AND deleted_at IS NULL
                      found    → SET link:<code> EX <jittered LINK_CACHE_TTL_SECONDS>
                      not found → SET link:<code>:absent EX <jittered LINK_NEGATIVE_CACHE_TTL_SECONDS>, 404
  5. 410 if expires_at is in the past (LINK_EXPIRED)      — re-checked against the clock on every
  6. 403 if is_active = false (LINK_DISABLED)                call, cache hit or miss alike
  7. res.redirect(302, long_url)
```

See `services/link.service.js` (`resolveLink`, `getCacheEntries`, `cachePositive`, `cacheNegative`,
`bustLinkCache`). Both TTLs are jittered (±10%, `utils/jitter.js`) so a burst of links cached around
the same moment don't all expire in the same instant and stampede Postgres together. The negative
cache exists specifically so a code that's typo'd or was never created doesn't cost a live query on
every retry — its TTL is much shorter than the positive one precisely because a *false* negative
(caused by racing a create against an in-flight lookup of the same code) is worse than a false
positive would be; `createLink` also explicitly busts any stale negative entry for the code it just
inserted, so that race self-heals immediately rather than waiting out the TTL.

`updateLink`/`deleteLink` invalidate (not update-in-place) the positive cache entry for the affected
code — simpler than keeping a cached payload in sync field-by-field, and the next redirect just
repopulates it. `expires_at` is the one field that can't be invalidated proactively (nothing writes
to it on a timer), so it's re-evaluated against the current clock on every resolution, cache hit or
not — the cache only ever skips the Postgres round trip, never the expiry/disabled check itself.

Redis being unreachable fails open at every step (`getCacheEntries`/`cachePositive`/`cacheNegative`/
`bustLinkCache` all catch and log rather than throw) — caching is a performance optimization on this
path, not a correctness dependency; a Redis outage degrades straight back to "every redirect hits
Postgres directly," which was Phase 3's actual "before" state.

**302, not 301, on purpose.** A permanent (301) redirect gets cached by browsers, which would let
repeat visits skip this server entirely — breaking click analytics (Phase 4) before it's even built,
and making a link's destination effectively immutable once a browser has cached it.

## Rate limiting (Phase 3: hand-written Redis token bucket)

`scripts/rateLimit.lua`, wrapped by `middleware/rateLimit.js`. One Lua script evaluated atomically
server-side (`EVALSHA`, via `ioredis`'s `defineCommand`) instead of an app-side GET-then-SET, which
would race under concurrent requests for the same bucket: read-refill-consume-write happens as a
single indivisible step, so two simultaneous requests can't both read the same "tokens remaining"
value and both be admitted, letting the bucket go negative.

Bucket state is a Redis hash (`tokens`, `updated_at_ms`) keyed by `ratelimit:{<bucketId>}`, refilled
lazily on each check (`elapsed_ms / 1000 * refill_per_sec`, capped at `capacity`) rather than by a
background job — no scheduler needed, and an idle bucket costs nothing until it's used again. Each
key gets an `EXPIRE` long enough for a full refill from empty plus slack, so idle buckets don't live
in Redis forever.

Three tiers, each its own capacity/refill pair (`RATE_LIMIT_*` in `.env`):

| Tier | Bucket key | Capacity | Refill/sec | Applied to |
|---|---|---|---|---|
| anon | `anon:<ip>` | 20 | 0.33 | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, anonymous `POST /links` |
| auth | `user:<id>` | 100 | 1.5 | every `requireAuth` links route, `/auth/me` |
| redirect | `redirect:<ip>` | 300 | 5 | `GET /:code` |

`POST /links` (which allows both anonymous and authenticated callers via `optionalAuth`) picks the
anon or auth tier per request based on whether `req.user` was populated
(`rateLimitLinksCreate` in `middleware/rateLimit.js`).

The anon tier doubles as `POST /auth/login`'s brute-force protection — no bespoke limiter was
written for login specifically (see `docs/decisions.md`); it sits behind the same general
infrastructure as every other unauthenticated route. Verified directly: 25 rapid bad-password
login attempts from one IP returned `401` for the first 20 and `429 RATE_LIMITED` (with a
computed `Retry-After` header, in seconds) for the rest.

Like the cache, this fails open — a Redis error is logged and the request is allowed through rather
than the whole API going down because rate limiting couldn't be evaluated.

## Route ordering: why `GET /:code` is mounted last

`GET /:code` matches *any* single path segment — that includes `/healthz`, `/metrics`, `/api`, etc.
Express matches routes in registration order and stops at the first match, not by specificity. The
redirect router is therefore mounted **after** every other router in
[`api/routes/index.js`](../backend/src/api/routes/index.js), so `/healthz` is claimed by the health
router before the redirect catch-all ever sees it. Verified directly: `/healthz` and `/readyz` both
resolve correctly with the redirect route live.

This is also why reserved aliases matter even though they're technically unreachable by route order
already — without the check, a user could create a link at `/healthz` that silently never resolves
(shadowed by the real health route), which would be a confusing bug report instead of a clear 409 at
creation time.

## Query validation and Express 5

Express 5 changed `req.query` from a plain assignable property (Express 4) into a getter with no
setter — it's re-derived from the URL on each access rather than cached. Code that tried to
reassign it (`req.query = parsedResult`, the natural way to write a generic Zod-validation
middleware) throws `TypeError: Cannot set property query of #<IncomingMessage> which has only a
getter`. Hit this directly while testing `POST /api/v1/links` and fixed it by having
[`middleware/validate.js`](../backend/src/middleware/validate.js) write parsed output to a separate
`req.valid[source]` namespace instead of overwriting `req.body`/`req.query`/`req.params` — sidesteps
the getter issue entirely and, as a side effect, keeps "what the client sent" cleanly separate from
"what passed validation" for every request.

## Auth session lifecycle

```
POST /auth/register or /auth/login
  → 201/200, body: { user, accessToken }
  → Set-Cookie: refreshToken=<jwt>; HttpOnly; SameSite=Lax; Path=/api/v1/auth

Every subsequent request to a protected route:
  → Authorization: Bearer <accessToken>
  → requireAuth verifies the signature only (no DB hit) → req.user

Access token expires (15m):
  POST /auth/refresh  (browser sends the cookie automatically; curl/Postman may send
                        { "refreshToken": "..." } in the body instead)
    1. verify JWT signature + exp on the presented refresh token
    2. SHA-256 it, look up the hash in refresh_tokens
    3. not found            → 401 INVALID_REFRESH_TOKEN
    4. found, revoked_at set → reuse detected: revoke EVERY token for this user, 401 REFRESH_TOKEN_REUSED
    5. found, expired        → 401 REFRESH_TOKEN_EXPIRED
    6. otherwise: revoke this row, issue + persist a brand new access+refresh pair
  → new Set-Cookie with the rotated refresh token; body: { user, accessToken }

POST /auth/logout
  → revoke the presented token's row (idempotent — no error if already gone)
  → clear the cookie
```

**Verified end-to-end by hand, including the failure paths** (the parts that are easy to get wrong
and don't show up just from the happy path working):

- Rotating a refresh token, then replaying the *old* one → `REFRESH_TOKEN_REUSED`, and the
  legitimately-issued *new* token was also found revoked immediately after — confirming the "kill
  every session" response actually fires, not just "reject this one request."
- Capturing a raw refresh token before calling `/logout`, then presenting that captured token
  afterward via the body (bypassing the cookie entirely) → still rejected. Proves revocation is
  enforced server-side against the database, not merely by the browser discarding a cleared cookie.
- Two accounts, cross-ownership: user B given user A's link id → `403 LINK_FORBIDDEN` on GET,
  PATCH, and DELETE alike. An anonymous (`user_id IS NULL`) link produces the identical 403 for a
  non-admin, non-owner caller — "unclaimed" is not "manageable by anyone."
- Promoting a user to `admin` (directly via SQL — there's no self-service admin grant in this
  phase) and re-logging-in to pick up the new role in a fresh access token: `GET /api/v1/links`
  then returns every user's links unscoped, and a link a regular user gets 403 on is readable by
  the admin.

## Estimation (rough, for context)

Not a real capacity plan — a sanity check in the style of the roadmap's Level 11 walkthrough, to
make sure the design isn't obviously wrong for a "small-to-medium public shortener" scale.

- **Writes (link creation):** low volume relative to reads — even an aggressive 10 links/sec
  sustained is nothing for a single Postgres instance with two B-Tree index updates per insert.
- **Reads (redirects):** the dominant traffic by orders of magnitude in any real shortener (a link
  is created once, clicked many times) — this is *why* Phase 3's Redis cache-aside matters far more
  than write-path optimization.
- **Storage:** a `links` row is a few hundred bytes; a `clicks` row (Phase 4) even less. A million
  links plus ten clicks each is on the order of low single-digit GB — trivial for Postgres, the
  index size (not the table) becomes the thing worth watching as it grows.
