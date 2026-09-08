"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CloseIcon, ChevronRightIcon } from "@/components/icons";
import { CLASSIFICATION_LABEL, CLASSIFICATION_TONE, currencyShortFmt, dateFmt } from "@/lib/sales-ai/display";
import { getKpiList, type KpiRow } from "./actions";

type Kpi = "OFFERTE_APERTE" | "FERME_14GG" | "AZIONI_APERTE" | "ANALIZZATE_AI";

const DEFINIZIONE: Record<Kpi, { label: string; dot: string; titoloPopup: string }> = {
  OFFERTE_APERTE: { label: "Offerte aperte", dot: "info", titoloPopup: "Offerte aperte" },
  FERME_14GG: { label: "Ferme da 14+ giorni", dot: "warn", titoloPopup: "Offerte ferme da 14+ giorni" },
  AZIONI_APERTE: { label: "Azioni aperte", dot: "danger", titoloPopup: "Offerte con azioni aperte" },
  ANALIZZATE_AI: { label: "Analizzate dall'AI", dot: "ok", titoloPopup: "Offerte analizzate dall'AI" },
};

export function KpiCards({ valori }: { valori: Record<Kpi, number> }) {
  const [aperta, setAperta] = useState<Kpi | null>(null);
  const [righe, setRighe] = useState<KpiRow[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apri(kpi: Kpi) {
    setAperta(kpi);
    setErrore(null);
    setRighe([]);
    startTransition(async () => {
      const res = await getKpiList(kpi);
      if (res.ok) setRighe(res.rows);
      else setErrore(res.error);
    });
  }

  return (
    <>
      <div className="kpis">
        {(Object.keys(DEFINIZIONE) as Kpi[]).map((kpi) => (
          <button
            key={kpi}
            type="button"
            className="kpi"
            onClick={() => apri(kpi)}
            style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}
          >
            <div className="top">
              <span className="label">{DEFINIZIONE[kpi].label}</span>
              <span className={`dot ${DEFINIZIONE[kpi].dot}`} />
            </div>
            <div className="value">{valori[kpi]}</div>
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
            style={{ maxWidth: 640, width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <div className="panel-head">
              <h2>{DEFINIZIONE[aperta].titoloPopup}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="panel-meta">{righe.length} offerte</span>
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
                <div style={{ padding: 20, fontSize: 13, color: "var(--muted)" }}>Nessuna offerta in questa categoria.</div>
              )}
              {righe.map((r) => (
                <Link
                  key={r.offer_id}
                  href={`/offerte/${encodeURIComponent(r.offer_number)}`}
                  className="offer-card"
                  style={{ color: "var(--text)" }}
                >
                  <div>
                    <div className="offer-top">
                      {r.sales_status && (
                        <span className={`status ${CLASSIFICATION_TONE[r.sales_status] ?? "neutral"}`}>
                          {CLASSIFICATION_LABEL[r.sales_status] ?? r.sales_status}
                        </span>
                      )}
                      <span className="tag">#{r.offer_number}</span>
                      {aperta === "AZIONI_APERTE" && (
                        <span className="tag">
                          {r.open_actions} {r.open_actions === 1 ? "azione" : "azioni"}
                          {r.overdue_actions > 0 ? ` · ${r.overdue_actions} scadute` : ""}
                        </span>
                      )}
                    </div>
                    <h3>{r.client_name ?? "Cliente non specificato"}</h3>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>{r.title ?? "Senza oggetto"}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                      Inviata il {dateFmt(r.sent_at)}
                      {r.days_since_sent !== null ? ` · ${r.days_since_sent} giorni fa` : ""}
                    </div>
                  </div>
                  <div className="offer-side">
                    <span style={{ fontWeight: 900, fontSize: 15 }}>{currencyShortFmt(r.final_price_net)}</span>
                    <ChevronRightIcon size={16} color="var(--muted)" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
