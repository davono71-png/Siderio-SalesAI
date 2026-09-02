import { classificaEmail, statoDopoClassificazione } from './triage.js';

// Un solo lotto di smistamento, condiviso dal pulsante manuale
// (app/(app)/inbox/actions.ts) e dal worker pg_cron
// (app/api/sales-ai/triage-inbox): prima erano due copie della stessa
// logica che rischiavano di divergere silenziosamente.
export async function triageInboxBatch(db, { quante = 15 } = {}) {
  const { error: ingestError } = await db.schema('sales_ai').rpc('triage_ingest', { p_limit: 500 });
  if (ingestError) throw ingestError;

  const { data: daFare, error: listError } = await db
    .schema('sales_ai')
    .from('email_triage')
    .select('email_id')
    .eq('triage_status', 'TO_ANALYZE')
    .limit(quante);
  if (listError) throw listError;

  const ids = (daFare ?? []).map((r) => r.email_id);
  if (ids.length === 0) return { analizzate: 0, falliti: 0, totale: 0 };

  const { data: emails, error: mailError } = await db
    .from('email_messaggi')
    .select('id, da, oggetto, corpo, allegati, created_at, account_id')
    .in('id', ids);
  if (mailError) throw mailError;

  let analizzate = 0;
  let falliti = 0;

  for (const mail of emails ?? []) {
    try {
      const esito = await classificaEmail({
        da: mail.da,
        oggetto: mail.oggetto,
        corpo: mail.corpo,
        allegati: mail.allegati,
        created_at: mail.created_at,
      });

      const { error } = await db
        .schema('sales_ai')
        .from('email_triage')
        .update({
          classification: esito.classification,
          confidence: esito.confidence,
          reason: esito.reason,
          triage_status: statoDopoClassificazione(esito.classification),
          model: esito.model,
          prompt_version: esito.prompt_version,
          analyzed_at: new Date().toISOString(),
        })
        .eq('email_id', mail.id);

      if (error) falliti += 1;
      else analizzate += 1;
    } catch {
      // Una email che fa fallire il modello non deve bloccare il lotto:
      // resta TO_ANALYZE e verrà ritentata al giro dopo.
      falliti += 1;
    }
  }

  return { analizzate, falliti, totale: ids.length };
}
