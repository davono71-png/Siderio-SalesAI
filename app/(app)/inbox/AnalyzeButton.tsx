"use client";

import { useState, useTransition } from "react";
import { analizzaInbox } from "./actions";
import { SparkIcon } from "@/components/icons";

export function AnalyzeButton({ daAnalizzare }: { daAnalizzare: number }) {
  const [pending, startTransition] = useTransition();
  const [esito, setEsito] = useState<string | null>(null);

  function lancia() {
    setEsito(null);
    startTransition(async () => {
      const res = await analizzaInbox(15);
      if (!res.ok) {
        setEsito(res.error ?? "Analisi fallita.");
        return;
      }
      if (res.analizzate === 0) setEsito("Niente di nuovo da classificare.");
      else setEsito(`${res.analizzate} classificate${res.falliti ? `, ${res.falliti} da ritentare` : ""}.`);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      <button type="button" className="btn ai" onClick={lancia} disabled={pending}>
        <SparkIcon size={15} />
        {pending ? "Classificazione in corso…" : "Classifica le nuove"}
      </button>
      {esito && <span style={{ fontSize: 12, color: "var(--muted)" }}>{esito}</span>}
      {!esito && daAnalizzare > 0 && (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{daAnalizzare} in attesa di classificazione</span>
      )}
    </div>
  );
}
