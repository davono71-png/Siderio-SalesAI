# AUTH — autenticazione e autorizzazione, Fase 1

## Decisione

**REQUISITO DECISO (26/08/2026)** — Sales AI usa lo **stesso Supabase Auth** del progetto condiviso con Suite (`Siderio-Suite_2`). Gli utenti si autenticano con le stesse credenziali che usano già in Siderio Suite. Non viene creato un sistema di login separato.

## Utenti Fase 1

Mattia, Davide, Jessika, Gianfranco — gli stessi 4 account già attivi su Suite (coerente con le 14 righe osservate in `public.profili_utenti`, che includono anche altro personale non utente di Sales AI).

## Ruoli

**REQUISITO DECISO** — un solo ruolo applicativo, identico per tutti gli utenti di Sales AI in Fase 1. Nessun RBAC granulare (niente permessi diversi tra Mattia/Davide/Jessika/Gianfranco).

Questo vale **solo a livello applicativo** (cosa vede/fa un utente dentro le schermate di Sales AI). A livello di database restano comunque due confini distinti, indipendenti dal ruolo applicativo unico:

- **Lettura dati Suite** (`public.*`) — tramite le viste/funzioni definite in `SUITE_INTEGRATION.md`, sola lettura, uguale per tutti gli utenti Sales AI.
- **Lettura/scrittura schema `sales_ai`** — piena per qualunque utente autenticato di Sales AI (coerente con "un solo ruolo").

## Cosa NON fare (finché non diversamente deciso)

- Non creare un secondo sistema di credenziali (es. NextAuth con provider proprio) — userebbe identità diverse da quelle di Suite, cosa esplicitamente esclusa.
- Non introdurre permessi differenziati per utente senza una richiesta esplicita — il documento progettuale dice chiaramente "1 solo ruolo uguale per tutti" per ora.

## Punti aperti

- **DA VERIFICARE**: conferma che `public.profili_utenti` (14 righe, popolata) sia la tabella profili collegata a `auth.users` di questo progetto, e che `public.user_profiles` (0 righe) sia inutilizzata/legacy — l'ispezione dello schema mostra entrambe presenti ma solo la prima con dati.
- **DA DECIDERE**: se serve un audit minimo di chi ha modificato cosa in `sales_ai.offer_local_state` (oggi coperto solo da `updated_by`/`updated_at`).
