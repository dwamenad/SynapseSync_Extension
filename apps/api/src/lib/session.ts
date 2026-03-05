import crypto from "node:crypto";
import type { Response } from "express";
import { prisma } from "./prisma";

export const SESSION_COOKIE_NAME = "app_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const ROLLING_REFRESH_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 7;

export async function createSession(userId: string) {
  const session = await prisma.session.create({
    data: {
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS)
    }
  });

  return session;
}

export function setSessionCookie(res: Response, sessionId: string, isProd: boolean) {
  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
}

export async function cleanupExpiredSessions() {
  await prisma.session.deleteMany({
    where: {
      expiresAt: { lt: new Date() }
    }
  });
}

export async function touchSession(sessionId: string, expiresAt: Date, isProd: boolean, res: Response) {
  const remaining = expiresAt.getTime() - Date.now();
  if (remaining > ROLLING_REFRESH_THRESHOLD_MS) {
    return;
  }

  const nextExpiry = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.update({
    where: { id: sessionId },
    data: { expiresAt: nextExpiry }
  });
  setSessionCookie(res, sessionId, isProd);
}

export function createState(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function createPkceVerifier(): string {
  return crypto.randomBytes(64).toString("base64url");
}

export function createPkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function setOAuthTempCookies(
  res: Response,
  values: { state: string; pkceVerifier: string },
  isProd: boolean
) {
  res.cookie("oauth_state", values.state, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/"
  });

  res.cookie("oauth_pkce_verifier", values.pkceVerifier, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/"
  });
}

export function clearOAuthTempCookies(res: Response) {
  res.clearCookie("oauth_state", { path: "/" });
  res.clearCookie("oauth_pkce_verifier", { path: "/" });
}
