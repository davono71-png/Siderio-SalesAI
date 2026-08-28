-- La richiesta diventa un oggetto autonomo, non un contenitore di email.
-- Specifica di Mattia Delbarba, 28/08/2026.
--
-- Il principio: Sales AI non deve essere "AI che legge le email" ma "AI che
-- comprende l'opportunità commerciale". Una trattativa vive anche di telefonate,
-- incontri e sopralluoghi, e oggi quelle informazioni restano nella testa di chi
-- ha risposto al telefono. Il caso tipico: il cliente scrive una richiesta
-- generica via email, poi al telefono specifica quantità, materiale, colore e
-- data — e per il sistema quella telefonata non è mai esistita.
--
-- Nota su request_emails: la tabella richiesta esiste già dallo schema V1 con il
-- nome sales_ai.request_messages (stessa forma: request_id, email_id, created_at,
-- più origin/match_confidence/confirmed). Non ne creo una seconda.
--
-- Nota sugli stati: i valori restano in inglese (NEW, TO_QUALIFY,
-- WAITING_INFORMATION, TO_EVALUATE, CONVERTED_TO_OFFER, ARCHIVED) perché sono
-- gli stessi che usa lo schema di output del modello; la traduzione italiana
-- (NUOVA, DA QUALIFICARE, ...) la fa la UI, come già per le classificazioni.

-- Campi che la richiesta deve avere di suo, indipendentemente dalle email.
alter table sales_ai.requests
  add column if not exists contact_name           text,
  add column if not exists installation_location  text,
  add column if not exists notes                  text,
  -- Separato da channel di proposito: un architetto che tratta direttamente con
  -- Siderio resta DIRECT anche se commercialmente è attribuito a un'agenzia.
  add column if not exists agency_source          text,
  -- Stima interna Siderio: cosa pensiamo NOI che costi. Concetto diverso dal
  -- budget del cliente, che vive in result_json.request.customer_budget.
  -- Per ora si scrive a mano.
  add column if not exists estimate_min           numeric(12,2),
  add column if not exists estimate_max           numeric(12,2),
  add column if not exists estimate_note          text;

comment on column sales_ai.requests.agency_source is
  'Agenzia a cui la richiesta è attribuita. Indipendente da channel.';
comment on column sales_ai.requests.estimate_min is
  'Stima preliminare Siderio, non il budget del cliente.';

-- Tutto ciò che accade e non è una email.
create table if not exists sales_ai.request_events (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references sales_ai.requests(id) on delete cascade,

  event_type    text not null check (event_type in
    ('TELEFONATA', 'INCONTRO', 'SOPRALLUOGO', 'MESSAGGIO', 'NOTA', 'ALTRO')),
  event_at      timestamptz not null default now(),

  contact_name  text,
  description   text not null,
  outcome       text,
  next_action   text,
  followup_date date,

  created_by    uuid references public.profili_utenti(id) on delete set null,
  created_at    timestamptz not null default now()
);

comment on table sales_ai.request_events is
  'Telefonate, incontri, sopralluoghi, note. Per l''AI valgono quanto le email.';

create index if not exists request_events_request_idx
  on sales_ai.request_events (request_id, event_at desc);

alter table sales_ai.request_events enable row level security;
grant all on sales_ai.request_events to service_role;

-- La storia commerciale della richiesta: email ed eventi nello stesso elenco,
-- ordinati per quando sono successi. Una sola timeline, non una sezione per
-- ogni mezzo di comunicazione — è il modo in cui la trattativa è andata
-- davvero, ed è quello che deve leggere anche il modello.
create or replace function sales_ai.get_request_timeline(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, sales_ai, pg_temp
as $$
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
           jsonb_array_length(coalesce(e.allegati, '[]'::jsonb)) as allegati
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
           0
      from sales_ai.request_events ev
      left join public.profili_utenti p on p.id = ev.created_by
     where ev.request_id = p_request_id
  ) t;

  return v_result;
end;
$$;

grant execute on function sales_ai.get_request_timeline(uuid) to authenticated;

-- Scheda completa della richiesta: anagrafica, ultima analisi, azioni aperte,
-- conteggi, timeline. Un solo giro invece di cinque.
create or replace function sales_ai.get_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, sales_ai, pg_temp
as $$
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
        'offer_number', o.offer_number
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
    -- Un job ancora in coda: la scheda mostra "analisi in corso" invece di
    -- restare su "Non analizzata" all'infinito.
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
$$;

grant execute on function sales_ai.get_request(uuid) to authenticated;

-- Registra un evento e accoda subito la rianalisi: un'informazione raccolta al
-- telefono deve valere quanto una arrivata per email, quindi la richiesta va
-- rivalutata come se fosse arrivato un messaggio nuovo.
create or replace function sales_ai.aggiungi_evento(
  p_request_id   uuid,
  p_event_type   text,
  p_description  text,
  p_event_at     timestamptz default now(),
  p_contact_name text default null,
  p_outcome      text default null,
  p_next_action  text default null,
  p_followup     date default null,
  p_user         uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, sales_ai, pg_temp
as $$
declare
  v_id uuid;
begin
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'La descrizione dell''evento non puo'' essere vuota';
  end if;

  insert into sales_ai.request_events
    (request_id, event_type, event_at, contact_name, description, outcome, next_action, followup_date, created_by)
  values
    (p_request_id, p_event_type, coalesce(p_event_at, now()), p_contact_name,
     btrim(p_description), p_outcome, p_next_action, p_followup, p_user)
  returning id into v_id;

  -- Un solo job in coda per richiesta: se ce n'è già uno che deve ancora
  -- girare leggerà comunque anche questo evento.
  if not exists (
    select 1 from sales_ai.analysis_jobs j
     where j.request_id = p_request_id and j.status = 'PENDING'
  ) then
    insert into sales_ai.analysis_jobs (request_id, created_by, priority)
    values (p_request_id, p_user, 120);
  end if;

  return v_id;
end;
$$;

grant execute on function sales_ai.aggiungi_evento(uuid, text, text, timestamptz, text, text, text, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Applicate insieme a questa (stessa sessione): analisi automatica alla
-- creazione della richiesta, creazione manuale, cambio stato, elenco
-- arricchito, e conversione in offerta. Vedi migration sales_ai_richiesta_
-- analisi_automatica e sales_ai_converti_richiesta sul progetto.
