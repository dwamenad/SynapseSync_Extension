import type { NextFunction, Request, Response } from "express";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  windowMs: number;
  max: number;
  message?: string;
  keyFn?: (req: Request) => string;
};

export function createInMemoryRateLimiter(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  const keyFn =
    options.keyFn ||
    ((req: Request) =>
      req.user?.id || req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown");

  const message =
    options.message || "Too many requests. Please wait and try again.";

  return function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const now = Date.now();
    const key = keyFn(req);
    const existing = buckets.get(key);

    if (!existing || now >= existing.resetAt) {
      buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs
      });
      return next();
    }

    if (existing.count >= options.max) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000)
      );
      res.setHeader("Retry-After", retryAfterSeconds.toString());
      return res.status(429).json({ error: message });
    }

    existing.count += 1;
    buckets.set(key, existing);
    return next();
  };
}

