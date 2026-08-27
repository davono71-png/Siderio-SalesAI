import { resolveRootOfferId } from './context.js';
import { httpError } from './http.js';

export async function normalizeScope(db, body) {
  const hasRequest = Boolean(body.request_id);
  const hasOffer = Boolean(body.offer_id || body.root_offer_id);

  if (hasRequest === hasOffer) {
    throw httpError(400, 'Specificare una sola scope: request_id oppure offer_id/root_offer_id');
  }

  if (hasRequest) {
    const { data, error } = await db.schema('sales_ai').from('requests').select('id').eq('id', body.request_id).maybeSingle();
    if (error) throw error;
    if (!data) throw httpError(404, 'Request Sales AI non trovata');
    return { request_id: body.request_id, root_offer_id: null };
  }

  const candidate = body.root_offer_id || body.offer_id;
  const rootOfferId = await resolveRootOfferId(db, candidate);
  return { request_id: null, root_offer_id: rootOfferId };
}

export async function enqueueAnalysis(db, scope, body, userId) {
  const row = {
    root_offer_id: scope.root_offer_id,
    request_id: scope.request_id,
    trigger_email_id: body.trigger_email_id || null,
    status: 'PENDING',
    attempts: 0,
    priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 100,
    created_by: userId || null,
  };

  const { data, error } = await db.schema('sales_ai').from('analysis_jobs').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

export async function claimNextJob(db) {
  const { data, error } = await db.schema('sales_ai').rpc('claim_next_analysis_job');
  if (error) throw error;
  if (!data) return null;
  if (Array.isArray(data)) return data[0] || null;
  return data;
}

export async function completeJob(db, jobId, analysisId) {
  const { error } = await db.schema('sales_ai').from('analysis_jobs').update({
    status: 'COMPLETED',
    analysis_id: analysisId,
    completed_at: new Date().toISOString(),
    last_error: null,
  }).eq('id', jobId);
  if (error) throw error;
}

export async function failOrRetryJob(db, job, error) {
  const maxAttempts = Math.max(1, Number(process.env.SALES_AI_MAX_JOB_ATTEMPTS || 3));
  const attempts = Number(job.attempts || 1);
  const retry = attempts < maxAttempts;

  const patch = {
    status: retry ? 'PENDING' : 'FAILED',
    last_error: String(error?.message || error).slice(0, 5000),
    started_at: null,
    completed_at: retry ? null : new Date().toISOString(),
  };

  const { error: updateError } = await db.schema('sales_ai').from('analysis_jobs').update(patch).eq('id', job.id);
  if (updateError) throw updateError;
  return { retry, attempts, maxAttempts };
}
