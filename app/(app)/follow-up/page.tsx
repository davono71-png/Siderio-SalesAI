import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageShell, EmptyState, ErrorState, getUserLabel } from "@/components/PageShell";
import { CLASSIFICATION_LABEL, CLASSIFICATION_TONE, currencyShortFmt, dateFmt } from "@/lib/sales-ai/display";

export const dynamic = "force-dynamic";

type Row = {
  offer_id: string;
  offer_number: string;
  title: string | null;
  final_price_net: number | null;
  sent_at: string;
  client_name: string | null;
  agente: string | null;
  days_since_sent: number;
  sales_status: string | null;
  open_actions: number;
};

const FILTERS = [
  { key: "tutte", label: "Tutte", days: 0 },
  { key: "14", label: "14+ giorni", days: 14 },
  { key: "30", label: "30+ giorni", days: 30 },
  { key: "90", label: "90+ giorni", days: 90 },
];

function ageTone(days: number) {
  if (days >= 90) return "danger";
  if (days >= 30) return "warn";
  if (days >= 14) return "info";
  return "ok";
}

export default async function FollowUpPage({
  searchParams,
}: {
  searchParams: Promise<{ da?: string }>;
}) {
  const { da } = await searchParams;
  const active = FILTERS.find((f) => f.key === da) ?? FILTERS[0];

  const userLabel = await getUserLabel();
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("sales_ai")
    .rpc("get_followups", { p_limit: 100, p_min_days: active.days });

  const rows = (data ?? []) as Row[];
  const totale = rows.reduce((s, r) => s + (r.final_price_net ?? 0), 0);

  return (
    <PageShell
      active="followup"
      userLabel={userLabel}
      eyebrow="Sales AI · Commerciale"
      title="Follow-up"
      subtitle="Offerte inviate e non ancora chiuse, dalla più vecchia."
      aside={<div className="datebox">{currencyShortFmt(totale)} in gioco</div>}
    >
      <div className="toolbar">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "tutte" ? "/follow-up" : `/follow-up?da=${f.key}`}
            className={`btn small${f.key === active.key ? " dark" : ""}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <section className="panel" style={{ overflow: "hidden" }}>
        <div className="panel-head">
          <h2>Offerte da richiamare</h2>
          <span className="panel-meta">{rows.length} offerte</span>
        </div>

        {error && <ErrorState />}

        {!error && rows.length === 0 && (
          <EmptyState title="Nessuna offerta in questo intervallo" note="Prova ad allargare il filtro." />
        )}

        {rows.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Offerta</th>
                  <th>Cliente</th>
                  <th>Oggetto</th>
                  <th>Inviata</th>
                  <th>Ferma da</th>
                  <th>Sales AI</th>
                  <th>Azioni</th>
                  <th>Agente</th>
                  <th>Importo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.offer_id}>
                    <td>
                      <Link href={`/offerte/${encodeURIComponent(r.offer_number)}`} style={{ fontWeight: 800 }}>
                        #{r.offer_number}
                      </Link>
                    </td>
                    <td>{r.client_name ?? "—"}</td>
                    <td style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.title ?? "Senza oggetto"}
                    </td>
                    <td style={{ color: "var(--muted)" }}>{dateFmt(r.sent_at)}</td>
                    <td>
                      <span className={`status ${ageTone(r.days_since_sent)}`}>{r.days_since_sent} gg</span>
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
                    <td>
                      {r.open_actions > 0 ? (
                        <span className="status warn">{r.open_actions}</span>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                    <td style={{ color: "var(--muted)" }}>{r.agente ?? "—"}</td>
                    <td style={{ fontWeight: 800 }}>{currencyShortFmt(r.final_price_net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  );
}
