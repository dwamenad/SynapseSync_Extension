import type { NextFunction, Request, Response } from "express";
import { hasValidCsrf } from "../lib/csrf";

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (!hasValidCsrf(req)) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  next();
}
