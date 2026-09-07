import { optionsResponse, jsonResponse, errorResponse } from '../../../../lib/sales-ai/http.js';
import { authorizeWorker } from '../../../../lib/sales-ai/authorization.js';
import { createServiceClient } from '../../../../lib/sales-ai/supabase.js';
import { triageInboxBatch } from '../../../../lib/sales-ai/inboxTriage.js';

// Stesso principio di process-next: invocazioni brevi e frequenti via
// pg_cron invece di un lotto grande a rischio di superare il tetto di
// durata di Vercel (60s). Lotto più piccolo di quello del pulsante manuale.
//
// Sceso da 10 a 5 quando triageInboxBatch ha iniziato a fare anche il match
// deterministico (lib/sales-ai/triageMatch.js, qualche query in più per
// email prima della chiamata al modello): un lotto di 10 email è arrivato a
// superare il timeout lato pg_net (55s, vedi cron.job), anche se la
// Function su Vercel continuava e completava comunque il lavoro oltre quel
// limite — il chiamante però lo vede come fallito e lo riprova.
export const maxDuration = 60;

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request) {
  try {
    authorizeWorker(request);
    const db = createServiceClient();
    const result = await triageInboxBatch(db, { quante: 5 });
    return jsonResponse({ status: 'OK', ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
