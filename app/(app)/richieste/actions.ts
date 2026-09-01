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

const ALLEGATO_MAX_BYTES = 20 * 1024 * 1024;

// Foto, PDF, disegni caricati a mano sulla richiesta: stesso pattern degli
// eventi manuali (aggiungiEvento sopra), ma con un file invece di un testo.
// Il file arriva già come bytes nella FormData (Server Action), quindi il
// caricamento sullo storage avviene qui, non lato client.
export async function caricaAllegatoRichiesta(requestId: string, formData: FormData) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Scegli un file." };
  if (file.size > ALLEGATO_MAX_BYTES) return { ok: false, error: "File troppo grande (max 20MB)." };

  const db = createServiceClient();
  const nomeSicuro = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${requestId}/${Date.now()}_${nomeSicuro}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await db.storage
    .from("allegati-richieste")
    .upload(path, buffer, { contentType: file.type || "application/octet-stream" });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { error } = await db.schema("sales_ai").rpc("aggiungi_allegato_richiesta", {
    p_request_id: requestId,
    p_nome_file: file.name,
    p_tipo_file: file.type || null,
    p_dimensione_kb: Math.round(file.size / 1024),
    p_storage_path: path,
    p_user: userId,
  });
  if (error) {
    await db.storage.from("allegati-richieste").remove([path]);
    return { ok: false, error: error.message };
  }

  // Un allegato in più è informazione nuova per la valutazione, come un
  // evento manuale: vale la pena rilanciare subito l'analisi.
  try {
    await smaltisciCoda(db);
  } catch {
    /* l'allegato è salvato comunque */
  }

  revalidatePath("/richieste");
  revalidatePath(`/richieste/${requestId}`);
  return { ok: true };
}

// Il bucket è privato: l'unico modo di aprire un allegato è un URL firmato
// generato al momento, mai un link diretto salvato nella pagina.
export async function apriAllegatoRichiesta(attachmentId: string) {
  const db = createServiceClient();
  const { data: allegato, error: fetchError } = await db
    .schema("sales_ai")
    .from("request_attachments")
    .select("storage_path, nome_file")
    .eq("id", attachmentId)
    .maybeSingle();
  if (fetchError || !allegato) return { ok: false, error: "Allegato non trovato." };

  const { data, error } = await db.storage.from("allegati-richieste").createSignedUrl(allegato.storage_path, 120);
  if (error || !data) return { ok: false, error: error?.message ?? "Impossibile generare il link." };

  return { ok: true, url: data.signedUrl, nome: allegato.nome_file as string };
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

// L'archiviazione è una transizione di fase tracciata (motivo obbligatorio),
// non un valore qualunque del select di stato: Rev.1 §13.4.
export async function archiviaRichiesta(requestId: string, reason: string, note: string | null) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  const { error } = await db.schema("sales_ai").rpc("archivia_richiesta", {
    p_request_id: requestId,
    p_reason: reason,
    p_note: note,
    p_user: userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/richieste");
  revalidatePath(`/richieste/${requestId}`);
  return { ok: true };
}

export async function ripristinaRichiesta(requestId: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  const { error } = await db.schema("sales_ai").rpc("ripristina_richiesta", {
    p_request_id: requestId,
    p_user: userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/richieste");
  revalidatePath(`/richieste/${requestId}`);
  return { ok: true };
}
