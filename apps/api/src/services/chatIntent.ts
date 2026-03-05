export type ParsedCreateIntent = {
  title: string;
  content: string;
  folderId?: string;
  contentFormat?: "plain" | "markdown" | "html";
  shareWith?: string[];
  shareRole?: "reader" | "commenter" | "writer";
};

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function extractBetween(input: string, startRegex: RegExp, endRegex: RegExp): string | null {
  const start = input.search(startRegex);
  if (start === -1) {
    return null;
  }

  const sliced = input.slice(start);
  const endMatch = sliced.match(endRegex);
  if (!endMatch?.index) {
    return sliced.replace(startRegex, "").trim();
  }

  return sliced
    .slice(0, endMatch.index)
    .replace(startRegex, "")
    .trim();
}

export function parseCreateDocIntent(message: string, folderHint?: string): ParsedCreateIntent | null {
  const normalized = message.trim();
  if (!/(create|make|draft)\s+(a\s+)?(google\s+)?doc(ument)?/i.test(normalized)) {
    return null;
  }

  const titleFromTitled = normalized.match(/titled\s+["“]?([^"”\n]+?)["”]?(?=\s+(in\s+folder|with\s+this\s+content:|content:|$))/i)?.[1]?.trim();
  const titleFromKey = normalized.match(/title\s*:\s*([^\n]+)/i)?.[1]?.trim();
  const title = titleFromTitled || titleFromKey || "Untitled Doc";

  const contentFromColon = normalized.match(/(?:with\s+this\s+content|content)\s*:\s*([\s\S]+)/i)?.[1]?.trim();
  const contentFromQuoted = extractBetween(normalized, /content\s+"/i, /"\s*(share\s+with|as\s+(reader|commenter|writer)|$)/i);
  const content = contentFromColon || contentFromQuoted || normalized;

  const folderFromMessage =
    normalized.match(/folder\s*(id)?\s*[:=]?\s*([A-Za-z0-9_-]{10,})/i)?.[2] ||
    normalized.match(/in\s+folder\s+([A-Za-z0-9_-]{10,})/i)?.[1];

  const shareEmails = normalized.match(EMAIL_REGEX) || [];
  const shareRoleMatch = normalized.match(/as\s+(reader|commenter|writer)/i)?.[1]?.toLowerCase();
  const format: ParsedCreateIntent["contentFormat"] = /```|\*\*|^#\s|^##\s|\n[-*]\s/m.test(content)
    ? "markdown"
    : /<\w+[^>]*>/.test(content)
      ? "html"
      : "plain";

  return {
    title,
    content,
    folderId: folderFromMessage || folderHint,
    contentFormat: format,
    shareWith: shareEmails.length ? shareEmails : undefined,
    shareRole: shareRoleMatch as ParsedCreateIntent["shareRole"] | undefined
  };
}
