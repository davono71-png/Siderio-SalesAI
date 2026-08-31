"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/sales-ai/supabase.js";
import { claimNextJob, completeJob, failOrRetryJob } from "@/lib/sales-ai/jobs.js";
import { runAnalysis } from "@/lib/sales-ai/engine.js";

async function currentUserId() {
  const authed = await createClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  return user?.id ?? null;
}

// Elabora subito il job appena accodato. Le richieste nascono già con un job
// in coda (lo accoda il database), ma senza un worker che gira di suo
// resterebbero "in attesa" a lungo: qui si smaltisce nello stesso momento in
// cui l'utente fa l'azione, così vede il risultato invece di una promessa.
async function smaltisciCoda(db: ReturnType<typeof createServiceClient>, giri = 2) {
  for (let i = 0; i < giri; i += 1) {
    const job = await claimNextJob(db);
    if (!job) return;
    try {
      const analysis = await runAnalysis(db, job);
      await completeJob(db, job.id, analysis.analysis_id);
    } catch (e) {
      await failOrRetryJob(db, job, e);
      return;
    }
  }
}

export async function aggiungiEvento(input: {
  requestId: string;
  tipo: string;
  descrizione: string;
  quando?: string | null;
  interlocutore?: string | null;
  esito?: string | null;
  prossimaAzione?: string | null;
  followup?: string | null;
}) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };
  if (!input.descrizione?.trim()) return { ok: false, error: "Scrivi cosa è successo." };

  const db = createServiceClient();
  const { error } = await db.schema("sales_ai").rpc("aggiungi_evento", {
    p_request_id: input.requestId,
    p_event_type: input.tipo,
    p_description: input.descrizione,
    p_event_at: input.quando || new Date().toISOString(),
    p_contact_name: input.interlocutore || null,
    p_outcome: input.esito || null,
    p_next_action: input.prossimaAzione || null,
    p_followup: input.followup || null,
    p_user: userId,
  });
  if (error) return { ok: false, error: error.message };

  // L'evento è informazione commerciale nuova: la richiesta va rivalutata
  // subito, altrimenti la scheda resta ferma a prima della telefonata.
  try {
    await smaltisciCoda(db);
  } catch {
    // L'evento è salvato comunque: l'analisi si può rilanciare a mano.
  }

  revalidatePath("/richieste");
  revalidatePath(`/richieste/${input.requestId}`);
  return { ok: true };
}

export async function cercaClienti(query: string) {
  const db = createServiceClient();
  const { data, error } = await db.schema("sales_ai").rpc("search_clients", {
    p_query: query || null,
    p_limit: 8,
  });
  if (error) return [];
  return (data ?? []) as Array<{
    id: string;
    display_name: string | null;
    company_name: string | null;
    contact_person: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
  }>;
}

export async function impostaClienteRichiesta(requestId: string, clientId: string | null) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  const { error } = await db.schema("sales_ai").rpc("imposta_cliente_richiesta", {
    p_request_id: requestId,
    p_client_id: clientId,
    p_user: userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/richieste");
  revalidatePath(`/richieste/${requestId}`);
  return { ok: true };
}

export async function creaRichiestaManuale(input: {
  oggetto: string;
  clientId?: string | null;
  contatto?: string | null;
  canale?: string;
  agenzia?: string | null;
  luogo?: string | null;
  note?: string | null;
}) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };
  if (!input.oggetto?.trim()) return { ok: false, error: "Serve un oggetto." };

  const db = createServiceClient();
  const { data: requestId, error } = await db.schema("sales_ai").rpc("crea_richiesta_manuale", {
    p_title: input.oggetto,
    p_client_id: input.clientId || null,
    p_contact: input.contatto || null,
    p_channel: input.canale || "UNKNOWN",
    p_agency: input.agenzia || null,
    p_luogo: input.luogo || null,
    p_note: input.note || null,
    p_user: userId,
  });
  if (error) return { ok: false, error: error.message };

  try {
    await smaltisciCoda(db);
  } catch {
    /* la richiesta esiste comunque */
  }

  revalidatePath("/richieste");
  return { ok: true, requestId: requestId as string };
}

export async function analizzaRichiesta(requestId: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  const { data: inCoda } = await db
    .schema("sales_ai")
    .from("analysis_jobs")
    .select("id")
    .eq("request_id", requestId)
    .in("status", ["PENDING", "RUNNING"])
    .limit(1);

  if (!inCoda?.length) {
    const { error } = await db
      .schema("sales_ai")
      .from("analysis_jobs")
      .insert({ request_id: requestId, created_by: userId, priority: 130 });
    if (error) return { ok: false, error: error.message };
  }

  try {
    await smaltisciCoda(db, 3);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Analisi fallita" };
  }

  revalidatePath("/richieste");
  revalidatePath(`/richieste/${requestId}`);
  return { ok: true };
}

export async function cambiaStatoRichiesta(requestId: string, stato: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  const { error } = await db.schema("sales_ai").rpc("imposta_stato_richiesta", {
    p_request_id: requestId,
    p_status: stato,
    p_user: userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/richieste");
  revalidatePath(`/richieste/${requestId}`);
  return { ok: true };
}
