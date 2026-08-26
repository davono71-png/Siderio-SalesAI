# DATA_MODEL — schema `sales_ai` (PROPOSTA)

Tutte le tabelle vivono nel progetto Supabase `Siderio-Suite_2`, schema dedicato `sales_ai` (nome proposto, da confermare), separato dallo schema `public` di Suite. Nessuna tabella qui duplica dati ufficiali di Suite: si fa riferimento a un'offerta tramite `offer_id` (uuid, = `public.offers.id`), senza copiare cliente/importo/stato.

## `sales_ai.offer_local_state`

Stato "vivo" corrente di un'offerta lato Sales AI — una riga per offerta.

| Colonna | Tipo | Note |
|---|---|---|
| `offer_id` | uuid, PK | riferimento logico a `public.offers.id` (nessuna FK fisica cross-schema per non accoppiare le migrazioni) |
| `status` | text/enum | uno tra: nessuna_azione, da_monitorare, followup_consigliato, attenzione, attesa_programmata — REQUISITO DECISO (set chiuso) |
| `priority` | text/enum | valore impostato manualmente in Fase 1 (bassa/media/alta) — PROPOSTA di valori, algoritmo non implementato ora |
| `action_owner` | text | chi deve materialmente agire (es. "siderio", "none", nome persona) |
| `waiting_for` | text | da chi/cosa si aspetta un evento (es. "customer", "siderio", "none") |
| `next_action` | text | descrizione libera dell'azione successiva |
| `next_action_date` | date | |
| `reason` | text | motivo dello stato/priorità attuale |
| `updated_at` | timestamptz | data ultimo aggiornamento/analisi |
| `updated_by` | uuid | riferimento a `auth.users.id` (utente Sales AI che ha aggiornato) |

**Seed iniziale (PROPOSTA, 26/08/2026)** — al primo popolamento, importare una tantum da Suite: `next_action_date ← offers.followup_secondo_richiamo`, `reason ← offers.followup_notes`, per le offerte che li hanno valorizzati (74 e 56 rispettivamente su 108 offerte, dato reale al 26/08/2026). Coerente con la decisione che la gestione del reminder passa a Sales AI (vedi `docs/product/REQUIREMENTS.md` §3 e `docs/architecture/SUITE_INTEGRATION.md` gap #4). **DA DECIDERE**: se dopo il passaggio i campi `followup_*` di Suite restano scrivibili in parallelo o vengono congelati — se restano scrivibili, questo seed andrebbe ripetuto o Suite andrebbe resa read-only su quei campi.

## `sales_ai.offer_analysis`

Storico delle valutazioni — append-only, una riga per ogni valutazione (manuale oggi, anche AI in futuro).

| Colonna | Tipo | Note |
|---|---|---|
| `analysis_id` | uuid, PK | |
| `offer_id` | uuid | riferimento logico a `public.offers.id` |
| `analysis_date` | timestamptz | |
| `result` | jsonb | risultato della valutazione (stato/priorità/action_owner/waiting_for/next_action proposti in quel momento) |
| `human_decision` | jsonb | decisione operativa effettivamente presa dall'umano |
| `human_correction` | text | eventuale correzione/nota umana rispetto al risultato |
| `created_by` | uuid | riferimento a `auth.users.id` |
| `created_at` | timestamptz | |

**Perché `jsonb` per `result`/`human_decision` e non colonne singole**: in Fase 1 il "risultato" è solo l'input manuale del commerciale (stesso shape di `offer_local_state`); in Fase 2 lo stesso campo dovrà accogliere l'output strutturato dell'AI, che è più ricco (vedi `docs/ai/AI_FUTURE_ARCHITECTURE.md`). Tenerlo in `jsonb` fin da ora evita una migrazione strutturale quando arriva l'AI — coerente con il requisito "il modello non deve impedire l'aggiunta successiva" dei campi AI.

## Estensione futura (Fase 2, NON creare ora)

Tabella separata `sales_ai.offer_analysis_ai_meta` (1:1 con `offer_analysis`, FK su `analysis_id`), per non sporcare la tabella base con colonne nullable per mesi:

| Colonna | Tipo | Note |
|---|---|---|
| `analysis_id` | uuid, PK/FK → `offer_analysis.analysis_id` | |
| `model` | text | modello AI usato |
| `prompt_version` | text | |
| `input_data_hash` | text | hash/versione dei dati analizzati |
| `ai_result` | jsonb | output strutturato AI (schema proposto in `AI_FUTURE_ARCHITECTURE.md`) |
| `confidence` | numeric | |
| `user_agreement` | boolean | accordo/disaccordo dell'utente con l'AI |
| `evidence` | jsonb | riferimenti a note/email/eventi usati dall'AI |

Questa tabella **non va creata in Fase 1**: è documentata qui solo per dimostrare che lo schema di Fase 1 non blocca la sua aggiunta.

## Perché uno schema separato e non colonne aggiunte a `public.offers`

Aggiungere colonne Sales AI direttamente a `public.offers` (opzione scartata, vedi `DECISIONS.md`) accoppierebbe le migrazioni delle due applicazioni e renderebbe Suite dipendente da modifiche pensate per Sales AI. Lo schema separato nello stesso progetto Supabase ottiene l'isolamento voluto senza il costo di un secondo database.

## Punti aperti

- **DA DECIDERE**: nome definitivo dello schema (`sales_ai` è una proposta).
- **DA DECIDERE**: se `offer_local_state` e `offer_analysis` bastano per il primo obiettivo funzionale (visualizzazione contesto) o se serve anche una tabella di sola configurazione (es. valori ammessi per `action_owner`/`waiting_for`) — oggi proposti come testo libero per semplicità in Fase 1.
