"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { creaRichiestaManuale } from "./actions";

// Non tutte le richieste arrivano per email: telefonate, fiere, segnalazioni
// di un agente, passaparola. Senza questa via il sistema dipenderebbe dalla
// posta per esistere.
export function NuovaRichiesta() {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);

  const [oggetto, setOggetto] = useState("");
  const [contatto, setContatto] = useState("");
  const [canale, setCanale] = useState("DIRECT");
  const [agenzia, setAgenzia] = useState("");
  const [luogo, setLuogo] = useState("");
  const [note, setNote] = useState("");

  function salva() {
    setErrore(null);
    startTransition(async () => {
      const res = await creaRichiestaManuale({
        oggetto,
        contatto: contatto || null,
        canale,
        agenzia: agenzia || null,
        luogo: luogo || null,
        note: note || null,
      });
      if (!res.ok) {
        setErrore(res.error ?? "Non riesco a creare la richiesta.");
        return;
      }
      setAperto(false);
      setOggetto("");
      setContatto("");
      setAgenzia("");
      setLuogo("");
      setNote("");
      if (res.requestId) router.push(`/richieste/${res.requestId}`);
      else router.refresh();
    });
  }

  if (!aperto) {
    return (
      <button type="button" className="btn dark" onClick={() => setAperto(true)}>
        + Nuova richiesta
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
    <div className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="eyebrow">Non arriva da una email</div>
          <strong style={{ fontSize: 15 }}>Nuova richiesta</strong>
        </div>
        <button type="button" className="btn small" onClick={() => setAperto(false)} disabled={pending}>
          Annulla
        </button>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span className="eyebrow">Oggetto</span>
        <input
          value={oggetto}
          onChange={(e) => setOggetto(e.target.value)}
          placeholder="Es. Basamenti tavoli per Mass SPA"
          style={campo}
        />
      </label>

      <div className="field-grid-2">
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span className="eyebrow">Contatto</span>
          <input value={contatto} onChange={(e) => setContatto(e.target.value)} placeholder="Nome e cognome" style={campo} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span className="eyebrow">Luogo</span>
          <input value={luogo} onChange={(e) => setLuogo(e.target.value)} placeholder="Città o cantiere" style={campo} />
        </label>
      </div>

      <div className="field-grid-2">
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span className="eyebrow">Canale</span>
          <select value={canale} onChange={(e) => setCanale(e.target.value)} style={campo}>
            <option value="DIRECT">Diretto</option>
            <option value="AGENCY">Agenzia</option>
            <option value="UNKNOWN">Non so</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span className="eyebrow">Agenzia di riferimento</span>
          <input
            value={agenzia}
            onChange={(e) => setAgenzia(e.target.value)}
            placeholder="Anche se il canale è diretto"
            style={campo}
          />
        </label>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span className="eyebrow">Cosa ti ha chiesto</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Racconta la richiesta come te l'hanno fatta. Diventa il primo evento della richiesta e Sales AI la legge subito."
          style={{ ...campo, resize: "vertical" }}
        />
      </label>

      {errore && <div style={{ fontSize: 12, color: "var(--danger)" }}>{errore}</div>}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" className="btn ai" onClick={salva} disabled={pending || !oggetto.trim()}>
          {pending ? "Creo e analizzo…" : "Crea richiesta"}
        </button>
      </div>
    </div>
  );
}
