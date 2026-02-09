import DashboardClient from "../../components/dashboard-client";

export default function DashboardPage() {
  return (
    <main className="container">
      <h1>Dashboard</h1>
      <p className="meta">Chat with the assistant to create Google Docs in your Drive.</p>
      <DashboardClient />
    </main>
  );
}
