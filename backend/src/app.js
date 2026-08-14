/**
 * @fileoverview Express application assembly. Exported (not started here) so
 * `tests/integration/*` can mount it directly with supertest without binding
 * a real port. `server.js` is the only file that calls `app.listen`.
 * @author Mohit Sharma
 */

import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";

import { env } from "./config/env.js";
import { logger, getCorrelationId } from "./config/logger.js";
import { httpRequestDuration } from "./config/metrics.js";
import { requestContext } from "./middleware/requestContext.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { router } from "./api/routes/index.js";

export const app = express();

// Correlation ID must run first — every later middleware's logs depend on it.
app.use(requestContext);

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(compression());
app.use(express.json({ limit: "16kb" })); // small: this API accepts URLs and short JSON bodies, not uploads

app.use(
  pinoHttp({
    logger,
    genReqId: () => getCorrelationId(),
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
  })
);

// Generic per-route HTTP metrics, labelled by matched route (not raw path)
// to keep label cardinality bounded — recorded on response finish so it
// captures real latency including downstream work.
app.use((req, res, next) => {
  const stop = httpRequestDuration.startTimer();
  res.on("finish", () => {
    const route = req.route?.path ?? req.baseUrl ?? "unmatched";
    stop({ method: req.method, route, status_code: res.statusCode });
  });
  next();
});

app.use(router);

app.use(notFound);
app.use(errorHandler);
