-- Rev.1 §06: "+ Aggiungi evento" e "+ Aggiungi allegato" sulla pagina
-- offerta, con lo stesso pattern già costruito per le richieste (§04 e gli
-- eventi manuali). Invece di duplicare le tabelle, request_events e
-- request_attachments diventano a doppio scope — esattamente il pattern
-- già in uso su sales_ai.ai_analyses e sales_ai.open_actions
-- (num_nonnulls(root_offer_id, request_id) = 1).

alter table sales_ai.request_events alter column request_id drop not null;
alter table sales_ai.request_events add column if not exists root_offer_id uuid references public.offers(id) on delete cascade;
alter table sales_ai.request_events add constraint request_events_exactly_one_scope check (num_nonnulls(root_offer_id, request_id) = 1);
create index if not exists request_events_root_offer_id_idx on sales_ai.request_events(root_offer_id);

alter table sales_ai.request_attachments alter column request_id drop not null;
alter table sales_ai.request_attachments add column if not exists root_offer_id uuid references public.offers(id) on delete cascade;
alter table sales_ai.request_attachments add constraint request_attachments_exactly_one_scope check (num_nonnulls(root_offer_id, request_id) = 1);
create index if not exists request_attachments_root_offer_id_idx on sales_ai.request_attachments(root_offer_id);

-- CREATE OR REPLACE non basta: aggiungere un parametro in coda cambia la
-- firma (9 argomenti -> 10), quindi senza il DROP esplicito Postgres
-- creerebbe una seconda funzione sovrapposta invece di sostituire quella
-- esistente.
drop function if exists sales_ai.aggiungi_evento(uuid, text, text, timestamptz, text, text, text, date, uuid);

create or replace function sales_ai.aggiungi_evento(
  p_request_id uuid default null,
  p_event_type text default null,
  p_description text default null,
  p_event_at timestamptz default now(),
  p_contact_name text default null,
  p_outcome text default null,
  p_next_action text default null,
  p_followup date default null,
  p_user uuid default null,
  p_root_offer_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'sales_ai', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if num_nonnulls(p_request_id, p_root_offer_id) <> 1 then
    raise exception 'Serve esattamente uno tra richiesta e offerta';
  end if;
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'La descrizione dell''evento non puo'' essere vuota';
  end if;

  insert into sales_ai.request_events
    (request_id, root_offer_id, event_type, event_at, contact_name, description, outcome, next_action, followup_date, created_by)
  values
    (p_request_id, p_root_offer_id, p_event_type, coalesce(p_event_at, now()), p_contact_name,
     btrim(p_description), p_outcome, p_next_action, p_followup, p_user)
  returning id into v_id;

  if p_request_id is not null then
    if not exists (select 1 from sales_ai.analysis_jobs j where j.request_id = p_request_id and j.status = 'PENDING') then
      insert into sales_ai.analysis_jobs (request_id, created_by, priority) values (p_request_id, p_user, 120);
    end if;
  else
    if not exists (select 1 from sales_ai.analysis_jobs j where j.root_offer_id = p_root_offer_id and j.status = 'PENDING') then
      insert into sales_ai.analysis_jobs (root_offer_id, created_by, priority) values (p_root_offer_id, p_user, 120);
    end if;
  end if;

  return v_id;
end;
$function$;

-- Sostituisce aggiungi_allegato_richiesta: stesso doppio scope di
-- aggiungi_evento, e stesso comportamento (accoda un job se non ce n'è già
-- uno in attesa) — nella versione precedente questo passaggio mancava, e
-- l'allegato non innescava davvero una rianalisi finché non c'era già un
-- job in coda per altri motivi.
drop function if exists sales_ai.aggiungi_allegato_richiesta(uuid, text, text, integer, text, uuid);

create or replace function sales_ai.aggiungi_allegato(
  p_request_id uuid default null,
  p_root_offer_id uuid default null,
  p_nome_file text default null,
  p_tipo_file text default null,
  p_dimensione_kb integer default null,
  p_storage_path text default null,
  p_user uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'sales_ai', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if num_nonnulls(p_request_id, p_root_offer_id) <> 1 then
    raise exception 'Serve esattamente uno tra richiesta e offerta';
  end if;
  if coalesce(btrim(p_storage_path), '') = '' then
    raise exception 'Percorso file mancante';
  end if;
  if coalesce(btrim(p_nome_file), '') = '' then
    raise exception 'Nome file mancante';
  end if;

  insert into sales_ai.request_attachments (request_id, root_offer_id, nome_file, tipo_file, dimensione_kb, storage_path, caricato_da)
  values (p_request_id, p_root_offer_id, btrim(p_nome_file), p_tipo_file, p_dimensione_kb, p_storage_path, p_user)
  returning id into v_id;

  if p_request_id is not null then
    if not exists (select 1 from sales_ai.analysis_jobs j where j.request_id = p_request_id and j.status = 'PENDING') then
      insert into sales_ai.analysis_jobs (request_id, created_by, priority) values (p_request_id, p_user, 120);
    end if;
  else
    if not exists (select 1 from sales_ai.analysis_jobs j where j.root_offer_id = p_root_offer_id and j.status = 'PENDING') then
      insert into sales_ai.analysis_jobs (root_offer_id, created_by, priority) values (p_root_offer_id, p_user, 120);
    end if;
  end if;

  return v_id;
end;
$function$;

-- Cronologia eventi/allegati di un'opportunità (senza le email, già
-- mostrate a parte in "Email collegate" sulla pagina offerta): stesso
-- shape di get_request_timeline per poter riusare la stessa UI.
create or replace function sales_ai.get_offer_events_timeline(p_root_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'sales_ai', 'pg_temp'
as $function$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t) order by t.avvenuto_il desc), '[]'::jsonb)
    into v_result
  from (
    select ev.event_type as tipo,
           ev.id as id,
           ev.event_at as avvenuto_il,
           null::text as direzione,
           coalesce(ev.contact_name, trim(coalesce(p.nome, '') || ' ' || coalesce(p.cognome, ''))) as interlocutore,
           null::text as titolo,
           ev.description as testo,
           ev.outcome as esito,
           ev.next_action as prossima_azione,
           ev.followup_date as data_followup,
           0 as allegati,
           null::uuid as allegato_id
      from sales_ai.request_events ev
      left join public.profili_utenti p on p.id = ev.created_by
     where ev.root_offer_id = p_root_offer_id
    union all
    select 'ALLEGATO',
           ra.id,
           ra.created_at,
           null,
           trim(coalesce(p.nome, '') || ' ' || coalesce(p.cognome, '')),
           ra.nome_file,
           null,
           null,
           null,
           null::date,
           1,
           ra.id
      from sales_ai.request_attachments ra
      left join public.profili_utenti p on p.id = ra.caricato_da
     where ra.root_offer_id = p_root_offer_id
  ) t;

  return v_result;
end;
$function$;
