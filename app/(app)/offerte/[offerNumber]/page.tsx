import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";
import { saveOfferState } from "./actions";
import { ArrowLeftIcon, BuildingIcon, NoteIcon, MailIcon, MailInIcon, MailOutIcon, ClockIcon, ChevronDownIcon } from "@/components/icons";

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

type LocalState = {
  status: string;
  priority: string | null;
  action_owner: string | null;
  waiting_for: string | null;
  next_action: string | null;
  next_action_date: string | null;
  reason: string | null;
  updated_at: string | null;
};

const STATUS_OPTIONS = [
  { value: "nessuna_azione", label: "Nessuna azione" },
  { value: "da_monitorare", label: "Da monitorare" },
  { value: "followup_consigliato", label: "Follow-up consigliato" },
  { value: "attenzione", label: "Attenzione" },
  { value: "attesa_programmata", label: "Attesa programmata" },
];

const dateFmt = (v: string | null | undefined) =>
  v ? new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(v)) : "—";

const currencyFmt = (v: number | null | undefined) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v ?? 0);

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

  const { data: stateData } = await supabase
    .schema("sales_ai")
    .from("offer_local_state")
    .select("*")
    .eq("offer_id", ctx.offer_id)
    .maybeSingle();

  const state = (stateData ?? {
    status: "nessuna_azione",
    priority: null,
    action_owner: null,
    waiting_for: null,
    next_action: null,
    next_action_date: null,
    reason: null,
    updated_at: null,
  }) as LocalState;

  const timeline = [
    { label: "Offerta creata", date: ctx.created_at },
    ctx.sent_at ? { label: "Offerta inviata al cliente", date: ctx.sent_at } : null,
    ctx.accepted_at ? { label: "Offerta accettata dal cliente", date: ctx.accepted_at } : null,
    state.updated_at ? { label: "Stato Sales AI aggiornato manualmente", date: state.updated_at } : null,
  ].filter(Boolean) as Array<{ label: string; date: string }>;

  return (
    <div className="app-shell">
      <Sidebar active="offerta" userLabel={userLabel} />

      <main className="main-content" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <a
          href="/ricerca"
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)", fontWeight: 600 }}
        >
          <ArrowLeftIcon size={15} />
          Torna alla ricerca
        </a>

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
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 11px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  color: "var(--muted)",
                }}
              >
                {ctx.status}
              </span>
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, maxWidth: 640 }}>{ctx.title ?? "Senza oggetto"}</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Creata il {dateFmt(ctx.created_at)} · Ultimo invio {dateFmt(ctx.sent_at)} · Agente: {ctx.agente ?? "—"}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Importo netto
            </div>
            <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.02em" }}>{currencyFmt(ctx.final_price_net)}</div>
          </div>
        </div>

        <div className="offer-grid">
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
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "var(--muted)",
                    background: "var(--bg)",
                    padding: "2px 9px",
                    borderRadius: 999,
                  }}
                >
                  {ctx.emails.length}
                </span>
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
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
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

          <form
            action={saveOfferState}
            className="panel"
            style={{
              borderColor: "var(--accent-border)",
              background: "var(--accent-bg)",
              padding: "20px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 15,
            }}
          >
            <input type="hidden" name="offer_id" value={ctx.offer_id} />
            <input type="hidden" name="offer_number" value={ctx.offer_number} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>Stato Sales AI</span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "#fff",
                  border: "1px solid var(--border)",
                  color: "var(--muted)",
                  letterSpacing: "0.03em",
                }}
              >
                GESTIONE MANUALE
              </span>
            </div>

            <LabeledField label="Stato">
              <div style={{ position: "relative" }}>
                <select name="status" defaultValue={state.status} className="field-box" style={{ width: "100%", appearance: "none" }}>
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span style={{ position: "absolute", right: 11, top: 11, pointerEvents: "none", color: "var(--muted)" }}>
                  <ChevronDownIcon size={13} />
                </span>
              </div>
            </LabeledField>

            <LabeledField label="Priorità">
              <select name="priority" defaultValue={state.priority ?? ""} className="field-box" style={{ width: "100%" }}>
                <option value="">—</option>
                <option value="bassa">Bassa</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </LabeledField>

            <div className="field-grid-2">
              <LabeledField label="Chi deve agire">
                <input name="action_owner" defaultValue={state.action_owner ?? ""} className="field-box" style={{ width: "100%" }} />
              </LabeledField>
              <LabeledField label="In attesa di">
                <input name="waiting_for" defaultValue={state.waiting_for ?? ""} className="field-box" style={{ width: "100%" }} />
              </LabeledField>
            </div>

            <LabeledField label="Prossima azione">
              <textarea
                name="next_action"
                defaultValue={state.next_action ?? ""}
                className="field-box"
                rows={2}
                style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
              />
            </LabeledField>

            <LabeledField label="Data prossima azione">
              <input
                type="date"
                name="next_action_date"
                defaultValue={state.next_action_date ?? ""}
                className="field-box"
                style={{ width: "100%" }}
              />
            </LabeledField>

            <LabeledField label="Motivo">
              <textarea
                name="reason"
                defaultValue={state.reason ?? ""}
                className="field-box"
                rows={2}
                style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
              />
            </LabeledField>

            <button
              type="submit"
              style={{
                height: 40,
                border: "none",
                borderRadius: 10,
                background: "var(--dark)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Salva modifiche
            </button>

            <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
              {state.updated_at ? `Ultimo aggiornamento: ${dateFmt(state.updated_at)}` : "Nessun aggiornamento ancora registrato."}
            </div>
          </form>
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

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{label}</label>
      {children}
    </div>
  );
}
