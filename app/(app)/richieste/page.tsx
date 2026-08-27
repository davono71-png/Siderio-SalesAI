import { createClient } from "@/lib/supabase/server";
import { PageShell, EmptyState, ErrorState, getUserLabel } from "@/components/PageShell";
import { CandidateCard, type Candidate } from "./CandidateCard";
import { CLASSIFICATION_LABEL, CLASSIFICATION_TONE, dateFmt } from "@/lib/sales-ai/display";

export const dynamic = "force-dynamic";

type Request = {
  request_id: string;
  title: string;
  status: string;
  channel: string;
  agency_name: string | null;
  created_at: string;
  converted_offer_id: string | null;
  client_name: string | null;
  email_count: number;
  sales_status: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  NEW: "Nuova",
  TO_QUALIFY: "Da qualificare",
  WAITING_INFORMATION: "In attesa di informazioni",
  TO_EVALUATE: "Da valutare",
  CONVERTED_TO_OFFER: "Convertita in offerta",
  ARCHIVED: "Archiviata",
};

const STATUS_TONE: Record<string, string> = {
  NEW: "info",
  TO_QUALIFY: "warn",
  WAITING_INFORMATION: "warn",
  TO_EVALUATE: "info",
  CONVERTED_TO_OFFER: "ok",
  ARCHIVED: "neutral",
};

export default async function RichiestePage() {
  const userLabel = await getUserLabel();
  const supabase = await createClient();

  const [candRes, reqRes] = await Promise.all([
    supabase.schema("sales_ai").rpc("get_request_candidates", { p_limit: 60, p_dal: "2026-05-12" }),
    supabase.schema("sales_ai").rpc("get_requests", { p_limit: 60 }),
  ]);

  const candidati = (candRes.data ?? []) as Candidate[];
  const richieste = (reqRes.data ?? []) as Request[];

  return (
    <PageShell
      active="richieste"
      userLabel={userLabel}
      eyebrow="Sales AI · Ingresso"
      title="Richieste"
      subtitle="Email da controparti riconosciute per cui non esiste ancora un'offerta."
    >
      <section className="panel" style={{ overflow: "hidden", marginBottom: 20 }}>
        <div className="panel-head">
          <h2>Richieste aperte</h2>
          <span className="panel-meta">{richieste.length}</span>
        </div>

        {reqRes.error && <ErrorState />}
        {!reqRes.error && richieste.length === 0 && (
          <EmptyState
            title="Nessuna richiesta ancora"
            note="Crea la prima dai candidati qui sotto: da lì potrai poi generare l'offerta in Suite."
          />
        )}

        {richieste.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Richiesta</th>
                  <th>Cliente</th>
                  <th>Stato</th>
                  <th>Sales AI</th>
                  <th>Email</th>
                  <th>Aperta il</th>
                </tr>
              </thead>
              <tbody>
                {richieste.map((r) => (
                  <tr key={r.request_id}>
                    <td style={{ fontWeight: 700, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.title}
                    </td>
                    <td>{r.client_name ?? "—"}</td>
                    <td>
                      <span className={`status ${STATUS_TONE[r.status] ?? "neutral"}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td>
                      {r.sales_status ? (
                        <span className={`status ${CLASSIFICATION_TONE[r.sales_status] ?? "neutral"}`}>
                          {CLASSIFICATION_LABEL[r.sales_status] ?? r.sales_status}
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>Non analizzata</span>
                      )}
                    </td>
                    <td>{r.email_count}</td>
                    <td style={{ color: "var(--muted)" }}>{dateFmt(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" style={{ overflow: "hidden" }}>
        <div className="panel-head">
          <h2>Candidati da smistare</h2>
          <span className="panel-meta">{candidati.length} conversazioni</span>
        </div>

        {candRes.error && <ErrorState />}
        {!candRes.error && candidati.length === 0 && (
          <EmptyState title="Niente da smistare" note="Tutti i candidati sono stati trasformati in richieste o scartati." />
        )}

        {candidati.map((c) => (
          <CandidateCard key={`${c.client_id}|${c.subj_norm}`} c={c} />
        ))}
      </section>

      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 14, lineHeight: 1.55, maxWidth: 660 }}>
        I candidati escono da un filtro che parte dalle email in arrivo non ancora agganciate, tiene solo
        quelle di mittenti riconosciuti come controparti commerciali senza offerte in Suite, e scarta le
        risposte automatiche e la posta amministrativa. Non sono ancora richieste: lo decidi tu, oppure
        l&apos;analisi AI quando la lanci sulla richiesta creata.
      </p>
    </PageShell>
  );
}
