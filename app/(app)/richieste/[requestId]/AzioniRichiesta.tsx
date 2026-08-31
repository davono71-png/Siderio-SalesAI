"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analizzaRichiesta, cambiaStatoRichiesta, archiviaRichiesta, ripristinaRichiesta } from "../actions";
import { convertiInOfferta } from "./actions";
import { SparkIcon } from "@/components/icons";

const STATI = [
  { v: "NEW", l: "Nuova" },
  { v: "TO_QUALIFY", l: "Da qualificare" },
  { v: "WAITING_INFORMATION", l: "In attesa informazioni" },
  { v: "TO_EVALUATE", l: "Da preventivare" },
];

const MOTIVI_ARCHIVIAZIONE = [
  { v: "DUPLICATA", l: "Duplicata" },
  { v: "NON_PERTINENTE", l: "Non pertinente" },
  { v: "CLIENTE_NON_PROCEDE", l: "Il cliente non procede" },
  { v: "PROGETTO_SOSPESO", l: "Progetto sospeso" },
  { v: "ALTRO", l: "Altro" },
];

export function AzioniRichiesta({
  requestId,
  stato,
  pronta,
  convertita,
}: {
  requestId: string;
  stato: string;
  pronta: boolean;
  convertita: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);
  const [chiedeNumero, setChiedeNumero] = useState(false);
  const [numero, setNumero] = useState("");
  const [archivio, setArchivio] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");

  function esegui(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErrore(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setErrore(res.error ?? "Operazione fallita.");
      else router.refresh();
    });
  }

  if (convertita) {
    return <span className="status ok">Convertita in offerta</span>;
  }

  if (stato === "ARCHIVED") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
        <span className="status neutral">Archiviata</span>
        <button
          type="button"
          className="btn small"
          disabled={pending}
          onClick={() => esegui(() => ripristinaRichiesta(requestId))}
        >
          {pending ? "Ripristino…" : "Ripristina"}
        </button>
        {errore && <span style={{ fontSize: 12, color: "var(--danger)", maxWidth: 280, textAlign: "right" }}>{errore}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
      {chiedeNumero ? (
        <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 9, minWidth: 260 }}>
          <div className="eyebrow">Numero della nuova offerta</div>
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="es. 6790"
            style={{
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "9px 11px",
              fontSize: 14,
              fontWeight: 700,
            }}
          />
          <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.45 }}>
            Viene creata una bozza in Suite col cliente e l&apos;oggetto della richiesta. Prezzi e articoli si
            lavorano lì.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="btn ai small"
              disabled={pending || !numero.trim()}
              onClick={() => esegui(() => convertiInOfferta(requestId, numero))}
            >
              {pending ? "Creo…" : "Crea offerta"}
            </button>
            <button type="button" className="btn small" disabled={pending} onClick={() => setChiedeNumero(false)}>
              Annulla
            </button>
          </div>
        </div>
      ) : archivio ? (
        <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 9, minWidth: 260 }}>
          <div className="eyebrow">Motivo archiviazione</div>
          <select
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            style={{
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "9px 11px",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            <option value="">Scegli un motivo…</option>
            {MOTIVI_ARCHIVIAZIONE.map((m) => (
              <option key={m.v} value={m.v}>
                {m.l}
              </option>
            ))}
          </select>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            placeholder={motivo === "ALTRO" ? "Obbligatoria per «Altro»" : "Nota facoltativa"}
            style={{
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "9px 11px",
              fontSize: 13,
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="btn small"
              disabled={pending || !motivo || (motivo === "ALTRO" && !nota.trim())}
              onClick={() => esegui(() => archiviaRichiesta(requestId, motivo, nota || null))}
            >
              {pending ? "Archivio…" : "Conferma archiviazione"}
            </button>
            <button type="button" className="btn small" disabled={pending} onClick={() => setArchivio(false)}>
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            className={pronta ? "btn ai" : "btn"}
            disabled={pending}
            onClick={() => setChiedeNumero(true)}
          >
            Crea offerta
          </button>
          <button type="button" className="btn" disabled={pending} onClick={() => esegui(() => analizzaRichiesta(requestId))}>
            <SparkIcon size={14} />
            {pending ? "Analizzo…" : "Rianalizza"}
          </button>
        </div>
      )}

      {!chiedeNumero && !archivio && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
          Stato
          <select
            value={stato}
            disabled={pending}
            onChange={(e) => esegui(() => cambiaStatoRichiesta(requestId, e.target.value))}
            style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 9, padding: "6px 9px", fontSize: 12 }}
          >
            {STATI.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </select>
        </label>
      )}

      {!chiedeNumero && !archivio && (
        <button
          type="button"
          onClick={() => setArchivio(true)}
          disabled={pending}
          style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}
        >
          Archivia richiesta
        </button>
      )}

      {errore && <span style={{ fontSize: 12, color: "var(--danger)", maxWidth: 280, textAlign: "right" }}>{errore}</span>}
    </div>
  );
}
