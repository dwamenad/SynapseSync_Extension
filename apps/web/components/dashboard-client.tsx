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
};

type FolderOption = {
  id: string;
  name: string;
};

export default function DashboardClient() {
  const pickerApiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || "";
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState("");
  const [folderId, setFolderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [folderQuery, setFolderQuery] = useState("");
  const [folderOptions, setFolderOptions] = useState<FolderOption[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);

  async function loadMe() {
    const res = await fetch("/api/me", { credentials: "include" });
    if (!res.ok) {
      setUser(null);
      return;
    }
    const data = await res.json();
    setUser(data.user);
  }

  async function loadRecentDocs() {
    const res = await fetch("/api/google/recentDocs", { credentials: "include" });
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    setRecentDocs(data.docs || []);
  }

  useEffect(() => {
    void loadMe();
    void loadRecentDocs();
    void loadCsrf();
  }, []);

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
    setChat((prev) => [...prev, { role: "user", text: current }]);
    setMessage("");

    try {
      const token = csrfToken || (await loadCsrf());
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

      setChat((prev) => [...prev, { role: "assistant", text: output }]);
      await loadRecentDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
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

    await new Promise<void>((resolve) => {
      window.gapi.load("picker", () => resolve());
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

      const view = new window.google.picker.DocsView(
        window.google.picker.ViewId.FOLDERS
      );
      view.setIncludeFolders(true);
      view.setSelectFolderEnabled(true);

      const picker = new window.google.picker.PickerBuilder()
        .setDeveloperKey(pickerApiKey)
        .setOAuthToken(tokenData.accessToken as string)
        .addView(view)
        .setCallback((data: any) => {
          if (data.action !== window.google.picker.Action.PICKED) {
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

        <div className="chat-log" style={{ marginBottom: "1rem" }}>
          {chat.map((item, idx) => (
            <div className={`chat-msg ${item.role}`} key={`${item.role}-${idx}`}>
              {item.text}
            </div>
          ))}
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
          {recentDocs.length === 0 ? <li className="meta">No docs yet.</li> : null}
          {recentDocs.map((doc) => (
            <li key={doc.id}>
              <div style={{ fontWeight: 600 }}>{doc.title}</div>
              <a href={doc.documentUrl} target="_blank" rel="noreferrer">
                Open doc
              </a>
            </li>
          ))}
        </ul>
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
