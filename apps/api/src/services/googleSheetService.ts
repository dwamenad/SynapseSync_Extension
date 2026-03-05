import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { env } from "../config/env";
import { decryptJson, encryptJson } from "../lib/crypto";
import { createOAuthClient } from "../lib/google";
import { prisma } from "../lib/prisma";

type StoredOAuthPayload = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
};

export const EVIDENCE_MATRIX_COLUMNS = [
  "Paper Title",
  "Source URL",
  "DOI",
  "Methodology",
  "Sample Size ($n$)",
  "Modality",
  "Brain Regions",
  "Result: Gain vs. Loss",
  "Key Stats",
  "Added At"
] as const;

async function withUserGoogleDriveAndSheets<T>(
  userId: string,
  run: (ctx: {
    oauth2: OAuth2Client;
    drive: ReturnType<typeof google.drive>;
    sheets: ReturnType<typeof google.sheets>;
  }) => Promise<T>
): Promise<T> {
  const tokenRow = await prisma.oAuthToken.findUnique({ where: { userId } });
  if (!tokenRow) {
    throw new Error("Missing OAuth token. Please sign in again.");
  }

  const oauth2 = createOAuthClient();
  const credentials = decryptJson<StoredOAuthPayload>(tokenRow.encryptedPayload);
  oauth2.setCredentials(credentials);

  const drive = google.drive({ version: "v3", auth: oauth2 });
  const sheets = google.sheets({ version: "v4", auth: oauth2 });
  const result = await run({ oauth2, drive, sheets });

  const nextCreds = oauth2.credentials;
  await prisma.oAuthToken.update({
    where: { userId },
    data: {
      encryptedPayload: encryptJson(nextCreds),
      expiryDate: nextCreds.expiry_date ? new Date(nextCreds.expiry_date) : null,
      scope: nextCreds.scope ?? tokenRow.scope
    }
  });

  return result;
}

type EvidenceMatrixRow = {
  title: string;
  url: string;
  doi: string | null;
  methodology: string | null;
  sampleSize: string | null;
  modality: string | null;
  brainRegions: string | null;
  gainVsLoss: string | null;
  keyStats: string | null;
  createdAt: Date;
};

export function buildEvidenceMatrixRows(entries: EvidenceMatrixRow[]) {
  return entries.map((entry) => [
    entry.title,
    entry.url,
    entry.doi || "",
    entry.methodology || "",
    entry.sampleSize || "",
    entry.modality || "",
    entry.brainRegions || "",
    entry.gainVsLoss || "",
    entry.keyStats || "",
    entry.createdAt.toISOString()
  ]);
}

type MatrixResult = {
  sheetId: string;
  sheetUrl: string;
  rowCount: number;
  updatedAt: string;
};

async function moveSheetToFolderIfNeeded(
  drive: ReturnType<typeof google.drive>,
  sheetId: string,
  folderId?: string | null
) {
  if (!folderId) {
    return;
  }

  const file = await drive.files.get({
    fileId: sheetId,
    fields: "parents"
  });
  const parents = file.data.parents || [];
  if (parents.includes(folderId)) {
    return;
  }

  await drive.files.update({
    fileId: sheetId,
    addParents: folderId,
    removeParents: parents.length > 0 ? parents.join(",") : undefined,
    fields: "id,parents"
  });
}

async function writeMatrixSheet(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  rows: string[][]
) {
  const spreadsheetMeta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))"
  });
  const matrixSheet =
    spreadsheetMeta.data.sheets?.find(
      (sheet) => sheet.properties?.title === "Evidence Matrix"
    ) || spreadsheetMeta.data.sheets?.[0];
  const sheetNumericId = matrixSheet?.properties?.sheetId;
  if (sheetNumericId === undefined || sheetNumericId === null) {
    throw new Error("Unable to locate sheet id for Evidence Matrix.");
  }

  const values = [Array.from(EVIDENCE_MATRIX_COLUMNS), ...rows];
  const sheetRange = "Evidence Matrix!A1";

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: "Evidence Matrix!A:Z"
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: sheetRange,
    valueInputOption: "RAW",
    requestBody: {
      values
    }
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId: sheetNumericId,
              gridProperties: {
                frozenRowCount: 1
              }
            },
            fields: "gridProperties.frozenRowCount"
          }
        },
        {
          repeatCell: {
            range: {
              sheetId: sheetNumericId,
              startRowIndex: 0,
              endRowIndex: 1
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  bold: true
                }
              }
            },
            fields: "userEnteredFormat.textFormat.bold"
          }
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: sheetNumericId,
              dimension: "COLUMNS",
              startIndex: 0,
              endIndex: EVIDENCE_MATRIX_COLUMNS.length
            }
          }
        }
      ]
    }
  });
}

async function createSpreadsheet(
  sheets: ReturnType<typeof google.sheets>,
  title: string
) {
  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [
        {
          properties: { title: "Evidence Matrix" }
        }
      ]
    },
    fields: "spreadsheetId,spreadsheetUrl,properties/title"
  });

  return {
    sheetId: response.data.spreadsheetId || "",
    sheetUrl: response.data.spreadsheetUrl || "",
    sheetTitle: response.data.properties?.title || title
  };
}

export async function getEvidenceMatrixForUser(userId: string, targetDocId: string) {
  const matrix = await prisma.evidenceMatrix.findUnique({
    where: {
      userId_sourceDocumentId: {
        userId,
        sourceDocumentId: targetDocId
      }
    }
  });

  if (!matrix) {
    return {
      exists: false as const
    };
  }

  return {
    exists: true as const,
    sheetId: matrix.sheetId,
    sheetUrl: matrix.sheetUrl,
    updatedAt: (matrix.lastGeneratedAt || matrix.updatedAt).toISOString()
  };
}

export async function generateEvidenceMatrixForUser(
  userId: string,
  targetDocId: string
): Promise<MatrixResult> {
  const entries = await prisma.paperEntry.findMany({
    where: {
      userId,
      sourceDocumentId: targetDocId
    },
    orderBy: { createdAt: "asc" }
  });

  if (entries.length === 0) {
    throw new Error("No papers available for this document. Append papers first.");
  }

  const recentDoc = await prisma.recentDoc.findFirst({
    where: {
      userId,
      documentId: targetDocId
    }
  });

  const sourceTitle = recentDoc?.title || "Research Doc";
  const sheetName = `${sourceTitle} - Evidence Matrix`;

  if (env.MOCK_GOOGLE_APIS) {
    const mockSheetId = `mock-sheet-${targetDocId}`;
    const mockSheetUrl = `https://docs.google.com/spreadsheets/d/${mockSheetId}/edit`;
    const now = new Date();

    await prisma.evidenceMatrix.upsert({
      where: {
        userId_sourceDocumentId: {
          userId,
          sourceDocumentId: targetDocId
        }
      },
      create: {
        userId,
        sourceDocumentId: targetDocId,
        sheetId: mockSheetId,
        sheetUrl: mockSheetUrl,
        sheetTitle: sheetName,
        lastGeneratedAt: now
      },
      update: {
        sheetUrl: mockSheetUrl,
        sheetTitle: sheetName,
        lastGeneratedAt: now
      }
    });

    return {
      sheetId: mockSheetId,
      sheetUrl: mockSheetUrl,
      rowCount: entries.length,
      updatedAt: now.toISOString()
    };
  }

  return withUserGoogleDriveAndSheets(userId, async ({ drive, sheets }) => {
    const existing = await prisma.evidenceMatrix.findUnique({
      where: {
        userId_sourceDocumentId: {
          userId,
          sourceDocumentId: targetDocId
        }
      }
    });

    let sheetId = existing?.sheetId || "";
    let sheetUrl = existing?.sheetUrl || "";
    let sheetTitle = existing?.sheetTitle || sheetName;

    if (!sheetId) {
      const created = await createSpreadsheet(sheets, sheetName);
      sheetId = created.sheetId;
      sheetUrl = created.sheetUrl;
      sheetTitle = created.sheetTitle;

      if (!sheetId || !sheetUrl) {
        throw new Error("Failed to create Evidence Matrix spreadsheet.");
      }
    }

    await moveSheetToFolderIfNeeded(drive, sheetId, recentDoc?.folderId);
    const rows = buildEvidenceMatrixRows(entries);

    let attempts = 0;
    while (attempts < 2) {
      try {
        await writeMatrixSheet(sheets, sheetId, rows);
        break;
      } catch (error) {
        attempts += 1;
        if (attempts >= 2) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 300 * attempts));
      }
    }

    const now = new Date();
    await prisma.evidenceMatrix.upsert({
      where: {
        userId_sourceDocumentId: {
          userId,
          sourceDocumentId: targetDocId
        }
      },
      create: {
        userId,
        sourceDocumentId: targetDocId,
        sheetId,
        sheetUrl,
        sheetTitle,
        lastGeneratedAt: now
      },
      update: {
        sheetUrl,
        sheetTitle,
        lastGeneratedAt: now
      }
    });

    return {
      sheetId,
      sheetUrl,
      rowCount: rows.length,
      updatedAt: now.toISOString()
    };
  });
}
