import { optionsResponse, jsonResponse, errorResponse, httpError } from '../../../../lib/sales-ai/http.js';
import { authorizeUser } from '../../../../lib/sales-ai/authorization.js';
import { createServiceClient } from '../../../../lib/sales-ai/supabase.js';
import { resolveRootOfferId } from '../../../../lib/sales-ai/context.js';

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request) {
  try {
    await authorizeUser(request);
    const db = createServiceClient();
    const salesDb = db.schema('sales_ai');

    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('request_id');
    const offerCandidate = searchParams.get('root_offer_id') || searchParams.get('offer_id');
    if (Boolean(requestId) === Boolean(offerCandidate)) {
      throw httpError(400, 'Specificare request_id oppure root_offer_id/offer_id');
    }

    const scope = requestId
      ? { request_id: requestId, root_offer_id: null }
      : { request_id: null, root_offer_id: await resolveRootOfferId(db, offerCandidate) };

    let analysisQuery = salesDb.from('ai_analyses').select('*').order('created_at', { ascending: false }).limit(1);
    analysisQuery = scope.request_id
      ? analysisQuery.eq('request_id', scope.request_id)
      : analysisQuery.eq('root_offer_id', scope.root_offer_id);
    const { data: analyses, error: analysisError } = await analysisQuery;
    if (analysisError) throw analysisError;
    const analysis = analyses?.[0] || null;

    let actionsQuery = salesDb.from('open_actions').select('*').eq('status', 'OPEN').order('created_at', { ascending: true });
    actionsQuery = scope.request_id
      ? actionsQuery.eq('request_id', scope.request_id)
      : actionsQuery.eq('root_offer_id', scope.root_offer_id);
    const { data: actions, error: actionError } = await actionsQuery;
    if (actionError) throw actionError;

    return jsonResponse({ scope, analysis, open_actions: actions || [] });
  } catch (error) {
    return errorResponse(error);
  }
}
