import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createInMemoryRateLimiter } from "../../apps/api/src/middleware/rateLimit";

describe("createInMemoryRateLimiter", () => {
  it("returns 429 after max requests in window", async () => {
    const app = express();
    app.use(
      createInMemoryRateLimiter({
        windowMs: 60_000,
        max: 2,
        keyFn: () => "fixed-key",
        message: "Too many research requests."
      })
    );
    app.get("/limited", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    await request(app).get("/limited").expect(200);
    await request(app).get("/limited").expect(200);
    const throttled = await request(app).get("/limited").expect(429);

    expect(throttled.body.error).toBe("Too many research requests.");
    expect(Number(throttled.headers["retry-after"])).toBeGreaterThanOrEqual(1);
  });
});

