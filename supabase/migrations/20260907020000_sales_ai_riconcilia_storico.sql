-- Fase 3 (Rev.2 §2): "un aggiornamento del prompt o del classificatore non
-- corregge automaticamente i record già salvati". Le ~260+ email già
-- smistate con la tassonomia a 4 categorie restano visibili in Inbox anche
-- se in realtà sono fornitori, ordini clienti acquisiti o amministrativa —
-- finché qualcosa non le rimanda in coda con la logica nuova.
--
-- Rimette in TO_ANALYZE le righe MAI toccate da una persona (confirmed_by
-- is null: se un umano ha già confermato/creato una Request, quella
-- decisione non si tocca) e classificate con un prompt_version diverso da
-- quello corrente. Chiamata da triageInboxBatch prima di ogni lotto: lo
-- stesso meccanismo che già smista le nuove email ora ripulisce da solo
-- anche lo storico, senza bisogno di un comando separato. Auto-limitante:
-- una volta riclassificata, la riga porta il prompt_version corrente e non
-- viene più selezionata — rilanciare il processo è quindi sempre sicuro,
-- nessun duplicato (è un update, mai un insert).
create or replace function sales_ai.riconcilia_storico(p_prompt_version text, p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path to 'public', 'sales_ai', 'pg_temp'
as $function$
declare
  v_count int;
begin
  with da_riclassificare as (
    select email_id
      from sales_ai.email_triage
     where confirmed_by is null
       and model is not null
       and prompt_version is distinct from p_prompt_version
     order by analyzed_at asc nulls first
     limit p_limit
  )
  update sales_ai.email_triage t
     set triage_status = 'TO_ANALYZE',
         classification = null,
         confidence = null,
         reason = null,
         root_offer_id = null,
         commessa_id = null,
         model = null,
         prompt_version = null,
         analyzed_at = null
    from da_riclassificare d
   where t.email_id = d.email_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
