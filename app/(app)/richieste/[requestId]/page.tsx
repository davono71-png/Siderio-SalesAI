import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell, getUserLabel } from "@/components/PageShell";
import { EventoForm } from "../EventoForm";
import { AllegatoForm } from "../AllegatoForm";
import { AzioniRichiesta } from "./AzioniRichiesta";
import { ClienteRichiesta } from "./ClienteRichiesta";
import { ApriAllegatoButton } from "./ApriAllegatoButton";
import { ArrowLeftIcon, MailInIcon, MailOutIcon, PhoneIcon, NoteIcon, BuildingIcon, FileIcon } from "@/components/icons";
import {
  ACTOR_LABEL,
  SUGGESTED_ACTION_LABEL,
  WAITING_FOR_LABEL,
  OPPORTUNITY_STATUS_LABEL,
  currencyShortFmt,
  dateFmt,
  dateTimeFmt,
} from "@/lib/sales-ai/display";

export const dynamic = "force-dynamic";

type Scheda = {
  request: {
    id: string;
    title: string;
    status: string;
    channel: string;
    agency_source: string | null;
    contact_name: string | null;
    installation_location: string | null;
    notes: string | null;
    estimate_min: number | null;
    estimate_max: number | null;
    estimate_note: string | null;
    created_at: string;
    converted_offer_id: string | null;
    client_id: string | null;
    client_name: string | null;
    archived_at: string | null;
    archive_reason: string | null;
    archive_note: string | null;
    client_email: string | null;
    client_phone: string | null;
    offer_number: string | null;
  } | null;
  latest_analysis: {
    id: string;
    classification: string;
    confidence: number;
    created_at: string;
    model: string;
    prompt_version: string;
    result_json: Record<string, unknown> & {
      reason?: string;
      qualification?: {
        completeness?: number;
        sufficient_to_proceed?: boolean;
        critical_missing_information?: string[];
        non_blocking_missing_information?: string[];
      };
      commercial?: {
        opportunity_status?: string;
        followup_owner?: string;
        waiting_for?: string;
        suggested_action?: string;
        action_due_date?: string | null;
      };
      request?: { timing?: string | null; customer_budget?: string | null; customer_budget_status?: string };
    };
  } | null;
  open_actions: Array<{ id: string; actor: string; description: string; due_date: string | null; blocking: boolean }>;
  timeline: Array<{
    tipo: string;
    id: string;
    avvenuto_il: string;
    direzione: string | null;
    interlocutore: string | null;
    titolo: string | null;
    testo: string | null;
    esito: string | null;
    prossima_azione: string | null;
    data_followup: string | null;
    allegati: number;
    allegato_id: string | null;
  }>;
  conteggi: { email: number; eventi: number; analisi: number; allegati: number };
  job_in_corso: boolean;
  ultimo_job_fallito: string | null;
};

const STATO: Record<string, { l: string; t: string }> = {
  NEW: { l: "Nuova", t: "info" },
  TO_QUALIFY: { l: "Da qualificare", t: "warn" },
  WAITING_INFORMATION: { l: "In attesa informazioni", t: "warn" },
  TO_EVALUATE: { l: "Da preventivare", t: "ok" },
  CONVERTED_TO_OFFER: { l: "Convertita in offerta", t: "ok" },
  ARCHIVED: { l: "Archiviata", t: "neutral" },
};

const CANALE: Record<string, string> = { DIRECT: "Diretto", AGENCY: "Agenzia", UNKNOWN: "Canale da definire" };

const MOTIVO_ARCHIVIAZIONE_LABEL: Record<string, string> = {
  DUPLICATA: "Duplicata",
  NON_PERTINENTE: "Non pertinente",
  CLIENTE_NON_PROCEDE: "Il cliente non procede",
  PROGETTO_SOSPESO: "Progetto sospeso",
  ALTRO: "Altro",
};

const ICONA_EVENTO: Record<string, React.ReactNode> = {
  TELEFONATA: <PhoneIcon size={14} />,
  INCONTRO: <BuildingIcon size={14} />,
  SOPRALLUOGO: <BuildingIcon size={14} />,
  MESSAGGIO: <NoteIcon size={14} />,
  NOTA: <NoteIcon size={14} />,
  ALTRO: <NoteIcon size={14} />,
  ALLEGATO: <FileIcon size={14} />,
};

const ETICHETTA_EVENTO: Record<string, string> = {
  TELEFONATA: "Telefonata",
  INCONTRO: "Incontro",
  SOPRALLUOGO: "Sopralluogo",
  MESSAGGIO: "Messaggio",
  NOTA: "Nota",
  ALTRO: "Altro",
  ALLEGATO: "Allegato",
};

export default async function RichiestaPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const userLabel = await getUserLabel();
  const supabase = await createClient();

  const { data, error } = await supabase.schema("sales_ai").rpc("get_request", { p_request_id: requestId });
  const s = data as Scheda | null;
  if (error || !s?.request) notFound();

  const r = s.request;
  const a = s.latest_analysis;
  const q = a?.result_json?.qualification;
  const c = a?.result_json?.commercial;
  const completezza = typeof q?.completeness === "number" ? q.completeness : null;
  const pronta = q?.sufficient_to_proceed === true;
  const stato = STATO[r.status] ?? { l: r.status, t: "neutral" };
  const tono = completezza === null ? "info" : completezza >= 80 ? "ok" : completezza >= 55 ? "warn" : "danger";

  return (
    <PageShell
      active="richieste"
      userLabel={userLabel}
      eyebrow="Pre-offerta"
      title={r.title}
      subtitle={r.client_name ?? "Cliente non ancora identificato"}
      aside={<AzioniRichiesta requestId={r.id} stato={r.status} pronta={pronta} convertita={!!r.converted_offer_id} />}
    >
      <Link
        href="/richieste"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)", fontWeight: 600, marginBottom: 14 }}
      >
        <ArrowLeftIcon size={15} />
        Tutte le richieste
      </Link>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <span className={`status ${stato.t}`}>{stato.l}</span>
        <span className="tag">{CANALE[r.channel] ?? r.channel}</span>
        {r.agency_source && <span className="tag purple">{r.agency_source}</span>}
        <span className="tag">
          {s.conteggi.email} email · {s.conteggi.eventi} {s.conteggi.eventi === 1 ? "evento" : "eventi"}
          {s.conteggi.allegati > 0 ? ` · ${s.conteggi.allegati} allegat${s.conteggi.allegati === 1 ? "o" : "i"}` : ""}
        </span>
        {r.offer_number && <span className="status ok">Offerta #{r.offer_number}</span>}
      </div>

      <div className="grid-2col">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section className="panel" style={{ padding: 20 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>
              Valutazione Sales AI
            </div>

            {s.job_in_corso && <div style={{ fontSize: 13, color: "var(--muted)" }}>Analisi in corso…</div>}

            {!a && !s.job_in_corso && (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                {s.ultimo_job_fallito
                  ? `Analisi non disponibile: ${s.ultimo_job_fallito}`
                  : "Non ancora analizzata."}
              </div>
            )}

            {a && (
              <>
                {a.result_json?.reason && <div className="ai-reason">{a.result_json.reason}</div>}

                {completezza !== null && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                      {pronta ? "Richiesta sufficientemente completa" : "Mancano informazioni necessarie"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, height: 8, background: "#f0f0ec", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(3, completezza)}%`, height: "100%", background: `var(--${tono})` }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: `var(--${tono})` }}>{completezza}%</span>
                    </div>
                  </div>
                )}

                <div className="detail-grid" style={{ marginTop: 16 }}>
                  <div className="detail">
                    <label>Stato opportunità</label>
                    <div>{OPPORTUNITY_STATUS_LABEL[c?.opportunity_status ?? ""] ?? "—"}</div>
                  </div>
                  <div className="detail">
                    <label>Responsabile follow-up</label>
                    <div>{WAITING_FOR_LABEL[c?.followup_owner ?? ""] ?? "—"}</div>
                  </div>
                  <div className="detail">
                    <label>Chi deve agire ora</label>
                    <div>{WAITING_FOR_LABEL[c?.waiting_for ?? ""] ?? "—"}</div>
                  </div>
                  <div className="detail">
                    <label>Azione consigliata</label>
                    <div>{SUGGESTED_ACTION_LABEL[c?.suggested_action ?? ""] ?? "—"}</div>
                  </div>
                </div>

                {!!q?.critical_missing_information?.length && (
                  <div style={{ marginTop: 14 }}>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>
                      Informazioni critiche mancanti
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                      {q.critical_missing_information.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 14 }}>
                  {dateTimeFmt(a.created_at)} · {a.model} · prompt {a.prompt_version} ·{" "}
                  {Math.round((a.confidence ?? 0) * 100)}% di confidenza
                </div>
              </>
            )}
          </section>

          {s.open_actions.length > 0 && (
            <section className="panel" style={{ padding: 20 }}>
              <div className="section-title" style={{ marginBottom: 12 }}>
                Azioni aperte
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {s.open_actions.map((oa) => (
                  <div key={oa.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 11 }}>
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 5 }}>
                      <span className="tag purple">{ACTOR_LABEL[oa.actor] ?? oa.actor}</span>
                      {oa.blocking && <span className="status danger">Bloccante</span>}
                      {oa.due_date && <span className="tag">Entro {dateFmt(oa.due_date)}</span>}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.45 }}>{oa.description}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <div className="section-title">Storia della richiesta</div>
              <span className="panel-meta">{s.timeline.length} voci</span>
            </div>

            <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <EventoForm requestId={r.id} />
              <AllegatoForm requestId={r.id} />
            </div>

            {s.timeline.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                Ancora niente. Aggiungi un evento per registrare cosa è successo.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column" }}>
              {s.timeline.map((v) => {
                const isEmail = v.tipo === "EMAIL";
                return (
                  <div key={v.id} style={{ display: "flex", gap: 12, padding: "13px 0", borderTop: "1px solid var(--border)" }}>
                    <span style={{ color: isEmail ? "var(--muted)" : "var(--accent)", marginTop: 3, display: "flex" }}>
                      {isEmail ? (
                        v.direzione === "in" ? <MailInIcon size={14} /> : <MailOutIcon size={14} />
                      ) : (
                        ICONA_EVENTO[v.tipo] ?? <NoteIcon size={14} />
                      )}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>
                          {isEmail
                            ? v.direzione === "in"
                              ? "Email ricevuta"
                              : "Email inviata"
                            : ETICHETTA_EVENTO[v.tipo] ?? v.tipo}
                          {v.interlocutore ? ` · ${v.interlocutore}` : ""}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{dateTimeFmt(v.avvenuto_il)}</span>
                      </div>
                      {v.titolo && <div style={{ fontSize: 13, marginTop: 2 }}>{v.titolo}</div>}
                      {v.testo && (
                        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                          {v.testo.length > 400 ? `${v.testo.slice(0, 400)}…` : v.testo}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                        {v.tipo === "ALLEGATO" && v.allegato_id && <ApriAllegatoButton attachmentId={v.allegato_id} />}
                        {v.tipo !== "ALLEGATO" && v.allegati > 0 && <span className="tag">{v.allegati} allegati</span>}
                        {v.esito && <span className="tag">Esito: {v.esito}</span>}
                        {v.prossima_azione && <span className="tag purple">Poi: {v.prossima_azione}</span>}
                        {v.data_followup && <span className="tag">Follow-up {dateFmt(v.data_followup)}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="side-stack">
          {r.status === "ARCHIVED" && (
            <section className="panel" style={{ padding: 20, borderColor: "var(--border)" }}>
              <div className="section-title" style={{ marginBottom: 8 }}>
                Archiviata
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                {MOTIVO_ARCHIVIAZIONE_LABEL[r.archive_reason ?? ""] ?? r.archive_reason ?? "—"}
                {r.archive_note ? ` — ${r.archive_note}` : ""}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{dateFmt(r.archived_at)}</div>
            </section>
          )}

          <section className="panel" style={{ padding: 20 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>
              Dati della richiesta
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span className="eyebrow">Cliente (anagrafica Suite)</span>
                <ClienteRichiesta requestId={r.id} clientId={r.client_id} clientName={r.client_name} />
              </div>
              <Voce etichetta="Contatto" valore={r.contact_name} />
              <Voce etichetta="Email" valore={r.client_email} />
              <Voce etichetta="Telefono" valore={r.client_phone} />
              <Voce etichetta="Luogo" valore={r.installation_location} />
              <Voce etichetta="Tempistiche" valore={a?.result_json?.request?.timing ?? null} />
              <Voce
                etichetta="Budget cliente"
                valore={
                  a?.result_json?.request?.customer_budget ??
                  (a?.result_json?.request?.customer_budget_status === "NOT_MENTIONED"
                    ? "non menzionato"
                    : a?.result_json?.request?.customer_budget_status === "CUSTOMER_DOES_NOT_KNOW"
                      ? "il cliente non lo sa"
                      : null)
                }
              />
              <Voce
                etichetta="Stima Siderio"
                valore={
                  r.estimate_min || r.estimate_max
                    ? `${currencyShortFmt(r.estimate_min)} – ${currencyShortFmt(r.estimate_max)}`
                    : null
                }
              />
              <Voce etichetta="Aperta il" valore={dateFmt(r.created_at)} />
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  );
}

function Voce({ etichetta, valore }: { etichetta: string; valore: string | null | undefined }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className="eyebrow">{etichetta}</span>
      <span style={{ fontSize: 13.5, fontWeight: valore ? 600 : 400, color: valore ? "var(--text)" : "var(--muted)" }}>
        {valore || "—"}
      </span>
    </div>
  );
}
