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

## Punti aperti dopo questa revisione

Vedi le sezioni "DA DECIDERE" in `REQUIREMENTS.md`, `SUITE_INTEGRATION.md` e `DATA_MODEL.md`. In sintesi:

- Come tracciare la "revisione" di un'offerta (non trovata una colonna dedicata in `offers`).
- Mismatch di tipo `offerte_allegati.offerta_id` (text) vs `offers.id` (uuid).
- Come normalizzare `offers.agente` (testo libero) rispetto agli utenti reali (`profili_utenti`).
- Se e come Sales AI potrà mai scrivere su tabelle di Suite (oggi: nessuna scrittura prevista, solo lettura tramite viste dedicate).
- Ambiente di staging separato da produzione, dato che si useranno dati reali fin dalla Fase 1.
