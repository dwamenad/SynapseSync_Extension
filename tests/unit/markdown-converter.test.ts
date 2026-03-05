import { describe, expect, it } from "vitest";
import { markdownToDocsRequests } from "../../apps/api/src/services/markdown";

describe("markdownToDocsRequests", () => {
  it("converts headings and inline styles to Docs requests", () => {
    const result = markdownToDocsRequests("# Title\nThis is **bold** and *italic*.");

    expect(result.text).toBe("Title\nThis is bold and italic.");

    const hasHeading = result.requests.some(
      (req) => req.updateParagraphStyle?.paragraphStyle?.namedStyleType === "HEADING_1"
    );
    const hasBold = result.requests.some(
      (req) => req.updateTextStyle?.textStyle?.bold === true
    );
    const hasItalic = result.requests.some(
      (req) => req.updateTextStyle?.textStyle?.italic === true
    );

    expect(hasHeading).toBe(true);
    expect(hasBold).toBe(true);
    expect(hasItalic).toBe(true);
  });

  it("converts markdown links and inline code", () => {
    const result = markdownToDocsRequests(
      "Read [docs](https://example.com) and run `npm test`."
    );

    expect(result.text).toBe("Read docs and run npm test.");
    const hasLink = result.requests.some(
      (req) => req.updateTextStyle?.textStyle?.link?.url === "https://example.com"
    );
    const hasCodeStyle = result.requests.some(
      (req) =>
        req.updateTextStyle?.textStyle?.weightedFontFamily?.fontFamily === "Courier New"
    );

    expect(hasLink).toBe(true);
    expect(hasCodeStyle).toBe(true);
  });

  it("converts markdown lists into paragraph bullets", () => {
    const result = markdownToDocsRequests("- first\n- second\n1. one\n2. two");
    expect(result.text).toBe("first\nsecond\none\ntwo");

    const bulletCount = result.requests.filter(
      (req) =>
        req.createParagraphBullets?.bulletPreset === "BULLET_DISC_CIRCLE_SQUARE"
    ).length;
    const numberedCount = result.requests.filter(
      (req) =>
        req.createParagraphBullets?.bulletPreset ===
        "NUMBERED_DECIMAL_ALPHA_ROMAN"
    ).length;

    expect(bulletCount).toBe(2);
    expect(numberedCount).toBe(2);
  });

  it("removes code fences and keeps block content", () => {
    const result = markdownToDocsRequests("```js\nconst a = 1;\n```");
    expect(result.text).toBe("const a = 1;");

    const hasCodeStyle = result.requests.some(
      (req) =>
        req.updateTextStyle?.textStyle?.weightedFontFamily?.fontFamily === "Courier New"
    );
    expect(hasCodeStyle).toBe(true);
  });

  it("renders markdown table rows as readable lines", () => {
    const result = markdownToDocsRequests(
      "| Name | Score |\n| --- | --- |\n| A | 10 |\n| B | 8 |"
    );

    expect(result.text).toBe("Name | Score\nA | 10\nB | 8");
  });
});
