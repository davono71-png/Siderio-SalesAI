# EVALUATION_PLAN — Fase 2, NON eseguire ora

## Obiettivo del test

Misurare se Sales AI, analizzando un'offerta senza conoscere la decisione operativa presa dall'umano, arriva alla stessa decisione.

## Campione

**REQUISITO DECISO** — circa 30-50 offerte reali.

## Protocollo

1. Per ciascuna offerta del campione, viene registrata **prima** la decisione operativa del commerciale umano (riferimento primario: **Mattia**), usando la stessa struttura di `sales_ai.offer_analysis.human_decision` (vedi `DATA_MODEL.md`).
2. L'AI analizza gli stessi casi **senza conoscere** quella decisione, producendo un risultato nello schema di `AI_FUTURE_ARCHITECTURE.md`, salvato in `offer_analysis_ai_meta.ai_result`.
3. **Davide** interviene come secondo valutatore nei casi dubbi o riguardanti aspetti più generali del processo aziendale.

## KPI principale

Percentuale di casi in cui il `status`/`next_action` proposto da Sales AI coincide con la decisione operativa del commerciale umano.

## Prerequisiti da Fase 1

Perché questo test sia eseguibile, la struttura dati di Fase 1 deve già permettere:

- di registrare `human_decision` separatamente da `ai_result` per la stessa offerta (garantito da `offer_analysis` + `offer_analysis_ai_meta`, 1:N — più valutazioni nel tempo per la stessa offerta);
- di distinguere valutatori diversi (Mattia vs Davide) — richiede che `offer_analysis.created_by` sia sempre valorizzato correttamente, coerente con l'autenticazione condivisa descritta in `AUTH.md`.

## Non ancora definito (Fase 2)

- Criterio esatto di "coincidenza" tra decisione AI e decisione umana (uguaglianza esatta su `status`? su `next_action`? tolleranza sulla data?) — **DA DECIDERE** quando si arriverà alla Fase 2, non bloccante per la Fase 1.
- Soglia di accuratezza minima per considerare l'AI affidabile — **DA DECIDERE**.
