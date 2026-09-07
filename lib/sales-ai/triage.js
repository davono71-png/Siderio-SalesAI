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

// Tassonomia a 8 categorie (spec 03.09.2026): le 4 originali restavano
// troppo larghe e finivano per marcare "commerciale" qualunque email con un
// cliente, un fornitore o un ordine dentro. NEWSLETTER/SPAM confluisce in
// NOT_COMMERCIAL (comportamento invariato), "Da classificare" resta UNCERTAIN.
export const EmailTriageSchema = z.object({
  classification: z.enum([
    'NEW_REQUEST', // Nuova richiesta commerciale -> crea una Request
    'EXISTING_OPPORTUNITY', // Opportunità esistente -> collega all'offerta
    'OFFER_CONFIRMED', // Conferma di offerta -> il cliente accetta un preventivo
    'CUSTOMER_ORDER', // Ordine cliente acquisito -> collega a commessa, non crea Request
    'SUPPLIER_ORDER', // Ordine a fornitore -> fuori dalla pipeline vendite
    'ADMINISTRATIVE', // Amministrativa o di servizio -> esclusa dalla pipeline
    'NOT_COMMERCIAL', // Newsletter/spam o comunque non commerciale
    'UNCERTAIN', // Segnali insufficienti o contrastanti
  ]),
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
// conosciamo, cosa scrive, se ha allegato qualcosa — e, dalla Fase 2 in poi,
// il risultato del match deterministico (lib/sales-ai/triageMatch.js) contro
// offerte, commesse e thread già noti a Suite. Il modello non deve indovinare
// i riferimenti: li riceve già trovati, e giudica solo la FASE del contenuto
// (identificazione fatta, qui si decide cosa significa il messaggio).
function componiInput(email, contesto) {
  const allegati = Array.isArray(email.allegati) ? email.allegati : [];
  return JSON.stringify({
    mittente: email.da || null,
    casella_ricevente: email.casella || null,
    oggetto: email.oggetto || null,
    data: email.created_at || null,
    allegati: allegati.map((a) => a?.nome).filter(Boolean),
    corpo: troncaCorpo(email.corpo),
    contesto_suite: contesto
      ? {
          controparte: contesto.controparte?.classe || 'sconosciuta',
          cliente_riconosciuto: contesto.controparte?.cliente_nome || null,
          fornitore_riconosciuto: contesto.controparte?.fornitore_nome || null,
          continuita_thread: contesto.thread || null,
          numeri_trovati_nel_testo: contesto.numeri_trovati || [],
          offerte_candidate: contesto.offerta || null,
          commesse_candidate: contesto.commessa || null,
        }
      : null,
  }, null, 2);
}

export async function classificaEmail(email, contesto = null) {
  const response = await client().responses.parse({
    model: modelName(),
    instructions: triagePrompt,
    input: [{ role: 'user', content: [{ type: 'input_text', text: componiInput(email, contesto) }] }],
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

// Dove finisce l'email dopo il verdetto.
// - NOT_COMMERCIAL, ADMINISTRATIVE, SUPPLIER_ORDER: se il modello è sicuro,
//   escono subito dalla coda operativa senza intervento umano — stesso
//   trattamento dello sfoltimento deterministico di triage_ingest(). Sotto
//   soglia restano TO_REVIEW: un fornitore scartato per errore costa più di
//   un'email in più da guardare.
// - CUSTOMER_ORDER: non alimenta mai la pipeline di pre-vendita (per
//   definizione non è un'opportunità), quindi esce comunque dalla coda;
//   resta TO_REVIEW solo se non abbiamo nemmeno un candidato di commessa a
//   cui agganciarla, per non perderne la tracciabilità.
// - Tutte le altre (NEW_REQUEST, EXISTING_OPPORTUNITY, OFFER_CONFIRMED,
//   UNCERTAIN): sempre TO_REVIEW, l'azione è sempre di una persona.
export function statoDopoClassificazione(classification, confidence, contesto = null) {
  const sicura = Number(confidence) >= SOGLIA_FIDUCIA;

  if (classification === 'NOT_COMMERCIAL') return sicura ? 'DISMISSED' : 'TO_REVIEW';
  if (classification === 'ADMINISTRATIVE') return sicura ? 'DISMISSED' : 'TO_REVIEW';
  if (classification === 'SUPPLIER_ORDER') return sicura ? 'DISMISSED' : 'TO_REVIEW';
  if (classification === 'CUSTOMER_ORDER') {
    const haCandidato = contesto?.commessa?.candidati?.length > 0;
    return haCandidato ? 'DISMISSED' : 'TO_REVIEW';
  }
  return 'TO_REVIEW';
}
