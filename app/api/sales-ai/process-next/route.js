import { optionsResponse, jsonResponse, errorResponse } from '../../../../lib/sales-ai/http.js';
import { authorizeWorker } from '../../../../lib/sales-ai/authorization.js';
import { createServiceClient } from '../../../../lib/sales-ai/supabase.js';
import { claimNextJob, completeJob, failOrRetryJob } from '../../../../lib/sales-ai/jobs.js';
import { runAnalysis } from '../../../../lib/sales-ai/engine.js';

// Un solo job per invocazione: sul piano Vercel in uso le funzioni hanno un
// tetto di durata (60s), quindi meglio tante invocazioni corte via pg_cron
// che una lunga a rischio di essere interrotta a metà.
export const maxDuration = 60;

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request) {
  let job = null;
  const db = createServiceClient();

  try {
    authorizeWorker(request);
    job = await claimNextJob(db);
    if (!job) return jsonResponse({ status: 'NO_JOB' });

    const analysis = await runAnalysis(db, job);
    await completeJob(db, job.id, analysis.analysis_id);

    return jsonResponse({ status: 'COMPLETED', job_id: job.id, analysis });
  } catch (error) {
    if (job?.id) {
      try {
        const retry = await failOrRetryJob(db, job, error);
        return jsonResponse({ error: error?.message || 'Analisi fallita', job_id: job.id, retry }, 500);
      } catch (jobError) {
        console.error('Impossibile aggiornare lo stato del job', jobError);
      }
    }
    return errorResponse(error);
  }
}
