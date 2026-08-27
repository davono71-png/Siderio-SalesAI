import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageShell, EmptyState, ErrorState, getUserLabel } from "@/components/PageShell";
import { CLASSIFICATION_LABEL, CLASSIFICATION_TONE, dateTimeFmt } from "@/lib/sales-ai/display";

export const dynamic = "force-dynamic";

type Row = {
  analysis_id: string;
  classification: string;
  confidence: number;
  model: string;
  prompt_version: string;
  created_at: string;
  reason: string | null;
  offer_id: string;
  offer_number: string;
  title: string | null;
  client_name: string | null;
  feedback: string | null;
};

const FEEDBACK_LABEL: Record<string, string> = {
  CORRECT: "Corretta",
  PARTIAL: "Parziale",
  WRONG: "Sbagliata",
  CRITICAL: "Grave",
};

const FEEDBACK_TONE: Record<string, string> = {
  CORRECT: "ok",
  PARTIAL: "warn",
  WRONG: "danger",
  CRITICAL: "danger",
};

export default async function StoricoPage() {
  const userLabel = await getUserLabel();
  const supabase = await createClient();

  const { data, error } = await supabase.schema("sales_ai").rpc("get_analysis_history", { p_limit: 100 });
  const rows = (data ?? []) as Row[];

  const conFeedback = rows.filter((r) => r.feedback).length;
  const corrette = rows.filter((r) => r.feedback === "CORRECT").length;

  return (
    <PageShell
      active="storico"
      userLabel={userLabel}
      eyebrow="Sales AI · Sistema"
      title="Storico AI"
      subtitle="Ogni valutazione prodotta dal motore, con il giudizio umano ricevuto."
      aside={
        <div className="datebox">
          {conFeedback > 0
            ? `${corrette}/${conFeedback} giudicate corrette`
            : "Nessun feedback ancora registrato"}
        </div>
      }
    >
      <section className="panel" style={{ overflow: "hidden" }}>
        <div className="panel-head">
          <h2>Valutazioni</h2>
          <span className="panel-meta">{rows.length} in elenco</span>
        </div>

        {error && <ErrorState />}
        {!error && rows.length === 0 && (
          <EmptyState
            title="Nessuna valutazione registrata"
            note="Apri un'offerta e premi «Analizza con AI»: da lì in poi ogni valutazione finisce qui, insieme al feedback che dai."
          />
        )}

        {rows.map((r) => (
          <Link
            key={r.analysis_id}
            href={`/offerte/${encodeURIComponent(r.offer_number)}`}
            className="offer-card"
            style={{ color: "var(--text)" }}
          >
            <div>
              <div className="offer-top">
                <span className={`status ${CLASSIFICATION_TONE[r.classification] ?? "neutral"}`}>
                  {CLASSIFICATION_LABEL[r.classification] ?? r.classification}
                </span>
                <span className="tag">#{r.offer_number}</span>
                <span className="tag">{Math.round((r.confidence ?? 0) * 100)}% confidenza</span>
                {r.feedback && (
                  <span className={`status ${FEEDBACK_TONE[r.feedback] ?? "neutral"}`}>
                    Feedback: {FEEDBACK_LABEL[r.feedback] ?? r.feedback}
                  </span>
                )}
              </div>
              <h3>{r.client_name ?? "Cliente non specificato"}</h3>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{r.title ?? "Senza oggetto"}</div>
              {r.reason && <div className="ai-reason">{r.reason}</div>}
            </div>
            <div className="offer-side">
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{dateTimeFmt(r.created_at)}</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                {r.model} · prompt {r.prompt_version}
              </span>
            </div>
          </Link>
        ))}
      </section>
    </PageShell>
  );
}
