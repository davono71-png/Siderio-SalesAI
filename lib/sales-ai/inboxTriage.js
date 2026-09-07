import { classificaEmail, statoDopoClassificazione, TRIAGE_PROMPT_VERSION } from './triage.js';
import { costruisciContestoMatch, candidatoCerto } from './triageMatch.js';

// Un solo lotto di smistamento, condiviso dal pulsante manuale
// (app/(app)/inbox/actions.ts) e dal worker pg_cron
// (app/api/sales-ai/triage-inbox): prima erano due copie della stessa
// logica che rischiavano di divergere silenziosamente.
export async function triageInboxBatch(db, { quante = 15 } = {}) {
  const { error: ingestError } = await db.schema('sales_ai').rpc('triage_ingest', { p_limit: 500 });
  if (ingestError) throw ingestError;

  // Riclassificazione storico (Fase 3, Rev.2 §2): rimette in coda le righe
  // mai confermate da una persona e ancora ferme a un prompt_version
  // superato. Stesso lotto, stesso worker: lo storico si ripulisce da solo,
  // senza un comando separato — vedi riconcilia_storico() per i dettagli.
  const { error: riconciliaError } = await db
    .schema('sales_ai')
    .rpc('riconcilia_storico', { p_prompt_version: TRIAGE_PROMPT_VERSION, p_limit: 500 });
  if (riconciliaError) throw riconciliaError;

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
    .select('id, da, oggetto, corpo, allegati, created_at, account_id, message_id, in_reply_to, riferimenti')
    .in('id', ids);
  if (mailError) throw mailError;

  let analizzate = 0;
  let falliti = 0;

  for (const mail of emails ?? []) {
    try {
      const contesto = await costruisciContestoMatch(db, mail);
      const esito = await classificaEmail(
        {
          da: mail.da,
          oggetto: mail.oggetto,
          corpo: mail.corpo,
          allegati: mail.allegati,
          created_at: mail.created_at,
        },
        contesto
      );

      const patch = {
        classification: esito.classification,
        confidence: esito.confidence,
        reason: esito.reason,
        triage_status: statoDopoClassificazione(esito.classification, esito.confidence, contesto),
        model: esito.model,
        prompt_version: esito.prompt_version,
        analyzed_at: new Date().toISOString(),
      };

      // Match certo (numero esplicito, un solo candidato): propone il
      // collegamento da solo, ma resta una PROPOSTA — root_offer_id/
      // commessa_id valorizzati fanno comparire il tag nella Inbox, la
      // scrittura ufficiale su email_offerta/email_commessa resta un'azione
      // umana (confermaMatchOfferta e equivalenti), come per ogni altro match.
      if (esito.classification === 'OFFER_CONFIRMED' || esito.classification === 'EXISTING_OPPORTUNITY') {
        const offerta = candidatoCerto(contesto.offerta);
        if (offerta) patch.root_offer_id = offerta.root_offer_id ?? offerta.id;
      } else if (esito.classification === 'CUSTOMER_ORDER') {
        const commessa = candidatoCerto(contesto.commessa);
        if (commessa) patch.commessa_id = commessa.id;
      }

      const { error } = await db.schema('sales_ai').from('email_triage').update(patch).eq('email_id', mail.id);

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
