import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/app";
import { prisma } from "../../apps/api/src/lib/prisma";

describe("append doc API route", () => {
  beforeEach(async () => {
    await prisma.recentDoc.deleteMany();
    await prisma.session.deleteMany();
    await prisma.oAuthToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it("requires CSRF token on append endpoint", async () => {
    const app = createApp();
    const agent = request.agent(app);

    await agent.get("/auth/google").expect(302);

    await agent
      .patch("/api/google/appendDoc")
      .send({
        documentId: "doc-123",
        paperTitle: "Decision making under uncertainty",
        paperUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
        summary: "Summary body."
      })
      .expect(403);
  });

  it("appends paper summary in mock mode", async () => {
    const app = createApp();
    const agent = request.agent(app);

    await agent.get("/auth/google").expect(302);

    const csrfRes = await agent.get("/api/csrf").expect(200);
    const csrfToken = csrfRes.body.csrfToken as string;

    const appendRes = await agent
      .patch("/api/google/appendDoc")
      .set("x-csrf-token", csrfToken)
      .send({
        documentId: "doc-123",
        paperTitle: "Decision making under uncertainty",
        paperUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
        summary: "Summary body."
      })
      .expect(200);

    expect(appendRes.body.documentId).toBe("doc-123");
    expect(appendRes.body.appended).toBe(true);
    expect(appendRes.body.documentUrl).toContain("/document/d/doc-123/edit");
  });
});
