"use client";

import { useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
};

type RecentDoc = {
  id: string;
  documentId: string;
  documentUrl: string;
  title: string;
  folderId: string | null;
  createdAt: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

type FolderOption = {
  id: string;
  name: string;
};

type IntegrationStatus = {
  mode: "mock" | "real";
  connected: boolean;
  email?: string | null;
  displayName?: string | null;
  error?: string;
};

type PaperEntrySummary = {
  id: string;
  title: string;
  createdAt: string;
  methodology: string | null;
  sampleSize: string | null;
  modality: string | null;
  brainRegions: string | null;
  gainVsLoss: string | null;
};

type EvidenceMatrixStatus = {
  exists: boolean;
  sheetId?: string;
  sheetUrl?: string;
  updatedAt?: string;
};

const CHAT_STORAGE_KEY = "gdca_chat_history_v1";
const FOLDER_STORAGE_KEY = "gdca_folder_id_v1";

export default function DashboardClient() {
  const pickerApiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || "";
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState("");
  const [folderId, setFolderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const [bootLoading, setBootLoading] = useState(true);
  const [recentLoading, setRecentLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [folderQuery, setFolderQuery] = useState("");
  const [folderOptions, setFolderOptions] = useState<FolderOption[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(
    null
  );

  const [paperEntries, setPaperEntries] = useState<PaperEntrySummary[]>([]);
  const [paperEntriesLoading, setPaperEntriesLoading] = useState(false);
  const [selectedPaperEntryIds, setSelectedPaperEntryIds] = useState<string[]>([]);

  const [matrixStatus, setMatrixStatus] = useState<EvidenceMatrixStatus | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixActionLoading, setMatrixActionLoading] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [googleReconnectNeeded, setGoogleReconnectNeeded] = useState(false);

  const [synthesisMode, setSynthesisMode] = useState<"thematic" | "chronological">(
    "thematic"
  );
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [synthesisPreview, setSynthesisPreview] = useState("");
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [synthesisDocUrl, setSynthesisDocUrl] = useState<string | null>(null);

  function isAuthScopeError(message: string) {
    return /(insufficient|permission|scope|unauthorized|forbidden|reconnect)/i.test(
      message
    );
  }

  async function loadMe() {
    setBootLoading(true);
    const res = await fetch("/api/me", { credentials: "include" });
    if (!res.ok) {
      setUser(null);
      setBootLoading(false);
      return;
    }
    const data = await res.json();
    setUser(data.user);
    setBootLoading(false);
  }

  async function loadRecentDocs() {
    setRecentLoading(true);
    const res = await fetch("/api/google/recentDocs", { credentials: "include" });
    if (!res.ok) {
      setRecentLoading(false);
      return;
    }
    const data = await res.json();
    setRecentDocs(data.docs || []);
    if (!selectedDocId && data.docs?.length) {
      setSelectedDocId(data.docs[0].id);
    }
    setRecentLoading(false);
  }

  async function loadIntegrationStatus() {
    const res = await fetch("/api/google/status", { credentials: "include" });
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    setIntegrationStatus(data);
  }

  useEffect(() => {
    void loadMe();
    void loadRecentDocs();
    void loadCsrf();
    void loadIntegrationStatus();

    const savedChat = window.localStorage.getItem(CHAT_STORAGE_KEY);
    if (savedChat) {
      try {
        const parsed = JSON.parse(savedChat) as Array<Partial<ChatMessage>>;
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .filter((msg) => msg.role === "user" || msg.role === "assistant")
            .map((msg) => ({
              role: msg.role as "user" | "assistant",
              text: msg.text || "",
              createdAt: msg.createdAt || new Date().toISOString()
            }));
          setChat(normalized.slice(-20));
        }
      } catch {
        // ignore malformed local state
      }
    }

    const savedFolder = window.localStorage.getItem(FOLDER_STORAGE_KEY);
    if (savedFolder) {
      setFolderId(savedFolder);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chat.slice(-20)));
  }, [chat]);

  useEffect(() => {
    window.localStorage.setItem(FOLDER_STORAGE_KEY, folderId);
  }, [folderId]);

  async function loadCsrf() {
    const res = await fetch("/api/csrf", { credentials: "include" });
    if (!res.ok) {
      return "";
    }
    const data = await res.json();
    const token = data.csrfToken || "";
    setCsrfToken(token);
    return token;
  }

  const selectedDoc = useMemo(
    () => recentDocs.find((doc) => doc.id === selectedDocId) || null,
    [recentDocs, selectedDocId]
  );

  useEffect(() => {
    if (!selectedDoc?.documentId) {
      setPaperEntries([]);
      setSelectedPaperEntryIds([]);
      setMatrixStatus(null);
      setSynthesisPreview("");
      setSynthesisDocUrl(null);
      return;
    }

    void loadPaperEntries(selectedDoc.documentId);
    void loadMatrixStatus(selectedDoc.documentId);
  }, [selectedDoc?.documentId]);

  async function loadPaperEntries(targetDocId: string) {
    setPaperEntriesLoading(true);
    try {
      const res = await fetch(
        `/api/research/papers?targetDocId=${encodeURIComponent(targetDocId)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load saved papers");
      }

      const papers = (data.papers || []) as PaperEntrySummary[];
      setPaperEntries(papers);
      setSelectedPaperEntryIds((current) =>
        current.filter((id) => papers.some((paper) => paper.id === id))
      );
    } catch (err) {
      setPaperEntries([]);
      setSelectedPaperEntryIds([]);
      setError(err instanceof Error ? err.message : "Failed to load saved papers");
    } finally {
      setPaperEntriesLoading(false);
    }
  }

  async function loadMatrixStatus(targetDocId: string) {
    setMatrixLoading(true);
    setMatrixError(null);
    setGoogleReconnectNeeded(false);
    try {
      const res = await fetch(
        `/api/research/evidence-matrix?targetDocId=${encodeURIComponent(targetDocId)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load evidence matrix status");
      }
      setMatrixStatus(data);
    } catch (err) {
      setMatrixStatus(null);
      const message =
        err instanceof Error ? err.message : "Failed to load evidence matrix status";
      setMatrixError(message);
      setGoogleReconnectNeeded(isAuthScopeError(message));
    } finally {
      setMatrixLoading(false);
    }
  }

  async function generateOrRefreshMatrix() {
    if (!selectedDoc?.documentId) {
      return;
    }

    setMatrixActionLoading(true);
    setMatrixError(null);
    setGoogleReconnectNeeded(false);
    try {
      const token = csrfToken || (await loadCsrf());
      const res = await fetch("/api/research/evidence-matrix", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": token
        },
        body: JSON.stringify({ targetDocId: selectedDoc.documentId })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate evidence matrix");
      }

      setMatrixStatus({
        exists: true,
        sheetId: data.sheetId,
        sheetUrl: data.sheetUrl,
        updatedAt: data.updatedAt
      });
      setStatusText("Evidence Matrix refreshed successfully.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Evidence Matrix generation failed";
      setMatrixError(message);
      setGoogleReconnectNeeded(isAuthScopeError(message));
    } finally {
      setMatrixActionLoading(false);
    }
  }

  function togglePaperSelection(id: string) {
    setSelectedPaperEntryIds((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }
      if (current.length >= 10) {
        return current;
      }
      return [...current, id];
    });
  }

  async function synthesizeSection() {
    if (!selectedDoc?.documentId) {
      return;
    }

    setSynthesisError(null);
    setGoogleReconnectNeeded(false);
    setSynthesisLoading(true);
    try {
      const token = csrfToken || (await loadCsrf());
      const res = await fetch("/api/research/synthesize", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": token
        },
        body: JSON.stringify({
          targetDocId: selectedDoc.documentId,
          paperEntryIds: selectedPaperEntryIds,
          mode: synthesisMode
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Synthesis failed");
      }

      setSynthesisPreview(data.synthesisText || "");
      setSynthesisDocUrl(data.appendedDoc?.documentUrl || null);
      setStatusText("Synthesis draft appended to selected document.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Synthesis failed";
      setSynthesisError(message);
      setGoogleReconnectNeeded(isAuthScopeError(message));
    } finally {
      setSynthesisLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      return;
    }

    const current = message.trim();
    setError(null);
    setLoading(true);
    setStatusText("Sending request...");
    setChat((prev) => [
      ...prev,
      { role: "user", text: current, createdAt: new Date().toISOString() }
    ]);
    setMessage("");

    try {
      const token = csrfToken || (await loadCsrf());
      setStatusText("Assistant is preparing doc request...");
      const res = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": token
        },
        body: JSON.stringify({
          message: current,
          folderId: folderId.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Chat failed");
      }

      const output = data.createdDoc
        ? `${data.message} ${data.createdDoc.documentUrl}`
        : data.message;

      setChat((prev) => [
        ...prev,
        { role: "assistant", text: output, createdAt: new Date().toISOString() }
      ]);
      setStatusText(data.createdDoc ? "Document created successfully." : "Response received.");
      await loadRecentDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setStatusText("");
    } finally {
      setLoading(false);
    }
  }

  function renderMessageText(raw: string) {
    const parts = raw.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((part, idx) =>
      /^https?:\/\//.test(part) ? (
        <a key={`${part}-${idx}`} href={part} target="_blank" rel="noreferrer">
          {part}
        </a>
      ) : (
        <span key={`${part}-${idx}`}>{part}</span>
      )
    );
  }

  async function onSignOut() {
    const token = csrfToken || (await loadCsrf());
    await fetch("/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "x-csrf-token": token }
    });
    window.location.href = "/";
  }

  async function searchFolders(query: string) {
    setFolderLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) {
        params.set("query", query.trim());
      }
      const res = await fetch(`/api/google/folders?${params.toString()}`, {
        credentials: "include"
      });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      setFolderOptions(data.folders || []);
    } finally {
      setFolderLoading(false);
    }
  }

  async function openFolderPicker() {
    setFolderPickerOpen(true);
    setFolderQuery("");
    await searchFolders("");
  }

  async function loadGooglePickerScripts() {
    if (window.gapi?.load && window.google?.picker) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        "script[data-google-picker='true']"
      );
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      script.async = true;
      script.dataset.googlePicker = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Google Picker script"));
      document.body.appendChild(script);
    });

    const gapi = window.gapi;
    if (!gapi?.load) {
      throw new Error("Google API loader is unavailable");
    }

    await new Promise<void>((resolve) => {
      gapi.load("picker", () => resolve());
    });
  }

  async function openGooglePicker() {
    if (!pickerApiKey) {
      setError("Missing NEXT_PUBLIC_GOOGLE_API_KEY for Google Picker.");
      return;
    }

    setPickerLoading(true);
    setError(null);
    try {
      const tokenRes = await fetch("/api/google/pickerToken", {
        credentials: "include"
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.accessToken) {
        throw new Error(tokenData.error || "Unable to load Google Picker token");
      }

      await loadGooglePickerScripts();
      const google = window.google;
      if (!google?.picker) {
        throw new Error("Google Picker API is unavailable");
      }

      const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS);
      view.setIncludeFolders(true);
      view.setSelectFolderEnabled(true);

      const picker = new google.picker.PickerBuilder()
        .setDeveloperKey(pickerApiKey)
        .setOAuthToken(tokenData.accessToken as string)
        .addView(view)
        .setCallback((data: any) => {
          if (data.action !== google.picker.Action.PICKED) {
            return;
          }

          const selected = data.docs?.[0];
          if (selected?.id) {
            setFolderId(selected.id);
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Picker failed");
    } finally {
      setPickerLoading(false);
    }
  }

  const selectedCount = selectedPaperEntryIds.length;
  const canSynthesize = selectedCount >= 5 && selectedCount <= 10 && !!selectedDoc;

  return (
    <div className="grid two">
      <section className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ marginBottom: 0 }}>Chat</h2>
          {user ? (
            <button className="button secondary" type="button" onClick={onSignOut}>
              Sign out
            </button>
          ) : null}
        </div>
        {user ? (
          <p className="meta">Signed in as {user.email}</p>
        ) : (
          <p className="meta">
            Not signed in. <a href="/auth/google">Sign in with Google</a>.
          </p>
        )}
        {bootLoading ? <p className="meta">Loading account...</p> : null}
        {statusText ? <p className="meta">{statusText}</p> : null}
        {integrationStatus ? (
          <p className="meta">
            Mode: <strong>{integrationStatus.mode}</strong>{" "}
            {integrationStatus.connected ? "connected" : "not connected"}
            {integrationStatus.email ? ` as ${integrationStatus.email}` : ""}
          </p>
        ) : null}

        <div className="chat-log" style={{ marginBottom: "1rem" }}>
          {chat.map((item, idx) => (
            <div className={`chat-msg ${item.role}`} key={`${item.role}-${idx}`}>
              <div>{renderMessageText(item.text)}</div>
              <div className="meta" style={{ marginTop: "0.35rem" }}>
                {new Date(item.createdAt).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>

        <div className="row" style={{ justifyContent: "flex-end", marginBottom: "0.75rem" }}>
          <button
            className="button secondary"
            type="button"
            onClick={() => setChat([])}
            disabled={chat.length === 0}
          >
            Clear history
          </button>
        </div>

        <form onSubmit={onSubmit} className="grid">
          <label>
            Folder ID (optional)
            <div className="row">
              <input
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                placeholder="Paste Google Drive folder ID"
              />
              <button
                className="button secondary"
                type="button"
                onClick={openFolderPicker}
                disabled={!user}
              >
                Browse
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={!user || pickerLoading || !pickerApiKey}
                onClick={() => void openGooglePicker()}
                title={
                  pickerApiKey
                    ? "Use Google Drive Picker"
                    : "Set NEXT_PUBLIC_GOOGLE_API_KEY to enable"
                }
              >
                {pickerLoading ? "Loading..." : "Google Picker"}
              </button>
            </div>
          </label>

          <label>
            Message
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Create a doc titled Project Notes with this content: ..."
            />
          </label>

          <button className="button primary" disabled={loading || !user} type="submit">
            {loading ? "Working..." : "Send"}
          </button>
        </form>

        {error ? <p style={{ color: "#b10f2e", marginTop: "0.75rem" }}>{error}</p> : null}
      </section>

      <aside className="card">
        <h3>Recent Docs</h3>
        <ul className="doc-list">
          {recentLoading ? <li className="meta">Loading docs...</li> : null}
          {!recentLoading && recentDocs.length === 0 ? (
            <li className="meta">No docs yet.</li>
          ) : null}
          {recentDocs.map((doc) => (
            <li
              key={doc.id}
              style={{
                outline: selectedDocId === doc.id ? "2px solid #8cb2ff" : "none",
                cursor: "pointer"
              }}
              onClick={() => setSelectedDocId(doc.id)}
            >
              <div style={{ fontWeight: 600 }}>{doc.title}</div>
              <a href={doc.documentUrl} target="_blank" rel="noreferrer">
                Open doc
              </a>
            </li>
          ))}
        </ul>

        {selectedDoc ? (
          <div
            style={{
              marginTop: "0.8rem",
              borderTop: "1px solid var(--border)",
              paddingTop: "0.8rem"
            }}
          >
            <h4 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Selected Doc</h4>
            <p className="meta" style={{ marginBottom: "0.5rem" }}>
              {selectedDoc.title}
            </p>
            <div className="row">
              <a
                className="button secondary"
                href={selectedDoc.documentUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open
              </a>
              <button
                className="button secondary"
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(selectedDoc.documentUrl);
                }}
              >
                Copy Link
              </button>
            </div>

            <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "0.8rem" }}>
              <h4 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Evidence Matrix</h4>
              <button
                className="button primary"
                type="button"
                onClick={() => void generateOrRefreshMatrix()}
                disabled={matrixActionLoading || !selectedDoc}
              >
                {matrixActionLoading ? "Working..." : "Generate / Refresh Evidence Matrix"}
              </button>
              {matrixLoading ? <p className="meta">Checking matrix status...</p> : null}
              {matrixStatus?.exists && matrixStatus.sheetUrl ? (
                <p className="meta" style={{ marginTop: "0.5rem" }}>
                  <a href={matrixStatus.sheetUrl} target="_blank" rel="noreferrer">
                    Open Matrix
                  </a>
                  {matrixStatus.updatedAt
                    ? ` · Updated ${new Date(matrixStatus.updatedAt).toLocaleString()}`
                    : ""}
                </p>
              ) : (
                <p className="meta" style={{ marginTop: "0.5rem" }}>
                  No matrix generated yet.
                </p>
              )}
              {matrixError ? (
                <p style={{ color: "#b10f2e", marginTop: "0.5rem" }}>{matrixError}</p>
              ) : null}
              {googleReconnectNeeded ? (
                <p className="meta" style={{ marginTop: "0.4rem" }}>
                  Reconnect Google to refresh scopes: <a href="/auth/google">Reconnect</a>
                </p>
              ) : null}
            </div>

            <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "0.8rem" }}>
              <h4 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Saved Papers</h4>
              <p className="meta">Select 5–10 papers for synthesis ({selectedCount}/10).</p>
              <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem" }}>
                {paperEntriesLoading ? <p className="meta">Loading papers...</p> : null}
                {!paperEntriesLoading && paperEntries.length === 0 ? (
                  <p className="meta">No saved papers yet. Append papers first.</p>
                ) : null}
                {paperEntries.map((paper) => (
                  <label key={paper.id} style={{ display: "block", marginBottom: "0.55rem" }}>
                    <input
                      type="checkbox"
                      checked={selectedPaperEntryIds.includes(paper.id)}
                      onChange={() => togglePaperSelection(paper.id)}
                      disabled={
                        !selectedPaperEntryIds.includes(paper.id) &&
                        selectedPaperEntryIds.length >= 10
                      }
                      style={{ marginRight: "0.4rem" }}
                    />
                    <strong>{paper.title}</strong>
                    <div className="meta">
                      {paper.sampleSize || "sample n/a"} · {paper.modality || "modality n/a"}
                    </div>
                    <div className="meta">{paper.gainVsLoss || "gain/loss n/a"}</div>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "0.8rem" }}>
              <h4 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Synthesis Draft</h4>
              <div className="row" style={{ alignItems: "center", marginBottom: "0.5rem" }}>
                <label style={{ display: "grid", gap: "0.2rem", flex: 1 }}>
                  Mode
                  <select
                    value={synthesisMode}
                    onChange={(event) =>
                      setSynthesisMode(event.target.value as "thematic" | "chronological")
                    }
                  >
                    <option value="thematic">Thematic</option>
                    <option value="chronological">Chronological</option>
                  </select>
                </label>
              </div>

              <button
                className="button primary"
                type="button"
                disabled={!canSynthesize || synthesisLoading}
                onClick={() => void synthesizeSection()}
              >
                {synthesisLoading ? "Synthesizing..." : "Synthesize Section"}
              </button>

              {!canSynthesize ? (
                <p className="meta" style={{ marginTop: "0.5rem" }}>
                  Choose between 5 and 10 papers to enable synthesis.
                </p>
              ) : null}

              {synthesisDocUrl ? (
                <p className="meta" style={{ marginTop: "0.5rem" }}>
                  <a href={synthesisDocUrl} target="_blank" rel="noreferrer">
                    Open appended synthesis in Google Doc
                  </a>
                </p>
              ) : null}

              {synthesisPreview ? (
                <pre
                  style={{
                    marginTop: "0.6rem",
                    whiteSpace: "pre-wrap",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "0.55rem",
                    background: "#f8fbff",
                    maxHeight: 220,
                    overflow: "auto"
                  }}
                >
                  {synthesisPreview.slice(0, 1200)}
                </pre>
              ) : null}

              {synthesisError ? (
                <p style={{ color: "#b10f2e", marginTop: "0.5rem" }}>{synthesisError}</p>
              ) : null}
              {googleReconnectNeeded ? (
                <p className="meta" style={{ marginTop: "0.4rem" }}>
                  Reconnect Google to refresh scopes: <a href="/auth/google">Reconnect</a>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </aside>

      {folderPickerOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 style={{ marginBottom: 0 }}>Pick a Folder</h3>
              <button
                className="button secondary"
                type="button"
                onClick={() => setFolderPickerOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="row">
              <input
                value={folderQuery}
                onChange={(e) => setFolderQuery(e.target.value)}
                placeholder="Search folders"
              />
              <button
                className="button primary"
                type="button"
                onClick={() => void searchFolders(folderQuery)}
              >
                Search
              </button>
            </div>

            <ul className="doc-list" style={{ marginTop: "0.5rem", maxHeight: 260, overflow: "auto" }}>
              {folderLoading ? <li className="meta">Loading...</li> : null}
              {!folderLoading && folderOptions.length === 0 ? (
                <li className="meta">No folders found.</li>
              ) : null}
              {folderOptions.map((folder) => (
                <li key={folder.id}>
                  <div style={{ fontWeight: 600 }}>{folder.name}</div>
                  <p className="meta" style={{ marginBottom: "0.5rem" }}>
                    {folder.id}
                  </p>
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => {
                      setFolderId(folder.id);
                      setFolderPickerOpen(false);
                    }}
                  >
                    Select
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
