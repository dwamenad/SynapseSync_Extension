import "dotenv/config";
import cookieParser from "cookie-parser";
import express from "express";
import { env } from "./config/env";
import { createRequestId, summarizeRequestBody } from "./lib/requestLogging";
import { requireAuth } from "./middleware/auth";
import authRoutes from "./routes/auth";
import chatRoutes from "./routes/chat";
import csrfRoutes from "./routes/csrf";
import googleRoutes from "./routes/google";
import meRoutes from "./routes/me";
import researchRoutes from "./routes/research";

export function createApp() {
  const app = express();
  const configuredExtensionOrigins = (env.CHROME_EXTENSION_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const isAllowedOrigin = (origin: string) => {
    if (origin === env.APP_BASE_URL) {
      return true;
    }

    if (configuredExtensionOrigins.includes(origin)) {
      return true;
    }

    if (env.NODE_ENV !== "production" && origin.startsWith("chrome-extension://")) {
      return true;
    }

    return false;
  };

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser(env.SESSION_COOKIE_SECRET));
  app.use((req, res, next) => {
    const requestId = createRequestId();
    const startedAt = Date.now();
    res.setHeader("x-request-id", requestId);
    res.locals.requestId = requestId;

    res.on("finish", () => {
      if (!env.LOG_REQUESTS) {
        return;
      }
      const durationMs = Date.now() - startedAt;
      const summary = summarizeRequestBody(req);
      // Token-safe request logging for local debugging and API observability.
      console.log(
        JSON.stringify({
          requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs,
          userId: req.user?.id || null,
          bodySummary: summary
        })
      );
    });

    next();
  });
  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (origin && isAllowedOrigin(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, X-CSRF-Token, X-Requested-With"
      );
      res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    return next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/auth", authRoutes);
  app.use("/api", requireAuth, meRoutes);
  app.use("/api", requireAuth, csrfRoutes);
  app.use("/api", requireAuth, chatRoutes);
  app.use("/api/google", requireAuth, googleRoutes);
  app.use("/api/research", requireAuth, researchRoutes);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : "Unexpected error";
    res.status(500).json({ error: message });
  });

  return app;
}
