import { optionsResponse, jsonResponse, errorResponse, httpError, parseJsonBody } from '../../../../lib/sales-ai/http.js';
import { authorizeUser } from '../../../../lib/sales-ai/authorization.js';
import { createServiceClient } from '../../../../lib/sales-ai/supabase.js';

const ALLOWED = new Set(['CORRECT', 'PARTIAL', 'WRONG', 'CRITICAL']);

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request) {
  try {
    const { user } = await authorizeUser(request);
    const body = await parseJsonBody(request);

    if (!body.analysis_id) throw httpError(400, 'analysis_id obbligatorio');
    if (!ALLOWED.has(body.result)) throw httpError(400, 'result non valido');

    const db = createServiceClient();
    const { data: analysis, error: checkError } = await db
      .schema('sales_ai')
      .from('ai_analyses')
      .select('id')
      .eq('id', body.analysis_id)
      .maybeSingle();
    if (checkError) throw checkError;
    if (!analysis) throw httpError(404, 'Analisi non trovata');

    const { data, error } = await db.schema('sales_ai').from('ai_feedback').insert({
      analysis_id: body.analysis_id,
      result: body.result,
      notes: body.notes || null,
      corrected_json: body.corrected_json || null,
      user_id: user.id,
    }).select('*').single();
    if (error) throw error;

    return jsonResponse(data, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
