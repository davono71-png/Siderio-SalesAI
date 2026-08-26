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
| `agente` | `offers.agente` | text | testo libero, non FK — vedi "Gap" sotto |
| `created_at` | `offers.created_at` | timestamptz | |
| `sent_at` | `offers.sent_at` | timestamptz | |
| `accepted_at` | `offers.accepted_at` | timestamptz | |
| `internal_notes` | `offers.internal_notes` | text | |
| `followup_notes` | `offers.followup_notes` | text | |
| `client` | `clients.display_name`, `company_name`, `contact_person`, `email`, `phone`, `address` | join su `offers.client_id = clients.id` | |
| `emails` | `email_messaggi` filtrate per `offerta_id = offers.id` | lista | campi: `da`, `destinatari`, `oggetto`, `corpo`, `direzione`, `created_at`, `allegati` |
| `attachments` | `offerte_allegati` filtrate per `offerta_id` | lista | **vedi gap sul tipo** |
| `revision` | — | — | **non trovato in Suite, vedi gap** |

## Gap tecnici trovati (DA DECIDERE / DA VERIFICARE con Mattia)

1. **Revisione offerta** — il documento progettuale chiede il campo "revisione" ma non esiste una colonna dedicata in `offers`. Possibilità: (a) le revisioni non sono versionate esplicitamente in Suite oggi e va chiarito cosa si intende, (b) l'informazione è dentro `editor_state` (jsonb) e va estratta, (c) va aggiunta lato Suite. Non risolvibile solo dall'ispezione dello schema.
2. **Mismatch di tipo** — `offerte_allegati.offerta_id` è `text`, mentre `offers.id` è `uuid`. Prima di usare questa tabella nel contratto va chiarito se `offerta_id` contiene l'uuid castato a testo, l'`offer_number`, o altro.
3. **`agente` come testo libero** — `offers.agente` non è una FK verso una tabella utenti. Se Sales AI deve mostrare/filtrare per commerciale in modo affidabile, serve una convenzione di matching con `profili_utenti.nome`/`cognome` (o equivalente), da confermare.
4. **Email non ancora collegate a un'offerta** — `email_messaggi.offerta_id` è nullable: non tutte le email sono necessariamente agganciate a un'offerta specifica (alcune sono agganciate solo a `commessa_id`/`ordine_id`). Il contesto offerta mostrerà solo le email con `offerta_id` valorizzato; eventuali email pre-conversione collegate solo al cliente restano fuori scope in Fase 1, salvo diversa decisione.
5. **Cronologia essenziale** — il documento chiede una "cronologia essenziale" nel contesto offerta. Non esiste una tabella di eventi/audit dedicata alle offerte (esiste `audit_logs`, generica, 0 righe attualmente). **DA DECIDERE**: cosa compone la cronologia in Fase 1 — proposta minima: `created_at`, `sent_at`, `accepted_at`, cambi di `status` (se non tracciati, la cronologia in Fase 1 sarà limitata a questi tre timestamp più lo storico `offer_analysis` di Sales AI).

## Fuori contratto (esplicitamente non esposto in Fase 1)

- Nessun accesso a tabelle di produzione/commesse (`commesse`, `fasi_commessa`, `ordini_fornitore`, ecc.) — fuori scope del primo obiettivo funzionale (contesto di una singola offerta).
- Nessuna scrittura verso `public.*` da parte di Sales AI in Fase 1.
