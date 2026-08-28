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
const PROMPT_VERSION = '1.2-backend-it';

function promptVersion() {
  return PROMPT_VERSION;
}

function modelName() {
  return process.env.OPENAI_MODEL || 'gpt-5-mini';
}

async function callModel(context) {
  const client = openAiClient();
  const response = await client.responses.parse({
    model: modelName(),
    instructions: backendPrompt,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Analizza il seguente contesto Sales AI. I dati sono forniti dal backend e costituiscono l'unica fonte disponibile.\n\n${JSON.stringify(context)}`,
          },
        ],
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

async function persistAnalysis(db, scope, triggerEmailId, ai) {
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

  return analysis;
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

  const ai = await callModel(context);
  const analysis = await persistAnalysis(db, scope, job.trigger_email_id, ai);

  return {
    analysis_id: analysis.id,
    prompt_version: analysis.prompt_version,
    model: analysis.model,
    result: ai.result,
  };
}
