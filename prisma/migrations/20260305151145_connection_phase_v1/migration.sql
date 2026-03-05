-- CreateTable
CREATE TABLE "PaperEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "doi" TEXT,
    "sourceType" TEXT,
    "authorsJson" TEXT,
    "abstract" TEXT NOT NULL,
    "methods" TEXT,
    "figures" TEXT,
    "discussion" TEXT,
    "conclusions" TEXT,
    "futureDirections" TEXT,
    "citations" TEXT,
    "summary" TEXT NOT NULL,
    "methodology" TEXT,
    "sampleSize" TEXT,
    "modality" TEXT,
    "brainRegions" TEXT,
    "gainVsLoss" TEXT,
    "keyStats" TEXT,
    "embeddingJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceMatrix" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "sheetUrl" TEXT NOT NULL,
    "sheetTitle" TEXT NOT NULL,
    "lastGeneratedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvidenceMatrix_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SynthesisRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "paperEntryIdsJson" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "synthesisText" TEXT NOT NULL,
    "appendedDocumentId" TEXT NOT NULL,
    "appendedDocumentUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SynthesisRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PaperEntry_userId_sourceDocumentId_createdAt_idx" ON "PaperEntry"("userId", "sourceDocumentId", "createdAt");

-- CreateIndex
CREATE INDEX "PaperEntry_sourceDocumentId_idx" ON "PaperEntry"("sourceDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceMatrix_sheetId_key" ON "EvidenceMatrix"("sheetId");

-- CreateIndex
CREATE INDEX "EvidenceMatrix_userId_sourceDocumentId_idx" ON "EvidenceMatrix"("userId", "sourceDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceMatrix_userId_sourceDocumentId_key" ON "EvidenceMatrix"("userId", "sourceDocumentId");

-- CreateIndex
CREATE INDEX "SynthesisRun_userId_sourceDocumentId_createdAt_idx" ON "SynthesisRun"("userId", "sourceDocumentId", "createdAt");
