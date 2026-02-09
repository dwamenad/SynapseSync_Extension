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
});
