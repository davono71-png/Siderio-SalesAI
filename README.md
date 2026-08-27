# Siderio-SalesAI
Assistente commerciale alle vendite

## Backend Sales AI V1

Motore di analisi commerciale su `offers.root_offer_id` (la catena
originale+revisioni = un'opportunità). Vedi `docs/architecture/ARCHITECTURE.md`
e `docs/architecture/SUITE_INTEGRATION.md` per il disegno completo.

- `app/api/sales-ai/analyze` (POST) — accoda l'analisi di un'offerta/revisione o di una `sales_ai.requests`.
- `app/api/sales-ai/process-next` (POST, richiede `x-sales-ai-cron-secret`) — worker: un job per invocazione.
- `app/api/sales-ai/opportunity` (GET) — ultima analisi + azioni aperte.
- `app/api/sales-ai/feedback` (POST) — riscontro umano su un'analisi.
- `lib/sales-ai/` — autorizzazione, contesto Suite→AI, motore OpenAI, coda job.
- `supabase/migrations/20260827160000_sales_ai_v1_schema.sql` — schema `sales_ai` (già applicato in produzione).

### Provare la prima analisi end-to-end

1. Configurare `.env.local` da `.env.example` (serve almeno `SUPABASE_SERVICE_ROLE_KEY` e `OPENAI_API_KEY`).
2. `npm run verify:sales-ai` — controlla che schema Zod e file principali siano coerenti.
3. `npm run dev`, poi:
   ```http
   POST /api/sales-ai/analyze
   Authorization: Bearer <JWT utente Suite/Sales AI>
   { "root_offer_id": "e9529632-27fb-4049-9251-5c0507a0b775" }
   ```
   Questa opportunità (offerta 6579) ha già 63 email collegate: buon primo caso reale.
4. `POST /api/sales-ai/process-next` con header `x-sales-ai-cron-secret` per elaborare il job.
5. `GET /api/sales-ai/opportunity?root_offer_id=...` per vedere il risultato.
6. Collegare `pg_cron`/`pg_net` con `supabase/reference/sales_ai_pg_cron_template.sql` solo dopo il deploy (serve l'URL Vercel reale).
