"use client";

import { useRef, useState, useTransition } from "react";
import { caricaAllegatoRichiesta } from "./actions";

// Foto, PDF, disegni: tutto quello che serve per preventivare e che non
// arriva per email. Le immagini vengono anche lette dall'AI, non solo
// elencate per nome (§04 Rev.1).
export function AllegatoForm({ requestId }: { requestId: string }) {
  const [aperto, setAperto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function salva() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErrore("Scegli un file.");
      return;
    }
    setErrore(null);
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const res = await caricaAllegatoRichiesta(requestId, fd);
      if (!res.ok) {
        setErrore(res.error ?? "Non riesco a caricare l'allegato.");
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      setAperto(false);
    });
  }

  if (!aperto) {
    return (
      <button type="button" className="btn" onClick={() => setAperto(true)}>
        + Aggiungi allegato
      </button>
    );
  }

  return (
    <div className="panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 14 }}>Nuovo allegato</strong>
        <button type="button" className="btn small" onClick={() => setAperto(false)} disabled={pending}>
          Annulla
        </button>
      </div>

      <input ref={fileRef} type="file" disabled={pending} />

      {errore && <div style={{ fontSize: 12, color: "var(--danger)" }}>{errore}</div>}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" className="btn ai" onClick={salva} disabled={pending}>
          {pending ? "Carico e rianalizzo…" : "Carica allegato"}
        </button>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Max 20MB. Le foto vengono lette anche da Sales AI.</span>
      </div>
    </div>
  );
}
