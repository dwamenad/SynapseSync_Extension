import { describe, expect, it } from "vitest";
import { clampPaperDataForPrompt, clampText } from "../../apps/api/src/services/promptLimits";

describe("prompt limits", () => {
  it("clamps text with ellipsis when over max", () => {
    const input = "x".repeat(20);
    const output = clampText(input, 10);
    expect(output.length).toBeGreaterThan(10);
    expect(output.endsWith("...")).toBe(true);
  });

  it("clamps long paper fields for prompt safety", () => {
    const paper = clampPaperDataForPrompt({
      title: "t".repeat(800),
      abstract: "a".repeat(30_000),
      methods: "m".repeat(10_000),
      discussion: "d".repeat(10_000),
      conclusions: "c".repeat(10_000),
      futureDirections: "f".repeat(10_000),
      citations: "z".repeat(20_000),
      url: "https://example.org"
    });

    expect(paper.title.length).toBeLessThan(600);
    expect(paper.abstract.length).toBeLessThan(11_000);
    expect((paper.methods || "").length).toBeLessThan(7_000);
    expect((paper.citations || "").length).toBeLessThan(9_000);
  });
});

