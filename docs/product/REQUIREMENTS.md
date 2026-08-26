# REQUIREMENTS — Fase 1

Legenda:
- **REQUISITO DECISO** = confermato dal documento progettuale o da Davide/Mattia in conversazione.
- **PROPOSTA** = raccomandazione progettuale, non ancora confermata.
- **DA DECIDERE** = richiede una decisione esplicita di Davide e Mattia.

## 1. Dati offerta provenienti da Suite

**REQUISITO DECISO** — Per una singola offerta Sales AI deve poter ricevere almeno: ID/numero offerta, cliente, contatto, commerciale, oggetto, importo, stato, revisione, data creazione, data ultimo invio, note, email collegate.

**Riscontro tecnico (ispezione schema Supabase `Siderio-Suite_2`, 26/08/2026)** — la tabella `public.offers` copre la maggior parte di questi campi:

| Campo richiesto | Colonna Suite | Note |
|---|---|---|
| ID offerta | `offers.id` (uuid) | chiave interna |
| Numero offerta | `offers.offer_number` (text) | **è la numerazione da usare come riferimento esterno** (REQUISITO DECISO, vedi DECISIONS.md) |
| Cliente | `offers.client_id` → `clients.display_name`/`company_name` | |
| Contatto | `clients.contact_person`, `clients.email`, `clients.phone` | un solo referente per cliente, non una tabella contatti dedicata |
| Commerciale/agente | `offers.agente` (text) | vincolato all'anagrafica `agenti` a livello applicativo (non FK in DB) — confermato, vedi `SUITE_INTEGRATION.md` |
| Oggetto | `offers.title`, `work_description_final` | |
| Importo | `offers.final_price_net` / `final_price_vat` | |
| Stato | `offers.status` (enum) | valori noti: draft, sent, accepted, rejected |
| Revisione | — | non ancora presente in Suite — **da implementare lato Suite** (Davide), fuori scope Sales AI per ora |
| Data creazione | `offers.created_at` | |
| Data ultimo invio | `offers.sent_at` | |
| Note | `offers.internal_notes`, `offers.followup_notes` | |
| Email collegate | `email_messaggi.offerta_id` (uuid, nullable) | collegamento diretto già esistente |

**REQUISITO DECISO (26/08/2026)** — la gestione della revisione delle offerte va implementata in Siderio Suite (a cura di Davide); Sales AI la consumerà solo una volta disponibile. Non è un'attività della Fase 1 di Sales AI.

**Chiarito (26/08/2026)** — `offerte_allegati.offerta_id` (text) contiene lo stesso uuid di `offers.id`, non l'`offer_number`: basta il cast `offerta_id::uuid` in lettura. Dettagli e caso limite (1 riga orfana su 80) in `docs/architecture/SUITE_INTEGRATION.md`.

## 2. Primo obiettivo funzionale

**REQUISITO DECISO** — Flusso: apro Sales AI → cerco/inserisco un numero offerta → Sales AI richiede a Suite il contesto completo → visualizza in modo ordinato: dati offerta, cliente e contatto, note, email/interazioni, cronologia essenziale. Nessuna interpretazione AI in questa fase.

**PROPOSTA** — la chiave di ricerca esposta all'utente è `offer_number` (numerazione Suite); internamente si risolve a `offers.id`.

## 3. Database Sales AI

**REQUISITO DECISO (aggiornato 26/08/2026)** — Sales AI **non ha un progetto database separato**: vive nello stesso progetto Supabase di Suite (`Siderio-Suite_2`), ma in uno **schema Postgres separato** dalle tabelle di Suite. Non legge/scrive liberamente le tabelle `public.*` di Suite: l'accesso è mediato da viste o funzioni dedicate (vedi `docs/architecture/SUITE_INTEGRATION.md` e `DATA_MODEL.md`).

**REQUISITO DECISO** — Lo schema Sales AI deve poter registrare almeno: `offer_id`, stato Sales AI, priorità, `action_owner`, `waiting_for`, prossima azione, data prossima azione, motivo, data analisi/aggiornamento.

**REQUISITO DECISO** — distinzione esplicita:
- `action_owner` = chi deve materialmente fare qualcosa.
- `waiting_for` = da chi/cosa stiamo aspettando un evento.

Esempio: `waiting_for=customer, action_owner=none` → "Aspettiamo il cliente, Siderio non deve fare nulla ora."
Esempio: `waiting_for=siderio, action_owner=siderio` → "Il cliente aspetta una nostra revisione."

**REQUISITO DECISO (26/08/2026)** — il reminder di follow-up oggi gestito in Suite (`offers.followup_secondo_richiamo`, `followup_notes`, `followup_sospesa`) passa a essere gestito da Sales AI fin dalla Fase 1, tramite `next_action_date`/`reason` in `sales_ai.offer_local_state`. Non è più solo "utile ai test": è la funzione che sostituisce il reminder di Suite. Vedi gap #4 in `SUITE_INTEGRATION.md` per l'importazione dello storico esistente (74 offerte con data di richiamo, 56 con note) e per il punto ancora aperto su cosa succede ai campi `followup_*` di Suite dopo il passaggio.

## 4. Storico delle valutazioni

**REQUISITO DECISO** — Fin dall'inizio la struttura dati deve prevedere uno storico: `analysis_id`, `offer_id`, `analysis_date`, risultato, decisione umana, correzione umana.

**REQUISITO DECISO** — il modello dati non deve impedire l'aggiunta futura di campi AI (modello usato, versione prompt, hash/versione dei dati analizzati, risultato strutturato AI, accordo/disaccordo utente, motivazione/correzione, evidenze), anche se non vengono implementati ora.

## 5. Stati commerciali

**REQUISITO DECISO** — set chiuso iniziale: Nessuna azione, Da monitorare, Follow-up consigliato, Attenzione, Attesa programmata. Nuovi stati vanno proposti prima di essere aggiunti.

## 6. Priorità

**REQUISITO DECISO** — non deve essere decisa esclusivamente dall'AI; l'architettura deve poter combinare regole software + dati oggettivi + eventuale interpretazione AI.

**PROPOSTA (non implementata ora)** — nessun algoritmo di priorità in Fase 1; il campo priorità in Fase 1 è impostato manualmente.

## 7. Email

**REQUISITO DECISO (26/08/2026)** — Sales AI non integra una casella di posta propria: mostra le email che Suite già collega all'offerta tramite `email_messaggi.offerta_id`. Mattia e Jessika continuano a scrivere email sia da Suite sia (in futuro, se necessario) da Sales AI usando lo stesso canale sottostante di Suite — nessuna sincronizzazione/copia separata in Fase 1.

**DA DECIDERE** — se e quando Sales AI dovrà anche scrivere email (non previsto in Fase 1: "nessuna email deve essere inviata autonomamente").

## 8. Autenticazione e utenti

**REQUISITO DECISO (26/08/2026)** — Login con le stesse credenziali di Siderio Suite (stesso progetto Supabase → stesso Supabase Auth). Utenti noti in Fase 1: Mattia, Davide, Jessika, Gianfranco.

**REQUISITO DECISO** — un solo ruolo applicativo, uguale per tutti; nessun sistema di permessi granulari in Fase 1.

## 9. Vincoli espliciti Fase 1

**REQUISITO DECISO**:
- Nessuna integrazione OpenAI/Anthropic per interpretare offerte in Fase 1 (solo Fase 2).
- Nessun invio email automatico.
- Nessuna decisione commerciale presa automaticamente.
- Nessun accesso libero al database interno di Suite: solo tramite l'interfaccia/contratto definito in `SUITE_INTEGRATION.md`, anche se fisicamente il DB è condiviso.
