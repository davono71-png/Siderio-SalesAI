import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";
import { SearchIcon } from "@/components/icons";
import {
  CLASSIFICATION_LABEL,
  CLASSIFICATION_TONE,
  currencyShortFmt,
  dateFmt,
} from "@/lib/sales-ai/display";

export const dynamic = "force-dynamic";

const SUITE_STATUS_LABEL: Record<string, string> = {
  draft: "Bozza",
  sent: "Inviata",
  accepted: "Accettata",
};

type OfferRow = {
  offer_id: string;
  offer_number: string;
  title: string | null;
  status: string;
  final_price_net: number | null;
  client_name: string | null;
  updated_at: string | null;
  sales_status: string | null;
  sales_open_actions: number;
};

export default async function OffertePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userLabel = (user?.user_metadata?.full_name as string | undefined) || user?.email || "Utente";

  const { data, error } = await supabase
    .schema("sales_ai")
    .rpc("search_offers", { p_query: q ?? null, p_limit: 40 });

  const offers = (data ?? []) as OfferRow[];

  return (
    <div className="app-shell">
      <Sidebar active="offerte" userLabel={userLabel} />

      <main className="main-content">
        <div className="hero">
          <div>
            <div className="eyebrow">Sales AI · Commerciale</div>
            <h1>Offerte</h1>
            <p className="subtitle">Portafoglio Siderio Suite con lo stato Sales AI accanto.</p>
          </div>
        </div>

        <form method="get" className="toolbar">
          <div className="grow" style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: 13, color: "var(--muted)", display: "flex" }}>
              <SearchIcon size={16} />
            </span>
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Numero offerta o cliente, es. 6735"
              style={{ width: "100%", paddingLeft: 38 }}
            />
          </div>
          <button type="submit" className="btn dark">
            Cerca
          </button>
          {q && (
            <Link href="/ricerca" className="btn">
              Azzera
            </Link>
          )}
        </form>

        <section className="panel" style={{ overflow: "hidden" }}>
          <div className="panel-head">
            <h2>{q ? `Risultati per "${q}"` : "Offerte recenti"}</h2>
            <span className="panel-meta">{offers.length} offerte · per ultimo aggiornamento</span>
          </div>

          {error && (
            <div style={{ padding: 20, fontSize: 13, color: "var(--danger)" }}>
              Non riesco a contattare Siderio Suite in questo momento. Riprova tra poco.
            </div>
          )}

          {!error && offers.length === 0 && (
            <div style={{ padding: 20, fontSize: 13, color: "var(--muted)" }}>Nessuna offerta trovata.</div>
          )}

          {offers.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Offerta</th>
                    <th>Cliente</th>
                    <th>Oggetto</th>
                    <th>Stato Suite</th>
                    <th>Sales AI</th>
                    <th>Azioni aperte</th>
                    <th>Importo</th>
                    <th>Aggiornata</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((o) => (
                    <tr key={o.offer_id}>
                      <td>
                        <Link href={`/offerte/${encodeURIComponent(o.offer_number)}`} style={{ fontWeight: 800 }}>
                          #{o.offer_number}
                        </Link>
                      </td>
                      <td>{o.client_name ?? "—"}</td>
                      <td
                        style={{
                          maxWidth: 260,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {o.title ?? "Senza oggetto"}
                      </td>
                      <td>
                        <span className="tag">{SUITE_STATUS_LABEL[o.status] ?? o.status}</span>
                      </td>
                      <td>
                        {o.sales_status ? (
                          <span className={`status ${CLASSIFICATION_TONE[o.sales_status] ?? "neutral"}`}>
                            {CLASSIFICATION_LABEL[o.sales_status] ?? o.sales_status}
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>Non analizzata</span>
                        )}
                      </td>
                      <td>
                        {o.sales_open_actions > 0 ? (
                          <span className="status warn">{o.sales_open_actions}</span>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>—</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 800 }}>{currencyShortFmt(o.final_price_net)}</td>
                      <td style={{ color: "var(--muted)" }}>{dateFmt(o.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
