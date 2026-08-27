import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageShell, EmptyState, ErrorState, getUserLabel } from "@/components/PageShell";
import { SearchIcon } from "@/components/icons";
import { currencyShortFmt, dateFmt } from "@/lib/sales-ai/display";

export const dynamic = "force-dynamic";

type Row = {
  client_id: string;
  client_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  province: string | null;
  offers_total: number;
  offers_open: number;
  offers_won: number;
  value_open: number;
  value_won: number;
  last_activity: string | null;
};

export default async function ClientiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const userLabel = await getUserLabel();
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("sales_ai")
    .rpc("get_clients", { p_query: q ?? null, p_limit: 60 });

  const rows = (data ?? []) as Row[];

  return (
    <PageShell
      active="clienti"
      userLabel={userLabel}
      eyebrow="Sales AI · Commerciale"
      title="Clienti"
      subtitle="Chi ha offerte in Suite, con il portafoglio aperto e quello vinto."
    >
      <form method="get" className="toolbar">
        <div className="grow" style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <span style={{ position: "absolute", left: 13, color: "var(--muted)", display: "flex" }}>
            <SearchIcon size={16} />
          </span>
          <input name="q" defaultValue={q ?? ""} placeholder="Nome cliente o email" style={{ width: "100%", paddingLeft: 38 }} />
        </div>
        <button type="submit" className="btn dark">
          Cerca
        </button>
        {q && (
          <Link href="/clienti" className="btn">
            Azzera
          </Link>
        )}
      </form>

      <section className="panel" style={{ overflow: "hidden" }}>
        <div className="panel-head">
          <h2>{q ? `Risultati per "${q}"` : "Clienti per ultima attività"}</h2>
          <span className="panel-meta">{rows.length} clienti</span>
        </div>

        {error && <ErrorState />}
        {!error && rows.length === 0 && (
          <EmptyState title="Nessun cliente trovato" note="Prova con un'altra ricerca." />
        )}

        {rows.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Città</th>
                  <th>Offerte</th>
                  <th>Aperte</th>
                  <th>Vinte</th>
                  <th>Valore aperto</th>
                  <th>Valore vinto</th>
                  <th>Ultima attività</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.client_id}>
                    <td>
                      <div style={{ fontWeight: 800 }}>{r.client_name ?? "—"}</div>
                      {r.email && <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.email}</div>}
                    </td>
                    <td style={{ color: "var(--muted)" }}>
                      {r.city ?? "—"}
                      {r.province ? ` (${r.province})` : ""}
                    </td>
                    <td>{r.offers_total}</td>
                    <td>{r.offers_open > 0 ? <span className="status info">{r.offers_open}</span> : "—"}</td>
                    <td>{r.offers_won > 0 ? <span className="status ok">{r.offers_won}</span> : "—"}</td>
                    <td style={{ fontWeight: 800 }}>{currencyShortFmt(r.value_open)}</td>
                    <td style={{ color: "var(--muted)" }}>{currencyShortFmt(r.value_won)}</td>
                    <td style={{ color: "var(--muted)" }}>{dateFmt(r.last_activity)}</td>
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
