// Classificatore delle email in ingresso sulle caselle commerciali.
//
// È volutamente separato da engine.js: quello analizza un'OPPORTUNITÀ intera
// (tutta la catena offerte, decine di email, output ricco), questo guarda UNA
// email e risponde a una domanda sola — richiede un'azione commerciale? Sono
// due lavori diversi, con costi diversi: il triage gira su ogni email in
// arrivo, quindi il contesto è corto e l'output minimo.
//
// Il grosso del volume non arriva nemmeno qui: le email dei mittenti in
// posta_mittenti_classe (ESCLUDI/INTERNO/NOTIFICATORE) vengono chiuse come
// NOT_COMMERCIAL da triage_ingest() senza spendere un token, ed è un filtro
// per identità, non per parole chiave.

import OpenAI from 'openai';
import { z } from 'zod/v4';
import { zodTextFormat } from 'openai/helpers/zod';
import triagePrompt from '../../prompts/email-triage-v1.js';

export const TRIAGE_PROMPT_VERSION = '1-triage-it';

// Sopra questa soglia il verdetto vale da solo; sotto si presenta comunque
// all'umano ma senza pretesa. Non scrive mai nulla sulle associazioni
// ufficiali di Suite: quelle le decide una persona.
export const SOGLIA_FIDUCIA = 0.75;

export const EmailTriageSchema = z.object({
  classification: z.enum(['NEW_REQUEST', 'EXISTING_OPPORTUNITY', 'NOT_COMMERCIAL', 'UNCERTAIN']),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

function client() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY non configurata');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function modelName() {
  return process.env.SALES_AI_TRIAGE_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini';
}

function troncaCorpo(corpo) {
  const max = Math.max(500, Number(process.env.SALES_AI_TRIAGE_MAX_CHARS || 3000));
  const testo = String(corpo || '').trim();
  if (testo.length <= max) return testo;
  return `${testo.slice(0, max)}\n[...testo troncato...]`;
}

// Il contesto minimo perché la decisione sia informata: chi scrive, se lo
// conosciamo, cosa scrive, e se ha allegato qualcosa.
function componiInput(email) {
  const allegati = Array.isArray(email.allegati) ? email.allegati : [];
  return JSON.stringify({
    mittente: email.da || null,
    casella_ricevente: email.casella || null,
    oggetto: email.oggetto || null,
    data: email.created_at || null,
    cliente_riconosciuto: email.cliente_riconosciuto || null,
    classe_mittente: email.classe_mittente || null,
    allegati: allegati.map((a) => a?.nome).filter(Boolean),
    corpo: troncaCorpo(email.corpo),
  }, null, 2);
}

export async function classificaEmail(email) {
  const response = await client().responses.parse({
    model: modelName(),
    instructions: triagePrompt,
    input: [{ role: 'user', content: [{ type: 'input_text', text: componiInput(email) }] }],
    text: { format: zodTextFormat(EmailTriageSchema, 'email_triage_v1') },
  });

  const out = response.output_parsed;
  if (!out) throw new Error('Il classificatore non ha restituito un risultato valido');

  return {
    ...out,
    model: modelName(),
    prompt_version: TRIAGE_PROMPT_VERSION,
    openai_response_id: response.id || null,
  };
}

// Dove finisce l'email dopo il verdetto. NOT_COMMERCIAL esce dalla vista
// operativa ma resta in tabella: serve per lo storico e per capire, guardando
// indietro, se il filtro sta scartando cose che non doveva.
export function statoDopoClassificazione(classification) {
  return classification === 'NOT_COMMERCIAL' ? 'DISMISSED' : 'TO_REVIEW';
}
