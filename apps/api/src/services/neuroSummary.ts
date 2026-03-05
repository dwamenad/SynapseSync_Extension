import OpenAI from "openai";
import { env } from "../config/env";

export type PaperData = {
  title: string;
  abstract: string;
  url: string;
  authors?: string[];
  doi?: string;
};

const NEURO_SYSTEM_PROMPT = `You are an expert Neuroscience Research Assistant specializing in Cognition and Decision-Making.
Your task is to synthesize the provided PubMed abstract into a structured "Master Literature Review" entry.

STRICT FORMATTING RULES:
1. Use Markdown headers for organization.
2. Maintain a professional, objective, and dense academic tone.
3. Use LaTeX for any mathematical notations or statistical values (e.g., $p < .05$, $\\eta^2 = .14$).

REQUIRED STRUCTURE:

## [Paper Title]
**Full Citation:** [Generate a formal APA-style citation based on authors/year/journal]
**Link:** [Insert URL here]

### 1. Research Core
- **Hypothesis:** What specific cognitive or neural mechanism is being tested?
- **Paradigm/Task:** Describe the behavioral task.

### 2. Methodological Parameters
- **Sample ($n$):** Detail participant count/demographic.
- **Modality:** Specify recording method.
- **ROIs/Coordinates:** List specific brain regions or MNI coordinates highlighted.

### 3. Key Findings & Stats
- Detail primary neural and behavioral results.
- Include contrasts and effect sizes if present.

### 4. Synthesis for PhD Review
- **Contribution:** How does this advance cognition/neuroscience?
- **Limitations:** Note caveats.

---`;

const GENERAL_SYSTEM_PROMPT = `You are an academic research assistant.
Summarize the PubMed abstract as a concise literature-review entry with:
1) Citation and link
2) Research question
3) Methods (sample, modality, task)
4) Results and statistics (if available)
5) Contributions and limitations.`;

export async function generateNeuroSummary(
  openai: OpenAI,
  paperData: PaperData,
  neuroMode: boolean
): Promise<string> {
  if (env.MOCK_GOOGLE_APIS) {
    return [
      `## ${paperData.title}`,
      `**Full Citation:** ${paperData.authors?.join(", ") || "Authors unavailable"}. (n.d.). ${paperData.title}.`,
      `**Link:** ${paperData.url}`,
      "",
      "### 1. Research Core",
      "- **Hypothesis:** Mock-mode placeholder for the tested mechanism.",
      "- **Paradigm/Task:** PubMed abstract-based task summary placeholder.",
      "",
      "### 2. Methodological Parameters",
      "- **Sample ($n$):** Not explicitly reported in mock mode.",
      "- **Modality:** Not explicitly reported in mock mode.",
      "- **ROIs/Coordinates:** Not explicitly reported in mock mode.",
      "",
      "### 3. Key Findings & Stats",
      "- Primary findings unavailable in mock mode.",
      "",
      "### 4. Synthesis for PhD Review",
      "- **Contribution:** Placeholder contribution summary.",
      "- **Limitations:** Abstract-only synthesis; validate against full text.",
      "",
      "---"
    ].join("\n");
  }

  const promptPayload = {
    title: paperData.title,
    abstract: paperData.abstract,
    url: paperData.url,
    authors: paperData.authors ?? [],
    doi: paperData.doi ?? null,
    neuroMode
  };

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: neuroMode ? NEURO_SYSTEM_PROMPT : GENERAL_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: `Summarize this paper:\n${JSON.stringify(promptPayload, null, 2)}`
      }
    ]
  });

  const text = response.output_text?.trim();
  if (!text) {
    throw new Error("Model did not return summary content");
  }

  return text;
}
