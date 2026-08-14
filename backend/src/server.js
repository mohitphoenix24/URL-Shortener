/**
 * @fileoverview Process entry point. Starts the HTTP server and owns
 * graceful shutdown — on SIGTERM/SIGINT it stops accepting new connections,
 * lets in-flight requests finish, then drains the Postgres pool and Redis
 * connection before exiting. Without this, a container orchestrator's
 * rolling deploy would drop live requests every time.
 * @author Mohit Sharma
 */

import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { closeDatabase, pingDatabase } from "./config/db.js";
import { closeRedis, pingRedis } from "./config/redis.js";

const server = app.listen(env.PORT, async () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "URL Shortener API listening");

  // Confirm dependencies at boot so a misconfigured .env is caught
  // immediately in the logs rather than on the first request.
  const [dbOk, redisOk] = await Promise.all([pingDatabase(), pingRedis()]);
  if (!dbOk) logger.warn("Postgres is not reachable at startup");
  if (!redisOk) logger.warn("Redis is not reachable at startup");
});

/**
 * Shared shutdown handler for SIGTERM/SIGINT.
 * @param {string} signal - The signal that triggered shutdown, for logging.
 * @returns {Promise<void>}
 */
async function shutdown(signal) {
  logger.info({ signal }, "Shutdown signal received, closing gracefully");

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, "Error while closing HTTP server");
      process.exitCode = 1;
    }

    try {
      await Promise.all([closeDatabase(), closeRedis()]);
      logger.info("All connections closed. Exiting.");
    } catch (closeErr) {
      logger.error({ err: closeErr }, "Error closing dependencies during shutdown");
      process.exitCode = 1;
    } finally {
      process.exit();
    }
  });

  // Safety net: if something hangs (e.g. a stuck connection), don't let the
  // process wait forever — force-exit after a grace period.
  setTimeout(() => {
    logger.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection — exiting");
  process.exit(1);
});
