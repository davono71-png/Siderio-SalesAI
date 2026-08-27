"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/sales-ai/supabase.js";
import { enqueueAnalysis, claimNextJob, completeJob, failOrRetryJob } from "@/lib/sales-ai/jobs.js";
import { runAnalysis } from "@/lib/sales-ai/engine.js";
import { resolveRootOfferId } from "@/lib/sales-ai/context.js";

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
