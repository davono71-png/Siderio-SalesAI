import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";
import { SparkIcon, ChevronRightIcon } from "@/components/icons";
import {
  CLASSIFICATION_LABEL,
  CLASSIFICATION_TONE,
  currencyShortFmt,
  dateFmt,
  dateTimeFmt,
} from "@/lib/sales-ai/display";

export const dynamic = "force-dynamic";

type Kpis = {
  offers_open: number;
  offers_draft: number;
  offers_stale: number;
  offers_analyzed: number;
  open_actions: number;
  blocking_actions: number;
  overdue_actions: number;
  analyses_total: number;
};

type AttentionRow = {
  offer_id: string;
  offer_number: string;
  title: string | null;
  client_name: string | null;
  final_price_net: number | null;
  sent_at: string | null;
  days_since_sent: number | null;
  sales_status: string | null;
  analyzed_at: string | null;
  open_actions: number;
  blocking_actions: number;
  overdue_actions: number;
  next_due_date: string | null;
  reason: string;
};

type RecentAnalysis = {
  analysis_id: string;
  classification: string;
  confidence: number;
  created_at: string;
  offer_number: string;
  title: string | null;
};

type Dashboard = {
  kpis: Kpis;
  attention: AttentionRow[];
  recent_analyses: RecentAnalysis[];
  generated_at: string;
};

function rowTone(r: AttentionRow) {
  if (r.overdue_actions > 0) return "danger";
  if (r.blocking_actions > 0) return "warn";
  if (r.open_actions > 0) return "info";
  return "neutral";
}

export default async function OggiPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userLabel = (user?.user_metadata?.full_name as string | undefined) || user?.email || "Utente";

  const { data, error } = await supabase.schema("sales_ai").rpc("get_dashboard", { p_limit: 25 });
  const dash = data as Dashboard | null;

  const kpis = dash?.kpis;
  const attention = dash?.attention ?? [];
  const recent = dash?.recent_analyses ?? [];

  const today = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="app-shell">
      <Sidebar active="oggi" userLabel={userLabel} />

      <main className="main-content">
        <div className="hero">
          <div>
            <div className="eyebrow">Sales AI · Command Center</div>
            <h1>Buongiorno, {userLabel.split(" ")[0]}.</h1>
            <p className="subtitle">Cosa merita attenzione oggi sul portafoglio offerte.</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <div className="datebox">{today}</div>
            <form action="/ricerca" method="get" style={{ display: "flex", gap: 6 }}>
              <input
                name="q"
                placeholder="Vai a un'offerta, es. 6579"
                style={{
                  background: "#fff",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "9px 12px",
                  minWidth: 210,
                }}
              />
              <button type="submit" className="btn small dark">
                Apri
              </button>
            </form>
          </div>
        </div>

        {error && (
          <div className="panel" style={{ padding: 18, marginBottom: 20, color: "var(--danger)", fontSize: 13 }}>
            Non riesco a contattare Siderio Suite in questo momento. Riprova tra poco.
          </div>
        )}

        {kpis && (
          <div className="kpis">
            <div className="kpi">
              <div className="top">
                <span className="label">Offerte aperte</span>
                <span className="dot info" />
              </div>
              <div className="value">{kpis.offers_open}</div>
            </div>
            <div className="kpi">
              <div className="top">
                <span className="label">Ferme da 14+ giorni</span>
                <span className="dot warn" />
              </div>
              <div className="value">{kpis.offers_stale}</div>
            </div>
            <div className="kpi">
              <div className="top">
                <span className="label">Azioni aperte</span>
                <span className="dot danger" />
              </div>
              <div className="value">{kpis.open_actions}</div>
            </div>
            <div className="kpi">
              <div className="top">
                <span className="label">Analizzate dall&apos;AI</span>
                <span className="dot ok" />
              </div>
              <div className="value">{kpis.offers_analyzed}</div>
            </div>
          </div>
        )}

        <div className="grid-2col">
          <section className="panel" style={{ overflow: "hidden" }}>
            <div className="panel-head">
              <h2>Da guardare oggi</h2>
              <span className="panel-meta">{attention.length} opportunità</span>
            </div>

            {attention.length === 0 && (
              <div style={{ padding: 20, fontSize: 13, color: "var(--muted)" }}>
                Nessuna offerta richiede attenzione con i criteri attuali.
              </div>
            )}

            {attention.map((r) => (
              <Link
                key={r.offer_id}
                href={`/offerte/${encodeURIComponent(r.offer_number)}`}
                className="offer-card"
                style={{ color: "var(--text)" }}
              >
                <div>
                  <div className="offer-top">
                    <span className={`status ${rowTone(r)}`}>{r.reason}</span>
                    {r.sales_status && (
                      <span className={`status ${CLASSIFICATION_TONE[r.sales_status] ?? "neutral"}`}>
                        {CLASSIFICATION_LABEL[r.sales_status] ?? r.sales_status}
                      </span>
                    )}
                    <span className="tag">#{r.offer_number}</span>
                  </div>
                  <h3>{r.client_name ?? "Cliente non specificato"}</h3>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>{r.title ?? "Senza oggetto"}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                    Inviata il {dateFmt(r.sent_at)}
                    {r.days_since_sent !== null ? ` · ${r.days_since_sent} giorni fa` : ""}
                    {r.next_due_date ? ` · prossima scadenza ${dateFmt(r.next_due_date)}` : ""}
                  </div>
                </div>
                <div className="offer-side">
                  <span style={{ fontWeight: 900, fontSize: 15 }}>{currencyShortFmt(r.final_price_net)}</span>
                  <ChevronRightIcon size={16} color="var(--muted)" />
                </div>
              </Link>
            ))}
          </section>

          <div className="side-stack">
            <section className="panel">
              <div className="panel-head">
                <h2>Briefing Sales AI</h2>
                <span className="panel-meta">{dash ? dateTimeFmt(dash.generated_at) : "—"}</span>
              </div>
              <div className="summary">
                <div className="ai-title">
                  <span className="spark">
                    <SparkIcon size={15} />
                  </span>
                  Sintesi
                </div>
                {kpis && kpis.analyses_total === 0 ? (
                  <>
                    <p>
                      L&apos;AI non ha ancora analizzato nessuna opportunità. Apri un&apos;offerta e usa
                      &laquo;Analizza con AI&raquo; per generare la prima valutazione.
                    </p>
                    <div className="brief">
                      <strong>Intanto:</strong> {kpis.offers_stale} offerte inviate sono ferme da almeno 14 giorni.
                    </div>
                  </>
                ) : (
                  kpis && (
                    <>
                      <p>
                        {kpis.offers_analyzed} opportunità su {kpis.offers_open} aperte hanno una valutazione AI.
                        {kpis.blocking_actions > 0
                          ? ` ${kpis.blocking_actions} azioni bloccanti sono ancora aperte.`
                          : " Nessuna azione bloccante aperta."}
                      </p>
                      <div className="brief">
                        <strong>Focus:</strong>{" "}
                        {kpis.overdue_actions > 0
                          ? `${kpis.overdue_actions} azioni sono già scadute.`
                          : `${kpis.offers_stale} offerte ferme da 14+ giorni da rivedere.`}
                      </div>
                    </>
                  )
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>Ultime valutazioni</h2>
                <span className="panel-meta">{kpis?.analyses_total ?? 0} totali</span>
              </div>
              <div className="summary">
                {recent.length === 0 && (
                  <p style={{ margin: 0 }}>Nessuna valutazione registrata finora.</p>
                )}
                {recent.map((a) => (
                  <Link
                    key={a.analysis_id}
                    href={`/offerte/${encodeURIComponent(a.offer_number)}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "10px 0",
                      borderTop: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>#{a.offer_number}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{dateTimeFmt(a.created_at)}</div>
                    </div>
                    <span className={`status ${CLASSIFICATION_TONE[a.classification] ?? "neutral"}`}>
                      {CLASSIFICATION_LABEL[a.classification] ?? a.classification}
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>Portafoglio</h2>
                <span className="panel-meta">Suite</span>
              </div>
              <div className="summary">
                <div className="cards-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <div className="card">
                    <div className="eyebrow">Bozze</div>
                    <div className="big">{kpis?.offers_draft ?? 0}</div>
                    <p>Non ancora inviate</p>
                  </div>
                  <div className="card">
                    <div className="eyebrow">Azioni scadute</div>
                    <div className="big">{kpis?.overdue_actions ?? 0}</div>
                    <p>Segnalate dall&apos;AI</p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
