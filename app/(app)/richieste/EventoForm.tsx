"use client";

import { useState, useTransition } from "react";
import { aggiungiEvento } from "./actions";

const TIPI = [
  { v: "TELEFONATA", l: "Telefonata" },
  { v: "INCONTRO", l: "Incontro" },
  { v: "SOPRALLUOGO", l: "Sopralluogo" },
  { v: "MESSAGGIO", l: "Messaggio" },
  { v: "NOTA", l: "Nota" },
  { v: "ALTRO", l: "Altro" },
];

function oraLocale() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// Registrare quello che si è detto al telefono è il punto in cui la trattativa
// entra nel sistema: qui si raccolgono le informazioni che altrimenti
// resterebbero in testa a chi ha risposto.
export function EventoForm({ requestId, onFatto }: { requestId: string; onFatto?: () => void }) {
  const [aperto, setAperto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);

  const [tipo, setTipo] = useState("TELEFONATA");
  const [quando, setQuando] = useState(oraLocale());
  const [interlocutore, setInterlocutore] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [esito, setEsito] = useState("");
  const [prossimaAzione, setProssimaAzione] = useState("");
  const [followup, setFollowup] = useState("");

  function salva() {
    setErrore(null);
    startTransition(async () => {
      const res = await aggiungiEvento({
        requestId,
        tipo,
        descrizione,
        quando: quando ? new Date(quando).toISOString() : null,
        interlocutore: interlocutore || null,
        esito: esito || null,
        prossimaAzione: prossimaAzione || null,
        followup: followup || null,
      });
      if (!res.ok) {
        setErrore(res.error ?? "Non riesco a salvare l'evento.");
        return;
      }
      setDescrizione("");
      setEsito("");
      setProssimaAzione("");
      setFollowup("");
      setInterlocutore("");
      setAperto(false);
      onFatto?.();
    });
  }

  if (!aperto) {
    return (
      <button type="button" className="btn ai" onClick={() => setAperto(true)}>
        + Aggiungi evento
      </button>
    );
  }

  const campo: React.CSSProperties = {
    width: "100%",
    background: "#fff",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "9px 11px",
    fontSize: 13,
    fontFamily: "inherit",
  };

  return (
    <div className="panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 14 }}>Nuovo evento</strong>
        <button type="button" className="btn small" onClick={() => setAperto(false)} disabled={pending}>
          Annulla
        </button>
      </div>

      <div className="field-grid-2">
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span className="eyebrow">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={campo}>
            {TIPI.map((t) => (
              <option key={t.v} value={t.v}>
                {t.l}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span className="eyebrow">Quando</span>
          <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} style={campo} />
        </label>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span className="eyebrow">Interlocutore</span>
        <input
          value={interlocutore}
          onChange={(e) => setInterlocutore(e.target.value)}
          placeholder="Con chi hai parlato"
          style={campo}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span className="eyebrow">Cosa è successo</span>
        <textarea
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
          rows={4}
          placeholder="Quantità, materiali, finiture, tempi, budget: tutto quello che ti ha detto e che non è scritto da nessuna parte."
          style={{ ...campo, resize: "vertical" }}
        />
      </label>

      <div className="field-grid-2">
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span className="eyebrow">Esito</span>
          <input
            value={esito}
            onChange={(e) => setEsito(e.target.value)}
            placeholder="interessato, da richiamare…"
            style={campo}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span className="eyebrow">Prossima azione</span>
          <input
            value={prossimaAzione}
            onChange={(e) => setProssimaAzione(e.target.value)}
            placeholder="attendere misure…"
            style={campo}
          />
        </label>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 5, maxWidth: 220 }}>
        <span className="eyebrow">Data follow-up</span>
        <input type="date" value={followup} onChange={(e) => setFollowup(e.target.value)} style={campo} />
      </label>

      {errore && <div style={{ fontSize: 12, color: "var(--danger)" }}>{errore}</div>}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" className="btn ai" onClick={salva} disabled={pending || !descrizione.trim()}>
          {pending ? "Salvo e rianalizzo…" : "Salva evento"}
        </button>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          Al salvataggio Sales AI rilegge la richiesta con questa informazione in più.
        </span>
      </div>
    </div>
  );
}
