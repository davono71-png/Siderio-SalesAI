import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell, getUserLabel } from "@/components/PageShell";
import { ArrowLeftIcon, MailInIcon, MailOutIcon, FileIcon } from "@/components/icons";
import { dateTimeFmt } from "@/lib/sales-ai/display";
import { Azioni } from "./Azioni";

export const dynamic = "force-dynamic";

type Allegato = { nome: string; tipo?: string; dimensione_kb?: number; path?: string };

type Scheda = {
  email: {
    id: string;
    da: string | null;
    destinatari: string[] | null;
    cc: string[] | null;
    oggetto: string | null;
    corpo: string | null;
    allegati: Allegato[];
    created_at: string;
    direzione: string | null;
    folder: string | null;
    letto: boolean;
    casella: string | null;
    conversazione: string | null;
  };
  triage: {
    classification: string | null;
    confidence: number | null;
    reason: string | null;
    triage_status: string;
    confirmed_at: string | null;
    analyzed_at: string | null;
    root_offer_id: string | null;
    commessa_id: number | null;
    request_id: string | null;
  } | null;
  cliente_riconosciuto: string | null;
  offerta: { id: string; offer_number: string; cliente: string | null } | null;
  commessa: { id: number; numero_commessa: string; cliente: string | null } | null;
  richiesta: { id: string; title: string } | null;
  thread: Array<{
    id: string;
    da: string | null;
    oggetto: string | null;
    anteprima: string | null;
    created_at: string;
    direzione: string | null;
    corrente: boolean;
  }>;
};

// Nome leggibile da un campo "da"/indirizzo che arriva come `Nome <a@b.it>`.
function scomponi(indirizzo: string | null) {
  const s = (indirizzo ?? "").trim();
  const m = s.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { nome: m[1].replace(/^["']|["']$/g, "").trim() || m[2], indirizzo: m[2] };
  return { nome: s, indirizzo: s };
}

export default async function EmailDettaglioPage({ params }: { params: Promise<{ emailId: string }> }) {
  const { emailId } = await params;
  const userLabel = await getUserLabel();
  const supabase = await createClient();

  const { data, error } = await supabase.schema("sales_ai").rpc("get_email_detail", { p_email_id: emailId });
  const s = data as Scheda | null;
  if (error || !s?.email) notFound();

  const e = s.email;
  const mittente = scomponi(e.da);
  const daAnalizzare = !s.triage || s.triage.triage_status === "TO_ANALYZE";

  return (
    <PageShell
      active="inbox"
      userLabel={userLabel}
      eyebrow="Email commerciale"
      title={e.oggetto || "(senza oggetto)"}
      subtitle={s.cliente_riconosciuto ?? mittente.nome}
    >
      <Link
        href="/inbox"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)", fontWeight: 600, marginBottom: 14 }}
      >
        <ArrowLeftIcon size={15} />
        Torna alla Inbox
      </Link>

      <div className="grid-2col">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section className="panel" style={{ padding: 20 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>
              Intestazioni
            </div>
            <div className="detail-grid">
              <div className="detail">
                <label>Da</label>
                <div>
                  {mittente.nome}
                  {mittente.indirizzo !== mittente.nome && (
                    <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {mittente.indirizzo}</span>
                  )}
                </div>
              </div>
              <div className="detail">
                <label>A</label>
                <div>{(e.destinatari ?? []).join(", ") || "—"}</div>
              </div>
              {!!(e.cc ?? []).length && (
                <div className="detail">
                  <label>CC</label>
                  <div>{(e.cc ?? []).join(", ")}</div>
                </div>
              )}
              <div className="detail">
                <label>Data</label>
                <div>{dateTimeFmt(e.created_at)}</div>
              </div>
              <div className="detail">
                <label>Casella / cartella</label>
                <div>
                  {e.casella ?? "—"} · {e.folder ?? "—"}
                </div>
              </div>
              <div className="detail">
                <label>Oggetto completo</label>
                <div>{e.oggetto || "(senza oggetto)"}</div>
              </div>
            </div>
          </section>

          <section className="panel" style={{ padding: 20 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>
              Corpo del messaggio
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {e.corpo || <span style={{ color: "var(--muted)" }}>Messaggio senza testo.</span>}
            </div>
          </section>

          {e.allegati.length > 0 && (
            <section className="panel" style={{ padding: 20 }}>
              <div className="section-title" style={{ marginBottom: 12 }}>
                Allegati ({e.allegati.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {e.allegati.map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <FileIcon size={14} />
                    <span style={{ fontWeight: 600 }}>{a.nome}</span>
                    <span style={{ color: "var(--muted)" }}>
                      {a.tipo ? `${a.tipo} · ` : ""}
                      {a.dimensione_kb ? `${a.dimensione_kb} KB` : ""}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10 }}>
                Apertura/download non ancora disponibile per gli allegati email in questa versione: i file restano
                sul server di posta, Sales AI vede per ora solo nome, tipo e dimensione.
              </p>
            </section>
          )}

          <section className="panel" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <div className="section-title">Thread ({s.thread.length})</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {s.thread.map((t) => (
                <Link
                  key={t.id}
                  href={t.corrente ? "#" : `/inbox/${t.id}`}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "13px 0",
                    borderTop: "1px solid var(--border)",
                    color: "inherit",
                    textDecoration: "none",
                    background: t.corrente ? "var(--panel-alt, #f7f7f2)" : "transparent",
                    borderRadius: t.corrente ? 8 : 0,
                    paddingLeft: t.corrente ? 8 : 0,
                    paddingRight: t.corrente ? 8 : 0,
                    pointerEvents: t.corrente ? "none" : "auto",
                  }}
                >
                  <span style={{ color: "var(--muted)", marginTop: 3, display: "flex" }}>
                    {t.direzione === "in" ? <MailInIcon size={14} /> : <MailOutIcon size={14} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: t.corrente ? 800 : 700 }}>
                        {scomponi(t.da).nome}
                        {t.corrente ? " (questa email)" : ""}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{dateTimeFmt(t.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 12.5, marginTop: 2 }}>{t.oggetto || "(senza oggetto)"}</div>
                    {t.anteprima && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>{t.anteprima}</div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <div className="side-stack">
          <section className="panel" style={{ padding: 20 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>
              Classificazione
            </div>
            {daAnalizzare && <div style={{ fontSize: 13, color: "var(--muted)" }}>Ancora da classificare.</div>}
            {s.triage && !daAnalizzare && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{s.triage.classification ?? "—"}</div>
                {s.triage.confidence !== null && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {Math.round(Number(s.triage.confidence) * 100)}% di confidenza
                  </div>
                )}
                {s.triage.reason && <div className="ai-reason" style={{ marginTop: 10 }}>{s.triage.reason}</div>}
              </>
            )}
          </section>

          <section className="panel" style={{ padding: 20 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>
              Collegamenti
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {s.offerta ? (
                <div className="detail">
                  <label>Offerta</label>
                  <div>
                    <Link href={`/offerte/${s.offerta.offer_number}`} style={{ color: "var(--accent)", fontWeight: 700 }}>
                      #{s.offerta.offer_number}
                    </Link>
                    {s.offerta.cliente ? ` · ${s.offerta.cliente}` : ""}
                  </div>
                </div>
              ) : s.commessa ? (
                <div className="detail">
                  <label>Commessa</label>
                  <div>
                    #{s.commessa.numero_commessa}
                    {s.commessa.cliente ? ` · ${s.commessa.cliente}` : ""}
                  </div>
                </div>
              ) : s.richiesta ? (
                <div className="detail">
                  <label>Richiesta</label>
                  <div>
                    <Link href={`/richieste/${s.richiesta.id}`} style={{ color: "var(--accent)", fontWeight: 700 }}>
                      {s.richiesta.title}
                    </Link>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>Nessun collegamento ancora.</div>
              )}
            </div>
          </section>

          <section className="panel" style={{ padding: 20 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>
              Azioni
            </div>
            <Azioni emailId={e.id} oggetto={e.oggetto} offertaProposta={s.offerta?.offer_number ?? null} />
          </section>
        </div>
      </div>
    </PageShell>
  );
}
