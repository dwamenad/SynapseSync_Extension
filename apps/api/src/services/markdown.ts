import type { docs_v1 } from "googleapis";

type InlineStyle = {
  start: number;
  end: number;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  linkUrl?: string;
};

type HeadingStyle = {
  start: number;
  end: number;
  namedStyleType: "HEADING_1" | "HEADING_2";
};

type ListStyle = {
  start: number;
  end: number;
  bulletPreset: "BULLET_DISC_CIRCLE_SQUARE" | "NUMBERED_DECIMAL_ALPHA_ROMAN";
};

type ParsedInline = {
  text: string;
  styles: InlineStyle[];
};

function parseInlineMarkdown(line: string): ParsedInline {
  let i = 0;
  let output = "";
  const styles: InlineStyle[] = [];

  while (i < line.length) {
    const linkMatch = line.slice(i).match(/^\[([^\]]+)]\((https?:\/\/[^)]+)\)/i);
    if (linkMatch) {
      const text = linkMatch[1];
      const linkUrl = linkMatch[2];
      const start = output.length;
      output += text;
      styles.push({ start, end: output.length, linkUrl });
      i += linkMatch[0].length;
      continue;
    }

    if (line.startsWith("**", i)) {
      const close = line.indexOf("**", i + 2);
      if (close !== -1) {
        const text = line.slice(i + 2, close);
        const start = output.length;
        output += text;
        styles.push({ start, end: output.length, bold: true });
        i = close + 2;
        continue;
      }
    }

    if (line.startsWith("*", i)) {
      const close = line.indexOf("*", i + 1);
      if (close !== -1) {
        const text = line.slice(i + 1, close);
        const start = output.length;
        output += text;
        styles.push({ start, end: output.length, italic: true });
        i = close + 1;
        continue;
      }
    }

    if (line.startsWith("`", i)) {
      const close = line.indexOf("`", i + 1);
      if (close !== -1) {
        const text = line.slice(i + 1, close);
        const start = output.length;
        output += text;
        styles.push({ start, end: output.length, code: true });
        i = close + 1;
        continue;
      }
    }

    output += line[i];
    i += 1;
  }

  return { text: output, styles };
}

function isTableSeparatorRow(line: string) {
  return /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line.trim());
}

function tableMarkdownRowToText(line: string) {
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

  return cells.join(" | ");
}

function buildTextStyleRequest(style: InlineStyle): docs_v1.Schema$Request {
  const textStyle: docs_v1.Schema$TextStyle = {};
  const fieldSet = new Set<string>();

  if (style.bold) {
    textStyle.bold = true;
    fieldSet.add("bold");
  }

  if (style.italic) {
    textStyle.italic = true;
    fieldSet.add("italic");
  }

  if (style.code) {
    textStyle.weightedFontFamily = { fontFamily: "Courier New" };
    textStyle.backgroundColor = {
      color: {
        rgbColor: {
          red: 0.95,
          green: 0.95,
          blue: 0.95
        }
      }
    };
    fieldSet.add("weightedFontFamily");
    fieldSet.add("backgroundColor");
  }

  if (style.linkUrl) {
    textStyle.link = { url: style.linkUrl };
    fieldSet.add("link");
  }

  return {
    updateTextStyle: {
      range: {
        startIndex: 1 + style.start,
        endIndex: 1 + style.end
      },
      textStyle,
      fields: Array.from(fieldSet).join(",")
    }
  };
}

export function markdownToDocsRequests(markdown: string): {
  text: string;
  requests: docs_v1.Schema$Request[];
} {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const inlineStyles: InlineStyle[] = [];
  const headings: HeadingStyle[] = [];
  const lists: ListStyle[] = [];

  let offset = 0;
  let inCodeBlock = false;
  const parsedLines: string[] = [];

  for (const rawLine of lines) {
    if (rawLine.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      parsedLines.push(rawLine);
      if (rawLine.length > 0) {
        inlineStyles.push({
          start: offset,
          end: offset + rawLine.length,
          code: true
        });
      }
      offset += rawLine.length + 1;
      continue;
    }

    let line = rawLine;
    let headingType: HeadingStyle["namedStyleType"] | undefined;
    let listBulletPreset: ListStyle["bulletPreset"] | undefined;

    if (line.trim().startsWith("|")) {
      if (isTableSeparatorRow(line)) {
        continue;
      }
      line = tableMarkdownRowToText(line);
    }

    if (line.startsWith("## ")) {
      headingType = "HEADING_2";
      line = line.slice(3);
    } else if (line.startsWith("# ")) {
      headingType = "HEADING_1";
      line = line.slice(2);
    } else if (/^\s*[-*]\s+/.test(line)) {
      listBulletPreset = "BULLET_DISC_CIRCLE_SQUARE";
      line = line.replace(/^\s*[-*]\s+/, "");
    } else if (/^\s*\d+\.\s+/.test(line)) {
      listBulletPreset = "NUMBERED_DECIMAL_ALPHA_ROMAN";
      line = line.replace(/^\s*\d+\.\s+/, "");
    }

    const { text, styles } = parseInlineMarkdown(line);
    for (const style of styles) {
      inlineStyles.push({
        start: offset + style.start,
        end: offset + style.end,
        bold: style.bold,
        italic: style.italic,
        code: style.code,
        linkUrl: style.linkUrl
      });
    }

    if (headingType && text.length > 0) {
      headings.push({
        start: offset,
        end: offset + text.length,
        namedStyleType: headingType
      });
    }

    if (listBulletPreset && text.length > 0) {
      lists.push({
        start: offset,
        end: offset + text.length + 1,
        bulletPreset: listBulletPreset
      });
    }

    offset += text.length + 1;
    parsedLines.push(text);
  }

  const text = parsedLines.join("\n");
  const requests: docs_v1.Schema$Request[] = [];

  for (const heading of headings) {
    requests.push({
      updateParagraphStyle: {
        range: {
          startIndex: 1 + heading.start,
          endIndex: 1 + heading.end
        },
        paragraphStyle: {
          namedStyleType: heading.namedStyleType
        },
        fields: "namedStyleType"
      }
    });
  }

  for (const list of lists) {
    requests.push({
      createParagraphBullets: {
        range: {
          startIndex: 1 + list.start,
          endIndex: 1 + list.end
        },
        bulletPreset: list.bulletPreset
      }
    });
  }

  for (const style of inlineStyles) {
    requests.push(buildTextStyleRequest(style));
  }

  return { text, requests };
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
