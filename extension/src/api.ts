import type {
  ExtensionChatPayload,
  OverlapCheckResponse,
  PaperData,
  RecentDoc
} from "./types";

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T;
  if (!res.ok) {
    const errorMessage =
      typeof (data as { error?: unknown }).error === "string"
        ? ((data as { error: string }).error as string)
        : `Request failed (${res.status})`;
    throw new Error(errorMessage);
  }

  return data;
}

export class SynapseSyncApi {
  constructor(private baseUrl: string) {}

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  getWebAppUrl() {
    return this.baseUrl.replace(":4000", ":3000");
  }

  async getRecentDocs() {
    const res = await fetch(`${this.baseUrl}/api/google/recentDocs`, {
      credentials: "include"
    });
    const data = await parseJsonResponse<{ docs: RecentDoc[] }>(res);
    return data.docs;
  }

  async getCsrfToken() {
    const res = await fetch(`${this.baseUrl}/api/csrf`, {
      credentials: "include"
    });
    const data = await parseJsonResponse<{ csrfToken: string }>(res);
    return data.csrfToken;
  }

  async summarizeAndAppend(payload: ExtensionChatPayload) {
    const csrfToken = await this.getCsrfToken();
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken
      },
      body: JSON.stringify(payload)
    });

    return parseJsonResponse<{
      message: string;
      summary?: string;
      appendedDoc?: { documentId: string; documentUrl: string };
    }>(res);
  }

  async checkOverlap(payload: { targetDocId: string; paperData: PaperData }) {
    const csrfToken = await this.getCsrfToken();
    const res = await fetch(`${this.baseUrl}/api/research/overlap-check`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken
      },
      body: JSON.stringify(payload)
    });

    return parseJsonResponse<OverlapCheckResponse>(res);
  }
}
