# Query Tuning Notes

Placeholder during Phase 0. Once migrations and the analytics endpoints land (Phases 1 and 4), this
file records real `EXPLAIN ANALYZE` output — before and after each index — for the queries that
matter most:

- `SELECT ... FROM links WHERE short_code = $1` — the redirect hot path
- `SELECT ... FROM links WHERE user_id = $1 ORDER BY created_at DESC` — dashboard listing
- `SELECT date_trunc('day', clicked_at), count(*) FROM clicks WHERE link_id = $1 GROUP BY 1` —
  analytics time series
- The partial index on `links(expires_at) WHERE is_active` and its effect on the expiry sweep

Each entry will show the query, the index (or lack of one) at the time, the actual `EXPLAIN ANALYZE`
plan, and what changed after adding the index — not just the final state.
