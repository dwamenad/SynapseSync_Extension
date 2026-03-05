import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { SESSION_COOKIE_NAME, touchSession } from "../lib/session";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies[SESSION_COOKIE_NAME];
  if (!sessionId) {
    if (env.MOCK_AUTH) {
      const user = await prisma.user.upsert({
        where: { googleSub: "mock-google-sub" },
        create: {
          googleSub: "mock-google-sub",
          email: "mock@example.com",
          name: "Mock User"
        },
        update: {}
      });
      req.user = user;
      return next();
    }

    return res.status(401).json({ error: "Unauthorized" });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true }
  });

  if (!session || session.expiresAt.getTime() < Date.now()) {
    if (session) {
      await prisma.session.deleteMany({ where: { id: session.id } });
    }
    return res.status(401).json({ error: "Unauthorized" });
  }

  await touchSession(session.id, session.expiresAt, env.NODE_ENV === "production", res);
  req.user = session.user;
  next();
}
