import crypto from "node:crypto";
import type { Request, Response } from "express";

export const CSRF_COOKIE_NAME = "csrf_token";

export function createCsrfToken() {
  return crypto.randomBytes(24).toString("hex");
}

export function setCsrfCookie(res: Response, token: string, isProd: boolean) {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 1000 * 60 * 60 * 8
  });
}

export function getOrIssueCsrfToken(req: Request, res: Response, isProd: boolean) {
  const existing = req.cookies[CSRF_COOKIE_NAME] as string | undefined;
  if (existing) {
    return existing;
  }

  const next = createCsrfToken();
  setCsrfCookie(res, next, isProd);
  return next;
}

export function hasValidCsrf(req: Request) {
  const cookieToken = req.cookies[CSRF_COOKIE_NAME] as string | undefined;
  const headerToken = req.get("x-csrf-token");
  return Boolean(cookieToken && headerToken && cookieToken === headerToken);
}
