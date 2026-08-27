// Autorizzazione per le API Sales AI, allineata al pattern reale delle API
// Suite (es. api/invia-ordine.js in Siderio-Suite-2): il ruolo si legge da
// profili_utenti con la service role, non chiamando app_has_role(...) da
// JS — quella funzione vive dentro le policy RLS in SQL, non viene invocata
// direttamente dal codice applicativo.
import { createAuthClient, createServiceClient } from './supabase.js';
import { httpError } from './http.js';

// Stessi 4 ruoli che in Suite possono leggere/scrivere offerte ed email
// (vedi RLS su public.offers / public.email_messaggi).
const RUOLI_EDITOR = ['Manager', 'Amministrazione', 'Progettazione', 'Proprietà'];

function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) throw httpError(401, 'Bearer token mancante');
  return header.slice('Bearer '.length).trim();
}

export async function authorizeUser(request) {
  const token = bearerToken(request);
  const auth = createAuthClient();
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data?.user) throw httpError(401, 'Sessione Supabase non valida');

  const service = createServiceClient();
  const { data: profilo } = await service.from('profili_utenti').select('ruolo').eq('id', data.user.id).single();
  if (!profilo || !RUOLI_EDITOR.includes(profilo.ruolo)) {
    throw httpError(403, 'Ruolo non autorizzato per Sales AI');
  }

  return { user: data.user, token };
}

export function authorizeWorker(request) {
  const expected = process.env.SALES_AI_CRON_SECRET;
  const received = request.headers.get('x-sales-ai-cron-secret');
  if (!expected) throw httpError(503, 'SALES_AI_CRON_SECRET non configurato');
  if (!received || received !== expected) throw httpError(401, 'Worker secret non valido');
}
