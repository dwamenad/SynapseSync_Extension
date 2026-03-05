import OpenAI from "openai";
import { z } from "zod";
import { env } from "../config/env";
import type { PaperData } from "./researchSummary";
import { clampPaperDataForPrompt, clampText, PROMPT_LIMITS } from "./promptLimits";

const EvidenceFieldsSchema = z
  .object({
    methodology: z.string().nullable().optional(),
    sampleSize: z.string().nullable().optional(),
    modality: z.string().nullable().optional(),
    brainRegions: z.string().nullable().optional(),
    gainVsLoss: z.string().nullable().optional(),
    keyStats: z.string().nullable().optional()
  })
  .strict();

export type EvidenceFields = {
  methodology?: string;
  sampleSize?: string;
  modality?: string;
  brainRegions?: string;
  gainVsLoss?: string;
  keyStats?: string;
};

function compactText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function pickFirstMatch(input: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) {
      return compactText(match[1]);
    }
  }
  return undefined;
}

function normalizeFields(raw: z.infer<typeof EvidenceFieldsSchema>): EvidenceFields {
  return {
    methodology: raw.methodology || undefined,
    sampleSize: raw.sampleSize || undefined,
    modality: raw.modality || undefined,
    brainRegions: raw.brainRegions || undefined,
    gainVsLoss: raw.gainVsLoss || undefined,
    keyStats: raw.keyStats || undefined
  };
}

function findStats(input: string) {
  const patterns = [
    /\b(p\s*[<=>]\s*\.?\d+(?:\.\d+)?)\b/i,
    /\b(η\^?2\s*=\s*\.?\d+(?:\.\d+)?)\b/i,
    /\b(beta\s*=\s*[-+]?\d+(?:\.\d+)?)\b/i,
    /\b(OR\s*=\s*[-+]?\d+(?:\.\d+)?)\b/i,
    /\b(CI\s*\[[^\]]+])/i
  ];
  const hits = patterns
    .map((pattern) => input.match(pattern)?.[1])
    .filter((v): v is string => Boolean(v));
  return hits.length > 0 ? hits.join("; ") : undefined;
}

function inferKeyRegionsOrConstructs(input: string) {
  const knownSignals = [
    "vmPFC",
    "VMPFC",
    "PFC",
    "prefrontal cortex",
    "dorsal striatum",
    "ventral striatum",
    "striatum",
    "amygdala",
    "hippocampus",
    "insula",
    "ACC",
    "anterior cingulate cortex",
    "dlPFC",
    "OFC",
    "orbitofrontal cortex",
    "working memory",
    "attention",
    "decision-making",
    "learning",
    "language",
    "executive function",
    "social cognition",
    "motivation"
  ];
  const regions = knownSignals.filter((region) =>
    new RegExp(`\\b${region.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
      input
    )
  );
  return regions.length > 0 ? Array.from(new Set(regions)).join(", ") : undefined;
}

function inferMethodology(input: string, paperData: PaperData) {
  const fromMethods =
    paperData.methods ||
    pickFirstMatch(input, [
      /\b(?:methods?|paradigm|task)\b[:\s-]+(.{20,220})/i,
      /\b(participants?\s+completed\s+.{10,220})/i
    ]);
  return fromMethods ? compactText(fromMethods).slice(0, 250) : undefined;
}

function inferSampleSize(input: string) {
  const n = pickFirstMatch(input, [
    /\b(?:n|N)\s*[=]\s*(\d{1,4})\b/,
    /\b(\d{1,4})\s+(?:participants|subjects|adults|patients)\b/i
  ]);
  return n ? `n=${n}` : undefined;
}

function inferModality(input: string) {
  const candidates = [
    "fMRI",
    "EEG",
    "MEG",
    "PET",
    "TMS",
    "single-unit recording",
    "behavioral",
    "lesion study",
    "electrophysiology"
  ];
  const hit = candidates.find((candidate) =>
    new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
      input
    )
  );
  return hit || undefined;
}

function inferGainVsLoss(input: string) {
  const match = input.match(
    /\b(gain\s*[>/-]\s*loss|loss\s*[>/-]\s*gain|gain\s+versus\s+loss|loss\s+versus\s+gain)\b/i
  );
  if (match?.[1]) {
    return compactText(match[1]);
  }

  if (/gain/i.test(input) && /loss/i.test(input)) {
    return "Mentions gain and loss contrasts.";
  }

  return undefined;
}

function fallbackExtraction(paperData: PaperData, summary: string): EvidenceFields {
  const context = [
    paperData.abstract,
    paperData.methods,
    paperData.discussion,
    paperData.conclusions,
    paperData.figures,
    summary
  ]
    .filter(Boolean)
    .join("\n");

  return {
    methodology: inferMethodology(context, paperData),
    sampleSize: inferSampleSize(context),
    modality: inferModality(context),
    brainRegions: inferKeyRegionsOrConstructs(context),
    gainVsLoss: inferGainVsLoss(context),
    keyStats: findStats(context)
  };
}

function extractFirstJsonObject(rawText: string) {
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return rawText.slice(start, end + 1);
}

export async function extractEvidenceFields(
  openai: OpenAI,
  paperData: PaperData,
  summary: string
): Promise<EvidenceFields> {
  const clampedPaper = clampPaperDataForPrompt(paperData);
  const clampedSummary = clampText(summary, PROMPT_LIMITS.summary);

  if (env.MOCK_GOOGLE_APIS) {
    return fallbackExtraction(clampedPaper, clampedSummary);
  }

  const payload = {
    title: clampedPaper.title,
    abstract: clampedPaper.abstract,
    methods: clampedPaper.methods ?? null,
    discussion: clampedPaper.discussion ?? null,
    conclusions: clampedPaper.conclusions ?? null,
    summary: clampedSummary
  };

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "Extract compact evidence fields for cross-disciplinary literature comparison. Return ONLY JSON with keys: methodology, sampleSize, modality, brainRegions, gainVsLoss, keyStats. Use null when unknown."
        },
        {
          role: "user",
          content: JSON.stringify(payload)
        }
      ]
    });

    const rawJson = extractFirstJsonObject(response.output_text || "");
    if (!rawJson) {
      return fallbackExtraction(paperData, summary);
    }

    const parsed = EvidenceFieldsSchema.safeParse(JSON.parse(rawJson));
    if (!parsed.success) {
      return fallbackExtraction(clampedPaper, clampedSummary);
    }

    return normalizeFields(parsed.data);
  } catch {
    return fallbackExtraction(clampedPaper, clampedSummary);
  }
}
