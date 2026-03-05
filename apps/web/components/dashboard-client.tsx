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

export default function DashboardClient() {
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState("");
  const [folderId, setFolderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string>("");

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
            <input
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              placeholder="Paste Google Drive folder ID"
            />
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
    </div>
  );
}
