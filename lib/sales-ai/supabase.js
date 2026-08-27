// Client Supabase per le API route di Sales AI. Deliberatamente separato da
// lib/supabase/* (quello serve i Server Component/Actions con sessione via
// cookie, tramite @supabase/ssr): qui l'autenticazione arriva come Bearer
// token nell'header, quindi serve un client stateless, non legato ai cookie
// della richiesta.
//
// L'URL viene riusato da lib/supabase/config.ts invece che da process.env:
// un valore Vercel mascherato ("copiato dalla dashboard prima di premere
// reveal") resta comunque "truthy" e vincerebbe silenziosamente su un
// fallback — già successo una volta su questo stesso progetto.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase/config';

export function createAuthClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Variabile ambiente mancante: SUPABASE_SERVICE_ROLE_KEY');
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
