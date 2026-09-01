"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/sales-ai/supabase.js";
import { enqueueAnalysis, claimNextJob, completeJob, failOrRetryJob } from "@/lib/sales-ai/jobs.js";
import { runAnalysis } from "@/lib/sales-ai/engine.js";
import { resolveRootOfferId } from "@/lib/sales-ai/context.js";

// Elabora subito il job appena accodato da un evento o un allegato manuale
// (stesso pattern di richieste/actions.ts): senza un worker pg_cron in
// background, il momento più affidabile per smaltire la coda è quando
// qualcuno fa davvero l'azione.
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

// Bottone "Analizza con AI": stessa pipeline di /api/sales-ai/analyze +
// /api/sales-ai/process-next, ma sincrona ed eseguita nel processo del
// Server Action — non serve il segreto cron né un token separato, la
// richiesta arriva già autenticata dalla sessione della pagina.
export async function runOpportunityAnalysis(offerId: string, offerNumber: string) {
  const authed = await createClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  let rootOfferId: string;
  try {
    rootOfferId = await resolveRootOfferId(db, offerId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Offerta non trovata" };
  }

  const scope = { root_offer_id: rootOfferId, request_id: null };
  let job;
  try {
    job = await enqueueAnalysis(db, scope, {}, user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Impossibile accodare l'analisi" };
  }

  // Elabora subito il job appena creato (in genere è lui il prossimo in coda,
  // ma claimNextJob prende comunque il primo PENDING per priorità/data —
  // corretto anche con più richieste in parallelo).
  const claimed = await claimNextJob(db);
  if (!claimed) {
    return { ok: true, queued: true, note: "Job accodato, in attesa che il worker lo elabori." };
  }

  try {
    const analysis = await runAnalysis(db, claimed);
    await completeJob(db, claimed.id, analysis.analysis_id);
    revalidatePath(`/offerte/${offerNumber}`);
    return { ok: true, queued: false };
  } catch (e) {
    await failOrRetryJob(db, claimed, e);
    return { ok: false, error: e instanceof Error ? e.message : "Analisi fallita" };
  }
}

// Rev.1 §13.3/13.4: archiviazione manuale di un'opportunità post-offerta —
// eccezione tracciata (motivo obbligatorio), non il normale avanzamento
// del funnel che avviene da solo quando la commessa è creata.
export async function archiviaOfferta(rootOfferId: string, offerNumber: string, reason: string, note: string | null) {
  const authed = await createClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  const { error } = await db.schema("sales_ai").rpc("archivia_offerta", {
    p_root_offer_id: rootOfferId,
    p_reason: reason,
    p_note: note,
    p_user: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/offerte/${offerNumber}`);
  revalidatePath("/ricerca");
  return { ok: true };
}

export async function ripristinaOfferta(rootOfferId: string, offerNumber: string) {
  const authed = await createClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  const { error } = await db.schema("sales_ai").rpc("ripristina_offerta", {
    p_root_offer_id: rootOfferId,
    p_user: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/offerte/${offerNumber}`);
  revalidatePath("/ricerca");
  return { ok: true };
}

// "+ Aggiungi evento" sulla pagina offerta — Rev.1 §06: stesso pattern
// delle richieste (aggiungiEvento), ma scope root_offer_id invece di
// request_id. aggiungi_evento accoda da solo un job se non ce n'è già uno
// in attesa; qui si smaltisce subito, come per ogni altra azione manuale.
export async function aggiungiEventoOfferta(input: {
  rootOfferId: string;
  offerNumber: string;
  tipo: string;
  descrizione: string;
  quando?: string | null;
  interlocutore?: string | null;
  esito?: string | null;
  prossimaAzione?: string | null;
  followup?: string | null;
}) {
  const authed = await createClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta, rientra." };
  if (!input.descrizione?.trim()) return { ok: false, error: "Scrivi cosa è successo." };

  const db = createServiceClient();
  const { error } = await db.schema("sales_ai").rpc("aggiungi_evento", {
    p_request_id: null,
    p_root_offer_id: input.rootOfferId,
    p_event_type: input.tipo,
    p_description: input.descrizione,
    p_event_at: input.quando || new Date().toISOString(),
    p_contact_name: input.interlocutore || null,
    p_outcome: input.esito || null,
    p_next_action: input.prossimaAzione || null,
    p_followup: input.followup || null,
    p_user: user.id,
  });
  if (error) return { ok: false, error: error.message };

  try {
    await smaltisciCoda(db);
  } catch {
    /* l'evento è salvato comunque */
  }

  revalidatePath(`/offerte/${input.offerNumber}`);
  return { ok: true };
}

const ALLEGATO_MAX_BYTES = 20 * 1024 * 1024;

// "+ Aggiungi allegato" sulla pagina offerta. Bucket allegati-richieste,
// condiviso con le richieste (sales_ai.request_attachments è ora a doppio
// scope): il path è comunque tenuto separato per prefisso (root_offer_id/…),
// quindi non c'è rischio di collisione.
export async function caricaAllegatoOfferta(rootOfferId: string, offerNumber: string, formData: FormData) {
  const authed = await createClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta, rientra." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Scegli un file." };
  if (file.size > ALLEGATO_MAX_BYTES) return { ok: false, error: "File troppo grande (max 20MB)." };

  const db = createServiceClient();
  const nomeSicuro = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${rootOfferId}/${Date.now()}_${nomeSicuro}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await db.storage
    .from("allegati-richieste")
    .upload(path, buffer, { contentType: file.type || "application/octet-stream" });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { error } = await db.schema("sales_ai").rpc("aggiungi_allegato", {
    p_request_id: null,
    p_root_offer_id: rootOfferId,
    p_nome_file: file.name,
    p_tipo_file: file.type || null,
    p_dimensione_kb: Math.round(file.size / 1024),
    p_storage_path: path,
    p_user: user.id,
  });
  if (error) {
    await db.storage.from("allegati-richieste").remove([path]);
    return { ok: false, error: error.message };
  }

  try {
    await smaltisciCoda(db);
  } catch {
    /* l'allegato è salvato comunque */
  }

  revalidatePath(`/offerte/${offerNumber}`);
  return { ok: true };
}

export async function submitAnalysisFeedback(analysisId: string, result: string, offerNumber: string) {
  const authed = await createClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  const { error } = await db.schema("sales_ai").from("ai_feedback").insert({
    analysis_id: analysisId,
    result,
    user_id: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/offerte/${offerNumber}`);
  return { ok: true };
}
