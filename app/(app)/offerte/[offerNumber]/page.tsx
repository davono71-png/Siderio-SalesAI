import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";
import { AiPanel, type AiState } from "./AiPanel";
import { currencyFmt, dateFmt } from "@/lib/sales-ai/display";
import {
  ArrowLeftIcon,
  BuildingIcon,
  NoteIcon,
  MailIcon,
  MailInIcon,
  MailOutIcon,
  ClockIcon,
} from "@/components/icons";

export const dynamic = "force-dynamic";

type OfferContext = {
  offer_id: string;
  offer_number: string;
  status: string;
  title: string | null;
  work_description: string | null;
  final_price_net: number;
  final_price_vat: number;
  agente: string | null;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  internal_notes: string | null;
  followup_notes: string | null;
  client: {
    display_name: string | null;
    company_name: string | null;
    contact_person: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  emails: Array<{
    id: string;
    da: string | null;
    destinatari: string[] | null;
    oggetto: string | null;
    corpo: string | null;
    direzione: string;
    created_at: string;
  }>;
  attachments: Array<{ id: string; nome_file: string; tipo_file: string | null; created_at: string }>;
};

const SUITE_STATUS_LABEL: Record<string, string> = {
  draft: "Bozza",
  sent: "Inviata",
  accepted: "Accettata",
};

export default async function OffertaPage({
  params,
}: {
  params: Promise<{ offerNumber: string }>;
}) {
  const { offerNumber } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userLabel = (user?.user_metadata?.full_name as string | undefined) || user?.email || "Utente";

  const { data: ctxData, error } = await supabase
    .schema("sales_ai")
    .rpc("get_offer_context", { p_offer_number: offerNumber });

  if (error || !ctxData) {
    notFound();
  }

  const ctx = ctxData as OfferContext;

  const { data: aiData } = await supabase
    .schema("sales_ai")
    .rpc("get_offer_ai_state", { p_offer_id: ctx.offer_id });

  const aiState = (aiData ?? null) as AiState | null;

  const timeline = [
    { label: "Offerta creata", date: ctx.created_at },
    ctx.sent_at ? { label: "Offerta inviata al cliente", date: ctx.sent_at } : null,
    ctx.accepted_at ? { label: "Offerta accettata dal cliente", date: ctx.accepted_at } : null,
    aiState?.latest_analysis
      ? { label: "Ultima valutazione Sales AI", date: aiState.latest_analysis.created_at }
      : null,
  ].filter(Boolean) as Array<{ label: string; date: string }>;

  return (
    <div className="app-shell">
      <Sidebar active="offerta" userLabel={userLabel} />

      <main className="main-content" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Link
          href="/ricerca"
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)", fontWeight: 600 }}
        >
          <ArrowLeftIcon size={15} />
          Torna alle offerte
        </Link>

        <div
          className="panel"
          style={{
            padding: "22px 26px",
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em" }}>#{ctx.offer_number}</span>
              <span className="tag">{SUITE_STATUS_LABEL[ctx.status] ?? ctx.status}</span>
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, maxWidth: 640 }}>{ctx.title ?? "Senza oggetto"}</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Creata il {dateFmt(ctx.created_at)} · Ultimo invio {dateFmt(ctx.sent_at)} · Agente: {ctx.agente ?? "—"}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div className="eyebrow">Importo netto</div>
            <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.02em" }}>
              {currencyFmt(ctx.final_price_net)}
            </div>
          </div>
        </div>

        <div className="grid-2col">
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="panel" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="section-title">
                <BuildingIcon size={16} />
                Cliente e contatto
              </div>
              <div className="field-grid-2">
                <Field label="Ragione sociale" value={ctx.client?.company_name ?? ctx.client?.display_name ?? "—"} />
                <Field label="Referente" value={ctx.client?.contact_person ?? "—"} />
                <Field label="Email" value={ctx.client?.email ?? "—"} />
                <Field label="Telefono" value={ctx.client?.phone ?? "—"} />
              </div>
            </div>

            <div className="panel" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="section-title">
                <NoteIcon size={16} />
                Note interne
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: "#3d3d3a" }}>{ctx.internal_notes || "Nessuna nota."}</div>
            </div>

            <div className="panel" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className="section-title">
                  <MailIcon size={16} />
                  Email collegate
                </div>
                <span className="tag">{ctx.emails.length}</span>
              </div>

              {ctx.emails.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>Nessuna email collegata a questa offerta.</div>
              )}

              <div style={{ display: "flex", flexDirection: "column" }}>
                {ctx.emails.map((e) => (
                  <div key={e.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
                    <span style={{ color: e.direzione === "in" ? "var(--accent)" : "var(--muted)", marginTop: 2 }}>
                      {e.direzione === "in" ? <MailInIcon size={14} /> : <MailOutIcon size={14} />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{e.da ?? "—"}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{dateFmt(e.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 13 }}>{e.oggetto ?? "(senza oggetto)"}</div>
                      {e.corpo && (
                        <div style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {e.corpo}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="section-title">
                <ClockIcon size={16} />
                Cronologia essenziale
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {timeline.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      position: "relative",
                      padding: i < timeline.length - 1 ? "0 0 16px 22px" : "0 0 2px 22px",
                      borderLeft: i < timeline.length - 1 ? "1px solid var(--border)" : "none",
                      marginLeft: 4,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: -5,
                        top: 2,
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background: i === timeline.length - 1 ? "var(--accent)" : "var(--dark)",
                      }}
                    />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13 }}>{t.label}</span>
                      <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{dateFmt(t.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="side-stack">
            <AiPanel state={aiState} offerId={ctx.offer_id} offerNumber={ctx.offer_number} />
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
