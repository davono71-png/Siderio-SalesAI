-- Sales AI schema V1 — sostituisce la proposta Fase 1 (offer_local_state /
-- offer_analysis, entrambe vuote, 0 righe: nessun dato perso) con un design
-- pensato per il caso reale trovato nei test: più azioni aperte in parallelo
-- sulla stessa opportunità, quindi coda job invece di un'unica riga di stato,
-- e una tabella open_actions distinta da ai_analyses.
--
-- Applicata manualmente sul progetto Supabase condiviso il 27/08/2026,
-- verificata con Davide. Questo file la porta sotto controllo di versione.

drop table if exists sales_ai.offer_analysis;
drop table if exists sales_ai.offer_local_state;

create schema if not exists sales_ai;
create extension if not exists pgcrypto;

create table if not exists sales_ai.requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid null references public.clients(id) on delete set null,
  source_email_id uuid null references public.email_messaggi(id) on delete set null,
  title text not null,
  status text not null default 'NEW' check (status in (
    'NEW','TO_QUALIFY','WAITING_INFORMATION','TO_EVALUATE','CONVERTED_TO_OFFER','ARCHIVED'
  )),
  channel text not null default 'UNKNOWN' check (channel in ('DIRECT','AGENCY','UNKNOWN')),
  agency_name text null,
  created_by uuid null references public.profili_utenti(id) on delete set null,
  converted_offer_id uuid null references public.offers(id) on delete set null,
  converted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sales_ai.request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references sales_ai.requests(id) on delete cascade,
  email_id uuid not null references public.email_messaggi(id) on delete cascade,
  origin text not null default 'MANUAL' check (origin in ('AUTO','AI','MANUAL')),
  match_confidence numeric(4,3) null check (match_confidence between 0 and 1),
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (request_id, email_id)
);

create table if not exists sales_ai.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  root_offer_id uuid null references public.offers(id) on delete cascade,
  request_id uuid null references sales_ai.requests(id) on delete cascade,
  trigger_email_id uuid null references public.email_messaggi(id) on delete set null,
  prompt_version text not null,
  model text not null,
  classification text not null check (classification in ('NEW_REQUEST','EXISTING_OPPORTUNITY','NOT_COMMERCIAL','UNCERTAIN')),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  result_json jsonb not null,
  openai_response_id text null,
  usage_json jsonb null,
  created_at timestamptz not null default now(),
  constraint ai_analyses_exactly_one_scope check (num_nonnulls(root_offer_id, request_id) = 1)
);

create table if not exists sales_ai.open_actions (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references sales_ai.ai_analyses(id) on delete cascade,
  root_offer_id uuid null references public.offers(id) on delete cascade,
  request_id uuid null references sales_ai.requests(id) on delete cascade,
  actor text not null check (actor in ('SIDERIO','CUSTOMER','AGENCY','ARCHITECT','OTHER')),
  action_type text null,
  description text not null,
  due_date date null,
  blocking boolean not null default false,
  status text not null default 'OPEN' check (status in ('OPEN','DONE','DISMISSED','SUPERSEDED')),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint open_actions_exactly_one_scope check (num_nonnulls(root_offer_id, request_id) = 1)
);

create table if not exists sales_ai.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references sales_ai.ai_analyses(id) on delete cascade,
  result text not null check (result in ('CORRECT','PARTIAL','WRONG','CRITICAL')),
  notes text null,
  corrected_json jsonb null,
  user_id uuid null references public.profili_utenti(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists sales_ai.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  root_offer_id uuid null references public.offers(id) on delete cascade,
  request_id uuid null references sales_ai.requests(id) on delete cascade,
  trigger_email_id uuid null references public.email_messaggi(id) on delete set null,
  analysis_id uuid null references sales_ai.ai_analyses(id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED')),
  attempts integer not null default 0,
  priority integer not null default 100,
  last_error text null,
  created_by uuid null references public.profili_utenti(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  constraint analysis_jobs_exactly_one_scope check (num_nonnulls(root_offer_id, request_id) = 1)
);

create index if not exists requests_client_idx on sales_ai.requests(client_id);
create index if not exists request_messages_request_idx on sales_ai.request_messages(request_id);
create index if not exists request_messages_email_idx on sales_ai.request_messages(email_id);
create index if not exists ai_analyses_root_offer_idx on sales_ai.ai_analyses(root_offer_id, created_at desc);
create index if not exists ai_analyses_request_idx on sales_ai.ai_analyses(request_id, created_at desc);
create index if not exists open_actions_root_offer_open_idx on sales_ai.open_actions(root_offer_id, status) where status = 'OPEN';
create index if not exists open_actions_request_open_idx on sales_ai.open_actions(request_id, status) where status = 'OPEN';
create index if not exists analysis_jobs_queue_idx on sales_ai.analysis_jobs(status, priority desc, created_at asc);

-- RLS: attiva e chiusa di default. Le API server-side usano la service role.
alter table sales_ai.requests enable row level security;
alter table sales_ai.request_messages enable row level security;
alter table sales_ai.ai_analyses enable row level security;
alter table sales_ai.open_actions enable row level security;
alter table sales_ai.ai_feedback enable row level security;
alter table sales_ai.analysis_jobs enable row level security;

create or replace function sales_ai.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sales_ai_requests_updated_at on sales_ai.requests;
create trigger trg_sales_ai_requests_updated_at
before update on sales_ai.requests
for each row execute function sales_ai.touch_updated_at();

-- Claim atomico del prossimo job: una funzione serverless elabora un job per invocazione.
create or replace function sales_ai.claim_next_analysis_job()
returns sales_ai.analysis_jobs
language plpgsql
security definer
set search_path = sales_ai, public
as $$
declare
  claimed sales_ai.analysis_jobs;
begin
  select *
  into claimed
  from sales_ai.analysis_jobs
  where status = 'PENDING'
  order by priority desc, created_at asc
  for update skip locked
  limit 1;

  if claimed.id is null then
    return null;
  end if;

  update sales_ai.analysis_jobs
  set status = 'RUNNING',
      attempts = attempts + 1,
      started_at = now(),
      last_error = null
  where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$$;

grant usage on schema sales_ai to service_role;
grant all on all tables in schema sales_ai to service_role;
grant usage, select on all sequences in schema sales_ai to service_role;
grant execute on function sales_ai.claim_next_analysis_job() to service_role;
