"use client";

import { useState, useTransition } from "react";
import { creaRichiestaDaEmail, confermaMatchOfferta, segnaNonCommerciale } from "./actions";
import { dateTimeFmt } from "@/lib/sales-ai/display";

export type MailTriage = {
  email_id: string;
  mittente: string | null;
  oggetto: string | null;
  anteprima: string | null;
  created_at: string;
  letto: boolean;
  allegati: number;
  casella: string | null;
  classification: string | null;
  confidence: number | null;
  reason: string | null;
  triage_status: string;
  offerta_proposta: string | null;
  cliente_offerta: string | null;
  cliente_riconosciuto: string | null;
};

// Nome leggibile dal campo "da", che arriva come `Mario Rossi <m@rossi.it>`.
function scomponiMittente(da: string | null) {
  const s = (da ?? "").trim();
  const m = s.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { nome: m[1].replace(/^["']|["']$/g, "").trim() || m[2], indirizzo: m[2] };
  return { nome: s, indirizzo: s };
}

const VERDETTO: Record<string, { label: string; tone: string }> = {
  NEW_REQUEST: { label: "Nuova richiesta", tone: "info" },
  EXISTING_OPPORTUNITY: { label: "Possibile match", tone: "warn" },
  UNCERTAIN: { label: "Da verificare", tone: "neutral" },
  NOT_COMMERCIAL: { label: "Non commerciale", tone: "neutral" },
};

export function MailRow({ m }: { m: MailTriage }) {
  const [pending, startTransition] = useTransition();
  const [fatto, setFatto] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [chiedeOfferta, setChiedeOfferta] = useState(false);
  const [numeroOfferta, setNumeroOfferta] = useState(m.offerta_proposta ?? "");

  const { nome, indirizzo } = scomponiMittente(m.mittente);
  const daAnalizzare = m.triage_status === "TO_ANALYZE";
  const verdetto = m.classification ? VERDETTO[m.classification] : null;

  function esegui(fn: () => Promise<{ ok: boolean; error?: string }>, esito: string) {
    setErrore(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) setFatto(esito);
      else setErrore(res.error ?? "Operazione fallita.");
    });
  }

  if (fatto) {
    return (
      <div className="mail-row" style={{ opacity: 0.55 }}>
        <div className="mail-from">
          <strong>{nome}</strong>
        </div>
        <div>
          <div className="mail-subject">{m.oggetto ?? "(senza oggetto)"}</div>
        </div>
        <div className="mail-actions">
          <span className="status ok">{fatto}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`mail-row${daAnalizzare ? " da-analizzare" : ""}`}>
      <div className="mail-from">
        <strong>{nome}</strong>
        {m.cliente_riconosciuto && <small style={{ color: "var(--accent)" }}>{m.cliente_riconosciuto}</small>}
        <small>{indirizzo !== nome ? indirizzo : ""}</small>
        <small>{dateTimeFmt(m.created_at)}</small>
        {m.casella && <small style={{ opacity: 0.75 }}>ricevuta su {m.casella}</small>}
      </div>

      <div style={{ minWidth: 0 }}>
        <div className="mail-subject">{m.oggetto ?? "(senza oggetto)"}</div>
        {m.anteprima && <div className="mail-preview">{m.anteprima}</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {m.allegati > 0 && <span className="tag">{m.allegati} allegati</span>}
          {m.offerta_proposta && (
            <span className="tag purple">
              Offerta #{m.offerta_proposta}
              {m.cliente_offerta ? ` · ${m.cliente_offerta}` : ""}
            </span>
          )}
        </div>
        {m.reason && <div className="ai-reason">{m.reason}</div>}
        {errore && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{errore}</div>}
      </div>

      <div className="mail-actions">
        {daAnalizzare && <span className="status neutral">Da analizzare</span>}
        {verdetto && (
          <span className={`status ${verdetto.tone}`}>
            {verdetto.label}
            {m.confidence !== null ? ` · ${Math.round(Number(m.confidence) * 100)}%` : ""}
          </span>
        )}

        {chiedeOfferta ? (
          <div className="riga">
            <input
              value={numeroOfferta}
              onChange={(e) => setNumeroOfferta(e.target.value)}
              placeholder="n° offerta"
              aria-label="Numero offerta"
              style={{
                width: 100,
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "6px 9px",
                fontSize: 13,
              }}
            />
            <button
              type="button"
              className="btn small dark"
              disabled={pending}
              onClick={() => esegui(() => confermaMatchOfferta(m.email_id, numeroOfferta), "Agganciata")}
            >
              Aggancia
            </button>
            <button type="button" className="btn small" disabled={pending} onClick={() => setChiedeOfferta(false)}>
              Annulla
            </button>
          </div>
        ) : (
          <>
            <div className="riga">
              <button
                type="button"
                className="btn small ai"
                disabled={pending}
                onClick={() =>
                  esegui(
                    () => creaRichiestaDaEmail(m.email_id, m.oggetto?.trim() || "Richiesta senza oggetto"),
                    "Richiesta creata"
                  )
                }
              >
                Crea richiesta
              </button>
              <button type="button" className="btn small" disabled={pending} onClick={() => setChiedeOfferta(true)}>
                {m.offerta_proposta ? "Conferma match" : "Collega a offerta"}
              </button>
            </div>
            <button
              type="button"
              className="btn small"
              disabled={pending}
              onClick={() => esegui(() => segnaNonCommerciale(m.email_id), "Archiviata")}
            >
              Non commerciale
            </button>
          </>
        )}
      </div>
    </div>
  );
}
