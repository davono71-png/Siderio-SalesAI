# SUITE_INTEGRATION — contratto di accesso ai dati di Suite

Fonte: ispezione dello schema reale del progetto Supabase `Siderio-Suite_2` (26/08/2026), schema `public`. Da validare con Mattia, che conosce il funzionamento applicativo di Suite meglio di quanto un'ispezione dello schema possa rivelare.

## Meccanismo di accesso (PROPOSTA)

Sales AI non esegue query libere su `public.*`. Espone/consuma un piccolo numero di funzioni/viste con contratto esplicito, versionato in questo documento:

1. `get_offer_context(offer_number text)` → dettaglio completo di una singola offerta (vedi sotto).
2. `search_offers(query text)` → ricerca offerte per numero/cliente (per la fase di ricerca, se serve oltre all'inserimento diretto del numero).

Ogni funzione/vista aggiunta o modificata va registrata qui con la data.

## Contratto: `get_offer_context`

| Campo esposto | Origine (schema `public` di Suite) | Tipo | Note |
|---|---|---|---|
| `offer_id` | `offers.id` | uuid | chiave interna |
| `offer_number` | `offers.offer_number` | text | chiave esterna/di ricerca — REQUISITO DECISO |
| `status` | `offers.status` | enum (draft/sent/accepted/rejected) | |
| `title` | `offers.title` | text | |
| `work_description` | `offers.work_description_final` | text | |
| `final_price_net` / `final_price_vat` | `offers.final_price_net` / `final_price_vat` | numeric | |
| `agente` | `offers.agente` | text | vincolato a `agenti.denominazione` a livello applicativo, non da FK — vedi "Gap" sotto |
| `created_at` | `offers.created_at` | timestamptz | |
| `sent_at` | `offers.sent_at` | timestamptz | |
| `accepted_at` | `offers.accepted_at` | timestamptz | |
| `internal_notes` | `offers.internal_notes` | text | |
| `followup_notes` / `followup_secondo_richiamo` / `followup_sospesa` | `offers.*` | text/date/bool | reminder attuale di Suite — la sua gestione passa a Sales AI, vedi "Gap" punto 4 |
| `client` | `clients.display_name`, `company_name`, `contact_person`, `email`, `phone`, `address` | join su `offers.client_id = clients.id` | |
| `emails` | `email_messaggi` filtrate per `offerta_id = offers.id` | lista | campi: `da`, `destinatari`, `oggetto`, `corpo`, `direzione`, `created_at`, `allegati` |
| `attachments` | `offerte_allegati` filtrate per `offerta_id::uuid = offers.id` | lista | cast esplicito richiesto — vedi "Gap" punto 2 |
| `revision` | — | — | non ancora presente in Suite, in arrivo — vedi "Gap" punto 1 |

## Gap tecnici trovati

1. **Revisione offerta — DA FARE lato Suite (non blocca Fase 1 Sales AI)**. Confermato (Davide, 26/08/2026): non esiste ancora nessuna colonna/traccia di revisione in `offers`, ed è un problema che va gestito **in Siderio Suite**, non in Sales AI. Finché Suite non espone questo dato, il contratto `get_offer_context` non include `revision` (lo si aggiungerà quando disponibile). Nessuna azione richiesta a Sales AI oggi.

2. **Mismatch di tipo `offerte_allegati.offerta_id` — chiarito, non bloccante.** Verifica sui dati reali (26/08/2026): `offerte_allegati.offerta_id` è `text` ma contiene sempre lo stesso valore di `offers.id` (uuid) scritto come stringa — non è l'`offer_number` né altro. Su 80 righe totali, 79 fanno match castando `offerta_id::uuid = offers.id`; **1 riga è orfana** (non corrisponde a nessuna offerta esistente, verosimilmente un record di test o un'offerta cancellata). Il contratto quindi: fa il cast `offerta_id::uuid`, e tratta eventuali righe orfane con un semplice LEFT JOIN (nessun allegato mostrato, nessun errore). Non serve alcuna modifica allo schema di Suite.

3. **`agente` come testo libero — chiarito, non bloccante.** Verifica sui dati reali (26/08/2026): `offers.agente` corrisponde quasi sempre a `agenti.denominazione` (join testuale: 8 valori distinti su 9 trovano corrispondenza esatta in `agenti`; un solo valore, "Pinocchio", è un'anomalia — verosimilmente dato di test — senza corrispondenza). Confermato da Davide: l'anagrafica `agenti` **vincola già** il valore in fase di creazione offerta (si inserisce prima l'agente in anagrafica, poi diventa selezionabile) — la mancanza è solo di una FK formale a livello di database, non di un vincolo applicativo. **PROPOSTA**: Sales AI risolve `agente` con un join testuale su `agenti.denominazione` per Fase 1; nessuna azione richiesta a Suite. Se in futuro Suite aggiunge una vera FK (`agente_id`), il contratto va aggiornato di conseguenza.

4. **Reminder follow-up — la sua gestione passa a Sales AI (REQUISITO DECISO 26/08/2026).** Oggi Suite ha un meccanismo minimo di reminder: `offers.followup_secondo_richiamo` (data), `offers.followup_notes` (testo), `offers.followup_sospesa` (bool). Confermato da Davide: questa gestione **si trasferisce dentro Sales AI** — coincide esattamente con `sales_ai.offer_local_state.next_action_date`/`reason` già previsti in `DATA_MODEL.md`. Dati reali (26/08/2026): su 108 offerte, 74 hanno già una data di richiamo impostata e 56 hanno note di follow-up — è uno storico non banale.
   - **REQUISITO DECISO (26/08/2026)** — fase transitoria: `sales_ai.offer_local_state` (`next_action_date`/`reason`) parte come **copia** dei campi `followup_*` di Suite, importata al primo avvio (74+56 valori storici) e poi risincronizzata finché Suite resta scrivibile su quei campi. Sales AI diventa il gestore effettivo (fonte di verità) del follow-up solo in un secondo momento; il momento esatto del passaggio e la disattivazione della scrittura lato Suite restano da fissare più avanti, non bloccano la Fase 1.

5. **Email non ancora collegate a un'offerta** — `email_messaggi.offerta_id` è nullable: non tutte le email sono necessariamente agganciate a un'offerta specifica (alcune sono agganciate solo a `commessa_id`/`ordine_id`). Il contesto offerta mostrerà solo le email con `offerta_id` valorizzato; eventuali email pre-conversione collegate solo al cliente restano fuori scope in Fase 1, salvo diversa decisione.
6. **Cronologia essenziale** — il documento chiede una "cronologia essenziale" nel contesto offerta. Non esiste una tabella di eventi/audit dedicata alle offerte (esiste `audit_logs`, generica, 0 righe attualmente). **DA DECIDERE**: cosa compone la cronologia in Fase 1 — proposta minima: `created_at`, `sent_at`, `accepted_at`, cambi di `status` (se non tracciati, la cronologia in Fase 1 sarà limitata a questi tre timestamp più lo storico `offer_analysis` di Sales AI).

## Fuori contratto (esplicitamente non esposto in Fase 1)

- Nessun accesso a tabelle di produzione/commesse (`commesse`, `fasi_commessa`, `ordini_fornitore`, ecc.) — fuori scope del primo obiettivo funzionale (contesto di una singola offerta).
- Nessuna scrittura verso `public.*` da parte di Sales AI in Fase 1.
