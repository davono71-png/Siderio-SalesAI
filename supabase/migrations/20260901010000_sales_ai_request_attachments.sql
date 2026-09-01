-- Rev.1 §04: upload allegati a livello di richiesta (pre-offerta). Prima
-- d'ora una richiesta poteva avere solo allegati email (mai leggibili
-- dall'AI in questa versione); qui si aggiunge la possibilità di caricare
-- a mano foto, PDF, disegni — lo stesso pattern già usato per gli eventi
-- manuali (sales_ai.request_events / aggiungi_evento), non un allegato
-- email.
--
-- Bucket privato dedicato (non allegati-offerte, che appartiene al dominio
-- offerte di Suite): l'accesso passa sempre dal client service-role, mai
-- da RLS diretta, come per il resto dello schema sales_ai.
insert into storage.buckets (id, name, public, file_size_limit)
values ('allegati-richieste', 'allegati-richieste', false, 20971520)
on conflict (id) do nothing;

create table if not exists sales_ai.request_attachments (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references sales_ai.requests(id) on delete cascade,
  nome_file     text not null,
  tipo_file     text,
  dimensione_kb integer,
  storage_path  text not null,
  caricato_da   uuid,
  created_at    timestamptz not null default now()
);

create index if not exists request_attachments_request_id_idx on sales_ai.request_attachments(request_id);

-- Stessa postura del resto dello schema: RLS attiva e zero policy, l'unico
-- accesso è tramite funzioni SECURITY DEFINER o il client service-role.
alter table sales_ai.request_attachments enable row level security;

create or replace function sales_ai.aggiungi_allegato_richiesta(
  p_request_id uuid,
  p_nome_file text,
  p_tipo_file text,
  p_dimensione_kb integer,
  p_storage_path text,
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
  if not exists (select 1 from sales_ai.requests where id = p_request_id) then
    raise exception 'Richiesta non trovata';
  end if;
  if coalesce(btrim(p_storage_path), '') = '' then
    raise exception 'Percorso file mancante';
  end if;
  if coalesce(btrim(p_nome_file), '') = '' then
    raise exception 'Nome file mancante';
  end if;

  insert into sales_ai.request_attachments (request_id, nome_file, tipo_file, dimensione_kb, storage_path, caricato_da)
  values (p_request_id, btrim(p_nome_file), p_tipo_file, p_dimensione_kb, p_storage_path, p_user)
  returning id into v_id;

  return v_id;
end;
$function$;

-- La storia della richiesta (get_request_timeline) mostrava solo email ed
-- eventi manuali: un allegato caricato ora vi compare come voce propria
-- ('ALLEGATO'), con allegato_id per il pulsante "Apri" lato client (mai lo
-- storage_path grezzo: quello resta lato server, dietro a un URL firmato).
create or replace function sales_ai.get_request_timeline(p_request_id uuid)
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
    select 'EMAIL'::text        as tipo,
           e.id                 as id,
           e.created_at         as avvenuto_il,
           e.direzione          as direzione,
           e.da                 as interlocutore,
           e.oggetto            as titolo,
           left(coalesce(e.corpo, ''), 600) as testo,
           null::text           as esito,
           null::text           as prossima_azione,
           null::date           as data_followup,
           jsonb_array_length(coalesce(e.allegati, '[]'::jsonb)) as allegati,
           null::uuid           as allegato_id
      from sales_ai.request_messages rm
      join public.email_messaggi e on e.id = rm.email_id
     where rm.request_id = p_request_id
    union all
    select ev.event_type,
           ev.id,
           ev.event_at,
           null,
           coalesce(ev.contact_name, trim(coalesce(p.nome, '') || ' ' || coalesce(p.cognome, ''))),
           null,
           ev.description,
           ev.outcome,
           ev.next_action,
           ev.followup_date,
           0,
           null::uuid
      from sales_ai.request_events ev
      left join public.profili_utenti p on p.id = ev.created_by
     where ev.request_id = p_request_id
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
     where ra.request_id = p_request_id
  ) t;

  return v_result;
end;
$function$;

create or replace function sales_ai.get_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'sales_ai', 'pg_temp'
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
      'email',     (select count(*) from sales_ai.request_messages    rm where rm.request_id = p_request_id),
      'eventi',    (select count(*) from sales_ai.request_events      ev where ev.request_id = p_request_id),
      'analisi',   (select count(*) from sales_ai.ai_analyses         a  where a.request_id  = p_request_id),
      'allegati',  (select count(*) from sales_ai.request_attachments ra where ra.request_id = p_request_id)
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
