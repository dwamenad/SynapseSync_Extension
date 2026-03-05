import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/app";
import { prisma } from "../../apps/api/src/lib/prisma";

describe("extension chat payload", () => {
  beforeEach(async () => {
    await prisma.synthesisRun.deleteMany();
    await prisma.evidenceMatrix.deleteMany();
    await prisma.paperEntry.deleteMany();
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
          methods:
            "Twenty-four adults completed a probabilistic reversal-learning task during fMRI.",
          discussion:
            "Findings suggest dynamic VMPFC-striatal coupling during effort allocation.",
          conclusions:
            "Adaptive control signals are sensitive to expected value under volatility.",
          futureDirections:
            "Future work should test clinical populations and out-of-sample prediction.",
          citations: "Botvinick et al. (2001); Daw et al. (2005)",
          figures: "Figure 2 shows stronger Gain > Loss activity in VMPFC.",
          sourceType: "pubmed",
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

    const createdEntries = await prisma.paperEntry.findMany();
    expect(createdEntries).toHaveLength(1);
    expect(createdEntries[0].sourceDocumentId).toBe(targetDocId);
    expect(createdEntries[0].title).toBe("Adaptive control in cognitive effort");
    expect(createdEntries[0].abstract).toContain("reward contingencies");
    expect(createdEntries[0].methodology || "").toContain("reversal-learning");
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
