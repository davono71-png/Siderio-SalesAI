"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analizzaRichiesta, cambiaStatoRichiesta } from "../actions";
import { convertiInOfferta } from "./actions";
import { SparkIcon } from "@/components/icons";

const STATI = [
  { v: "NEW", l: "Nuova" },
  { v: "TO_QUALIFY", l: "Da qualificare" },
  { v: "WAITING_INFORMATION", l: "In attesa informazioni" },
  { v: "TO_EVALUATE", l: "Da preventivare" },
  { v: "ARCHIVED", l: "Archiviata" },
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

      {errore && <span style={{ fontSize: 12, color: "var(--danger)", maxWidth: 280, textAlign: "right" }}>{errore}</span>}
    </div>
  );
}
