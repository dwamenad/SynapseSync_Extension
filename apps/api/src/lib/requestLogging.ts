import crypto from "node:crypto";
import type { Request } from "express";

export function createRequestId() {
  return crypto.randomUUID();
}

export function summarizeRequestBody(req: Request) {
  if (!req.body || typeof req.body !== "object") {
    return undefined;
  }

  const body = req.body as Record<string, unknown>;
  const keys = Object.keys(body);
  const summary: Record<string, string | number | boolean | null> = {};

  for (const key of keys.slice(0, 12)) {
    if (/token|secret|password|authorization|cookie/i.test(key)) {
      continue;
    }
    const value = body[key];
    if (typeof value === "string") {
      summary[key] = value.length > 80 ? `${value.slice(0, 80)}...` : value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      summary[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      summary[key] = value.length;
      continue;
    }
    if (typeof value === "object") {
      summary[key] = "object";
    }
  }

  return summary;
}

