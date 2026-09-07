"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  creaRichiestaDaEmail,
  confermaMatchOfferta,
  segnaNonCommerciale,
  offertaAnnullataPersa,
  offertaTrasformataOrdine,
  ordineClienteInCorso,
  fornitoreAcquisti,
  duplicatoDaIgnorare,
} from "../actions";

// Stesse azioni della riga Inbox (MailRow), ma a piena larghezza: qui
// l'utente ha già letto il messaggio per intero, quindi non serve
// nascondere le opzioni meno frequenti dietro un secondo clic.
export function Azioni({
  emailId,
  oggetto,
  offertaProposta,
}: {
  emailId: string;
  oggetto: string | null;
  offertaProposta: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fatto, setFatto] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [numeroOfferta, setNumeroOfferta] = useState(offertaProposta ?? "");
  const [numeroCommessa, setNumeroCommessa] = useState("");

  function esegui(fn: () => Promise<{ ok: boolean; error?: string }>, esito: string) {
    setErrore(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setFatto(esito);
        router.refresh();
      } else {
        setErrore(res.error ?? "Operazione fallita.");
      }
    });
  }

  if (fatto) {
    return <span className="status ok">{fatto}</span>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {errore && <div style={{ fontSize: 12, color: "var(--danger)" }}>{errore}</div>}

      <button
        type="button"
        className="btn small ai"
        disabled={pending}
        onClick={() =>
          esegui(() => creaRichiestaDaEmail(emailId, oggetto?.trim() || "Richiesta senza oggetto"), "Richiesta creata")
        }
      >
        Crea richiesta
      </button>

      <div>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 6 }}>
          Offerta
        </label>
        <div className="riga" style={{ flexWrap: "wrap" }}>
          <input
            value={numeroOfferta}
            onChange={(ev) => setNumeroOfferta(ev.target.value)}
            placeholder="n° offerta"
            aria-label="Numero offerta"
            style={{ width: 100, background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 9px", fontSize: 13 }}
          />
        </div>
        <div className="riga" style={{ flexWrap: "wrap", marginTop: 8 }}>
          <button
            type="button"
            className="btn small dark"
            disabled={pending}
            onClick={() => esegui(() => confermaMatchOfferta(emailId, numeroOfferta), "Agganciata")}
          >
            Conferma offerta
          </button>
          <button
            type="button"
            className="btn small"
            disabled={pending}
            onClick={() => esegui(() => offertaTrasformataOrdine(emailId, numeroOfferta), "Trasformata in ordine")}
          >
            Già trasformata in ordine
          </button>
          <button
            type="button"
            className="btn small"
            disabled={pending}
            onClick={() => esegui(() => offertaAnnullataPersa(emailId, numeroOfferta), "Annullata/persa")}
          >
            Annullata/persa
          </button>
        </div>
      </div>

      <div>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 6 }}>
          Ordine cliente
        </label>
        <div className="riga">
          <input
            value={numeroCommessa}
            onChange={(ev) => setNumeroCommessa(ev.target.value)}
            placeholder="n° commessa"
            aria-label="Numero commessa"
            style={{ width: 100, background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 9px", fontSize: 13 }}
          />
          <button
            type="button"
            className="btn small"
            disabled={pending}
            onClick={() => esegui(() => ordineClienteInCorso(emailId, numeroCommessa), "Collegata alla commessa")}
          >
            Collega
          </button>
        </div>
      </div>

      <div className="riga" style={{ flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn small"
          disabled={pending}
          onClick={() => esegui(() => fornitoreAcquisti(emailId), "Fornitore/acquisti")}
        >
          Fornitore/acquisti
        </button>
        <button
          type="button"
          className="btn small"
          disabled={pending}
          onClick={() => esegui(() => segnaNonCommerciale(emailId), "Archiviata")}
        >
          Non commerciale
        </button>
        <button
          type="button"
          className="btn small"
          disabled={pending}
          onClick={() => esegui(() => duplicatoDaIgnorare(emailId), "Duplicato/ignorata")}
        >
          Duplicato/da ignorare
        </button>
      </div>
    </div>
  );
}
