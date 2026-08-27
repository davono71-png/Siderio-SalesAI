// Helper HTTP per i Route Handler App Router (Request/Response nativi), non
// per lo stile (req,res) delle Vercel Functions "classiche".

export function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.SALES_AI_ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-sales-ai-cron-secret',
    Vary: 'Origin',
  };
}

export function optionsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function jsonResponse(data, status = 200) {
  return Response.json(data, { status, headers: corsHeaders() });
}

export function errorResponse(error, fallbackStatus = 500) {
  const status = Number(error?.statusCode || fallbackStatus);
  const message = error?.message || 'Errore interno';
  return Response.json({ error: message }, { status, headers: corsHeaders() });
}

export async function parseJsonBody(request) {
  const text = await request.text();
  return text.trim() ? JSON.parse(text) : {};
}
