import OpenAI from "openai";
import { env } from "../config/env";

export type PaperData = {
  title: string;
  abstract: string;
  url: string;
  methods?: string;
  figures?: string;
  discussion?: string;
  conclusions?: string;
  futureDirections?: string;
  citations?: string;
  authors?: string[];
  doi?: string;
  sourceType?: "pubmed" | "arxiv" | "biorxiv" | "journal";
};

const DISCIPLINE_SYSTEM_PROMPT = `You are an expert PhD-level research assistant supporting literature review workflows across disciplines.
Your task is to synthesize the provided research metadata and scraped sections into a structured "Master Literature Review" entry.

STRICT FORMATTING RULES:
1. Use Markdown headers for organization.
2. Maintain a professional, objective, and dense academic tone.
3. Use LaTeX for any mathematical notations or statistical values (e.g., $p < .05$, $\\eta^2 = .14$).

REQUIRED STRUCTURE:

## [Paper Title]
**Full Citation:** [Generate a formal APA-style citation based on authors/year/journal]
**Link:** [Insert URL here]

### 1. Research Core
- **Question/Hypothesis:** What specific mechanism, relationship, or claim is being tested?
- **Study Design/Task:** Describe the study design, paradigm, or task.

### 2. Methodological Parameters
- **Sample ($n$):** Detail participant/unit count and key demographics when available.
- **Data/Measurement Modality:** Specify instrumentation, modality, or data source.
- **Key Variables/Regions/Constructs:** List named constructs, regions, variables, or coordinates highlighted.

### 3. Key Findings & Stats
- Detail the primary empirical results.
- Include contrasts, test statistics, and effect sizes if present.

### 4. Synthesis for PhD Review
- **Contribution:** How does this advance the field/topic?
- **Limitations:** Note caveats.

---`;

const GENERAL_SYSTEM_PROMPT = `You are an academic research assistant for PhD students and researchers across fields.
Summarize the provided paper content as a concise literature-review entry with:
1) Citation and link
2) Research question
3) Methods (sample, modality, task)
4) Results and statistics (if available)
5) Contributions and limitations.
Use available sections such as abstract, methods, discussion, conclusions, future directions, figures, and citations when present.`;

export async function generateResearchSummary(
  openai: OpenAI,
  paperData: PaperData,
  disciplineMode: boolean
): Promise<string> {
  if (env.MOCK_GOOGLE_APIS) {
    return [
      `## ${paperData.title}`,
      `**Full Citation:** ${paperData.authors?.join(", ") || "Authors unavailable"}. (n.d.). ${paperData.title}.`,
      `**Link:** ${paperData.url}`,
      paperData.sourceType ? `**Source Type:** ${paperData.sourceType}` : "",
      "",
      "### 1. Research Core",
      "- **Question/Hypothesis:** Mock-mode placeholder for the tested mechanism.",
      "- **Study Design/Task:** Scraped-section task summary placeholder.",
      "",
      "### 2. Methodological Parameters",
      "- **Sample ($n$):** Not explicitly reported in mock mode.",
      "- **Data/Measurement Modality:** Not explicitly reported in mock mode.",
      "- **Key Variables/Regions/Constructs:** Not explicitly reported in mock mode.",
      "",
      "### 3. Key Findings & Stats",
      "- Primary findings unavailable in mock mode.",
      "",
      "### 4. Synthesis for PhD Review",
      "- **Contribution:** Placeholder contribution summary.",
      "- **Limitations:** Scraped-page synthesis; validate against full text.",
      "",
      "---"
    ]
      .filter(Boolean)
      .join("\n");
  }

  const promptPayload = {
    title: paperData.title,
    abstract: paperData.abstract,
    methods: paperData.methods ?? null,
    figures: paperData.figures ?? null,
    discussion: paperData.discussion ?? null,
    conclusions: paperData.conclusions ?? null,
    futureDirections: paperData.futureDirections ?? null,
    citations: paperData.citations ?? null,
    url: paperData.url,
    sourceType: paperData.sourceType ?? null,
    authors: paperData.authors ?? [],
    doi: paperData.doi ?? null,
    disciplineMode
  };

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: disciplineMode ? DISCIPLINE_SYSTEM_PROMPT : GENERAL_SYSTEM_PROMPT
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
