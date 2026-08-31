create or replace function sales_ai.get_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'sales_ai', 'pg_temp'
as $function$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'request', (
      select jsonb_build_object(
        'id', r.id, 'title', r.title, 'status', r.status, 'channel', r.channel,
        'agency_source', r.agency_source, 'contact_name', r.contact_name,
        'installation_location', r.installation_location, 'notes', r.notes,
        'estimate_min', r.estimate_min, 'estimate_max', r.estimate_max,
        'estimate_note', r.estimate_note,
        'created_at', r.created_at, 'converted_offer_id', r.converted_offer_id,
        'converted_at', r.converted_at,
        'client_id', r.client_id,
        'client_name', coalesce(c.company_name, c.display_name),
        'client_email', c.email, 'client_phone', c.phone,
        'offer_number', o.offer_number,
        'archived_at', r.archived_at, 'archive_reason', r.archive_reason, 'archive_note', r.archive_note
      )
      from sales_ai.requests r
      left join public.clients c on c.id = r.client_id
      left join public.offers  o on o.id = r.converted_offer_id
      where r.id = p_request_id
    ),
    'latest_analysis', (
      select jsonb_build_object(
        'id', a.id, 'classification', a.classification, 'confidence', a.confidence,
        'result_json', a.result_json, 'created_at', a.created_at,
        'model', a.model, 'prompt_version', a.prompt_version)
      from sales_ai.ai_analyses a
      where a.request_id = p_request_id
      order by a.created_at desc limit 1
    ),
    'open_actions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', oa.id, 'actor', oa.actor, 'description', oa.description,
        'due_date', oa.due_date, 'blocking', oa.blocking)
        order by oa.blocking desc, oa.due_date nulls last), '[]'::jsonb)
      from sales_ai.open_actions oa
      where oa.request_id = p_request_id and oa.status = 'OPEN'
    ),
    'timeline', sales_ai.get_request_timeline(p_request_id),
    'conteggi', jsonb_build_object(
      'email',  (select count(*) from sales_ai.request_messages rm where rm.request_id = p_request_id),
      'eventi', (select count(*) from sales_ai.request_events  ev where ev.request_id = p_request_id),
      'analisi',(select count(*) from sales_ai.ai_analyses      a where a.request_id  = p_request_id)
    ),
    'job_in_corso', exists (
      select 1 from sales_ai.analysis_jobs j
       where j.request_id = p_request_id and j.status in ('PENDING', 'RUNNING')
    ),
    'ultimo_job_fallito', (
      select j.last_error from sales_ai.analysis_jobs j
       where j.request_id = p_request_id and j.status = 'FAILED'
       order by j.created_at desc limit 1
    )
  ) into v_result;

  return v_result;
end;
$function$;
