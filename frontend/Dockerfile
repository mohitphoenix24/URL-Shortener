# syntax=docker/dockerfile:1
#
# Vite bakes VITE_* env vars into the built JS at build time, not runtime —
# there's no server process here to read an env var when a request comes
# in, only static files nginx hands out. So VITE_API_BASE_URL has to be a
# build ARG, and changing it means rebuilding the image, not just restarting
# the container (see api/client.js, which reads import.meta.env.VITE_API_BASE_URL).

# ---- build: compile the SPA ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=http://localhost:4500
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ---- runner: serve the static build ----
FROM nginx:1.27-alpine AS runner
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
# 127.0.0.1, not localhost: this container's nginx only listens on IPv4
# (listen 80;, no IPv6 listener), but `localhost` can resolve to the IPv6
# loopback (::1) first — wget then gets "connection refused" against a
# port nothing is listening on there, even though the server is perfectly
# reachable on IPv4. Caught directly: the container ran and served real
# 200s (visible in its own access log) while Docker still reported it
# unhealthy for exactly this reason.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1
