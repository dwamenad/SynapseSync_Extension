import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { z } from "zod";
import { env } from "../config/env";
import { decryptJson, encryptJson } from "../lib/crypto";
import { createOAuthClient } from "../lib/google";
import { prisma } from "../lib/prisma";
import { htmlToPlainText, markdownToDocsRequests } from "./markdown";

export const createDocArgsSchema = z.object({
  title: z.string().min(1),
  folderId: z.string().optional(),
  content: z.string().min(1),
  contentFormat: z.enum(["plain", "markdown", "html"]).default("plain"),
  shareWith: z.array(z.string().email()).optional(),
  shareRole: z.enum(["reader", "commenter", "writer"]).default("reader")
});

export type CreateDocArgs = z.infer<typeof createDocArgsSchema>;
type CreateDocResult = {
  documentId: string;
  documentUrl: string;
  title: string;
};

type StoredOAuthPayload = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
};

async function withUserGoogleClient<T>(
  userId: string,
  run: (ctx: {
    oauth2: OAuth2Client;
    drive: ReturnType<typeof google.drive>;
    docs: ReturnType<typeof google.docs>;
  }) => Promise<T>
): Promise<T> {
  const tokenRow = await prisma.oauthToken.findUnique({ where: { userId } });
  if (!tokenRow) {
    throw new Error("Missing OAuth token. Please sign in again.");
  }

  const oauth2 = createOAuthClient();
  const credentials = decryptJson<StoredOAuthPayload>(tokenRow.encryptedPayload);
  oauth2.setCredentials(credentials);

  const drive = google.drive({ version: "v3", auth: oauth2 });
  const docs = google.docs({ version: "v1", auth: oauth2 });

  const result = await run({ oauth2, drive, docs });

  const nextCreds = oauth2.credentials;
  await prisma.oauthToken.update({
    where: { userId },
    data: {
      encryptedPayload: encryptJson(nextCreds),
      expiryDate: nextCreds.expiry_date ? new Date(nextCreds.expiry_date) : null,
      scope: nextCreds.scope ?? tokenRow.scope
    }
  });

  return result;
}

export async function createGoogleDocForUser(userId: string, rawArgs: unknown) {
  const args = createDocArgsSchema.parse(rawArgs);

  if (env.MOCK_GOOGLE_APIS) {
    const mockId = `mock-doc-${Date.now()}`;
    const mockDoc: CreateDocResult = {
      documentId: mockId,
      documentUrl: `https://docs.google.com/document/d/${mockId}/edit`,
      title: args.title
    };

    await prisma.recentDoc.create({
      data: {
        userId,
        documentId: mockDoc.documentId,
        documentUrl: mockDoc.documentUrl,
        title: args.title,
        folderId: args.folderId
      }
    });

    return mockDoc;
  }

  return withUserGoogleClient(userId, async ({ drive, docs }) => {
    const doc = await createGoogleDocWithClients(drive, docs, args);

    await prisma.recentDoc.create({
      data: {
        userId,
        documentId: doc.documentId,
        documentUrl: doc.documentUrl,
        title: args.title,
        folderId: args.folderId
      }
    });

    return doc;
  });
}

export async function listDriveFoldersForUser(
  userId: string,
  options?: { query?: string; pageSize?: number }
) {
  if (env.MOCK_GOOGLE_APIS) {
    return [
      { id: "mock-folder-alpha", name: "Mock Folder Alpha" },
      { id: "mock-folder-notes", name: "Mock Notes" },
      { id: "mock-folder-projects", name: "Mock Projects" }
    ].filter((folder) =>
      options?.query
        ? folder.name.toLowerCase().includes(options.query.toLowerCase())
        : true
    );
  }

  return withUserGoogleClient(userId, async ({ drive }) => {
    const q = [
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
      options?.query ? `name contains '${options.query.replace(/'/g, "\\\\'")}'` : null
    ]
      .filter(Boolean)
      .join(" and ");

    const response = await drive.files.list({
      q,
      pageSize: options?.pageSize ?? 20,
      fields: "files(id,name)",
      orderBy: "name_natural"
    });

    return (response.data.files || [])
      .filter((file) => file.id && file.name)
      .map((file) => ({
        id: file.id as string,
        name: file.name as string
      }));
  });
}

export async function getGoogleDriveAccessTokenForUser(userId: string): Promise<string> {
  if (env.MOCK_GOOGLE_APIS) {
    return "mock-drive-access-token";
  }

  return withUserGoogleClient(userId, async ({ oauth2 }) => {
    const existing = oauth2.credentials.access_token;
    if (existing) {
      return existing;
    }

    const tokenResponse = await oauth2.getAccessToken();
    if (!tokenResponse.token) {
      throw new Error("No Google access token available");
    }

    return tokenResponse.token;
  });
}

export async function getGoogleIntegrationStatusForUser(userId: string) {
  if (env.MOCK_GOOGLE_APIS) {
    return {
      mode: "mock" as const,
      connected: true,
      email: "mock@example.com",
      displayName: "Mock User"
    };
  }

  return withUserGoogleClient(userId, async ({ drive }) => {
    const about = await drive.about.get({
      fields: "user(displayName,emailAddress)"
    });

    return {
      mode: "real" as const,
      connected: true,
      email: about.data.user?.emailAddress || null,
      displayName: about.data.user?.displayName || null
    };
  });
}

export async function createGoogleDocWithClients(
  drive: ReturnType<typeof google.drive>,
  docs: ReturnType<typeof google.docs>,
  args: CreateDocArgs
): Promise<CreateDocResult> {
  const createFileRes = await drive.files.create({
    requestBody: {
      name: args.title,
      mimeType: "application/vnd.google-apps.document",
      parents: args.folderId ? [args.folderId] : undefined
    },
    fields: "id,webViewLink,name,parents"
  });

  const documentId = createFileRes.data.id;
  const documentUrl = createFileRes.data.webViewLink;

  if (!documentId || !documentUrl) {
    throw new Error("Failed to create Google Doc.");
  }

  let text = args.content;
  let formatRequests: NonNullable<
    Parameters<typeof docs.documents.batchUpdate>[0]["requestBody"]
  >["requests"] = [];

  if (args.contentFormat === "markdown") {
    const converted = markdownToDocsRequests(args.content);
    text = converted.text;
    formatRequests = converted.requests;
  } else if (args.contentFormat === "html") {
    text = htmlToPlainText(args.content);
  }

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text
          }
        },
        ...formatRequests
      ]
    }
  });

  if (args.shareWith?.length) {
    for (const emailAddress of args.shareWith) {
      await drive.permissions.create({
        fileId: documentId,
        requestBody: {
          type: "user",
          role: args.shareRole,
          emailAddress
        },
        sendNotificationEmail: false
      });
    }
  }

  return {
    documentId,
    documentUrl,
    title: args.title
  };
}
