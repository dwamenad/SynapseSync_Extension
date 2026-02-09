import "dotenv/config";
import cookieParser from "cookie-parser";
import express from "express";
import { env } from "./config/env";
import { requireAuth } from "./middleware/auth";
import authRoutes from "./routes/auth";
import chatRoutes from "./routes/chat";
import googleRoutes from "./routes/google";
import meRoutes from "./routes/me";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser(env.SESSION_COOKIE_SECRET));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/auth", authRoutes);
  app.use("/api", requireAuth, meRoutes);
  app.use("/api", requireAuth, chatRoutes);
  app.use("/api/google", requireAuth, googleRoutes);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : "Unexpected error";
    res.status(500).json({ error: message });
  });

  return app;
}
