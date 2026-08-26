# AGENTS.md — regole permanenti per agenti di sviluppo

Queste regole valgono per qualunque agente (Claude Code o altro) che lavori su questa repository. Sono vincolanti quanto le istruzioni dirette di Davide e Mattia; in caso di conflitto tra una richiesta estemporanea e queste regole, chiedere conferma esplicita prima di procedere.

## Regole di scope

1. **Nessuna integrazione AI/OpenAI/Anthropic per l'interpretazione delle offerte finché la Fase 1 non è completa e approvata.** Vedi `docs/product/ROADMAP.md`. Questo vincolo non riguarda l'uso di Claude Code stesso come strumento di sviluppo.
2. **Siderio Suite resta l'unica fonte ufficiale dei dati.** Non aggiungere logica che duplichi permanentemente dati di Suite (clienti, offerte, importi) in tabelle Sales AI, oltre al riferimento `offer_id`. Vedi `docs/architecture/DATA_MODEL.md`.
3. **Nessun accesso libero alle tabelle `public.*` del progetto Supabase condiviso.** Ogni lettura di dati Suite passa dalle viste/funzioni definite in `docs/architecture/SUITE_INTEGRATION.md`. Se serve un nuovo campo non ancora esposto, aggiornare prima quel contratto (e questo file, se cambia una regola), non aggirarlo con query dirette.
4. **Nessuna scrittura su tabelle `public.*` di Suite** senza autorizzazione esplicita di Davide o Mattia in conversazione — non è sufficiente che sembri utile o ovvio.
5. **Nessun invio email automatico e nessuna decisione commerciale automatica**, in nessuna fase, salvo istruzione esplicita che cambi questa regola.
6. **Un solo ruolo applicativo per Fase 1** — non introdurre permessi differenziati tra utenti senza richiesta esplicita.
7. **Non inventare nuovi stati commerciali** oltre ai 5 definiti in `docs/product/REQUIREMENTS.md` senza prima proporli e farli approvare.

## Regole di processo

8. **Distinguere sempre, in commit/PR/documentazione**: REQUISITO DECISO (confermato dal documento o da Davide/Mattia) vs PROPOSTA (raccomandazione dell'agente) vs DA DECIDERE (richiede decisione umana). Non trasformare una proposta in requisito di propria iniziativa.
9. **Prima di scrivere codice applicativo**, verificare che l'architettura/contratto/modello dati rilevante sia già documentato in `/docs`. Se manca o è ambiguo, aggiornare la documentazione (o chiedere) prima di implementare.
10. **Ogni volta che si scopre un gap tra la documentazione e lo schema reale di Suite** (es. campo mancante, mismatch di tipo), registrarlo in `docs/architecture/SUITE_INTEGRATION.md` sotto "Gap tecnici", non risolverlo silenziosamente con un'assunzione.
11. **Il progetto Supabase di produzione è condiviso con Siderio Suite** (`Siderio-Suite_2`). Qualunque migrazione va applicata solo nello schema `sales_ai` (o quello concordato), mai nello schema `public` di Suite, e va trattata con la stessa cautela di una modifica a un sistema in produzione usato quotidianamente dall'azienda.

## Roadmap di riferimento

Vedi `docs/product/ROADMAP.md`. Non anticipare funzionalità di una fase successiva (es. dashboard, automazioni n8n, interpretazione AI) mentre si lavora sulla fase corrente, salvo istruzione esplicita.
