-- Con la tassonomia a 8 categorie (fase 2), SUPPLIER_ORDER, ADMINISTRATIVE e
-- CUSTOMER_ORDER sono, per definizione, fuori dalla pipeline di pre-vendita
-- tanto quanto NOT_COMMERCIAL: un fornitore o un cliente già acquisito non
-- deve più comparire tra le email "da smistare", anche se il match preciso
-- (a quale commessa) non è ancora stato risolto con certezza. Prima di
-- questa migrazione solo NOT_COMMERCIAL veniva escluso: le nuove categorie
-- sarebbero rimaste visibili in Inbox nonostante triage.js le classifichi
-- già correttamente (bug di integrazione, non di classificazione).
create or replace function sales_ai.get_inbox_commerciale(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'sales_ai', 'pg_temp'
as $function$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select e.id as email_id,
           e.da as mittente,
           e.oggetto,
           left(coalesce(e.corpo, ''), 260) as anteprima,
           e.created_at,
           e.letto,
           jsonb_array_length(coalesce(e.allegati, '[]'::jsonb)) as allegati,
           acc.indirizzo as casella,
           tr.classification,
           tr.confidence,
           tr.reason,
           tr.triage_status,
           tr.root_offer_id,
           o.offer_number  as offerta_proposta,
           coalesce(cli.company_name, cli.display_name) as cliente_offerta,
           coalesce(idc.company_name, idc.display_name) as cliente_riconosciuto
      from sales_ai.email_triage tr
      join public.email_messaggi e   on e.id = tr.email_id
      left join public.email_account acc on acc.id = e.account_id
      left join public.offers  o   on o.id = tr.root_offer_id
      left join public.clients cli on cli.id = o.client_id
      left join lateral (
        select c.company_name, c.display_name
          from public.posta_identita i
          join public.clients c on c.id = i.client_id
         where i.attivo
           and i.valore in (
             lower(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+')),
             lower(split_part(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+'), '@', 2))
           )
         order by i.confidenza desc
         limit 1
      ) idc on true
     where tr.triage_status in ('TO_ANALYZE', 'TO_REVIEW')
       and coalesce(tr.classification, 'TO_ANALYZE') not in ('NOT_COMMERCIAL', 'ADMINISTRATIVE', 'SUPPLIER_ORDER', 'CUSTOMER_ORDER')
     order by e.created_at desc
     limit p_limit
  ) t;

  return v_result;
end;
$function$;

create or replace function sales_ai.get_inbox_contatori()
returns jsonb
language sql
security definer
set search_path to 'public', 'sales_ai', 'pg_temp'
as $function$
  select jsonb_build_object(
    'da_smistare', count(*) filter (
      where triage_status in ('TO_ANALYZE', 'TO_REVIEW')
        and coalesce(classification, 'TO_ANALYZE') not in ('NOT_COMMERCIAL', 'ADMINISTRATIVE', 'SUPPLIER_ORDER', 'CUSTOMER_ORDER')),
    'nuove_richieste', count(*) filter (
      where triage_status = 'TO_REVIEW' and classification = 'NEW_REQUEST'),
    'possibili_match', count(*) filter (
      where triage_status = 'TO_REVIEW' and classification in ('EXISTING_OPPORTUNITY', 'OFFER_CONFIRMED')),
    'da_verificare', count(*) filter (
      where triage_status = 'TO_REVIEW' and classification = 'UNCERTAIN'),
    'da_analizzare', count(*) filter (where triage_status = 'TO_ANALYZE'),
    'archiviate_non_commerciali', count(*) filter (
      where classification in ('NOT_COMMERCIAL', 'ADMINISTRATIVE')),
    'ordini_fuori_pipeline', count(*) filter (
      where classification in ('SUPPLIER_ORDER', 'CUSTOMER_ORDER'))
  )
  from sales_ai.email_triage;
$function$;
