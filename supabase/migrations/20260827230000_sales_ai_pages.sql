-- Funzioni di lettura per le pagine di navigazione (Follow-up, Attese,
-- Attività, Clienti, Pipeline, Storico AI, Inbox). Stesso pattern delle
-- altre: SECURITY DEFINER, nessuna tabella Suite concessa direttamente.
--
-- Tutte leggono dati reali già presenti: non c'è nessun dato di esempio.
-- Le pagine basate sull'AI (Attese, Attività, Storico) restano vuote finché
-- l'analisi non viene lanciata, ed è corretto che sia così.

-- Offerte inviate e non ancora accettate, ordinate per anzianità dell'invio.
create or replace function sales_ai.get_followups(p_limit int default 60, p_min_days int default 0)
returns jsonb
language plpgsql
security definer
set search_path = public, sales_ai, pg_temp
as $$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t) order by t.days_since_sent desc nulls last), '[]'::jsonb)
    into v_result
  from (
    select o.id as offer_id, o.offer_number, o.title, o.final_price_net, o.sent_at,
           coalesce(c.company_name, c.display_name) as client_name,
           o.agente,
           (current_date - o.sent_at::date) as days_since_sent,
           latest.classification as sales_status,
           coalesce(act.open_count, 0) as open_actions
    from public.offers o
    left join public.clients c on c.id = o.client_id
    left join lateral (
      select a.classification from sales_ai.ai_analyses a
      where a.root_offer_id = coalesce(o.root_offer_id, o.id)
      order by a.created_at desc limit 1
    ) latest on true
    left join lateral (
      select count(*) as open_count from sales_ai.open_actions oa
      where oa.root_offer_id = coalesce(o.root_offer_id, o.id) and oa.status = 'OPEN'
    ) act on true
    where o.status = 'sent'
      and o.sent_at is not null
      and (current_date - o.sent_at::date) >= p_min_days
    order by o.sent_at asc
    limit p_limit
  ) t;

  return v_result;
end;
$$;

grant execute on function sales_ai.get_followups(int, int) to authenticated;

-- Azioni aperte individuate dall'AI. p_side = 'SIDERIO' (cosa tocca a noi)
-- oppure 'EXTERNAL' (cosa stiamo aspettando da cliente/agenzia/progettista).
create or replace function sales_ai.get_actions(p_side text default 'SIDERIO', p_limit int default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, sales_ai, pg_temp
as $$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t)
           order by t.blocking desc, t.due_date asc nulls last, t.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select oa.id, oa.actor, oa.description, oa.due_date, oa.blocking, oa.created_at,
           (oa.due_date is not null and oa.due_date < current_date) as overdue,
           o.id as offer_id, o.offer_number, o.title, o.final_price_net,
           coalesce(c.company_name, c.display_name) as client_name
    from sales_ai.open_actions oa
    join public.offers o on o.id = oa.root_offer_id
    left join public.clients c on c.id = o.client_id
    where oa.status = 'OPEN'
      and case when p_side = 'SIDERIO' then oa.actor = 'SIDERIO' else oa.actor <> 'SIDERIO' end
    limit p_limit
  ) t;

  return v_result;
end;
$$;

grant execute on function sales_ai.get_actions(text, int) to authenticated;

-- Clienti con il loro portafoglio offerte.
create or replace function sales_ai.get_clients(p_query text default null, p_limit int default 60)
returns jsonb
language plpgsql
security definer
set search_path = public, sales_ai, pg_temp
as $$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t) order by t.last_activity desc nulls last), '[]'::jsonb)
    into v_result
  from (
    select c.id as client_id,
           coalesce(c.company_name, c.display_name) as client_name,
           c.email, c.phone, c.city, c.province,
           count(o.id) as offers_total,
           count(o.id) filter (where o.status = 'sent') as offers_open,
           count(o.id) filter (where o.status = 'accepted') as offers_won,
           coalesce(sum(o.final_price_net) filter (where o.status = 'sent'), 0) as value_open,
           coalesce(sum(o.final_price_net) filter (where o.status = 'accepted'), 0) as value_won,
           max(o.updated_at) as last_activity
    from public.clients c
    join public.offers o on o.client_id = c.id
    where p_query is null or p_query = ''
       or c.company_name ilike '%' || p_query || '%'
       or c.display_name ilike '%' || p_query || '%'
       or c.email ilike '%' || p_query || '%'
    group by c.id, c.company_name, c.display_name, c.email, c.phone, c.city, c.province
    order by max(o.updated_at) desc nulls last
    limit p_limit
  ) t;

  return v_result;
end;
$$;

grant execute on function sales_ai.get_clients(text, int) to authenticated;

-- Pipeline: valore e numero per stato Suite, più la ripartizione AI.
create or replace function sales_ai.get_pipeline()
returns jsonb
language plpgsql
security definer
set search_path = public, sales_ai, pg_temp
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'by_status', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.value_net desc), '[]'::jsonb)
      from (
        select o.status, count(*) as offers, coalesce(sum(o.final_price_net), 0) as value_net
        from public.offers o group by o.status
      ) t
    ),
    'by_classification', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.offers desc), '[]'::jsonb)
      from (
        select latest.classification, count(*) as offers,
               coalesce(sum(o.final_price_net), 0) as value_net
        from public.offers o
        join lateral (
          select a.classification from sales_ai.ai_analyses a
          where a.root_offer_id = coalesce(o.root_offer_id, o.id)
          order by a.created_at desc limit 1
        ) latest on true
        group by latest.classification
      ) t
    ),
    'by_age', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.sort_key), '[]'::jsonb)
      from (
        select case
                 when (current_date - o.sent_at::date) < 7 then '0-7 giorni'
                 when (current_date - o.sent_at::date) < 14 then '7-14 giorni'
                 when (current_date - o.sent_at::date) < 30 then '14-30 giorni'
                 when (current_date - o.sent_at::date) < 90 then '1-3 mesi'
                 else 'oltre 3 mesi'
               end as bucket,
               case
                 when (current_date - o.sent_at::date) < 7 then 1
                 when (current_date - o.sent_at::date) < 14 then 2
                 when (current_date - o.sent_at::date) < 30 then 3
                 when (current_date - o.sent_at::date) < 90 then 4
                 else 5
               end as sort_key,
               count(*) as offers,
               coalesce(sum(o.final_price_net), 0) as value_net
        from public.offers o
        where o.status = 'sent' and o.sent_at is not null
        group by 1, 2
      ) t
    ),
    'top_open', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.final_price_net desc), '[]'::jsonb)
      from (
        select o.id as offer_id, o.offer_number, o.title, o.final_price_net,
               coalesce(c.company_name, c.display_name) as client_name,
               (current_date - o.sent_at::date) as days_since_sent
        from public.offers o
        left join public.clients c on c.id = o.client_id
        where o.status = 'sent'
        order by o.final_price_net desc nulls last
        limit 10
      ) t
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function sales_ai.get_pipeline() to authenticated;

-- Storico completo delle valutazioni AI, con il feedback umano ricevuto.
create or replace function sales_ai.get_analysis_history(p_limit int default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, sales_ai, pg_temp
as $$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select a.id as analysis_id, a.classification, a.confidence, a.model,
           a.prompt_version, a.created_at,
           a.result_json -> 'reason' as reason,
           o.id as offer_id, o.offer_number, o.title,
           coalesce(c.company_name, c.display_name) as client_name,
           (select f.result from sales_ai.ai_feedback f
              where f.analysis_id = a.id order by f.created_at desc limit 1) as feedback
    from sales_ai.ai_analyses a
    join public.offers o on o.id = a.root_offer_id
    left join public.clients c on c.id = o.client_id
    order by a.created_at desc
    limit p_limit
  ) t;

  return v_result;
end;
$$;

grant execute on function sales_ai.get_analysis_history(int) to authenticated;

-- Inbox commerciale: email in arrivo non ancora collegate a un'offerta o a
-- una commessa. È il bacino da cui nasceranno le "Richieste" quando la
-- pipeline pre-offerta sarà attiva.
create or replace function sales_ai.get_inbox(p_limit int default 50, p_only_unlinked boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, sales_ai, pg_temp
as $$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select e.id as email_id, e.da, e.oggetto,
           left(coalesce(e.corpo, ''), 220) as anteprima,
           e.created_at, e.letto, e.folder,
           acc.indirizzo as account_address,
           e.offerta_id, e.commessa_id,
           jsonb_array_length(coalesce(e.allegati, '[]'::jsonb)) as allegati,
           (select coalesce(cl.company_name, cl.display_name) from public.clients cl
             where cl.email is not null and e.da ilike '%' || cl.email || '%' limit 1) as client_name
    from public.email_messaggi e
    left join public.email_account acc on acc.id = e.account_id
    where e.direzione = 'in'
      and (not p_only_unlinked or (e.offerta_id is null and e.commessa_id is null))
    order by e.created_at desc
    limit p_limit
  ) t;

  return v_result;
end;
$$;

grant execute on function sales_ai.get_inbox(int, boolean) to authenticated;
