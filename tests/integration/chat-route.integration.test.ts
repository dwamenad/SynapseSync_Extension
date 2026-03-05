import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/app";
import { prisma } from "../../apps/api/src/lib/prisma";

describe("chat API route", () => {
  beforeEach(async () => {
    await prisma.synthesisRun.deleteMany();
    await prisma.evidenceMatrix.deleteMany();
    await prisma.paperEntry.deleteMany();
    await prisma.recentDoc.deleteMany();
    await prisma.session.deleteMany();
    await prisma.oAuthToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it("requires CSRF token on chat endpoint", async () => {
    const app = createApp();
    const agent = request.agent(app);

    await agent.get("/auth/google").expect(302);

    await agent
      .post("/api/chat")
      .send({ message: "Create a doc titled CSRF Test with this content: A" })
      .expect(403);
  });

  it("creates a doc in mock mode through chat endpoint", async () => {
    const app = createApp();
    const agent = request.agent(app);

    await agent.get("/auth/google").expect(302);

    const csrfRes = await agent.get("/api/csrf").expect(200);
    const csrfToken = csrfRes.body.csrfToken as string;

    const chatRes = await agent
      .post("/api/chat")
      .set("x-csrf-token", csrfToken)
      .send({
        message: "Create a doc titled Integration Route with this content: Hello route"
      })
      .expect(200);

    expect(chatRes.body.createdDoc?.title).toBe("Integration Route");
    expect(chatRes.body.createdDoc?.documentUrl).toContain("docs.google.com/document");

    const recentRes = await agent.get("/api/google/recentDocs").expect(200);
    expect(recentRes.body.docs.length).toBe(1);
    expect(recentRes.body.docs[0].title).toBe("Integration Route");
  });
});
