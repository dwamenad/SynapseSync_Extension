import type { PaperData } from "./neuroSummary";

export const PROMPT_LIMITS = {
  title: 500,
  abstract: 10_000,
  section: 6_000,
  citations: 8_000,
  summary: 8_000
} as const;

export function clampText(value: string | null | undefined, maxChars: number) {
  const text = (value || "").trim();
  if (!text) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}...`;
}

export function clampPaperDataForPrompt(paperData: PaperData): PaperData {
  return {
    ...paperData,
    title: clampText(paperData.title, PROMPT_LIMITS.title),
    abstract: clampText(paperData.abstract, PROMPT_LIMITS.abstract),
    methods: clampText(paperData.methods, PROMPT_LIMITS.section) || undefined,
    figures: clampText(paperData.figures, PROMPT_LIMITS.section) || undefined,
    discussion: clampText(paperData.discussion, PROMPT_LIMITS.section) || undefined,
    conclusions: clampText(paperData.conclusions, PROMPT_LIMITS.section) || undefined,
    futureDirections:
      clampText(paperData.futureDirections, PROMPT_LIMITS.section) || undefined,
    citations: clampText(paperData.citations, PROMPT_LIMITS.citations) || undefined
  };
}

