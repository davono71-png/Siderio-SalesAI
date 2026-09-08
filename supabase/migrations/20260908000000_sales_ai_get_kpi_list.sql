-- Le 4 card KPI del Command Center ("Offerte aperte", "Ferme da 14+ giorni",
-- "Azioni aperte", "Analizzate dall'AI") erano numeri statici, non
-- cliccabili: "KPI cliccabili" era già un requisito condiviso in precedenza
-- (citato nella nota 07/09 tra quelli ancora validi) ma non risultava
-- implementato. Riusa la stessa logica "enriched" già scritta in
-- get_dashboard, filtrata per singolo KPI, per popolare il popup con
-- l'elenco dettagliato dietro ogni card.
create or replace function sales_ai.get_kpi_list(p_kpi text, p_stale_days integer default 14, p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'sales_ai', 'pg_temp'
as $function$
declare
  v_result jsonb;
begin
  with offer_state as (
    select o.id,
           o.offer_number,
           o.title,
           o.status,
           o.final_price_net,
           o.sent_at,
           coalesce(o.root_offer_id, o.id) as root_id,
           coalesce(c.company_name, c.display_name) as client_name
    from public.offers o
    left join public.clients c on c.id = o.client_id
  ),
  enriched as (
    select os.*,
           latest.classification,
           latest.created_at as analyzed_at,
           coalesce(act.open_count, 0) as open_actions,
           coalesce(act.blocking_count, 0) as blocking_actions,
           coalesce(act.overdue_count, 0) as overdue_actions,
           act.next_due_date,
           case
             when os.sent_at is not null
               then (current_date - os.sent_at::date)
             else null
           end as days_since_sent
    from offer_state os
    left join lateral (
      select a.classification, a.created_at
      from sales_ai.ai_analyses a
      where a.root_offer_id = os.root_id
      order by a.created_at desc
      limit 1
    ) latest on true
    left join lateral (
      select count(*) as open_count,
             count(*) filter (where oa.blocking) as blocking_count,
             count(*) filter (where oa.due_date is not null and oa.due_date < current_date) as overdue_count,
             min(oa.due_date) as next_due_date
      from sales_ai.open_actions oa
      where oa.root_offer_id = os.root_id and oa.status = 'OPEN'
    ) act on true
  )
  select coalesce(jsonb_agg(row_to_json(a) order by
           a.overdue_actions desc, a.blocking_actions desc, a.open_actions desc,
           a.days_since_sent desc nulls last, a.sent_at desc nulls last
         ), '[]'::jsonb)
    into v_result
  from (
    select e.id as offer_id, e.offer_number, e.title, e.client_name,
           e.final_price_net, e.status, e.sent_at, e.days_since_sent,
           e.classification as sales_status, e.analyzed_at,
           e.open_actions, e.blocking_actions, e.overdue_actions, e.next_due_date
      from enriched e
     where case p_kpi
             when 'OFFERTE_APERTE' then e.status = 'sent'
             when 'FERME_14GG' then e.status = 'sent' and e.days_since_sent >= p_stale_days
             when 'AZIONI_APERTE' then e.open_actions > 0
             when 'ANALIZZATE_AI' then e.classification is not null
             else false
           end
     limit p_limit
  ) a;

  return v_result;
end;
$function$;
