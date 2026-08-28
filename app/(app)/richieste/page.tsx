import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageShell, EmptyState, ErrorState, getUserLabel } from "@/components/PageShell";
import { NuovaRichiesta } from "./NuovaRichiesta";
import { currencyShortFmt, dateFmt, SUGGESTED_ACTION_LABEL, WAITING_FOR_LABEL } from "@/lib/sales-ai/display";

export const dynamic = "force-dynamic";

type Riga = {
  request_id: string;
  title: string;
  status: string;
  channel: string;
  agency_source: string | null;
  created_at: string;
  converted_offer_id: string | null;
  offer_number: string | null;
  estimate_min: number | null;
  estimate_max: number | null;
  installation_location: string | null;
  client_name: string | null;
  email_count: number;
  event_count: number;
  sales_status: string | null;
  confidence: number | null;
  reason: string | null;
  completeness: number | null;
  sufficient: boolean | null;
  critical_missing: string[] | null;
  followup_owner: string | null;
  waiting_for: string | null;
  suggested_action: string | null;
  timing: string | null;
  budget_status: string | null;
  customer_budget: string | null;
  open_actions: number;
  job_in_corso: boolean;
};

const STATO = {
  NEW: { l: "Nuova", t: "info" },
  TO_QUALIFY: { l: "Da qualificare", t: "warn" },
  WAITING_INFORMATION: { l: "In attesa informazioni", t: "warn" },
  TO_EVALUATE: { l: "Da preventivare", t: "ok" },
  CONVERTED_TO_OFFER: { l: "Convertita in offerta", t: "ok" },
  ARCHIVED: { l: "Archiviata", t: "neutral" },
} as const;

const CANALE: Record<string, string> = { DIRECT: "Diretto", AGENCY: "Agenzia", UNKNOWN: "Canale da definire" };

const BUDGET: Record<string, string> = {
  KNOWN: "noto",
  NOT_MENTIONED: "non menzionato",
  CUSTOMER_DOES_NOT_KNOW: "il cliente non lo sa",
};

function Barra({ valore }: { valore: number }) {
  const tono = valore >= 80 ? "ok" : valore >= 55 ? "warn" : "danger";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div style={{ flex: 1, height: 7, background: "#f0f0ec", borderRadius: 999, overflow: "hidden", maxWidth: 190 }}>
        <div style={{ width: `${Math.max(3, valore)}%`, height: "100%", background: `var(--${tono})` }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 800, color: `var(--${tono})` }}>{valore}%</span>
    </div>
  );
}

export default async function RichiestePage() {
  const userLabel = await getUserLabel();
  const supabase = await createClient();

  const { data, error } = await supabase.schema("sales_ai").rpc("get_requests", { p_limit: 60 });
  const righe = (data ?? []) as Riga[];

  return (
    <PageShell
      active="richieste"
      userLabel={userLabel}
      eyebrow="Pre-offerta"
      title="Richieste commerciali"
      subtitle="Gestite interamente in Sales AI fino alla decisione di creare un'offerta."
      aside={<NuovaRichiesta />}
    >
      {error && (
        <section className="panel">
          <ErrorState />
        </section>
      )}

      {!error && righe.length === 0 && (
        <section className="panel">
          <EmptyState
            title="Nessuna richiesta aperta"
            note="Le richieste nascono dalla Inbox commerciale, oppure con «Nuova richiesta» quando arrivano per telefono, in fiera o di persona."
          />
        </section>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {righe.map((r) => {
          const stato = STATO[r.status as keyof typeof STATO] ?? { l: r.status, t: "neutral" };
          const completezza = typeof r.completeness === "number" ? r.completeness : null;
          const pronta = r.sufficient === true;
          const mancanti = Array.isArray(r.critical_missing) ? r.critical_missing : [];

          return (
            <section key={r.request_id} className="panel" style={{ padding: 20 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                <span className={`status ${stato.t}`}>{stato.l}</span>
                <span className="tag">{CANALE[r.channel] ?? r.channel}</span>
                {r.agency_source && <span className="tag purple">{r.agency_source}</span>}
                {r.job_in_corso && <span className="status info">Analisi in corso…</span>}
                {r.offer_number && <span className="status ok">Offerta #{r.offer_number}</span>}
              </div>

              <h2 style={{ fontSize: 18, margin: "0 0 3px" }}>
                {r.client_name ? `${r.client_name} · ` : ""}
                {r.title}
              </h2>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Aperta il {dateFmt(r.created_at)} · {r.email_count} email · {r.event_count}{" "}
                {r.event_count === 1 ? "evento" : "eventi"}
                {r.open_actions > 0 ? ` · ${r.open_actions} azioni aperte` : ""}
              </div>

              {r.reason && <div className="ai-reason">{r.reason}</div>}

              {!r.sales_status && !r.job_in_corso && (
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 10 }}>
                  Non ancora analizzata. Aprila per lanciare la valutazione.
                </div>
              )}

              {completezza !== null && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                    {pronta ? "Richiesta sufficientemente completa" : "Mancano informazioni necessarie"}
                  </div>
                  <Barra valore={completezza} />
                </div>
              )}

              {mancanti.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="eyebrow" style={{ marginBottom: 4 }}>
                    Mancano
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#444", lineHeight: 1.6 }}>
                    {mancanti.slice(0, 4).map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="detail-grid" style={{ marginTop: 14 }}>
                <div className="detail">
                  <label>Chi deve agire</label>
                  <div>{WAITING_FOR_LABEL[r.waiting_for ?? ""] ?? "—"}</div>
                </div>
                <div className="detail">
                  <label>Azione consigliata</label>
                  <div>{SUGGESTED_ACTION_LABEL[r.suggested_action ?? ""] ?? "—"}</div>
                </div>
                <div className="detail">
                  <label>Budget cliente</label>
                  <div>{r.customer_budget || BUDGET[r.budget_status ?? ""] || "—"}</div>
                </div>
                <div className="detail">
                  <label>Stima Siderio</label>
                  <div>
                    {r.estimate_min || r.estimate_max
                      ? `${currencyShortFmt(r.estimate_min)} – ${currencyShortFmt(r.estimate_max)}`
                      : "—"}
                  </div>
                </div>
                <div className="detail">
                  <label>Tempistiche</label>
                  <div>{r.timing || "—"}</div>
                </div>
                <div className="detail">
                  <label>Luogo</label>
                  <div>{r.installation_location || "—"}</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                <Link href={`/richieste/${r.request_id}`} className={`btn${pronta ? " ai" : " dark"}`}>
                  {pronta ? "Apri e crea offerta" : "Apri richiesta"}
                </Link>
              </div>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
