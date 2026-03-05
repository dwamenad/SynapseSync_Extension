"use client";

import { useEffect, useState } from "react";

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

  async function loadIntegrationStatus() {
    const res = await fetch("/api/google/status", { credentials: "include" });
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    setIntegrationStatus(data);
  }

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

  const selectedDoc = recentDocs.find((doc) => doc.id === selectedDocId) || null;

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
          <div style={{ marginTop: "0.8rem", borderTop: "1px solid var(--border)", paddingTop: "0.8rem" }}>
            <h4 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Selected Doc</h4>
            <p className="meta" style={{ marginBottom: "0.5rem" }}>
              {selectedDoc.title}
            </p>
            <div className="row">
              <a className="button secondary" href={selectedDoc.documentUrl} target="_blank" rel="noreferrer">
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
