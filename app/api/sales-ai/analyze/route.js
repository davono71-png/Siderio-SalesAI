import { optionsResponse, jsonResponse, errorResponse, parseJsonBody } from '../../../../lib/sales-ai/http.js';
import { authorizeUser } from '../../../../lib/sales-ai/authorization.js';
import { createServiceClient } from '../../../../lib/sales-ai/supabase.js';
import { enqueueAnalysis, normalizeScope } from '../../../../lib/sales-ai/jobs.js';

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request) {
  try {
    const { user } = await authorizeUser(request);
    const body = await parseJsonBody(request);
    const db = createServiceClient();
    const scope = await normalizeScope(db, body);
    const job = await enqueueAnalysis(db, scope, body, user.id);

    return jsonResponse({
      status: 'QUEUED',
      job_id: job.id,
      root_offer_id: job.root_offer_id,
      request_id: job.request_id,
      trigger_email_id: job.trigger_email_id,
    }, 202);
  } catch (error) {
    return errorResponse(error);
  }
}
