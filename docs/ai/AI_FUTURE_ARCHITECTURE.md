# AI_FUTURE_ARCHITECTURE — Fase 2, NON implementare ora

Questo documento descrive intenzioni progettuali per la Fase 2. Nessun elemento qui va implementato in Fase 1.

## Meccanismo previsto

**REQUISITO DECISO (26/08/2026)** — l'interpretazione AI userà **API dirette Anthropic e/o OpenAI**, non il connettore MCP usato in fase di progettazione per leggere i dati di Suite. Questa decisione riguarda solo come il livello AI verrà costruito in Fase 2; non cambia il meccanismo di accesso ai dati di Suite descritto in `SUITE_INTEGRATION.md`.

## Principio

L'AI non deve produrre solo testo libero: deve restituire dati strutturati, verificabili, con citazione delle fonti (evidence). Schema concettuale proposto dal documento progettuale (**PROPOSTA, non definitiva**):

```json
{
  "situation": "...",
  "status": "followup",
  "priority": "medium",
  "waiting_for": "customer",
  "action_owner": "siderio",
  "next_action": "send_followup",
  "next_action_date": "2026-09-03",
  "reason": "...",
  "confidence": 0.87,
  "evidence": []
}
```

`status`, `priority`, `waiting_for`, `action_owner` devono restare coerenti con i valori usati in `sales_ai.offer_local_state` (vedi `docs/architecture/DATA_MODEL.md`), così che l'output AI sia direttamente confrontabile con le decisioni umane storiche.

## Evidence

Il campo `evidence` deve permettere di risalire a quali note, email o eventi l'AI ha basato la propria conclusione (es. "l'AI ritiene che si attende il cliente perché nella mail del 27/08 il cliente indica che discuterà l'offerta con la proprietà"). Per essere citabili in Fase 2, le fonti devono avere identificatori stabili già in Fase 1: `email_messaggi.id` (Suite) e `offer_analysis.analysis_id` (Sales AI) sono già adatti a questo scopo — nessuna modifica necessaria in Fase 1, ma va tenuto presente nel design delle schermate/API di Fase 1 che ogni nota/email mostrata deve portare con sé il proprio ID.

## Regole software + AI

La priorità non sarà mai decisa esclusivamente dall'AI. L'architettura di Fase 2 dovrà combinare regole software (es. valore economico, cliente strategico, giorni trascorsi, data promessa superata) con l'interpretazione AI — nessun algoritmo definitivo è definito ora.

## Prompt versioning

Ogni chiamata AI in Fase 2 dovrà registrare la versione del prompt usata (campo `prompt_version` in `sales_ai.offer_analysis_ai_meta`, vedi `DATA_MODEL.md`), per poter correlare i risultati alle iterazioni del prompt durante la calibrazione.

## Human-in-the-loop

Nessuna email inviata autonomamente, nessuna decisione commerciale presa automaticamente, anche dopo l'introduzione dell'AI. L'AI propone (`next_action`, `reason`, `evidence`); il commerciale decide.
