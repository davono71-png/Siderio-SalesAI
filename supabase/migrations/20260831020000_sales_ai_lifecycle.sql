-- Sezione 13 del Rev.1 di Mattia: richieste e offerte devono uscire dalla
-- vista attiva quando cambiano fase del funnel (RICHIESTA -> OFFERTA ->
-- WON/ORDINE/COMMESSA), senza mai perdere lo storico. Il dato non si
-- cancella mai: cambia fase.

-- 1) Richieste: archiviazione tracciata (motivo, chi, quando) invece del
--    semplice cambio di status generico che c'era finora.
alter table sales_ai.requests
  add column if not exists archived_at   timestamptz,
  add column if not exists archived_by   uuid,
  add column if not exists archive_reason text,
  add column if not exists archive_note   text;

alter table sales_ai.requests drop constraint if exists requests_archive_reason_check;
alter table sales_ai.requests add constraint requests_archive_reason_check
  check (archive_reason is null or archive_reason in
    ('DUPLICATA', 'NON_PERTINENTE', 'CLIENTE_NON_PROCEDE', 'PROGETTO_SOSPESO', 'ALTRO'));

alter table sales_ai.requests drop constraint if exists requests_archive_note_required_check;
alter table sales_ai.requests add constraint requests_archive_note_required_check
  check (archive_reason is distinct from 'ALTRO' or coalesce(btrim(archive_note), '') <> '');

create or replace function sales_ai.archivia_richiesta(
  p_request_id uuid, p_reason text, p_note text default null, p_user uuid default null
)
returns void
language plpgsql
security definer
set search_path = 'public', 'sales_ai', 'pg_temp'
as $$
begin
  if not exists (select 1 from sales_ai.requests where id = p_request_id) then
    raise exception 'Richiesta non trovata';
  end if;
  if p_reason is null or p_reason not in ('DUPLICATA','NON_PERTINENTE','CLIENTE_NON_PROCEDE','PROGETTO_SOSPESO','ALTRO') then
    raise exception 'Motivo di archiviazione non valido';
  end if;
  if p_reason = 'ALTRO' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Serve una nota quando il motivo è "Altro"';
  end if;

  update sales_ai.requests
     set status = 'ARCHIVED',
         archived_at = now(),
         archived_by = p_user,
         archive_reason = p_reason,
         archive_note = p_note,
         updated_at = now()
   where id = p_request_id;

  insert into sales_ai.request_events (request_id, event_type, description, created_by)
  values (p_request_id, 'NOTA', 'Richiesta archiviata manualmente: ' || p_reason ||
          coalesce(' — ' || nullif(btrim(p_note), ''), ''), p_user);
end;
$$;

grant execute on function sales_ai.archivia_richiesta(uuid, text, text, uuid) to authenticated;

create or replace function sales_ai.ripristina_richiesta(p_request_id uuid, p_user uuid default null)
returns void
language plpgsql
security definer
set search_path = 'public', 'sales_ai', 'pg_temp'
as $$
begin
  update sales_ai.requests
     set status = 'NEW',
         archived_at = null,
         archived_by = null,
         archive_reason = null,
         archive_note = null,
         updated_at = now()
   where id = p_request_id;

  insert into sales_ai.request_events (request_id, event_type, description, created_by)
  values (p_request_id, 'NOTA', 'Richiesta ripristinata dall''archivio', p_user);
end;
$$;

grant execute on function sales_ai.ripristina_richiesta(uuid, uuid) to authenticated;

-- 2) Offerte: stato di funnel Sales AI, distinto dallo stato ufficiale
--    Suite (public.offers.status). Una riga per opportunità (root_offer_id),
--    non per singola offerta/revisione.
create table if not exists sales_ai.offer_lifecycle (
  root_offer_id    uuid primary key,
  commercial_status text not null default 'OPEN'
    check (commercial_status in ('OPEN', 'WAITING', 'WON', 'LOST', 'ON_HOLD')),
  operational_status text,
  archived_at   timestamptz,
  archived_by   uuid,
  archive_reason text
    check (archive_reason is null or archive_reason in
      ('DUPLICATA', 'NON_PERTINENTE', 'CLIENTE_NON_PROCEDE', 'PROGETTO_SOSPESO', 'ALTRO')),
  archive_note  text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

alter table sales_ai.offer_lifecycle enable row level security;
-- Nessuna policy, come per il resto dello schema sales_ai: l'accesso passa
-- solo dalle funzioni SECURITY DEFINER qui sotto o dal service role.

create or replace function sales_ai.touch_offer_lifecycle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_offer_lifecycle_updated_at on sales_ai.offer_lifecycle;
create trigger trg_offer_lifecycle_updated_at
  before update on sales_ai.offer_lifecycle
  for each row execute function sales_ai.touch_offer_lifecycle_updated_at();

-- Legge (creandolo se manca) lo stato di funnel di un'opportunità.
create or replace function sales_ai.get_or_create_offer_lifecycle(p_root_offer_id uuid)
returns sales_ai.offer_lifecycle
language plpgsql
security definer
set search_path = 'public', 'sales_ai', 'pg_temp'
as $$
declare
  v_row sales_ai.offer_lifecycle;
begin
  select * into v_row from sales_ai.offer_lifecycle where root_offer_id = p_root_offer_id;
  if found then
    return v_row;
  end if;
  insert into sales_ai.offer_lifecycle (root_offer_id)
  values (p_root_offer_id)
  on conflict (root_offer_id) do nothing;
  select * into v_row from sales_ai.offer_lifecycle where root_offer_id = p_root_offer_id;
  return v_row;
end;
$$;

-- Aggiorna l'esito commerciale a valle di una nuova analisi AI. "Sales AI
-- imposta l'esito commerciale" (Rev.1, 13.3): la fonte è l'ultima
-- classificazione del motore, non un dato che l'utente scrive a mano.
create or replace function sales_ai.sync_offer_commercial_status(p_root_offer_id uuid, p_opportunity_status text)
returns void
language plpgsql
security definer
set search_path = 'public', 'sales_ai', 'pg_temp'
as $$
begin
  if p_opportunity_status is null or p_opportunity_status not in ('OPEN','WAITING','WON','LOST','ON_HOLD','UNKNOWN') then
    return; -- UNKNOWN o valore inatteso: non degradare uno stato già affidabile
  end if;
  if p_opportunity_status = 'UNKNOWN' then
    return;
  end if;

  insert into sales_ai.offer_lifecycle (root_offer_id, commercial_status)
  values (p_root_offer_id, p_opportunity_status)
  on conflict (root_offer_id) do update
    set commercial_status = excluded.commercial_status,
        updated_at = now()
    where sales_ai.offer_lifecycle.archived_at is null; -- un'opportunità archiviata non si riapre da sola
end;
$$;

-- Archiviazione manuale di un'opportunità post-offerta (eccezioni: offerta
-- duplicata, cliente non procede, ecc. — non il normale avanzamento).
create or replace function sales_ai.archivia_offerta(
  p_root_offer_id uuid, p_reason text, p_note text default null, p_user uuid default null
)
returns void
language plpgsql
security definer
set search_path = 'public', 'sales_ai', 'pg_temp'
as $$
begin
  if p_reason is null or p_reason not in ('DUPLICATA','NON_PERTINENTE','CLIENTE_NON_PROCEDE','PROGETTO_SOSPESO','ALTRO') then
    raise exception 'Motivo di archiviazione non valido';
  end if;
  if p_reason = 'ALTRO' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Serve una nota quando il motivo è "Altro"';
  end if;

  insert into sales_ai.offer_lifecycle (root_offer_id, archived_at, archived_by, archive_reason, archive_note, updated_by)
  values (p_root_offer_id, now(), p_user, p_reason, p_note, p_user)
  on conflict (root_offer_id) do update
    set archived_at = now(),
        archived_by = p_user,
        archive_reason = p_reason,
        archive_note = p_note,
        updated_by = p_user,
        updated_at = now();
end;
$$;

grant execute on function sales_ai.archivia_offerta(uuid, text, text, uuid) to authenticated;

create or replace function sales_ai.ripristina_offerta(p_root_offer_id uuid, p_user uuid default null)
returns void
language plpgsql
security definer
set search_path = 'public', 'sales_ai', 'pg_temp'
as $$
begin
  update sales_ai.offer_lifecycle
     set archived_at = null, archived_by = null, archive_reason = null, archive_note = null,
         updated_by = p_user, updated_at = now()
   where root_offer_id = p_root_offer_id;
end;
$$;

grant execute on function sales_ai.ripristina_offerta(uuid, uuid) to authenticated;

-- search_offers guadagna il filtro di vista (ATTIVE | WON | LOST | ARCHIVIATE
-- | TUTTE, default ATTIVE) secondo la regola 13.3: un'opportunità WON esce
-- dalle attive solo a passaggio a commessa completo (commessa_id valorizzato
-- e nessuna azione commerciale aperta e bloccante), mai per il solo status
-- Suite "accepted".
create or replace function sales_ai.search_offers(p_query text default null, p_limit integer default 20, p_view text default 'ACTIVE')
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'sales_ai', 'pg_temp'
as $function$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'offer_id', filtered.id,
      'offer_number', filtered.offer_number,
      'title', filtered.title,
      'status', filtered.status,
      'final_price_net', filtered.final_price_net,
      'client_name', filtered.client_name,
      'updated_at', filtered.updated_at,
      'sales_status', filtered.sales_status,
      'sales_open_actions', filtered.open_actions_count,
      'commercial_status', filtered.commercial_status,
      'operational_status', filtered.operational_status,
      'archived_at', filtered.archived_at,
      'lifecycle_view', filtered.lifecycle_view
    ) order by filtered.updated_at desc), '[]'::jsonb)
    into v_result
  from (
    select sub.*
      from (
        select o.id, o.offer_number, o.title, o.status, o.final_price_net, o.updated_at,
               coalesce(c.company_name, c.display_name) as client_name,
               latest.classification as sales_status,
               coalesce(oa_count.n, 0) as open_actions_count,
               coalesce(ol.commercial_status, 'OPEN') as commercial_status,
               ol.operational_status,
               ol.archived_at,
               case
                 when ol.archived_at is not null then 'ARCHIVED'
                 when coalesce(ol.commercial_status, 'OPEN') = 'LOST' then 'LOST'
                 when coalesce(ol.commercial_status, 'OPEN') = 'WON'
                      and o.commessa_id is not null
                      and coalesce(oa_blocking.n, 0) = 0
                   then 'WON'
                 else 'ACTIVE'
               end as lifecycle_view
          from public.offers o
          left join public.clients c on c.id = o.client_id
          left join sales_ai.offer_lifecycle ol on ol.root_offer_id = coalesce(o.root_offer_id, o.id)
          left join lateral (
            select a.classification
              from sales_ai.ai_analyses a
             where a.root_offer_id = coalesce(o.root_offer_id, o.id)
             order by a.created_at desc
             limit 1
          ) latest on true
          left join lateral (
            select count(*) as n from sales_ai.open_actions oa
             where oa.status = 'OPEN' and oa.root_offer_id = coalesce(o.root_offer_id, o.id)
          ) oa_count on true
          left join lateral (
            select count(*) as n from sales_ai.open_actions oa
             where oa.status = 'OPEN' and oa.blocking and oa.root_offer_id = coalesce(o.root_offer_id, o.id)
          ) oa_blocking on true
         where p_query is null or p_query = ''
            or o.offer_number ilike '%' || p_query || '%'
            or c.company_name ilike '%' || p_query || '%'
            or c.display_name ilike '%' || p_query || '%'
      ) sub
     where case upper(coalesce(p_view, 'ACTIVE'))
             when 'ACTIVE'   then sub.lifecycle_view = 'ACTIVE'
             when 'WON'      then sub.lifecycle_view = 'WON'
             when 'LOST'     then sub.lifecycle_view = 'LOST'
             when 'ARCHIVED' then sub.lifecycle_view = 'ARCHIVED'
             else true
           end
     order by sub.updated_at desc
     limit p_limit
  ) filtered;

  return v_result;
end;
$function$;

grant execute on function sales_ai.search_offers(text, integer, text) to authenticated;
