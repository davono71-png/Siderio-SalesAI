"use client";

import { useTransition } from "react";
import { apriAllegatoRichiesta } from "../actions";

// Il bucket è privato: non c'è un href statico da mettere nella pagina,
// il link firmato va chiesto al server nel momento in cui serve.
export function ApriAllegatoButton({ attachmentId }: { attachmentId: string }) {
  const [pending, startTransition] = useTransition();

  function apri() {
    startTransition(async () => {
      const res = await apriAllegatoRichiesta(attachmentId);
      if (!res.ok) {
        window.alert(res.error ?? "Non riesco ad aprire l'allegato.");
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <button
      type="button"
      onClick={apri}
      disabled={pending}
      style={{
        fontSize: 11.5,
        fontWeight: 700,
        color: "var(--accent)",
        background: "none",
        border: "none",
        padding: 0,
        cursor: pending ? "default" : "pointer",
      }}
    >
      {pending ? "Apro…" : "Apri"}
    </button>
  );
}
