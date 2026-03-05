import crypto from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import type { PaperData } from "./researchSummary";
import { clampPaperDataForPrompt } from "./promptLimits";

export type OverlapItem = {
  paperEntryId: string;
  title: string;
  score: number;
  reason: string;
};

export type GapInsight = {
  headline: string;
  opportunity: string;
  confidence: number;
};

const GapInsightSchema = z
  .object({
    headline: z.string().min(1),
    opportunity: z.string().min(1),
    confidence: z.number().min(0).max(1)
  })
  .strict();

function compactText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

export function buildCandidateText(paperData: PaperData) {
  const clamped = clampPaperDataForPrompt(paperData);
  return [
    clamped.title,
    clamped.abstract,
    clamped.methods,
    clamped.discussion,
    clamped.conclusions
  ]
    .filter(Boolean)
    .join("\n");
}

function deterministicEmbedding(input: string, dimensions = 64) {
  const vec = Array.from({ length: dimensions }, () => 0);
  const tokens = input
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length > 1)
    .slice(0, 300);

  for (const token of tokens) {
    const hash = crypto.createHash("sha256").update(token).digest();
    for (let i = 0; i < dimensions; i += 1) {
      const value = (hash[i % hash.length] / 255) * 2 - 1;
      vec[i] += value;
    }
  }

  return normalizeVector(vec);
}

function normalizeVector(vector: number[]) {
  const norm = Math.sqrt(vector.reduce((sum, current) => sum + current * current, 0));
  if (!norm) {
    return vector;
  }
  return vector.map((value) => value / norm);
}

function parseEmbeddingJson(embeddingJson: string | null | undefined) {
  if (!embeddingJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(embeddingJson);
    if (!Array.isArray(parsed)) {
      return null;
    }
    const values = parsed
      .map((value) => (typeof value === "number" ? value : Number(value)))
      .filter((value) => Number.isFinite(value));
    return values.length > 0 ? values : null;
  } catch {
    return null;
  }
}

export function cosineSimilarity(left: number[], right: number[]) {
  const len = Math.min(left.length, right.length);
  if (len === 0) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < len; i += 1) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }

  const denom = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  if (!denom) {
    return 0;
  }

  return dot / denom;
}

export async function createEmbedding(openai: OpenAI, text: string): Promise<number[]> {
  const normalized = compactText(text);
  if (!normalized) {
    return deterministicEmbedding("empty");
  }

  if (env.MOCK_GOOGLE_APIS) {
    return deterministicEmbedding(normalized);
  }

  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: normalized
    });
    const embedding = response.data?.[0]?.embedding;
    if (!embedding || embedding.length === 0) {
      return deterministicEmbedding(normalized);
    }
    return normalizeVector(embedding);
  } catch {
    return deterministicEmbedding(normalized);
  }
}

function overlapReason(paperData: PaperData, entry: {
  methodology: string | null;
  modality: string | null;
  gainVsLoss: string | null;
}) {
  const differences: string[] = [];
  const newMethod = compactText(paperData.methods);
  const existingMethod = compactText(entry.methodology);
  if (newMethod && existingMethod && newMethod.toLowerCase() !== existingMethod.toLowerCase()) {
    differences.push("different task/method details");
  }

  const existingModality = compactText(entry.modality);
  if (existingModality && paperData.abstract) {
    const newAbstractLower = paperData.abstract.toLowerCase();
    if (!newAbstractLower.includes(existingModality.toLowerCase())) {
      differences.push(`possible modality difference from ${existingModality}`);
    }
  }

  if (entry.gainVsLoss) {
    differences.push("related key contrast/result");
  }

  if (differences.length === 0) {
    return "High semantic overlap in core hypothesis and study context.";
  }

  return `Overlapping domain with ${differences.slice(0, 2).join("; ")}.`;
}

function extractFirstJson(rawText: string) {
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return rawText.slice(start, end + 1);
}

async function deriveGapInsight(
  openai: OpenAI,
  paperData: PaperData,
  overlaps: OverlapItem[]
): Promise<GapInsight> {
  const clampedPaper = clampPaperDataForPrompt(paperData);

  if (overlaps.length === 0) {
    return {
      headline: "No strong overlap yet",
      opportunity:
        "This paper appears sufficiently distinct from saved entries in the selected doc.",
      confidence: 0.42
    };
  }

  if (env.MOCK_GOOGLE_APIS) {
    return {
      headline: "Methodological gap candidate",
      opportunity:
        "Compare the same task across a different modality and larger sample to test robustness.",
      confidence: 0.74
    };
  }

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You produce one concise methodological gap insight as JSON. Return only: {headline, opportunity, confidence}. confidence must be between 0 and 1."
        },
        {
          role: "user",
          content: JSON.stringify({
            candidatePaper: clampedPaper,
            topOverlaps: overlaps
          })
        }
      ]
    });

    const rawJson = extractFirstJson(response.output_text || "");
    if (!rawJson) {
      throw new Error("No JSON in gap insight response");
    }
    const parsed = GapInsightSchema.parse(JSON.parse(rawJson));
    return parsed;
  } catch {
    return {
      headline: "Methodological gap candidate",
      opportunity:
        "Top overlaps suggest similar paradigms; consider testing with a different modality or larger n.",
      confidence: 0.66
    };
  }
}

export async function checkOverlapForPaper(
  openai: OpenAI,
  userId: string,
  targetDocId: string,
  paperData: PaperData
): Promise<{ overlaps: OverlapItem[]; gapInsight: GapInsight }> {
  const entries = await prisma.paperEntry.findMany({
    where: {
      userId,
      sourceDocumentId: targetDocId
    },
    orderBy: { createdAt: "desc" }
  });

  if (entries.length === 0) {
    return {
      overlaps: [],
      gapInsight: await deriveGapInsight(openai, paperData, [])
    };
  }

  const candidateEmbedding = await createEmbedding(openai, buildCandidateText(paperData));
  const scored = entries.map((entry) => {
    const entryEmbedding =
      parseEmbeddingJson(entry.embeddingJson) ||
      deterministicEmbedding(
        [entry.title, entry.abstract, entry.methods, entry.discussion, entry.summary]
          .filter(Boolean)
          .join("\n")
      );
    const score = cosineSimilarity(candidateEmbedding, entryEmbedding);
    return {
      entry,
      score
    };
  });

  const top = scored.sort((a, b) => b.score - a.score).slice(0, 3);
  const overlaps: OverlapItem[] = top.map(({ entry, score }) => ({
    paperEntryId: entry.id,
    title: entry.title,
    score: Number(score.toFixed(3)),
    reason: overlapReason(paperData, entry)
  }));

  const gapInsight = await deriveGapInsight(openai, paperData, overlaps);
  return { overlaps, gapInsight };
}
