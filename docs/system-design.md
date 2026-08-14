# System Design Notes

Filled in as each mechanism is built. Placeholder during Phase 0 — see `docs/decisions.md` for the
reasoning already locked in.

## Planned sections

- **Short-code generation** (Phase 1) — Base62 over `BIGSERIAL`, why it's collision-free by
  construction, the `?mode=random` and `customAlias` variants and their own guarantees.
- **Redirect hot path** (Phase 1 → Phase 3) — cache-aside sequence, negative caching, TTL jitter and
  why it prevents a stampede, fire-and-forget click capture.
- **Rate limiter** (Phase 3) — token bucket algorithm, why it's implemented as a single atomic Redis
  Lua script instead of read-then-write, the three tiers (anon/auth/redirect) and their capacities.
- **Estimation** (this section) — rough RPS/storage math for a hypothetical read-heavy deployment,
  in the style of the roadmap's System Design Level 11 walkthrough.
