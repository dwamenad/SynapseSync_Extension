import { describe, expect, it } from "vitest";
import { extractEvidenceFields } from "../../apps/api/src/services/evidenceExtraction";
import {
  buildEvidenceMatrixRows,
  EVIDENCE_MATRIX_COLUMNS
} from "../../apps/api/src/services/googleSheetService";
import { cosineSimilarity } from "../../apps/api/src/services/overlapService";
import { buildSynthesisPrompt } from "../../apps/api/src/services/synthesisService";
import type OpenAI from "openai";
import type { PaperData } from "../../apps/api/src/services/researchSummary";

describe("connection phase services", () => {
  it("ranks cosine similarity correctly", () => {
    const base = [1, 0, 0];
    const close = [0.9, 0.1, 0];
    const far = [0, 1, 0];
    expect(cosineSimilarity(base, close)).toBeGreaterThan(cosineSimilarity(base, far));
  });

  it("extracts evidence fields in mock mode with schema-safe output", async () => {
    const paperData: PaperData = {
      title: "Decision under uncertainty",
      abstract:
        "n=24 adults completed an fMRI reversal-learning task showing gain versus loss effects in vmPFC.",
      methods: "Twenty-four participants completed a probabilistic reversal task with fMRI.",
      url: "https://example.org/paper"
    };

    const result = await extractEvidenceFields(
      {} as OpenAI,
      paperData,
      "Gain > Loss in vmPFC with p < .05."
    );

    expect(result.sampleSize).toContain("24");
    expect(result.modality?.toLowerCase()).toContain("fmri");
    expect(result.brainRegions?.toLowerCase()).toContain("vmpfc");
    expect(result.gainVsLoss?.toLowerCase()).toContain("gain");
  });

  it("maps evidence matrix rows to deterministic columns", () => {
    const rows = buildEvidenceMatrixRows([
      {
        title: "Paper A",
        url: "https://example.org/a",
        doi: "10.1/a",
        methodology: "Task",
        sampleSize: "n=20",
        modality: "EEG",
        brainRegions: "vmPFC",
        gainVsLoss: "Gain > Loss",
        keyStats: "p < .05",
        createdAt: new Date("2026-01-01T00:00:00.000Z")
      }
    ]);

    expect(EVIDENCE_MATRIX_COLUMNS).toHaveLength(10);
    expect(rows[0][0]).toBe("Paper A");
    expect(rows[0][4]).toBe("n=20");
    expect(rows[0][7]).toBe("Gain > Loss");
  });

  it("builds synthesis prompt with the selected mode", () => {
    const entries = [
      {
        id: "1",
        title: "Paper 1",
        summary: "Summary 1",
        methodology: "Task A",
        modality: "fMRI",
        sampleSize: "n=24",
        brainRegions: "vmPFC",
        gainVsLoss: "Gain > Loss",
        keyStats: "p < .05",
        createdAt: new Date("2025-01-01T00:00:00.000Z")
      },
      {
        id: "2",
        title: "Paper 2",
        summary: "Summary 2",
        methodology: "Task B",
        modality: "EEG",
        sampleSize: "n=30",
        brainRegions: "ACC",
        gainVsLoss: "Loss > Gain",
        keyStats: "p < .01",
        createdAt: new Date("2026-01-01T00:00:00.000Z")
      }
    ] as any;

    const prompt = buildSynthesisPrompt("chronological", entries);
    expect(prompt.mode).toBe("chronological");
    expect(prompt.instruction.toLowerCase()).toContain("chronological");
    expect(prompt.papers).toHaveLength(2);
  });
});
