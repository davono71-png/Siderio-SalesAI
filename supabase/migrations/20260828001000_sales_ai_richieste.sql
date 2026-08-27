-- Rilevatore di richieste commerciali: porta in sales_ai.requests le email di
-- controparti riconosciute per cui non esiste ancora un'offerta.
--
-- Perché prima delle Richieste e non del ranking degli agganci: misurando
-- l'archivio il 27/08/2026, delle email orfane recenti attribuite a un cliente
-- solo 22 arrivavano a 1-3 offerte candidate, mentre 209 erano di clienti senza
-- nessuna offerta. Suite contiene 111 offerte partite il 12/05/2026, contro un
-- anno di email: la maggior parte della posta commerciale non ha un'offerta a
-- cui attaccarsi perché l'offerta non è mai stata creata. Quelle non sono
-- agganci mancati, sono richieste.
--
-- Cinque filtri, tutti dettati da falsi positivi visti in un campione reale:
--   - fuori ESCLUDI / INTERNO / NOTIFICATORE (già classificati);
--   - fuori FORNITORE: manda DDT e conferme d'ordine, non richieste. Nel
--     campione erano la maggioranza dei falsi positivi ("invio ddt",
--     "Documento di trasporto Nr. 3646", "DDT CON PREZZI");
--   - fuori gli indirizzi interni, anche su domini generici (davono71@gmail.com
--     risultava l'identità di due clienti e le mail che Davide manda a sé
--     stesso sarebbero diventate richieste);
--   - fuori le risposte automatiche e la posta amministrativa (fatture, DDT,
--     solleciti): riconoscibili dall'oggetto senza scomodare il modello;
--   - fuori le email già agganciate, già in una richiesta o già scartate.
--
-- Quello che resta è un candidato, non una richiesta: la classificazione vera
-- (NEW_REQUEST / NOT_COMMERCIAL) resta all'analisi AI, e la conferma all'umano.

create table if not exists sales_ai.dismissed_emails (
  email_id   uuid primary key references public.email_messaggi(id) on delete cascade,
  motivo     text,
  user_id    uuid null references public.profili_utenti(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table sales_ai.dismissed_emails enable row level security;
grant all on sales_ai.dismissed_emails to service_role;

comment on table sales_ai.dismissed_emails is
  'Email scartate a mano dai candidati richiesta: non ripresentarle.';

-- Oggetti che non sono mai una richiesta commerciale.
create or replace function sales_ai.oggetto_non_commerciale(p_oggetto text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_oggetto, '') ~* (
    '^\s*(risposta automatica|automatic reply|out of office|assente|' ||
    'delivery status|undelivered|mail delivery|non recapitat)'
  )
  or coalesce(p_oggetto, '') ~* (
    '\m(fattura|fatture|ddt|documento di trasporto|sollecito|estratto conto|' ||
    'nota di credito|bonifico|scadenzario|f24|cedolino|busta paga)\M'
  );
$$;

-- Candidati richiesta, raggruppati per cliente + oggetto normalizzato: una
-- conversazione è una richiesta, non cinque.
create or replace function sales_ai.get_request_candidates(p_limit int default 60, p_dal date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, sales_ai, pg_temp
as $$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(g) order by g.ultima desc), '[]'::jsonb)
    into v_result
  from (
    select x.client_id,
           coalesce(cl.company_name, cl.display_name) as client_name,
           x.subj_norm,
           min(x.oggetto)            as titolo,
           count(*)                  as email_count,
           min(x.created_at)         as prima,
           max(x.created_at)         as ultima,
           max(x.confidenza)         as identita_confidenza,
           min(x.origine)            as identita_origine,
           array_agg(x.id order by x.created_at)      as email_ids,
           (array_agg(x.id order by x.created_at))[1] as source_email_id,
           (array_agg(x.addr order by x.created_at))[1] as mittente,
           (array_agg(left(coalesce(x.corpo, ''), 300) order by x.created_at desc))[1] as anteprima
      from (
        select e.id, e.oggetto, e.corpo, e.created_at,
               lower(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+')) as addr,
               lower(split_part(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+'), '@', 2)) as dom,
               lower(btrim(regexp_replace(coalesce(e.oggetto, ''), '^((re|r|fwd|fw|i)\s*:\s*)+', '', 'i'))) as subj_norm,
               i.client_id, i.confidenza, i.origine
          from public.email_messaggi e
          join public.posta_identita i
            on i.attivo
           and ( (i.tipo = 'email'   and i.valore = lower(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+')))
              or (i.tipo = 'dominio' and i.valore = lower(split_part(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+'), '@', 2))) )
         where e.direzione = 'in'
           and e.folder = 'inbox'
           and e.commessa_id is null
           and e.offerta_id is null
           and (p_dal is null or e.created_at >= p_dal)
           and not sales_ai.oggetto_non_commerciale(e.oggetto)
           -- mittenti che non mandano richieste
           and not exists (
             select 1 from public.posta_mittenti_classe k
              where k.attivo
                and k.valore = lower(split_part(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+'), '@', 2))
                and k.classe in ('ESCLUDI', 'INTERNO', 'NOTIFICATORE', 'FORNITORE')
           )
           and not exists (
             select 1 from public.posta_indirizzi_interni x
              where x.attivo
                and x.indirizzo = lower(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+'))
           )
           -- il cliente non ha nessuna offerta: se ne avesse, sarebbe un aggancio
           and not exists (select 1 from public.offers f where f.client_id = i.client_id)
           and not exists (select 1 from sales_ai.request_messages rm where rm.email_id = e.id)
           and not exists (select 1 from sales_ai.dismissed_emails d where d.email_id = e.id)
      ) x
      left join public.clients cl on cl.id = x.client_id
     where x.subj_norm <> ''
     group by x.client_id, cl.company_name, cl.display_name, x.subj_norm
     order by max(x.created_at) desc
     limit p_limit
  ) g;

  return v_result;
end;
$$;

grant execute on function sales_ai.get_request_candidates(int, date) to authenticated;

-- Crea la richiesta da un gruppo di email e le collega.
create or replace function sales_ai.crea_richiesta(
  p_email_ids uuid[],
  p_title     text,
  p_client_id uuid default null,
  p_channel   text default 'UNKNOWN',
  p_user      uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, sales_ai, pg_temp
as $$
declare
  v_request_id uuid;
begin
  if p_email_ids is null or array_length(p_email_ids, 1) is null then
    raise exception 'Serve almeno un''email';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'Serve un titolo';
  end if;

  insert into sales_ai.requests (client_id, source_email_id, title, channel, created_by)
  values (p_client_id, p_email_ids[1], btrim(p_title), coalesce(p_channel, 'UNKNOWN'), p_user)
  returning id into v_request_id;

  insert into sales_ai.request_messages (request_id, email_id, origin, confirmed)
  select v_request_id, e, 'AUTO', true
    from unnest(p_email_ids) as e
  on conflict (request_id, email_id) do nothing;

  return v_request_id;
end;
$$;

grant execute on function sales_ai.crea_richiesta(uuid[], text, uuid, text, uuid) to authenticated;

-- Scarta un gruppo di candidati: non sono richieste.
create or replace function sales_ai.scarta_candidati(
  p_email_ids uuid[],
  p_motivo    text default null,
  p_user      uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, sales_ai, pg_temp
as $$
declare
  v_n integer;
begin
  insert into sales_ai.dismissed_emails (email_id, motivo, user_id)
  select e, p_motivo, p_user from unnest(p_email_ids) as e
  on conflict (email_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

grant execute on function sales_ai.scarta_candidati(uuid[], text, uuid) to authenticated;

-- Elenco delle richieste già create, per la pagina Richieste.
create or replace function sales_ai.get_requests(p_limit int default 60)
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
    select r.id as request_id, r.title, r.status, r.channel, r.agency_name,
           r.created_at, r.converted_offer_id, r.converted_at,
           coalesce(c.company_name, c.display_name) as client_name,
           (select count(*) from sales_ai.request_messages rm where rm.request_id = r.id) as email_count,
           (select a.classification from sales_ai.ai_analyses a
             where a.request_id = r.id order by a.created_at desc limit 1) as sales_status
      from sales_ai.requests r
      left join public.clients c on c.id = r.client_id
     order by r.created_at desc
     limit p_limit
  ) t;

  return v_result;
end;
$$;

grant execute on function sales_ai.get_requests(int) to authenticated;
