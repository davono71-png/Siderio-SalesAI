-- Stesso trattamento delle card KPI del Command Center: le 3 card
-- dell'Inbox ("Da smistare", "Nuove richieste", "Possibili match") erano
-- numeri statici. La lista inline sotto è già la stessa fonte ma limitata a
-- 100 righe: con "da smistare" a 203, oltre 100 email non erano
-- raggiungibili in nessun modo. Riusa la query di get_inbox_commerciale,
-- filtrata per singolo KPI e con un tetto più alto per il popup.
create or replace function sales_ai.get_inbox_kpi_list(p_kpi text, p_limit integer default 300)
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
       and case p_kpi
             when 'DA_SMISTARE' then true
             when 'NUOVE_RICHIESTE' then tr.classification = 'NEW_REQUEST'
             when 'POSSIBILI_MATCH' then tr.classification in ('EXISTING_OPPORTUNITY', 'OFFER_CONFIRMED')
             else false
           end
     order by e.created_at desc
     limit p_limit
  ) t;

  return v_result;
end;
$function$;
