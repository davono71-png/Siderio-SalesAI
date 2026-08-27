import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageShell, EmptyState, ErrorState, getUserLabel } from "@/components/PageShell";
import { CLASSIFICATION_LABEL, CLASSIFICATION_TONE, currencyShortFmt } from "@/lib/sales-ai/display";

export const dynamic = "force-dynamic";

const SUITE_STATUS_LABEL: Record<string, string> = {
  draft: "Bozza",
  sent: "Inviata",
  accepted: "Accettata",
};

type Pipeline = {
  by_status: Array<{ status: string; offers: number; value_net: number }>;
  by_classification: Array<{ classification: string; offers: number; value_net: number }>;
  by_age: Array<{ bucket: string; offers: number; value_net: number }>;
  top_open: Array<{
    offer_id: string;
    offer_number: string;
    title: string | null;
    final_price_net: number | null;
    client_name: string | null;
    days_since_sent: number | null;
  }>;
};

function Bar({ value, max, tone }: { value: number; max: number; tone: string }) {
  const pct = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ height: 8, background: "#f0f0ec", borderRadius: 999, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: `var(--${tone})` }} />
    </div>
  );
}

export default async function PipelinePage() {
  const userLabel = await getUserLabel();
  const supabase = await createClient();

  const { data, error } = await supabase.schema("sales_ai").rpc("get_pipeline");
  const p = data as Pipeline | null;

  const maxAge = Math.max(1, ...(p?.by_age ?? []).map((a) => a.value_net));
  const totale = (p?.by_status ?? []).reduce((s, r) => s + r.value_net, 0);

  return (
    <PageShell
      active="pipeline"
      userLabel={userLabel}
      eyebrow="Sales AI · Commerciale"
      title="Pipeline"
      subtitle="Dove sta il valore, e da quanto tempo è fermo lì."
      aside={<div className="datebox">{currencyShortFmt(totale)} a portafoglio</div>}
    >
      {error && (
        <section className="panel">
          <ErrorState />
        </section>
      )}

      {p && (
        <>
          <div className="kpis" style={{ gridTemplateColumns: `repeat(${Math.max(1, p.by_status.length)}, minmax(150px, 1fr))` }}>
            {p.by_status.map((s) => (
              <div className="kpi" key={s.status}>
                <div className="top">
                  <span className="label">{SUITE_STATUS_LABEL[s.status] ?? s.status}</span>
                  <span className={`dot ${s.status === "accepted" ? "ok" : s.status === "sent" ? "info" : "warn"}`} />
                </div>
                <div className="value">{currencyShortFmt(s.value_net)}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{s.offers} offerte</div>
              </div>
            ))}
          </div>

          <div className="grid-2col">
            <section className="panel" style={{ overflow: "hidden" }}>
              <div className="panel-head">
                <h2>Offerte aperte più grosse</h2>
                <span className="panel-meta">valore netto</span>
              </div>
              {p.top_open.length === 0 && <EmptyState title="Nessuna offerta aperta" note="Il portafoglio è vuoto." />}
              {p.top_open.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Offerta</th>
                        <th>Cliente</th>
                        <th>Oggetto</th>
                        <th>Ferma da</th>
                        <th>Importo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.top_open.map((o) => (
                        <tr key={o.offer_id}>
                          <td>
                            <Link href={`/offerte/${encodeURIComponent(o.offer_number)}`} style={{ fontWeight: 800 }}>
                              #{o.offer_number}
                            </Link>
                          </td>
                          <td>{o.client_name ?? "—"}</td>
                          <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {o.title ?? "Senza oggetto"}
                          </td>
                          <td style={{ color: "var(--muted)" }}>
                            {o.days_since_sent !== null ? `${o.days_since_sent} gg` : "—"}
                          </td>
                          <td style={{ fontWeight: 800 }}>{currencyShortFmt(o.final_price_net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="side-stack">
              <section className="panel">
                <div className="panel-head">
                  <h2>Anzianità delle offerte aperte</h2>
                </div>
                <div className="summary" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {p.by_age.length === 0 && <p style={{ margin: 0 }}>Nessuna offerta inviata.</p>}
                  {p.by_age.map((a, i) => (
                    <div key={a.bucket} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ fontWeight: 700 }}>{a.bucket}</span>
                        <span style={{ color: "var(--muted)" }}>
                          {a.offers} · {currencyShortFmt(a.value_net)}
                        </span>
                      </div>
                      <Bar value={a.value_net} max={maxAge} tone={["ok", "info", "info", "warn", "danger"][i] ?? "info"} />
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <h2>Ripartizione Sales AI</h2>
                </div>
                <div className="summary">
                  {p.by_classification.length === 0 ? (
                    <p style={{ margin: 0 }}>
                      Nessuna offerta ancora analizzata: questa ripartizione si popola man mano che lanci le analisi.
                    </p>
                  ) : (
                    p.by_classification.map((c) => (
                      <div
                        key={c.classification}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 0",
                          borderTop: "1px solid var(--border)",
                        }}
                      >
                        <span className={`status ${CLASSIFICATION_TONE[c.classification] ?? "neutral"}`}>
                          {CLASSIFICATION_LABEL[c.classification] ?? c.classification}
                        </span>
                        <span style={{ fontSize: 13, color: "var(--muted)" }}>
                          {c.offers} · {currencyShortFmt(c.value_net)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
