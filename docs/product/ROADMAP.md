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

## FASE 1 — Fondamenta applicative (IN CORSO — prima versione avviata il 26/08/2026)

- [x] Creare applicazione Sales AI (Next.js 16, App Router, coerente con hosting Vercel già collegato).
- [x] Collegamento al sistema di autenticazione Siderio (Supabase Auth condiviso — login email/password, stesse credenziali di Suite).
- [x] Collegamento controllato con Suite (funzioni `sales_ai.get_offer_context`/`sales_ai.search_offers`, `SECURITY DEFINER`, nessun accesso diretto alle tabelle `public.*` — vedi `supabase/migrations/20260826000000_sales_ai_schema.sql`).
- [x] Recupero di una singola offerta tramite numero offerta.
- [x] Visualizzazione completa del contesto dell'offerta (dati, cliente/contatto, note, email, cronologia essenziale).
- [x] Schema dati Sales AI (`sales_ai`) nello stesso progetto Supabase di Suite (`offer_local_state`, `offer_analysis`).
- [ ] Storico minimo delle valutazioni — tabella `sales_ai.offer_analysis` creata, non ancora popolata da alcuna schermata.
- [x] Gestione manuale di stato/priorità/prossima azione (pannello "Stato Sales AI" nella pagina offerta).

Nessuna interpretazione AI in questa fase.

Non ancora fatto in questa prima versione: ricerca full-text oltre a numero/cliente, gestione allegati, sincronizzazione del reminder da `offers.followup_*` (vedi `docs/architecture/SUITE_INTEGRATION.md` gap #4), pagina "Storico valutazioni".

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
