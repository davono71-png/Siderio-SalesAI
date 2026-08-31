-- Rev.1 §08: salvare uno snapshot tecnico dello stato dell'offerta al
-- momento dell'analisi (offer_id/status/revision_number/sent_at/
-- accepted_at/updated_at/analyzed_at), per poter verificare a posteriori
-- su quali dati si è basata una valutazione.
alter table sales_ai.ai_analyses add column if not exists context_snapshot jsonb;
