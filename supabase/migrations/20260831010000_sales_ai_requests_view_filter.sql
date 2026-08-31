-- Le richieste convertite in offerta restavano in cima alla vista principale
-- per sempre: la lista "Richieste commerciali" doveva già lavorare solo
-- sulle richieste ancora aperte, non su tutto lo storico. Il campo esiste
-- già (sales_ai.requests.status: NEW/TO_QUALIFY/WAITING_INFORMATION/
-- TO_EVALUATE/CONVERTED_TO_OFFER/ARCHIVED), manca solo il filtro.
create or replace function sales_ai.get_requests(p_limit integer default 60, p_view text default 'ACTIVE')
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'sales_ai', 'pg_temp'
as $function$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select r.id as request_id, r.title, r.status, r.channel, r.agency_source,
           r.created_at, r.converted_offer_id, r.converted_at,
           r.estimate_min, r.estimate_max, r.installation_location,
           coalesce(c.company_name, c.display_name) as client_name,
           o.offer_number,
           (select count(*) from sales_ai.request_messages rm where rm.request_id = r.id) as email_count,
           (select count(*) from sales_ai.request_events  ev where ev.request_id = r.id) as event_count,
           a.classification as sales_status,
           a.confidence,
           a.result_json -> 'reason'                                    as reason,
           a.result_json -> 'qualification' -> 'completeness'           as completeness,
           a.result_json -> 'qualification' -> 'sufficient_to_proceed'  as sufficient,
           a.result_json -> 'qualification' -> 'critical_missing_information' as critical_missing,
           a.result_json -> 'commercial' -> 'followup_owner'            as followup_owner,
           a.result_json -> 'commercial' -> 'waiting_for'               as waiting_for,
           a.result_json -> 'commercial' -> 'suggested_action'          as suggested_action,
           a.result_json -> 'request' -> 'timing'                       as timing,
           a.result_json -> 'request' -> 'customer_budget_status'       as budget_status,
           a.result_json -> 'request' -> 'customer_budget'              as customer_budget,
           (select count(*) from sales_ai.open_actions oa
             where oa.request_id = r.id and oa.status = 'OPEN')         as open_actions,
           exists (select 1 from sales_ai.analysis_jobs j
                    where j.request_id = r.id and j.status in ('PENDING','RUNNING')) as job_in_corso
      from sales_ai.requests r
      left join public.clients c on c.id = r.client_id
      left join public.offers  o on o.id = r.converted_offer_id
      left join lateral (
        select * from sales_ai.ai_analyses an
         where an.request_id = r.id order by an.created_at desc limit 1
      ) a on true
     where case upper(coalesce(p_view, 'ACTIVE'))
             when 'ACTIVE'    then r.status not in ('CONVERTED_TO_OFFER', 'ARCHIVED')
             when 'CONVERTED' then r.status = 'CONVERTED_TO_OFFER'
             when 'ARCHIVED'  then r.status = 'ARCHIVED'
             else true -- 'ALL' o qualunque altro valore
           end
     order by r.created_at desc
     limit p_limit
  ) t;

  return v_result;
end;
$function$;

grant execute on function sales_ai.get_requests(integer, text) to authenticated;
