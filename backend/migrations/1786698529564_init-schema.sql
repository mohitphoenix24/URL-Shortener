-- Up Migration

-- CITEXT gives us case-insensitive unique emails ("Mohit@x.com" and
-- "mohit@x.com" collide) without hand-rolling lower() comparisons everywhere.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE links (
  id           BIGSERIAL PRIMARY KEY,
  -- UNIQUE already creates a B-Tree index for us — this is the redirect hot
  -- path lookup (GET /:code), so it must stay indexed.
  short_code   TEXT UNIQUE NOT NULL,
  long_url     TEXT NOT NULL,
  -- ON DELETE CASCADE: deleting a user deletes their links. ON DELETE SET
  -- NULL would "orphan" links to keep them alive after account deletion —
  -- deliberately not chosen here; a user's links are their data.
  user_id      BIGINT REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT,
  expires_at   TIMESTAMPTZ,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  click_count  BIGINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Soft delete: a deleted link keeps its click history and its short_code
  -- (so it can never be silently reissued to someone else), it just stops
  -- resolving. Repositories filter `deleted_at IS NULL` on every read.
  deleted_at   TIMESTAMPTZ
);

-- Dashboard listing: "give me user X's links, newest first". Composite index
-- with the sort column as the second key lets Postgres satisfy both the
-- WHERE and the ORDER BY from one index scan instead of a sort step.
CREATE INDEX idx_links_user_created ON links (user_id, created_at DESC);

-- Partial index: only rows that are actually still active and could expire
-- are indexed, so a future "sweep expired links" job scans a tiny sliver of
-- the table instead of all of it. Rows with expires_at IS NULL (never
-- expire) don't even need to be in this index.
CREATE INDEX idx_links_expires_active ON links (expires_at)
  WHERE is_active = true AND expires_at IS NOT NULL;

-- Short codes are Base62(id), not random — see src/utils/base62.js. Starting
-- the sequence at 62^4 means the very first link is already a 5-character
-- code instead of "1", "2", "3"... which would otherwise be guessable and
-- look unfinished. See docs/system-design.md.
ALTER SEQUENCE links_id_seq RESTART WITH 14776336;

CREATE TABLE clicks (
  id          BIGSERIAL PRIMARY KEY,
  link_id     BIGINT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  clicked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Raw IPs are never stored — only a salted hash (see utils/hash.js in
  -- Phase 4). Column is nullable because click capture must never block or
  -- fail the redirect it's recording.
  ip_hash     TEXT,
  country     TEXT,
  referrer    TEXT,
  device_type TEXT,
  browser     TEXT,
  os          TEXT
);

-- Analytics time series: "clicks for link X, most recent first / grouped by
-- day". Same reasoning as idx_links_user_created above.
CREATE INDEX idx_clicks_link_clicked ON clicks (link_id, clicked_at DESC);

CREATE TABLE refresh_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- We store a hash of the refresh token, never the token itself — same
  -- principle as password_hash. A leaked database row can't be replayed.
  token_hash  TEXT UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Give me this user's active refresh tokens" (e.g. to revoke all sessions
-- on password change).
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);

-- Down Migration

DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS clicks;
DROP TABLE IF EXISTS links;
DROP TABLE IF EXISTS users;
DROP EXTENSION IF EXISTS citext;
