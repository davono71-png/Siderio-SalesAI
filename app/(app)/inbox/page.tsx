import { createClient } from "@/lib/supabase/server";
import { PageShell, EmptyState, ErrorState, getUserLabel } from "@/components/PageShell";
import { MailInIcon } from "@/components/icons";
import { dateTimeFmt } from "@/lib/sales-ai/display";

export const dynamic = "force-dynamic";

type Row = {
  email_id: string;
  da: string | null;
  oggetto: string | null;
  anteprima: string | null;
  created_at: string;
  letto: boolean;
  folder: string | null;
  account_address: string | null;
  offerta_id: string | null;
  commessa_id: number | null;
  allegati: number;
  client_name: string | null;
};

export default async function InboxPage() {
  const userLabel = await getUserLabel();
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("sales_ai")
    .rpc("get_inbox", { p_limit: 60, p_only_unlinked: true });

  const rows = (data ?? []) as Row[];

  return (
    <PageShell
      active="inbox"
      userLabel={userLabel}
      eyebrow="Sales AI · Ingresso"
      title="Inbox commerciale"
      subtitle="Email in arrivo non ancora collegate a un'offerta o a una commessa."
    >
      <section className="panel" style={{ overflow: "hidden" }}>
        <div className="panel-head">
          <h2>Da smistare</h2>
          <span className="panel-meta">ultime {rows.length}</span>
        </div>

        {error && <ErrorState />}
        {!error && rows.length === 0 && (
          <EmptyState title="Niente da smistare" note="Tutte le email in arrivo risultano già collegate." />
        )}

        {rows.map((e) => (
          <div key={e.email_id} className="offer-card">
            <div style={{ minWidth: 0 }}>
              <div className="offer-top">
                <span style={{ color: "var(--accent)", display: "flex" }}>
                  <MailInIcon size={14} />
                </span>
                {e.client_name && <span className="tag purple">{e.client_name}</span>}
                {!e.letto && <span className="status info">Non letta</span>}
                {e.allegati > 0 && <span className="tag">{e.allegati} allegati</span>}
                {e.account_address && <span className="tag">{e.account_address}</span>}
              </div>
              <h3 style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{e.oggetto ?? "(senza oggetto)"}</h3>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{e.da ?? "—"}</div>
              {e.anteprima && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    marginTop: 7,
                    lineHeight: 1.45,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {e.anteprima}
                </div>
              )}
            </div>
            <div className="offer-side">
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{dateTimeFmt(e.created_at)}</span>
            </div>
          </div>
        ))}
      </section>

      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 14, lineHeight: 1.5, maxWidth: 640 }}>
        Da questa lista nasceranno le «Richieste»: quando la pipeline pre-offerta sarà attiva, l&apos;AI
        riconoscerà da sola quali di queste email sono richieste commerciali e le qualificherà. Per ora è una
        vista di sola lettura sulle email di Suite.
      </p>
    </PageShell>
  );
}
