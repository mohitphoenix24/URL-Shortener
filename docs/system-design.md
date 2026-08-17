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

## Redirect hot path (current state — no cache yet)

```
GET /:code
  1. SELECT * FROM links WHERE short_code = $1 AND deleted_at IS NULL
  2. 404 if no row (LINK_NOT_FOUND)
  3. 410 if expires_at is in the past (LINK_EXPIRED)
  4. 403 if is_active = false (LINK_DISABLED)
  5. res.redirect(302, long_url)
```

**302, not 301, on purpose.** A permanent (301) redirect gets cached by browsers, which would let
repeat visits skip this server entirely — breaking click analytics (Phase 4) before it's even built,
and making a link's destination effectively immutable once a browser has cached it.

Redis cache-aside (check cache → miss → query Postgres → populate cache with a jittered TTL →
respond) is Phase 3. Right now every redirect is a live Postgres query — intentionally, so the
"before" state is real and the Phase 3 write-up can show an honest before/after, not a
hypothetical one.

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
