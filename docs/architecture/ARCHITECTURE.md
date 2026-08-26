# ARCHITECTURE — Fase 1

## Vista d'insieme

```
                     ┌───────────────────────────────────────┐
                     │   Supabase project "Siderio-Suite_2"   │
                     │                                        │
                     │  schema "public"        schema "sales_ai" (nuovo)
                     │  ─────────────────       ─────────────────────
                     │  offers                  offer_local_state
                     │  clients                 offer_analysis
                     │  email_messaggi          (storico valutazioni)
                     │  offerte_allegati
                     │  profili_utenti / auth.users (condivisi)
                     │        ▲                        ▲
                     └────────│────────────────────────│────────────┘
                              │ sola lettura             │ lettura/scrittura piena
                              │ (viste/funzioni dedicate)│ (app Sales AI)
                     ┌────────┴────────────────────────┴────────┐
                     │            Sales AI (Next.js / Vercel)     │
                     │  - login: Supabase Auth (stesso progetto)  │
                     │  - ricerca offerta per offer_number        │
                     │  - vista contesto offerta                  │
                     │  - gestione manuale stato/priorità/azione  │
                     └─────────────────────────────────────────────┘
                              │
                     ┌────────┴────────┐
                     │  Siderio Suite   │  (app esistente, invariata)
                     └──────────────────┘
```

## Componenti

- **Supabase project condiviso (`Siderio-Suite_2`)** — REQUISITO DECISO 26/08/2026. Un solo progetto database, non due. Suite continua a usare lo schema `public` esattamente come oggi, senza modifiche.
- **Schema `sales_ai` (PROPOSTA di naming)** — nuovo schema Postgres nello stesso progetto, dedicato interamente ai dati di Sales AI (stato commerciale, priorità, storico valutazioni). Isolato da `public` a livello di schema, permessi e migrazioni.
- **Confine di accesso Suite → Sales AI** — anche stando nello stesso database fisico, Sales AI **non interroga direttamente le tabelle `public.*` di Suite** con query libere. Il confine logico richiesto dal documento originale ("Sales AI non deve avere accesso libero al database di Suite") si implementa con:
  - viste read-only (es. `sales_ai.v_offer_context`) che espongono solo i campi concordati in `SUITE_INTEGRATION.md`, oppure
  - funzioni Postgres (RPC) `SECURITY DEFINER` con parametri espliciti (es. `get_offer_context(offer_number text)`).

  Questo mantiene un contratto esplicito e versionabile, anche senza un vero confine di rete/processo tra le due app. **PROPOSTA**, da validare con Mattia/Davide in `SUITE_INTEGRATION.md`.
- **Sales AI (applicazione)** — Next.js, deployata su Vercel (repository già collegata). Nessun accesso diretto lato client al database: le query passano da un livello server (route handler / server component) che applica il contratto sopra.
- **Autenticazione** — Supabase Auth dello stesso progetto, riuso delle identità esistenti di Suite (`profili_utenti`). Un solo ruolo applicativo. Dettagli in `AUTH.md`.

## Cosa NON cambia in Suite

- Nessuna modifica alle tabelle, alla logica o all'app di Suite in Fase 1.
- Nessuna scrittura di Sales AI sulle tabelle `public.*` di Suite in Fase 1 (nemmeno su `followup_notes`/`status` via `aggiorna_offerta`): resta un'operazione fatta da Suite. Da riconfermare come DA DECIDERE se in futuro serve.

## Perché non un secondo database

La preoccupazione iniziale (documento progettuale) era evitare che Sales AI diventasse "un secondo gestionale" con dati duplicati e disallineati da Suite. Usare lo stesso progetto Supabase con schema separato ottiene lo stesso risultato (nessuna copia dei dati ufficiali, Suite resta l'unica fonte) senza il costo operativo di sincronizzare due database distinti — che sarebbe stato l'unico reale rischio dell'approccio "due DB".

## Ambienti

**DA DECIDERE** — un solo ambiente (produzione) o anche uno di staging, dato che Fase 1 lavora già su dati reali di Suite. Uno schema `sales_ai_staging` accanto a `sales_ai` nello stesso progetto è un'opzione a basso costo se serve isolare i test.
