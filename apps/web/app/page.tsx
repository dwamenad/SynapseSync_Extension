import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container">
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h1>Google Docs Chat Creator</h1>
        <p className="meta">
          Sign in with Google, then ask ChatGPT to create and write Google Docs in your
          Drive.
        </p>
        <div className="row">
          <a className="button primary" href="/auth/google">
            Sign in with Google
          </a>
          <Link className="button secondary" href="/dashboard">
            Open Dashboard
          </Link>
        </div>
      </div>

      <div className="card">
        <h2>Prompt Example</h2>
        <p className="meta">
          Create a doc titled Weekly Plan in folder 1AbC... with this content: # Goals\n
          **Launch MVP** by Friday
        </p>
      </div>
    </main>
  );
}
