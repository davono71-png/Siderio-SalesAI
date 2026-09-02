import { optionsResponse, jsonResponse, errorResponse } from '../../../../lib/sales-ai/http.js';
import { authorizeWorker } from '../../../../lib/sales-ai/authorization.js';
import { createServiceClient } from '../../../../lib/sales-ai/supabase.js';
import { triageInboxBatch } from '../../../../lib/sales-ai/inboxTriage.js';

// Stesso principio di process-next: invocazioni brevi e frequenti via
// pg_cron invece di un lotto grande a rischio di superare il tetto di
// durata di Vercel (60s). Lotto più piccolo di quello del pulsante manuale
// (10 invece di 15) proprio per questo.
export const maxDuration = 60;

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request) {
  try {
    authorizeWorker(request);
    const db = createServiceClient();
    const result = await triageInboxBatch(db, { quante: 10 });
    return jsonResponse({ status: 'OK', ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
