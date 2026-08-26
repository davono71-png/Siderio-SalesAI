# ROADMAP di massima

Sequenza di partenza, non vincolante nei tempi. Ogni fase è subordinata al completamento e all'approvazione della precedente.

## FASE 0 — Progettazione (IN CORSO)

- [x] Analisi requisiti e prima revisione con Davide/Mattia (26/08/2026)
- [x] Ispezione schema dati reale di Siderio Suite (progetto Supabase `Siderio-Suite_2`)
- [x] Documentazione: struttura `/docs`, `AGENTS.md`
- [ ] Architettura approvata
- [ ] Contratto di accesso Suite → Sales AI definito (`SUITE_INTEGRATION.md`)
- [ ] Modello dati definito (`DATA_MODEL.md`)
- [ ] Autenticazione definita (`AUTH.md`)
- [ ] Punti "DA DECIDERE" residui chiusi (vedi `DECISIONS.md`)

## FASE 1 — Fondamenta applicative

- Creare applicazione Sales AI (Next.js, coerente con hosting Vercel già collegato).
- Collegamento al sistema di autenticazione Siderio (Supabase Auth condiviso).
- Collegamento controllato con Suite (viste/funzioni sullo schema condiviso, non accesso libero).
- Recupero di una singola offerta tramite numero offerta.
- Visualizzazione completa del contesto dell'offerta (dati, cliente/contatto, note, email, cronologia essenziale).
- Schema dati Sales AI (`sales_ai`) nello stesso progetto Supabase di Suite.
- Storico minimo delle valutazioni (gestito manualmente in questa fase).
- Gestione manuale di stato/priorità/prossima azione, se utile ai test.

Nessuna interpretazione AI in questa fase.

## FASE 2 — Intelligenza

- Integrazione Anthropic/OpenAI (via API dirette — non tramite il connettore MCP usato oggi per l'accesso ai dati di Suite in fase di progettazione).
- Definizione schema strutturato di risposta (proposta iniziale in `docs/ai/AI_FUTURE_ARCHITECTURE.md`).
- Prompt versionato.
- Evidence/citazioni delle informazioni utilizzate (note, email, eventi con ID stabili).
- Combinazione regole software + interpretazione AI per la priorità.
- Test su 30-50 offerte reali (piano in `docs/ai/EVALUATION_PLAN.md`).
- Confronto Mattia (riferimento primario) vs Sales AI, Davide come secondo valutatore sui casi dubbi.
- Correzione e calibrazione.

## FASE 3 — Dashboard

Solo dopo che l'analisi della singola offerta è affidabile:

- Dashboard delle situazioni che richiedono attenzione.
- Filtri e priorità.
- Nessuna offerta con azioni nascoste o secondarie.

## FASE 4 — Automazioni

- n8n.
- Rivalutazioni programmate.
- Trigger su nuove email.
- Registrazione rapida delle telefonate.
- Preparazione follow-up.
- Ulteriori automazioni.
