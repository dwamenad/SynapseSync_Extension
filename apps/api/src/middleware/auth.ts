import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { SESSION_COOKIE_NAME } from "../lib/session";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies[SESSION_COOKIE_NAME];
  if (!sessionId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true }
  });

  if (!session || session.expiresAt.getTime() < Date.now()) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.user = session.user;
  next();
}
