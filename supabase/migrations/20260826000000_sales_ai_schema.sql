-- Siderio Sales AI — schema iniziale (Fase 1)
-- Vive nello stesso progetto Supabase di Siderio Suite, in uno schema separato.
-- Non modifica nessuna tabella esistente di Suite (schema public).

create extension if not exists pgcrypto;

create schema if not exists sales_ai;

-- Stato "vivo" corrente di un'offerta lato Sales AI (una riga per offerta).
create table if not exists sales_ai.offer_local_state (
  offer_id uuid primary key,
  status text not null default 'nessuna_azione'
    check (status in ('nessuna_azione','da_monitorare','followup_consigliato','attenzione','attesa_programmata')),
  priority text
    check (priority is null or priority in ('bassa','media','alta')),
  action_owner text,
  waiting_for text,
  next_action text,
  next_action_date date,
  reason text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- Storico delle valutazioni (append-only).
create table if not exists sales_ai.offer_analysis (
  analysis_id uuid primary key default gen_random_uuid(),
  offer_id uuid not null,
  analysis_date timestamptz not null default now(),
  result jsonb,
  human_decision jsonb,
  human_correction text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists offer_analysis_offer_id_idx on sales_ai.offer_analysis (offer_id, analysis_date desc);

alter table sales_ai.offer_local_state enable row level security;
alter table sales_ai.offer_analysis enable row level security;

-- Ruolo unico: qualunque utente autenticato (stesse credenziali di Suite) ha pieno accesso.
drop policy if exists offer_local_state_all on sales_ai.offer_local_state;
create policy offer_local_state_all on sales_ai.offer_local_state
  for all to authenticated using (true) with check (true);

drop policy if exists offer_analysis_all on sales_ai.offer_analysis;
create policy offer_analysis_all on sales_ai.offer_analysis
  for all to authenticated using (true) with check (true);

grant usage on schema sales_ai to authenticated;
grant select, insert, update on sales_ai.offer_local_state to authenticated;
grant select, insert on sales_ai.offer_analysis to authenticated;

-- Contratto di lettura verso Suite (SUITE_INTEGRATION.md).
-- SECURITY DEFINER: gli utenti Sales AI leggono questi campi indipendentemente
-- dal proprio ruolo applicativo in Suite (che regola tutt'altro, l'accesso diretto
-- alle tabelle di Suite). Nessuna tabella di Suite viene concessa direttamente.

create or replace function sales_ai.get_offer_context(p_offer_number text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer record;
  v_result jsonb;
begin
  select o.id, o.offer_number, o.status, o.title, o.work_description_final,
         o.final_price_net, o.final_price_vat, o.agente, o.created_at, o.sent_at, o.accepted_at,
         o.internal_notes, o.followup_notes, o.followup_secondo_richiamo, o.followup_sospesa,
         o.client_id
    into v_offer
    from public.offers o
   where o.offer_number = p_offer_number;

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'offer_id', v_offer.id,
    'offer_number', v_offer.offer_number,
    'status', v_offer.status,
    'title', v_offer.title,
    'work_description', v_offer.work_description_final,
    'final_price_net', v_offer.final_price_net,
    'final_price_vat', v_offer.final_price_vat,
    'agente', v_offer.agente,
    'created_at', v_offer.created_at,
    'sent_at', v_offer.sent_at,
    'accepted_at', v_offer.accepted_at,
    'internal_notes', v_offer.internal_notes,
    'followup_notes', v_offer.followup_notes,
    'followup_secondo_richiamo', v_offer.followup_secondo_richiamo,
    'followup_sospesa', v_offer.followup_sospesa,
    'client', (
      select jsonb_build_object(
        'display_name', c.display_name,
        'company_name', c.company_name,
        'contact_person', c.contact_person,
        'email', c.email,
        'phone', c.phone
      )
      from public.clients c where c.id = v_offer.client_id
    ),
    'emails', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'da', e.da, 'destinatari', e.destinatari, 'oggetto', e.oggetto,
        'corpo', e.corpo, 'direzione', e.direzione, 'created_at', e.created_at
      ) order by e.created_at desc), '[]'::jsonb)
      from public.email_messaggi e where e.offerta_id = v_offer.id
    ),
    'attachments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'nome_file', a.nome_file, 'tipo_file', a.tipo_file, 'created_at', a.created_at
      )), '[]'::jsonb)
      from public.offerte_allegati a where a.offerta_id::uuid = v_offer.id
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function sales_ai.get_offer_context(text) to authenticated;

-- Ricerca/elenco offerte recenti, con lo stato Sales AI già unito.
create or replace function sales_ai.search_offers(p_query text default null, p_limit int default 20)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
      'sales_priority', sub.sales_priority,
      'next_action_date', sub.next_action_date
    ) order by sub.updated_at desc), '[]'::jsonb)
    into v_result
  from (
    select o.id, o.offer_number, o.title, o.status, o.final_price_net, o.updated_at,
           coalesce(c.company_name, c.display_name) as client_name,
           s.status as sales_status, s.priority as sales_priority, s.next_action_date
    from public.offers o
    left join public.clients c on c.id = o.client_id
    left join sales_ai.offer_local_state s on s.offer_id = o.id
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

-- Espone lo schema sales_ai via l'API REST di Supabase (PostgREST), in aggiunta a "public".
-- Non rimuove né limita l'esposizione esistente di "public" usata da Siderio Suite.
alter role authenticator set pgrst.db_schemas = 'public, sales_ai';
notify pgrst, 'reload config';
