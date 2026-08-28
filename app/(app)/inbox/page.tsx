import { createClient } from "@/lib/supabase/server";
import { PageShell, EmptyState, ErrorState, getUserLabel } from "@/components/PageShell";
import { MailRow, type MailTriage } from "./MailRow";
import { AnalyzeButton } from "./AnalyzeButton";

export const dynamic = "force-dynamic";

type Contatori = {
  da_smistare: number;
  nuove_richieste: number;
  possibili_match: number;
  da_verificare: number;
  da_analizzare: number;
  archiviate_non_commerciali: number;
};

export default async function InboxPage() {
  const userLabel = await getUserLabel();
  const supabase = await createClient();

  const [listaRes, contRes, caselleRes] = await Promise.all([
    supabase.schema("sales_ai").rpc("get_inbox_commerciale", { p_limit: 100 }),
    supabase.schema("sales_ai").rpc("get_inbox_contatori"),
    supabase.from("email_account").select("indirizzo").eq("sales_ai_inbox", true).eq("attivo", true),
  ]);

  const mails = (listaRes.data ?? []) as MailTriage[];
  const c = (contRes.data ?? null) as Contatori | null;
  const caselle = (caselleRes.data ?? []).map((r: { indirizzo: string }) => r.indirizzo);

  return (
    <PageShell
      active="inbox"
      userLabel={userLabel}
      eyebrow="Ingresso commerciale"
      title="Inbox commerciale"
      subtitle="Solo le email che richiedono una decisione commerciale. Il resto è già stato tolto di mezzo."
      aside={<AnalyzeButton daAnalizzare={c?.da_analizzare ?? 0} />}
    >
      <div className="cards-3" style={{ marginBottom: 18 }}>
        <div className="card">
          <h3>Da smistare</h3>
          <div className="big">{c?.da_smistare ?? 0}</div>
          <p>Richiedono una tua decisione.</p>
        </div>
        <div className="card">
          <h3>Nuove richieste</h3>
          <div className="big">{c?.nuove_richieste ?? 0}</div>
          <p>Possibili opportunità nuove.</p>
        </div>
        <div className="card">
          <h3>Possibili match</h3>
          <div className="big">{c?.possibili_match ?? 0}</div>
          <p>Riguardano un lavoro già in corso.</p>
        </div>
      </div>

      <section className="panel" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>Da smistare</h2>
          <span className="panel-meta">
            {caselle.length > 0 ? `caselle: ${caselle.join(", ")}` : "nessuna casella commerciale configurata"}
          </span>
        </div>

        {(listaRes.error || contRes.error) && <ErrorState />}

        {caselle.length === 0 && !listaRes.error && (
          <EmptyState
            title="Nessuna casella commerciale configurata"
            note="Nessun account ha il flag sales_ai_inbox attivo, quindi non entra niente. Va acceso sulle caselle da cui passa la posta commerciale."
          />
        )}

        {caselle.length > 0 && mails.length === 0 && !listaRes.error && (
          <EmptyState
            title="Niente da smistare"
            note={
              (c?.da_analizzare ?? 0) > 0
                ? `Ci sono ${c?.da_analizzare} email in attesa di classificazione: premi «Classifica le nuove».`
                : "Tutte le email in arrivo sono state classificate o lavorate."
            }
          />
        )}

        {mails.map((m) => (
          <MailRow key={m.email_id} m={m} />
        ))}
      </section>

      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 14, lineHeight: 1.55, maxWidth: 680 }}>
        Entrano solo le email in arrivo delle caselle commerciali, non ancora agganciate a un&apos;offerta o a
        una commessa: quelle già collegate alimentano direttamente l&apos;analisi dell&apos;opportunità e non
        hanno bisogno di essere smistate. Chi scrive da un mittente mai commerciale viene archiviato senza
        passare dal modello.{" "}
        {(c?.archiviate_non_commerciali ?? 0) > 0 && (
          <>Finora {c?.archiviate_non_commerciali} email sono state archiviate come non commerciali.</>
        )}
      </p>
    </PageShell>
  );
}
