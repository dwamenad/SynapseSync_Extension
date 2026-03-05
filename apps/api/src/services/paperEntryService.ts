import OpenAI from "openai";
import { prisma } from "../lib/prisma";
import type { PaperData } from "./researchSummary";
import { extractEvidenceFields } from "./evidenceExtraction";
import { buildCandidateText, createEmbedding } from "./overlapService";

type SavePaperEntryInput = {
  userId: string;
  sourceDocumentId: string;
  paperData: PaperData;
  summary: string;
  openai: OpenAI;
};

function toJsonString(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export async function savePaperEntryForAppend(input: SavePaperEntryInput) {
  const { userId, sourceDocumentId, paperData, summary, openai } = input;
  const evidence = await extractEvidenceFields(openai, paperData, summary);
  const embedding = await createEmbedding(openai, buildCandidateText(paperData));

  return prisma.paperEntry.create({
    data: {
      userId,
      sourceDocumentId,
      title: paperData.title,
      url: paperData.url,
      doi: paperData.doi,
      sourceType: paperData.sourceType,
      authorsJson: paperData.authors ? toJsonString(paperData.authors) : null,
      abstract: paperData.abstract,
      methods: paperData.methods,
      figures: paperData.figures,
      discussion: paperData.discussion,
      conclusions: paperData.conclusions,
      futureDirections: paperData.futureDirections,
      citations: paperData.citations,
      summary,
      methodology: evidence.methodology,
      sampleSize: evidence.sampleSize,
      modality: evidence.modality,
      brainRegions: evidence.brainRegions,
      gainVsLoss: evidence.gainVsLoss,
      keyStats: evidence.keyStats,
      embeddingJson: toJsonString(embedding)
    }
  });
}

export async function listPaperEntriesForDoc(userId: string, targetDocId: string) {
  return prisma.paperEntry.findMany({
    where: {
      userId,
      sourceDocumentId: targetDocId
    },
    orderBy: { createdAt: "desc" }
  });
}
