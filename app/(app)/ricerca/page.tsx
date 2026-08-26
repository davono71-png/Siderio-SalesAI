import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";
import { SearchIcon, RefreshIcon, ChevronRightIcon } from "@/components/icons";

const STATUS_LABEL: Record<string, string> = {
  nessuna_azione: "Nessuna azione",
  da_monitorare: "Da monitorare",
  followup_consigliato: "Follow-up consigliato",
  attenzione: "Attenzione",
  attesa_programmata: "Attesa programmata",
};

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  nessuna_azione: { bg: "var(--ok-soft)", fg: "var(--ok)" },
  da_monitorare: { bg: "var(--info-soft)", fg: "var(--info)" },
  followup_consigliato: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  attenzione: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  attesa_programmata: { bg: "var(--accent-soft)", fg: "var(--accent)" },
};

type RecentOffer = {
  offer_id: string;
  offer_number: string;
  title: string | null;
  status: string;
  final_price_net: number;
  client_name: string | null;
  sales_status: string | null;
};

export default async function RicercaPage({
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
    .rpc("search_offers", { p_query: q ?? null, p_limit: 8 });

  const offers = (data ?? []) as RecentOffer[];

  return (
    <div style={{ display: "flex", fontFamily: "inherit" }}>
      <Sidebar active="cerca" userLabel={userLabel} />

      <main style={{ flex: 1, padding: "26px 32px 50px", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <a
            href="/ricerca"
            style={{
              border: "1px solid var(--border)",
              background: "#fff",
              borderRadius: 10,
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text)",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <RefreshIcon size={14} />
            Aggiorna
          </a>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 20,
            marginBottom: 28,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.12em",
                color: "var(--muted)",
                textTransform: "uppercase",
              }}
            >
              Sales AI · Ricerca offerta
            </div>
            <h1 style={{ fontSize: 30, letterSpacing: "-0.02em", margin: "8px 0 5px", fontWeight: 800 }}>
              Buongiorno, {userLabel.split(" ")[0]}.
            </h1>
            <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>
              Cerca un numero offerta per vederne lo stato completo.
            </p>
          </div>
        </div>

        <form method="get" style={{ display: "flex", gap: 10, marginBottom: 36 }}>
          <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: 15, color: "var(--muted)", display: "flex" }}>
              <SearchIcon size={18} />
            </span>
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Numero offerta, es. 6735"
              style={{
                width: "100%",
                height: 50,
                padding: "0 16px 0 44px",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 15,
                color: "var(--text)",
                background: "#fff",
                outline: "none",
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              height: 50,
              padding: "0 26px",
              border: "none",
              borderRadius: 12,
              background: "var(--dark)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cerca
          </button>
        </form>

        <section className="panel" style={{ overflow: "hidden", maxWidth: 900 }}>
          <div style={{ padding: "17px 20px", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: 15, margin: 0, fontWeight: 800 }}>
              {q ? `Risultati per "${q}"` : "Offerte recenti"}
            </h2>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {q ? "Ordinati per ultimo aggiornamento" : "Ultime aggiornate — non è una lista prioritizzata"}
            </div>
          </div>

          {error && (
            <div style={{ padding: 20, fontSize: 13, color: "var(--danger)" }}>
              Non riesco a contattare Siderio Suite in questo momento. Riprova tra poco.
            </div>
          )}

          {!error && offers.length === 0 && (
            <div style={{ padding: 20, fontSize: 13, color: "var(--muted)" }}>
              Nessuna offerta trovata.
            </div>
          )}

          {offers.map((o, i) => {
            const statusKey = o.sales_status ?? "nessuna_azione";
            const color = STATUS_COLOR[statusKey] ?? STATUS_COLOR.nessuna_azione;
            return (
              <a
                key={o.offer_id}
                href={`/offerte/${encodeURIComponent(o.offer_number)}`}
                style={{
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: i < offers.length - 1 ? "1px solid var(--border)" : "none",
                  color: "var(--text)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: "0.03em",
                      textTransform: "uppercase",
                      padding: "5px 9px",
                      borderRadius: 999,
                      background: color.bg,
                      color: color.fg,
                    }}
                  >
                    {STATUS_LABEL[statusKey]}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{o.client_name ?? "Cliente non specificato"}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      #{o.offer_number} · {o.title ?? "Senza oggetto"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>
                    {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
                      o.final_price_net ?? 0
                    )}
                  </span>
                  <ChevronRightIcon size={16} color="var(--muted)" />
                </div>
              </a>
            );
          })}
        </section>
      </main>
    </div>
  );
}
