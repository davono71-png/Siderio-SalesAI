"use client";

import { useEffect, useRef, useState } from "react";
import { cercaClienti } from "@/app/(app)/richieste/actions";

export type ClienteRisultato = {
  id: string;
  display_name: string | null;
  company_name: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
};

// Ricerca invece di creazione: in anagrafica Suite esistono già più
// clienti quasi identici per la stessa azienda reale — una funzione che
// permettesse di crearne uno nuovo al volo peggiorerebbe la duplicazione.
export function ClientePicker({
  value,
  onSelect,
  placeholder = "Cerca in anagrafica Suite…",
}: {
  value: { id: string; label: string } | null;
  onSelect: (client: ClienteRisultato | null) => void;
  placeholder?: string;
}) {
  const [aperto, setAperto] = useState(false);
  const [query, setQuery] = useState("");
  const [risultati, setRisultati] = useState<ClienteRisultato[]>([]);
  const [cercando, setCercando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!aperto) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCercando(true);
      cercaClienti(query)
        .then(setRisultati)
        .finally(() => setCercando(false));
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, aperto]);

  if (value && !aperto) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="tag ok">{value.label}</span>
        <button type="button" className="btn small" onClick={() => setAperto(true)}>
          Cambia
        </button>
        <button type="button" className="btn small" onClick={() => onSelect(null)}>
          Scollega
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        autoFocus={aperto}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setAperto(true);
        }}
        onFocus={() => setAperto(true)}
        placeholder={placeholder}
        style={{
          width: "100%",
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "9px 11px",
          fontSize: 13,
          fontFamily: "inherit",
        }}
      />
      {aperto && (
        <div
          className="panel"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 20,
            maxHeight: 260,
            overflowY: "auto",
            padding: 6,
          }}
        >
          {cercando && <div style={{ padding: 8, fontSize: 12, color: "var(--muted)" }}>Cerco…</div>}
          {!cercando && risultati.length === 0 && (
            <div style={{ padding: 8, fontSize: 12, color: "var(--muted)" }}>
              Nessun cliente trovato{query ? ` per "${query}"` : ""}. L&apos;anagrafica si crea in Suite.
            </div>
          )}
          {!cercando &&
            risultati.map((c) => {
              const label = c.company_name || c.display_name || c.contact_person || "Cliente senza nome";
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelect(c);
                    setAperto(false);
                    setQuery("");
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 9px",
                    borderRadius: 8,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    {[c.email, c.city].filter(Boolean).join(" · ") || "—"}
                  </span>
                </button>
              );
            })}
          <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" className="btn small" onClick={() => setAperto(false)}>
              Chiudi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
