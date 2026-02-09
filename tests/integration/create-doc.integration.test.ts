import { describe, expect, it, vi } from "vitest";
import { createGoogleDocWithClients } from "../../apps/api/src/services/googleDocService";

describe("createGoogleDocWithClients", () => {
  it("calls Drive create before Docs batchUpdate", async () => {
    const calls: string[] = [];

    const drive = {
      files: {
        create: vi.fn(async () => {
          calls.push("drive.files.create");
          return {
            data: {
              id: "doc-123",
              webViewLink: "https://docs.google.com/document/d/doc-123/edit"
            }
          };
        })
      },
      permissions: {
        create: vi.fn(async () => {
          calls.push("drive.permissions.create");
          return {};
        })
      }
    } as any;

    const docs = {
      documents: {
        batchUpdate: vi.fn(async () => {
          calls.push("docs.documents.batchUpdate");
          return {};
        })
      }
    } as any;

    const result = await createGoogleDocWithClients(drive, docs, {
      title: "Integration Test",
      content: "Hello world",
      contentFormat: "plain",
      shareRole: "reader",
      shareWith: ["a@example.com"]
    });

    expect(result.documentId).toBe("doc-123");
    expect(calls[0]).toBe("drive.files.create");
    expect(calls[1]).toBe("docs.documents.batchUpdate");
    expect(calls[2]).toBe("drive.permissions.create");
  });
});
