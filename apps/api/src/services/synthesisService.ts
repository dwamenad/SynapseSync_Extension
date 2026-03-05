import OpenAI from "openai";
import type { PaperEntry } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { appendSectionToDocForUser } from "./googleDocService";

export type SynthesisMode = "thematic" | "chronological";

function compactText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function wordCount(text: string) {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length;
}

export function buildSynthesisPrompt(mode: SynthesisMode, entries: PaperEntry[]) {
  const ordered = entries.map((entry, index) => ({
    index: index + 1,
    title: entry.title,
    createdAt: entry.createdAt.toISOString(),
    methodology: entry.methodology,
    modality: entry.modality,
    sampleSize: entry.sampleSize,
    brainRegions: entry.brainRegions,
    gainVsLoss: entry.gainVsLoss,
    keyStats: entry.keyStats,
    summary: entry.summary
  }));

  return {
    mode,
    instruction:
      mode === "chronological"
        ? "Write a cohesive 500-word literature review draft that progresses chronologically."
        : "Write a cohesive 500-word literature review draft organized by themes and conceptual links.",
    papers: ordered
  };
}

async function generateSynthesisText(
  openai: OpenAI,
  mode: SynthesisMode,
  entries: PaperEntry[]
) {
  if (env.MOCK_GOOGLE_APIS) {
    const intro =
      mode === "chronological"
        ? "This synthesis tracks how findings evolved over time across the selected studies."
        : "This synthesis organizes the selected studies around shared mechanisms and methodological contrasts.";
    const body = entries
      .map((entry, idx) => {
        const method = compactText(entry.methodology) || "method details unavailable";
        const modality = compactText(entry.modality) || "modality not stated";
        const sample = compactText(entry.sampleSize) || "sample not reported";
        return `${idx + 1}. ${entry.title}: ${method}; ${modality}; ${sample}.`;
      })
      .join(" ");
    return `${intro}\n\n${body}\n\nOverall, these papers collectively motivate a targeted follow-up study that tests robustness across modality and sample constraints.`;
  }

  const payload = buildSynthesisPrompt(mode, entries);
  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content:
          "You are an expert neuroscience writing assistant. Produce approximately 500 words, academic tone, cohesive and citation-ready."
      },
      {
        role: "user",
        content: JSON.stringify(payload)
      }
    ]
  });

  const text = response.output_text?.trim();
  if (!text) {
    throw new Error("Model did not return synthesis text.");
  }
  return text;
}

export async function synthesizeAndAppendForUser(args: {
  openai: OpenAI;
  userId: string;
  targetDocId: string;
  paperEntryIds: string[];
  mode: SynthesisMode;
}) {
  const { openai, userId, targetDocId, paperEntryIds, mode } = args;

  const entries = await prisma.paperEntry.findMany({
    where: {
      id: { in: paperEntryIds },
      userId,
      sourceDocumentId: targetDocId
    }
  });

  if (entries.length !== paperEntryIds.length) {
    throw new Error("One or more selected papers are invalid for the target document.");
  }

  const ordered =
    mode === "chronological"
      ? entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      : paperEntryIds
          .map((id) => entries.find((entry) => entry.id === id))
          .filter((entry): entry is PaperEntry => Boolean(entry));

  const synthesisText = await generateSynthesisText(openai, mode, ordered);
  const heading =
    mode === "chronological"
      ? "Synthesis Draft (Chronological)"
      : "Synthesis Draft (Thematic)";

  const appendedDoc = await appendSectionToDocForUser(userId, {
    documentId: targetDocId,
    sectionTitle: heading,
    content: synthesisText,
    insertDivider: true
  });

  await prisma.synthesisRun.create({
    data: {
      userId,
      sourceDocumentId: targetDocId,
      mode,
      paperEntryIdsJson: JSON.stringify(paperEntryIds),
      wordCount: wordCount(synthesisText),
      synthesisText,
      appendedDocumentId: appendedDoc.documentId,
      appendedDocumentUrl: appendedDoc.documentUrl
    }
  });

  return {
    synthesisText,
    appendedDoc
  };
}

