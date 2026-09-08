"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CloseIcon } from "@/components/icons";
import { dateTimeFmt } from "@/lib/sales-ai/display";
import { getInboxKpiList } from "./actions";
import { VERDETTO, scomponiMittente, type MailTriage } from "./MailRow";

type Kpi = "DA_SMISTARE" | "NUOVE_RICHIESTE" | "POSSIBILI_MATCH";

const DEFINIZIONE: Record<Kpi, { titolo: string; nota: string; titoloPopup: string }> = {
  DA_SMISTARE: { titolo: "Da smistare", nota: "Richiedono una tua decisione.", titoloPopup: "Da smistare" },
  NUOVE_RICHIESTE: { titolo: "Nuove richieste", nota: "Possibili opportunità nuove.", titoloPopup: "Nuove richieste" },
  POSSIBILI_MATCH: { titolo: "Possibili match", nota: "Riguardano un lavoro già in corso.", titoloPopup: "Possibili match" },
};

export function InboxKpiCards({ valori }: { valori: Record<Kpi, number> }) {
  const [aperta, setAperta] = useState<Kpi | null>(null);
  const [righe, setRighe] = useState<MailTriage[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apri(kpi: Kpi) {
    setAperta(kpi);
    setErrore(null);
    setRighe([]);
    startTransition(async () => {
      const res = await getInboxKpiList(kpi);
      if (res.ok) setRighe(res.rows);
      else setErrore(res.error);
    });
  }

  return (
    <>
      <div className="cards-3" style={{ marginBottom: 18 }}>
        {(Object.keys(DEFINIZIONE) as Kpi[]).map((kpi) => (
          <button
            key={kpi}
            type="button"
            className="card"
            onClick={() => apri(kpi)}
            style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}
          >
            <h3>{DEFINIZIONE[kpi].titolo}</h3>
            <div className="big">{valori[kpi]}</div>
            <p>{DEFINIZIONE[kpi].nota}</p>
          </button>
        ))}
      </div>

      {aperta && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setAperta(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20,20,18,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}
        >
          <div
            className="panel"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 680, width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <div className="panel-head">
              <h2>{DEFINIZIONE[aperta].titoloPopup}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="panel-meta">{righe.length} email</span>
                <button
                  type="button"
                  onClick={() => setAperta(null)}
                  aria-label="Chiudi"
                  style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}
                >
                  <CloseIcon size={16} />
                </button>
              </div>
            </div>

            <div style={{ overflowY: "auto", flex: 1 }}>
              {pending && <div style={{ padding: 20, fontSize: 13, color: "var(--muted)" }}>Carico l&apos;elenco…</div>}
              {errore && <div style={{ padding: 20, fontSize: 13, color: "var(--danger)" }}>{errore}</div>}
              {!pending && !errore && righe.length === 0 && (
                <div style={{ padding: 20, fontSize: 13, color: "var(--muted)" }}>Niente qui dentro.</div>
              )}
              {righe.map((m) => {
                const { nome } = scomponiMittente(m.mittente);
                const verdetto = m.classification ? VERDETTO[m.classification] : null;
                return (
                  <Link
                    key={m.email_id}
                    href={`/inbox/${m.email_id}`}
                    style={{
                      display: "flex",
                      gap: 12,
                      padding: "13px 16px",
                      borderTop: "1px solid var(--border)",
                      color: "inherit",
                      textDecoration: "none",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>
                          {nome}
                          {m.cliente_riconosciuto ? ` · ${m.cliente_riconosciuto}` : ""}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{dateTimeFmt(m.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, marginTop: 2 }}>{m.oggetto ?? "(senza oggetto)"}</div>
                      {m.anteprima && (
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>{m.anteprima}</div>
                      )}
                      {verdetto && (
                        <span className={`status ${verdetto.tone}`} style={{ marginTop: 6, display: "inline-block" }}>
                          {verdetto.label}
                          {m.confidence !== null ? ` · ${Math.round(Number(m.confidence) * 100)}%` : ""}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
