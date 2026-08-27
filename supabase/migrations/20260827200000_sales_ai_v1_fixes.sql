-- Fix search_offers dopo la migrazione allo schema V1 (20260827160000):
-- referenziava ancora sales_ai.offer_local_state, già eliminata, il che
-- rompeva la pagina /ricerca in produzione. sales_status ora arriva
-- dall'ultima classificazione in ai_analyses, sales_open_actions conta le
-- azioni aperte in open_actions — entrambe chiavate su coalesce(root_offer_id, id)
-- per coprire anche le revisioni. Applicato a mano il 27/08/2026 e verificato
-- con Davide; questo file lo porta sotto controllo di versione.
create or replace function sales_ai.search_offers(p_query text default null, p_limit int default 20)
returns jsonb
language plpgsql
security definer
set search_path = public, sales_ai, pg_temp
as $$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'offer_id', sub.id,
      'offer_number', sub.offer_number,
      'title', sub.title,
      'status', sub.status,
      'final_price_net', sub.final_price_net,
      'client_name', sub.client_name,
      'updated_at', sub.updated_at,
      'sales_status', sub.sales_status,
      'sales_open_actions', sub.open_actions_count
    ) order by sub.updated_at desc), '[]'::jsonb)
    into v_result
  from (
    select o.id, o.offer_number, o.title, o.status, o.final_price_net, o.updated_at,
           coalesce(c.company_name, c.display_name) as client_name,
           latest.classification as sales_status,
           (select count(*) from sales_ai.open_actions oa
              where oa.status = 'OPEN' and oa.root_offer_id = coalesce(o.root_offer_id, o.id)) as open_actions_count
    from public.offers o
    left join public.clients c on c.id = o.client_id
    left join lateral (
      select a.classification
      from sales_ai.ai_analyses a
      where a.root_offer_id = coalesce(o.root_offer_id, o.id)
      order by a.created_at desc
      limit 1
    ) latest on true
    where p_query is null or p_query = ''
       or o.offer_number ilike '%' || p_query || '%'
       or c.company_name ilike '%' || p_query || '%'
       or c.display_name ilike '%' || p_query || '%'
    order by o.updated_at desc
    limit p_limit
  ) sub;

  return v_result;
end;
$$;

grant execute on function sales_ai.search_offers(text, int) to authenticated;

-- Stato Sales AI per il pannello di dettaglio offerta: ultima analisi AI +
-- feedback umano ricevuto + azioni aperte, per root_offer_id (copre le
-- revisioni). Stesso pattern di get_offer_context: SECURITY DEFINER, gli
-- utenti Sales AI leggono questi campi indipendentemente dal ruolo Suite.
create or replace function sales_ai.get_offer_ai_state(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, sales_ai, pg_temp
as $$
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
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function sales_ai.get_offer_ai_state(uuid) to authenticated;
