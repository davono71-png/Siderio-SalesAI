# DECISIONS — log delle decisioni progettuali

Formato: data, decisione, chi l'ha presa, note. Una volta presa, una decisione qui registrata è un **REQUISITO DECISO** per tutti i documenti collegati.

## 2026-08-26 — Prima revisione architetturale (Davide)

| # | Decisione | Sostituisce/chiarisce |
|---|---|---|
| 1 | Il database di Sales AI **non è un progetto Supabase separato**: è lo **stesso progetto Supabase di Suite** (`Siderio-Suite_2`), con le tabelle Sales AI in uno **schema Postgres dedicato** (proposta: `sales_ai`), distinto dallo schema `public` di Suite. Sales AI non legge/scrive liberamente le tabelle `public.*` di Suite. | Corregge una lettura iniziale troppo rigida del documento progettuale ("Sales AI avrà un proprio piccolo database... non deve copiare il database di Suite"), che poteva far pensare a un secondo progetto Supabase indipendente. |
| 2 | Le email da mostrare in Sales AI sono quelle che **Suite già collega all'offerta** (`email_messaggi.offerta_id`). Nessuna integrazione Gmail/IMAP separata in Sales AI in Fase 1. Mattia e Jessika continuano a scrivere email da entrambe le app sullo stesso canale sottostante di Suite. | Chiarisce "duplicare la visibilità delle mail" del messaggio iniziale. |
| 3 | Anthropic/OpenAI via API dirette (non MCP) riguardano **solo la Fase 2** (interpretazione AI delle offerte). Non cambiano il meccanismo con cui Sales AI ottiene i dati da Suite in Fase 1. | Chiarisce l'affermazione "non si gestirà con una mcp, ma prevedo delle API con Anthropic o OpenAI". |
| 4 | Login a Sales AI con le **stesse credenziali di Siderio Suite** (stesso Supabase Auth del progetto condiviso). Un solo ruolo applicativo uguale per Mattia, Davide, Jessika, Gianfranco — nessun sistema di permessi granulari in Fase 1. | Chiarisce "accesso con le medesime credenziali", esclude l'ipotesi di login condiviso letterale (stesso username/password per tutti). |
| 5 | La numerazione delle offerte in Sales AI è quella di Suite (`offers.offer_number`). | Conferma esplicita. |
| 6 | Database ospitato in Supabase. | Conferma esplicita. |

## 2026-08-26 — Seconda revisione: chiusura gap tecnici (Davide)

| # | Decisione/chiarimento | Sostituisce/chiarisce |
|---|---|---|
| 7 | La gestione della revisione delle offerte va implementata **in Siderio Suite** (non in Sales AI). Sales AI la consumerà solo quando Suite la espone. | Chiude il gap "manca la colonna revisione" spostandone la responsabilità fuori da Sales AI. |
| 8 | Il mismatch `offerte_allegati.offerta_id` (text) vs `offers.id` (uuid) è puramente di tipo: il campo contiene lo stesso uuid come stringa (verificato sui dati: 79/80 righe corrispondono con un cast, 1 orfana). Si risolve in lettura con `offerta_id::uuid`, nessuna modifica a Suite necessaria. | Chiude il gap #2, prima segnato come "da chiarire". |
| 9 | `offers.agente` è già vincolato in pratica dall'anagrafica `agenti` (si aggiunge l'agente in anagrafica, poi diventa selezionabile in offerta) — confermato dai dati (8/9 valori distinti trovano corrispondenza in `agenti.denominazione`). Sales AI può fare join testuale su `agenti.denominazione` in Fase 1. | Chiude il gap #3, prima segnato come "testo libero non normalizzato". |
| 10 | Il reminder di follow-up oggi in Suite (`followup_secondo_richiamo`, `followup_notes`, `followup_sospesa`) **passa a essere gestito da Sales AI** fin dalla Fase 1. | Rende esplicito e vincolante quanto in `ROADMAP.md` era solo "gestione manuale di stato/prossima azione se utile ai test". |

## Punti aperti dopo questa revisione

Vedi le sezioni "DA DECIDERE" in `REQUIREMENTS.md`, `SUITE_INTEGRATION.md` e `DATA_MODEL.md`. In sintesi:

- Cosa compone la "cronologia essenziale" dell'offerta, non esistendo una tabella di eventi/audit dedicata.
- Se, dopo il passaggio del reminder a Sales AI, i campi `followup_*` di Suite restano scrivibili in parallelo o vengono congelati (incide sul seed iniziale dei dati storici).
- Se e come Sales AI potrà mai scrivere su tabelle di Suite (oggi: nessuna scrittura prevista, solo lettura tramite viste dedicate).
- Ambiente di staging separato da produzione, dato che si useranno dati reali fin dalla Fase 1.
- Email pre-conversione collegate solo al cliente (non a un'offerta specifica): restano fuori scope Fase 1.
