-- Dati per la home "Oggi" (Command Center). Un solo round-trip: KPI reali
-- calcolati sulle offerte Suite + sullo stato Sales AI, e la lista delle
-- opportunità che meritano attenzione oggi.
--
-- Nessun valore inventato: se l'AI non ha ancora analizzato nulla, i contatori
-- relativi all'AI valgono 0 e la lista si basa solo sui dati Suite (offerte
-- inviate e ferme da tempo).
create or replace function sales_ai.get_dashboard(p_limit int default 12, p_stale_days int default 14)
returns jsonb
language plpgsql
security definer
set search_path = public, sales_ai, pg_temp
as $$
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
           o.created_at,
           o.updated_at,
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
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'offers_open', (select count(*) from enriched where status = 'sent'),
      'offers_draft', (select count(*) from enriched where status = 'draft'),
      'offers_stale', (select count(*) from enriched
                        where status = 'sent' and days_since_sent >= p_stale_days),
      'offers_analyzed', (select count(distinct root_id) from enriched where classification is not null),
      'open_actions', (select coalesce(sum(open_actions), 0) from enriched),
      'blocking_actions', (select coalesce(sum(blocking_actions), 0) from enriched),
      'overdue_actions', (select coalesce(sum(overdue_actions), 0) from enriched),
      'analyses_total', (select count(*) from sales_ai.ai_analyses)
    ),
    'attention', (
      select coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb)
      from (
        select e.id as offer_id, e.offer_number, e.title, e.client_name,
               e.final_price_net, e.status, e.sent_at, e.days_since_sent,
               e.classification as sales_status, e.analyzed_at,
               e.open_actions, e.blocking_actions, e.overdue_actions, e.next_due_date,
               case
                 when e.overdue_actions > 0 then 'Azioni scadute'
                 when e.blocking_actions > 0 then 'Azione bloccante aperta'
                 when e.open_actions > 0 then 'Azioni aperte'
                 when e.classification is null then 'Mai analizzata dall''AI'
                 else 'Da monitorare'
               end as reason
        from enriched e
        where e.status = 'sent'
          and (e.open_actions > 0 or e.days_since_sent >= p_stale_days)
        order by e.overdue_actions desc, e.blocking_actions desc, e.open_actions desc,
                 e.days_since_sent desc nulls last
        limit p_limit
      ) a
    ),
    'recent_analyses', (
      select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      from (
        select an.id as analysis_id, an.classification, an.confidence, an.created_at,
               o.offer_number, o.title
        from sales_ai.ai_analyses an
        join public.offers o on o.id = an.root_offer_id
        order by an.created_at desc
        limit 6
      ) r
    ),
    'generated_at', now()
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function sales_ai.get_dashboard(int, int) to authenticated;
