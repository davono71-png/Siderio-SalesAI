-- Collega l'anagrafica cliente di Suite alle richieste Sales AI.
--
-- Bug reale osservato sull'offerta #6757: nata da una richiesta creata a
-- mano (NuovaRichiesta.tsx) che non aveva alcun campo per scegliere il
-- cliente, quindi client_id restava null sulla richiesta e, per copia
-- diretta, anche sull'offerta creata da converti_richiesta_in_offerta().
-- Un'offerta senza client_id è un dato incompleto in Suite.
--
-- Ricerca invece di creazione: in clients esistono già più anagrafiche
-- quasi identiche per lo stesso cliente reale (es. "CM CLEANING CO." /
-- "CM CLEANING CO. SRL" / duplicato con la stessa email) — una funzione
-- che potesse crearne una nuova al volo peggiorerebbe la duplicazione.
-- L'utente cerca e sceglie tra quelle esistenti.

create or replace function sales_ai.search_clients(p_query text default null, p_limit int default 8)
returns jsonb
language sql
security definer
set search_path = 'public', 'sales_ai', 'pg_temp'
as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  from (
    select id, display_name, company_name, contact_person, email, phone, city
    from public.clients
    where p_query is null or btrim(p_query) = ''
       or display_name ilike '%' || btrim(p_query) || '%'
       or company_name ilike '%' || btrim(p_query) || '%'
       or contact_person ilike '%' || btrim(p_query) || '%'
       or email ilike '%' || btrim(p_query) || '%'
    order by display_name nulls last
    limit greatest(1, least(p_limit, 25))
  ) t;
$$;

grant execute on function sales_ai.search_clients(text, int) to authenticated;

create or replace function sales_ai.imposta_cliente_richiesta(p_request_id uuid, p_client_id uuid, p_user uuid default null)
returns void
language plpgsql
security definer
set search_path = 'public', 'sales_ai', 'pg_temp'
as $$
begin
  if not exists (select 1 from sales_ai.requests where id = p_request_id) then
    raise exception 'Richiesta non trovata';
  end if;
  if p_client_id is not null and not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'Cliente non trovato';
  end if;

  update sales_ai.requests
     set client_id = p_client_id,
         updated_at = now()
   where id = p_request_id;

  insert into sales_ai.request_events (request_id, event_type, description, created_by)
  values (
    p_request_id,
    'NOTA',
    case when p_client_id is null then 'Collegamento al cliente rimosso'
         else 'Collegata all''anagrafica cliente di Suite' end,
    p_user
  );
end;
$$;

grant execute on function sales_ai.imposta_cliente_richiesta(uuid, uuid, uuid) to authenticated;
