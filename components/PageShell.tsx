import { createClient } from "@/lib/supabase/server";
import { Sidebar, type SidebarSection } from "./Sidebar";

export async function getUserLabel() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (user?.user_metadata?.full_name as string | undefined) || user?.email || "Utente";
}

export function PageShell({
  active,
  userLabel,
  eyebrow,
  title,
  subtitle,
  aside,
  children,
}: {
  active: SidebarSection;
  userLabel: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <Sidebar active={active} userLabel={userLabel} />
      <main className="main-content">
        <div className="hero">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h1>{title}</h1>
            <p className="subtitle">{subtitle}</p>
          </div>
          {aside}
        </div>
        {children}
      </main>
    </div>
  );
}

export function EmptyState({ title, note }: { title: string; note: string }) {
  return (
    <div style={{ padding: "34px 20px", textAlign: "center", color: "var(--muted)" }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>{note}</div>
    </div>
  );
}

export function ErrorState() {
  return (
    <div style={{ padding: 20, fontSize: 13, color: "var(--danger)" }}>
      Non riesco a contattare Siderio Suite in questo momento. Riprova tra poco.
    </div>
  );
}
