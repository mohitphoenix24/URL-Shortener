# Issues Log

A plain-English record of real problems hit while building and deploying this
project — what went wrong, why, and how it got fixed. This is not a list of
features; it's a list of things that broke, confused, or wasted time, kept
around so the same mistake doesn't happen twice.

**Keep this updated.** Every time something breaks during development or
deployment and gets fixed, add a new entry at the bottom of the relevant
section using the same format: what happened, why it happened, how it was
fixed.

---

## Development issues

### 1. Container crashed on boot: "unable to determine transport target for pino-pretty"

The API container kept restarting in a loop. `pino-pretty` (used to make logs
readable during local development) is a dev-only dependency — the production
image never installs it. But the container was still picking up
`NODE_ENV=development` from the shared `.env` file, so the logger tried to
load `pino-pretty` anyway and crashed because it wasn't there.

**Fix:** explicitly set `NODE_ENV=production` in `docker-compose.yml` for the
containerized services, overriding whatever `.env` says.

### 2. Container crashed on boot: `ENOENT` for a missing script

Same crash-loop symptom, different cause: the app loads a Lua script
(`scripts/rateLimit.lua`) at startup to register it with Redis. That folder
was never copied into the Docker image, so the file didn't exist inside the
container and the app crashed trying to read it.

**Fix:** added `COPY scripts ./scripts` to `backend/Dockerfile`.

### 3. Docker healthcheck said "unhealthy" even though the app was working fine

Both the frontend and backend containers showed as unhealthy in
`docker ps`, despite the access logs showing real, successful 200 responses.
Cause: the healthcheck command used `wget http://localhost/...`, and
`localhost` resolved to the IPv6 loopback address (`::1`) first — but the
server inside the container only listens on IPv4. So the healthcheck was
connecting to a port nothing was listening on, while the app itself worked
perfectly for real traffic.

**Fix:** changed healthchecks to use `127.0.0.1` explicitly instead of
`localhost`.

### 4. Grafana container wouldn't start: nested bind mount

Tried to mount the dashboard JSON folder as its own separate volume, nested
inside a folder that was already mounted read-only. Docker doesn't allow
creating a new mount point inside a directory that's already a mount point —
the container failed to start at all.

**Fix:** removed the nested mount and pointed Grafana at one single mount
covering the whole `observability/grafana/provisioning` folder instead.

### 5. Integration tests failed randomly — but only when run together

Some test runs would fail with random 500 or 404 errors on data that was
just created moments earlier, or rate-limit counters that reset mid-test.
Individually, every test passed. Cause: all integration test files share one
real Postgres and Redis instance (not separate throwaway containers per
test), and Vitest was running multiple test files in parallel — one file's
"clear the database" step could wipe data another file was actively using.

**Fix:** forced all integration test files to run one at a time
(`fileParallelism: false` plus pinning to a single worker process) instead
of in parallel.

### 6. Click counts were roughly double what they should be

A single real click on a link was sometimes counted twice. Cause: Chrome's
"preload pages" feature speculatively loads a pasted or typed URL before you
even press Enter, then loads it again for the real navigation — two
identical requests for one visible click.

**Fix:** browsers that do this send a special header (`Sec-Purpose` /
`Purpose`) marking the request as speculative. The redirect still happens
normally, but click-counting now skips any request carrying that header.

### 7. Links table overflowed off the edge of the card on desktop

The Delete button and part of the table bled past the right edge of its
container. First attempted fix (make the table scroll horizontally) "fixed"
the visible overflow but created a new, worse problem: it hid the Delete
button behind a horizontal scrollbar most people wouldn't notice.

**Fix:** widened the page's main content area so the table fits without
needing to scroll at normal desktop sizes; the horizontal-scroll fallback
was kept only for genuinely narrow screens.

---

## Deployment issues (Render)

### 8. Render asked for a credit card just to deploy

The deploy blueprint (`render.yaml`) had the database, API, and Redis all
set to Render's paid "starter" plan. Paid plans require a card on file
before Render will provision anything, even before the first charge.

**Fix:** switched all three to the `free` plan. Trade-off: Render's free
Postgres database automatically deletes itself 30 days after creation, and
the free web service "falls asleep" after 15 minutes with no traffic
(the next request after that is slow to wake it back up).

### 9. API crashed on deploy: "APP_BASE_URL: Invalid url"

The blueprint tried to auto-generate the API's own public address using a
Render feature that only returns the bare hostname (e.g.
`url-shortener-api.onrender.com`) — no `https://` in front. The app's
startup check requires a complete web address, not just a hostname, so it
refused to start.

**Fix (attempt 1, didn't fully work):** changed the app so that if its own
`APP_BASE_URL` isn't explicitly given, it falls back to reading Render's
automatic `RENDER_EXTERNAL_URL` variable instead (which is a complete
address). This didn't actually solve it — see the next entry.

### 10. API still crashed on deploy: "APP_BASE_URL: Required"

After the fix above, the app now failed with a different, related error —
meaning neither the custom `APP_BASE_URL` variable nor Render's automatic
`RENDER_EXTERNAL_URL` were available inside the running container. Render's
own documentation says every service should get `RENDER_EXTERNAL_URL`
automatically, but it apparently wasn't reaching this specific service (a
plain Docker container, not one of Render's more common runtime types).

**Fix:** stopped trying to auto-generate or derive the value at all.
Checked the API's real, live web address directly in the Render dashboard
and hardcoded that exact address into `render.yaml`. Guaranteed to work
because it no longer depends on any assumption about how Render behaves.

### 11. The site's actual web addresses didn't match what was assumed

`render.yaml` was written assuming the API and the frontend would get clean
addresses like `url-shortener-api.onrender.com`. In reality, both of those
exact names were already taken by other people's projects on Render (these
names are shared across every Render user, not just this account), so
Render silently added a random suffix to each — e.g.
`url-shortener-api-w46w.onrender.com` and
`url-shortener-web-5aym.onrender.com`.

This broke two things that depended on the assumed clean names: the
frontend didn't know the API's real address, and the API's CORS setting
(which browsers use to decide "is this website allowed to talk to this
API?") didn't recognize the frontend's real address, so every request from
the live site would have been silently blocked by the browser.

**Fix:** checked both real addresses directly in the Render dashboard and
hardcoded the correct ones into `render.yaml`.

### 12. Running database migrations failed: "SSL/TLS required"

Trying to run the one-time database setup command from a local machine
against Render's database failed immediately with an SSL error. Render's
databases require an encrypted connection when accessed from outside
Render's own network, and the plain connection string didn't request one.

**Fix:** added `?sslmode=require` to the end of the database connection
string when running migrations from outside Render.

### 13. Leftover development message was visible on the live site

The header on the deployed site showed the text "Backend test harness —
every request here hits the real API" — a note that made sense during local
development but had no place on a live, deployed app.

**Fix:** removed the line before considering the deploy finished.

---

## What this suggests going forward

Most of the deployment issues (9–11) came from the same root cause: relying
on Render to automatically fill in a URL, rather than checking the real,
actual URL after deployment and using that. When setting up any new hosted
service, deploy first with a placeholder, then go check the dashboard for
the real assigned values before assuming defaults are correct.
