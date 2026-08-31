import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import backendPrompt from '../../prompts/backend-analysis-v1.1.js';
import { SalesAiOutputSchema } from './schema.js';
import { buildOfferOpportunityContext, buildRequestContext } from './context.js';

function openAiClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY non configurata');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// La versione descrive il prompt qui accanto, quindi vive qui accanto: cambia
// il prompt, si cambia questa riga. NON è configurabile da variabile d'ambiente
// di proposito.
//
// Prima lo era, e SALES_AI_PROMPT_VERSION vinceva sul valore del codice. È una
// trappola silenziosa: l'unico effetto possibile è etichettare le analisi con
// la versione di un prompt diverso da quello che le ha prodotte, e non te ne
// accorgi guardando l'app — te ne accorgi mesi dopo, quando provi a capire su
// quale prompt sono arrivati i feedback negativi. Un valore che può solo far
// mentire i dati non merita di essere configurabile.
const PROMPT_VERSION = '1.3-backend-it-eventi';

function promptVersion() {
  return PROMPT_VERSION;
}

function modelName() {
  return process.env.OPENAI_MODEL || 'gpt-5-mini';
}

async function callModel(context) {
  const client = openAiClient();

  // Le immagini allegate viaggiano come parti di input visivo separate, non
  // dentro il JSON testuale: incollarle lì dentro come base64 sprecherebbe
  // token e il modello non le leggerebbe comunque come immagine.
  const { attachment_images: attachmentImages, ...contextForModel } = context;

  const content = [
    {
      type: 'input_text',
      text: `Analizza il seguente contesto Sales AI. I dati sono forniti dal backend e costituiscono l'unica fonte disponibile.\n\n${JSON.stringify(contextForModel)}`,
    },
  ];

  for (const image of attachmentImages || []) {
    content.push({ type: 'input_image', image_url: image.data_url });
  }

  const response = await client.responses.parse({
    model: modelName(),
    instructions: backendPrompt,
    input: [
      {
        role: 'user',
        content,
      },
    ],
    text: {
      format: zodTextFormat(SalesAiOutputSchema, 'siderio_sales_ai_output_v1_1'),
    },
  });

  if (!response.output_parsed) {
    const details = response.incomplete_details ? JSON.stringify(response.incomplete_details) : 'output_parsed nullo';
    throw new Error(`OpenAI non ha restituito un output strutturato valido: ${details}`);
  }

  return {
    result: response.output_parsed,
    responseId: response.id,
    usage: response.usage || null,
  };
}

async function supersedeOldOpenActions(salesDb, scope) {
  let query = salesDb.from('open_actions').update({ status: 'SUPERSEDED' }).eq('status', 'OPEN');
  if (scope.root_offer_id) query = query.eq('root_offer_id', scope.root_offer_id);
  if (scope.request_id) query = query.eq('request_id', scope.request_id);
  const { error } = await query;
  if (error) throw error;
}

async function persistAnalysis(db, scope, triggerEmailId, ai, snapshot) {
  const salesDb = db.schema('sales_ai');

  const row = {
    root_offer_id: scope.root_offer_id || null,
    request_id: scope.request_id || null,
    trigger_email_id: triggerEmailId || null,
    prompt_version: promptVersion(),
    model: modelName(),
    classification: ai.result.classification,
    confidence: ai.result.confidence,
    result_json: ai.result,
    openai_response_id: ai.responseId || null,
    usage_json: ai.usage || null,
    context_snapshot: snapshot || null,
  };

  const { data: analysis, error } = await salesDb.from('ai_analyses').insert(row).select('*').single();
  if (error) throw error;

  await supersedeOldOpenActions(salesDb, scope);

  if (ai.result.open_actions?.length) {
    const actionRows = ai.result.open_actions.map((action) => ({
      analysis_id: analysis.id,
      root_offer_id: scope.root_offer_id || null,
      request_id: scope.request_id || null,
      actor: action.actor,
      action_type: null,
      description: action.description,
      due_date: action.due_date,
      blocking: action.blocking,
      status: 'OPEN',
    }));
    const { error: actionError } = await salesDb.from('open_actions').insert(actionRows);
    if (actionError) throw actionError;
  }

  // Rev.1 §13.3: "Sales AI imposta l'esito commerciale" — la fonte è
  // l'ultima classificazione del motore, non una scelta manuale. Solo per
  // le analisi con scope offerta: le richieste non hanno un esito
  // commerciale WON/LOST separato.
  if (scope.root_offer_id) {
    const { error: lifecycleError } = await salesDb.rpc('sync_offer_commercial_status', {
      p_root_offer_id: scope.root_offer_id,
      p_opportunity_status: ai.result.commercial?.opportunity_status || null,
    });
    if (lifecycleError) throw lifecycleError;
  }

  return analysis;
}

// Stato tecnico dell'offerta corrente (ultima revisione) al momento in cui
// il contesto è stato costruito — Rev.1 §08: la valutazione deve poter
// essere confrontata a posteriori con i dati reali che l'hanno prodotta.
function buildOfferSnapshot(context) {
  const offers = context?.offers || [];
  if (!offers.length) return null;
  const current = offers.reduce((a, b) => ((b.revision_number ?? 0) > (a.revision_number ?? 0) ? b : a));
  return {
    offer_id: current.id,
    status: current.status,
    revision_number: current.revision_number ?? 0,
    sent_at: current.sent_at,
    accepted_at: current.accepted_at,
    updated_at: current.updated_at,
  };
}

// Se lo stato dell'offerta è cambiato tra l'inizio della costruzione del
// contesto e la risposta del modello (chiamata OpenAI: qualche secondo),
// la valutazione appena prodotta descrive un'offerta che nel frattempo è
// già cambiata. Non la scartiamo — il job ha comunque un costo — ma la
// marchiamo esplicitamente invece di lasciarla sembrare aggiornata.
async function markStaleIfOfferChanged(db, snapshot) {
  if (!snapshot?.offer_id) return snapshot;

  const { data: fresh, error } = await db
    .from('offers')
    .select('status, sent_at, accepted_at, updated_at')
    .eq('id', snapshot.offer_id)
    .maybeSingle();
  if (error || !fresh) return snapshot;

  const changed =
    fresh.status !== snapshot.status ||
    fresh.sent_at !== snapshot.sent_at ||
    fresh.accepted_at !== snapshot.accepted_at ||
    fresh.updated_at !== snapshot.updated_at;

  return { ...snapshot, analyzed_at: new Date().toISOString(), stale: changed, current_status_at_completion: changed ? fresh.status : undefined };
}

export async function runAnalysis(db, job) {
  const scope = {
    root_offer_id: job.root_offer_id || null,
    request_id: job.request_id || null,
  };

  let context;
  if (scope.root_offer_id) {
    context = await buildOfferOpportunityContext(db, scope.root_offer_id);
  } else if (scope.request_id) {
    context = await buildRequestContext(db, scope.request_id);
  } else {
    throw new Error('Job senza root_offer_id o request_id');
  }

  const snapshotBefore = scope.root_offer_id ? buildOfferSnapshot(context) : null;
  const ai = await callModel(context);
  const snapshot = snapshotBefore ? await markStaleIfOfferChanged(db, snapshotBefore) : null;

  const analysis = await persistAnalysis(db, scope, job.trigger_email_id, ai, snapshot);

  return {
    analysis_id: analysis.id,
    prompt_version: analysis.prompt_version,
    model: analysis.model,
    result: ai.result,
  };
}
