import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/app";
import { prisma } from "../../apps/api/src/lib/prisma";

describe("extension chat payload", () => {
  beforeEach(async () => {
    await prisma.recentDoc.deleteMany();
    await prisma.session.deleteMany();
    await prisma.oAuthToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it("summarizes and appends when paperData payload is provided", async () => {
    const app = createApp();
    const agent = request.agent(app);

    await agent.get("/auth/google").expect(302);

    const csrfRes = await agent.get("/api/csrf").expect(200);
    const csrfToken = csrfRes.body.csrfToken as string;

    const targetDocId = "target-doc-987";
    const response = await agent
      .post("/api/chat")
      .set("x-csrf-token", csrfToken)
      .send({
        paperData: {
          title: "Adaptive control in cognitive effort",
          abstract:
            "We examined how participants allocate effort under changing reward contingencies.",
          url: "https://pubmed.ncbi.nlm.nih.gov/98765432/",
          authors: ["A. Smith", "B. Jones"],
          doi: "10.1016/j.neuro.2026.01.001"
        },
        targetDocId,
        neuroMode: true
      })
      .expect(200);

    expect(response.body.message).toBe("Summary appended successfully.");
    expect(response.body.appendedDoc?.documentId).toBe(targetDocId);
    expect(response.body.appendedDoc?.documentUrl).toContain(
      `/document/d/${targetDocId}/edit`
    );
    expect(typeof response.body.summary).toBe("string");
    expect(response.body.summary).toContain("## Adaptive control in cognitive effort");
  });

  it("rejects invalid extension payloads", async () => {
    const app = createApp();
    const agent = request.agent(app);

    await agent.get("/auth/google").expect(302);

    const csrfRes = await agent.get("/api/csrf").expect(200);
    const csrfToken = csrfRes.body.csrfToken as string;

    const response = await agent
      .post("/api/chat")
      .set("x-csrf-token", csrfToken)
      .send({
        paperData: {
          title: "Missing URL and abstract"
        },
        targetDocId: "doc-1"
      })
      .expect(400);

    expect(response.body.error).toContain("Invalid request body");
  });
});
