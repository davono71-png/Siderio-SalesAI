create or replace function sales_ai.get_offer_ai_state(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'sales_ai', 'pg_temp'
as $function$
declare
  v_root_offer_id uuid;
  v_result jsonb;
begin
  select coalesce(root_offer_id, id) into v_root_offer_id
  from public.offers where id = p_offer_id;

  if v_root_offer_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'root_offer_id', v_root_offer_id,
    'latest_analysis', (
      select jsonb_build_object(
        'id', a.id,
        'classification', a.classification,
        'confidence', a.confidence,
        'result_json', a.result_json,
        'created_at', a.created_at,
        'model', a.model,
        'prompt_version', a.prompt_version,
        'feedback', (
          select coalesce(jsonb_agg(jsonb_build_object('result', f.result, 'created_at', f.created_at) order by f.created_at desc), '[]'::jsonb)
          from sales_ai.ai_feedback f where f.analysis_id = a.id
        )
      )
      from sales_ai.ai_analyses a
      where a.root_offer_id = v_root_offer_id
      order by a.created_at desc
      limit 1
    ),
    'open_actions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', oa.id, 'actor', oa.actor, 'description', oa.description,
        'due_date', oa.due_date, 'blocking', oa.blocking, 'status', oa.status
      ) order by oa.blocking desc, oa.due_date nulls last), '[]'::jsonb)
      from sales_ai.open_actions oa
      where oa.root_offer_id = v_root_offer_id and oa.status = 'OPEN'
    ),
    'analysis_count', (
      select count(*) from sales_ai.ai_analyses a where a.root_offer_id = v_root_offer_id
    ),
    'lifecycle', (
      select jsonb_build_object(
        'commercial_status', coalesce(ol.commercial_status, 'OPEN'),
        'operational_status', ol.operational_status,
        'archived_at', ol.archived_at,
        'archive_reason', ol.archive_reason,
        'archive_note', ol.archive_note
      )
      from (select 1) x
      left join sales_ai.offer_lifecycle ol on ol.root_offer_id = v_root_offer_id
    )
  ) into v_result;

  return v_result;
end;
$function$;
