"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClientePicker, type ClienteRisultato } from "@/components/ClientePicker";
import { impostaClienteRichiesta } from "../actions";

export function ClienteRichiesta({
  requestId,
  clientId,
  clientName,
}: {
  requestId: string;
  clientId: string | null;
  clientName: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function collega(c: ClienteRisultato | null) {
    startTransition(async () => {
      await impostaClienteRichiesta(requestId, c?.id ?? null);
      router.refresh();
    });
  }

  return (
    <div style={{ opacity: pending ? 0.6 : 1 }}>
      <ClientePicker
        value={clientId ? { id: clientId, label: clientName || "Cliente collegato" } : null}
        onSelect={collega}
      />
    </div>
  );
}
