"use client";

import { useState, useTransition } from "react";
import { creaRichiesta, scartaCandidato } from "./actions";
import { dateFmt } from "@/lib/sales-ai/display";

export type Candidate = {
  client_id: string | null;
  client_name: string | null;
  subj_norm: string;
  titolo: string | null;
  email_count: number;
  prima: string;
  ultima: string;
  identita_confidenza: number;
  identita_origine: string;
  email_ids: string[];
  mittente: string | null;
  anteprima: string | null;
};

const ORIGINE_LABEL: Record<string, string> = {
  ANAGRAFICA: "email in anagrafica",
  STORICO: "corrispondenza passata",
  NOME_DOMINIO: "nome del dominio",
  MANUALE: "confermato a mano",
};

export function CandidateCard({ c }: { c: Candidate }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<null | "creata" | "scartata">(null);
  const [error, setError] = useState<string | null>(null);
  const [titolo, setTitolo] = useState(c.titolo?.trim() || c.subj_norm);

  if (done) {
    return (
      <div className="offer-card" style={{ opacity: 0.6 }}>
        <div>
          <div className="offer-top">
            <span className={`status ${done === "creata" ? "ok" : "neutral"}`}>
              {done === "creata" ? "Richiesta creata" : "Scartata"}
            </span>
          </div>
          <h3 style={{ fontSize: 15 }}>{titolo}</h3>
        </div>
        <div className="offer-side" />
      </div>
    );
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, esito: "creata" | "scartata") {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) setDone(esito);
      else setError(res.error ?? "Operazione fallita.");
    });
  }

  return (
    <div className="offer-card">
      <div style={{ minWidth: 0 }}>
        <div className="offer-top">
          <span className="tag purple">{c.client_name ?? "Cliente non identificato"}</span>
          <span className="tag">
            {c.email_count} {c.email_count === 1 ? "email" : "email"}
          </span>
          <span className="tag">
            riconosciuto per {ORIGINE_LABEL[c.identita_origine] ?? c.identita_origine}
          </span>
        </div>

        <input
          value={titolo}
          onChange={(e) => setTitolo(e.target.value)}
          aria-label="Titolo della richiesta"
          style={{
            width: "100%",
            marginTop: 10,
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "9px 11px",
            fontWeight: 700,
            fontSize: 15,
          }}
        />

        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 7 }}>
          {c.mittente} · dal {dateFmt(c.prima)} al {dateFmt(c.ultima)}
        </div>

        {c.anteprima && <div className="req-summary">{c.anteprima}</div>}

        {error && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{error}</div>}
      </div>

      <div className="request-actions">
        <button
          type="button"
          className="btn ai"
          disabled={pending}
          onClick={() => run(() => creaRichiesta(c.email_ids, titolo, c.client_id), "creata")}
        >
          Crea richiesta
        </button>
        <button
          type="button"
          className="btn small"
          disabled={pending}
          onClick={() => run(() => scartaCandidato(c.email_ids, "non commerciale"), "scartata")}
        >
          Non è una richiesta
        </button>
      </div>
    </div>
  );
}
