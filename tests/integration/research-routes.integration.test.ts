import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/app";
import { prisma } from "../../apps/api/src/lib/prisma";

async function seedPaperEntries(userId: string, targetDocId: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    await prisma.paperEntry.create({
      data: {
        userId,
        sourceDocumentId: targetDocId,
        title: `Paper ${i + 1}`,
        url: `https://example.org/paper-${i + 1}`,
        abstract: `Study ${i + 1} explored reward sensitivity in decision tasks.`,
        summary: `Summary ${i + 1}`,
        methodology: "Probabilistic reversal learning",
        sampleSize: `n=${20 + i}`,
        modality: i % 2 === 0 ? "fMRI" : "EEG",
        brainRegions: "vmPFC, striatum",
        gainVsLoss: "Gain > Loss",
        embeddingJson: JSON.stringify(Array.from({ length: 8 }, (_, idx) => idx + i + 1))
      }
    });
  }
}

describe("research routes", () => {
  beforeEach(async () => {
    await prisma.synthesisRun.deleteMany();
    await prisma.evidenceMatrix.deleteMany();
    await prisma.paperEntry.deleteMany();
    await prisma.recentDoc.deleteMany();
    await prisma.session.deleteMany();
    await prisma.oAuthToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it("requires CSRF for research POST endpoints", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await agent.get("/auth/google").expect(302);

    await agent
      .post("/api/research/overlap-check")
      .send({
        targetDocId: "doc-1",
        paperData: {
          title: "A",
          abstract: "B",
          url: "https://example.org"
        }
      })
      .expect(403);

    await agent
      .post("/api/research/evidence-matrix")
      .send({ targetDocId: "doc-1" })
      .expect(403);

    await agent
      .post("/api/research/synthesize")
      .send({ targetDocId: "doc-1", paperEntryIds: ["a", "b", "c", "d", "e"], mode: "thematic" })
      .expect(403);
  });

  it("returns overlap details and a gap insight", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await agent.get("/auth/google").expect(302);

    const user = await prisma.user.findFirstOrThrow({
      where: { googleSub: "mock-google-sub" }
    });
    const targetDocId = "doc-overlap";
    await seedPaperEntries(user.id, targetDocId, 3);

    const csrfRes = await agent.get("/api/csrf").expect(200);
    const csrfToken = csrfRes.body.csrfToken as string;

    const response = await agent
      .post("/api/research/overlap-check")
      .set("x-csrf-token", csrfToken)
      .send({
        targetDocId,
        paperData: {
          title: "New decision paper",
          abstract: "Participants performed gain versus loss trials in uncertain settings.",
          methods: "Thirty adults completed a reversal-learning task with EEG.",
          url: "https://example.org/new-paper"
        }
      })
      .expect(200);

    expect(Array.isArray(response.body.overlaps)).toBe(true);
    expect(response.body.overlaps.length).toBeGreaterThan(0);
    expect(response.body.overlaps[0]).toHaveProperty("paperEntryId");
    expect(response.body.overlaps[0]).toHaveProperty("score");
    expect(response.body.gapInsight).toHaveProperty("headline");
    expect(response.body.gapInsight).toHaveProperty("opportunity");
  });

  it("rejects oversized overlap payloads", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await agent.get("/auth/google").expect(302);

    const csrfRes = await agent.get("/api/csrf").expect(200);
    const csrfToken = csrfRes.body.csrfToken as string;

    const response = await agent
      .post("/api/research/overlap-check")
      .set("x-csrf-token", csrfToken)
      .send({
        targetDocId: "doc-x",
        paperData: {
          title: "Oversized payload",
          abstract: "a".repeat(20_001),
          url: "https://example.org/oversized"
        }
      })
      .expect(400);

    expect(response.body.error).toContain("Invalid overlap-check payload");
  });

  it("creates and retrieves an evidence matrix in mock mode", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await agent.get("/auth/google").expect(302);

    const user = await prisma.user.findFirstOrThrow({
      where: { googleSub: "mock-google-sub" }
    });
    const targetDocId = "doc-matrix";
    await seedPaperEntries(user.id, targetDocId, 2);

    const csrfRes = await agent.get("/api/csrf").expect(200);
    const csrfToken = csrfRes.body.csrfToken as string;

    const generateRes = await agent
      .post("/api/research/evidence-matrix")
      .set("x-csrf-token", csrfToken)
      .send({ targetDocId })
      .expect(200);

    expect(generateRes.body.sheetId).toContain("mock-sheet");
    expect(generateRes.body.rowCount).toBe(2);

    const statusRes = await agent
      .get(`/api/research/evidence-matrix?targetDocId=${targetDocId}`)
      .expect(200);
    expect(statusRes.body.exists).toBe(true);
    expect(statusRes.body.sheetUrl).toContain("spreadsheets");
  });

  it("validates synthesis count bounds and appends synthesis", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await agent.get("/auth/google").expect(302);

    const user = await prisma.user.findFirstOrThrow({
      where: { googleSub: "mock-google-sub" }
    });
    const targetDocId = "doc-synth";
    await seedPaperEntries(user.id, targetDocId, 5);

    const entries = await prisma.paperEntry.findMany({
      where: { userId: user.id, sourceDocumentId: targetDocId },
      orderBy: { createdAt: "asc" }
    });

    const csrfRes = await agent.get("/api/csrf").expect(200);
    const csrfToken = csrfRes.body.csrfToken as string;

    await agent
      .post("/api/research/synthesize")
      .set("x-csrf-token", csrfToken)
      .send({
        targetDocId,
        paperEntryIds: entries.slice(0, 4).map((entry) => entry.id),
        mode: "thematic"
      })
      .expect(400);

    const synthRes = await agent
      .post("/api/research/synthesize")
      .set("x-csrf-token", csrfToken)
      .send({
        targetDocId,
        paperEntryIds: entries.map((entry) => entry.id),
        mode: "chronological"
      })
      .expect(200);

    expect(synthRes.body.message).toContain("Synthesis appended successfully");
    expect(synthRes.body.appendedDoc.documentId).toBe(targetDocId);
    expect(typeof synthRes.body.synthesisText).toBe("string");

    const runs = await prisma.synthesisRun.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0].mode).toBe("chronological");
  });
});
