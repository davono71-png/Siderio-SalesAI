# VISION — Siderio Sales AI

## Cos'è

Siderio Sales AI è un'applicazione **separata** da Siderio Suite, collegata ad essa, che aiuta il commerciale a rispondere a cinque domande su ogni offerta:

1. Cosa sta succedendo con questa offerta?
2. Chi deve fare qualcosa?
3. Quando bisogna intervenire?
4. Cosa conviene fare?
5. Perché?

Nella prima fase queste risposte restano tutte manuali/umane. Sales AI costruisce solo l'infrastruttura (dati, contesto, storico) che permetterà in futuro di elaborarle in parte automaticamente.

## Cosa NON è

- **Non è un nuovo gestionale commerciale** e non duplica le funzioni di Siderio Suite.
- **Non è la fonte dei dati aziendali** — Siderio Suite resta l'unica fonte ufficiale (offerte, clienti, commesse, email).
- **Non prende decisioni commerciali** — non invia email autonomamente, non decide prezzi o stati commerciali al posto del commerciale.
- **Non integra AI/OpenAI nella prima fase** — l'interpretazione automatica arriva solo dopo che il recupero e la visualizzazione di una singola offerta sono affidabili.

## Principio architetturale

```
SIDERIO SUITE (fonte ufficiale dei dati)
        │  espone i dati dell'offerta
        ▼
SIDERIO SALES AI (organizza, registra, presenta lo stato commerciale)
        │  in una fase successiva
        ▼
AI (interpreta le informazioni e propone azioni — NON in Fase 1)
```

Suite conserva i dati aziendali ufficiali. Sales AI conserva solo i dati necessari alla propria funzione (stato commerciale, priorità, storico delle valutazioni). Vedi `docs/architecture/DATA_MODEL.md` per come questo principio si traduce in schema dati, dato che Sales AI e Suite condivideranno lo stesso progetto Supabase (vedi `DECISIONS.md`, 26/08/2026).

## Principio human-in-the-loop

Il commerciale continua a gestire relazione con il cliente, trattativa, prezzi, negoziazione, decisioni. Sales AI si occupa (progressivamente) di ricordare, controllare, organizzare, classificare, segnalare, preparare — mai di sostituire il commerciale.

## Stato

Fase 0 — Progettazione (vedi `ROADMAP.md`). Nessuna funzionalità applicativa è stata ancora sviluppata.
