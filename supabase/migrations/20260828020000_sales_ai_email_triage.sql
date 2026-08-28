-- Inbox commerciale: triage delle email in ingresso sulle caselle commerciali.
-- Specifica di Mattia Delbarba, 28/08/2026.
--
-- Il criterio che deve valere: se di notte arrivano 100 email e 4 hanno
-- rilevanza commerciale, al mattino nella Inbox se ne devono trovare 4.
--
-- DUE SCELTE CHE SI DISCOSTANO DALLA SPECIFICA, ed entrambe per un motivo
-- misurato sui dati:
--
-- 1) le caselle NON sono cablate nel codice. La specifica indicava
--    mattia@siderio.it e jessika@siderio.it, ma jessika@siderio.it non esiste
--    in email_account e mattia@siderio.it ha ricevuto 20 email inbound negli
--    ultimi 30 giorni: cablarle avrebbe prodotto una Inbox vuota e un criterio
--    di successo non verificabile. Il traffico commerciale vero oggi sta su
--    @archeitalia.com (gianfranco 398 inbound/30gg, ilaria 229, info@ 132).
--    Con un flag sulla casella, chi di dovere sceglie senza toccare il codice.
--
-- 2) prima del classificatore AI passa un filtro deterministico sul mittente.
--    Non è il "filtro rigido per parole chiave" che la specifica giustamente
--    scarta: è il filtro per IDENTITÀ su posta_mittenti_classe, la lista di 66
--    domini validata a mano. Verificato sull'archivio: le 4.270 email di quei
--    mittenti sono orfane al 100%, nessuna ha mai agganciato una commessa.
--    Classificarle NOT_COMMERCIAL senza chiamare il modello non perde niente e
--    toglie la maggior parte del volume prima di spendere un token.

-- Quali caselle alimentano la Inbox commerciale. È una proprietà della casella,
-- quindi sta sulla casella.
alter table public.email_account
  add column if not exists sales_ai_inbox boolean not null default false;

comment on column public.email_account.sales_ai_inbox is
  'La posta in arrivo di questa casella entra nella Inbox commerciale di Sales AI.';

-- L'unica delle due caselle indicate che esista davvero.
update public.email_account set sales_ai_inbox = true
 where indirizzo in ('mattia@siderio.it', 'jessika@siderio.it');

-- Stato commerciale di una email in ingresso.
--
-- Deliberatamente separato da email_messaggi.letto, che deve continuare a
-- significare quello che significa nella posta: leggere una richiesta dal
-- telefono non vuol dire averla lavorata.
create table if not exists sales_ai.email_triage (
  email_id       uuid primary key references public.email_messaggi(id) on delete cascade,

  -- Cosa dice il classificatore. Stessi valori di ai_analyses.classification.
  classification text null check (classification in
    ('NEW_REQUEST', 'EXISTING_OPPORTUNITY', 'NOT_COMMERCIAL', 'UNCERTAIN')),
  confidence     numeric(4,3) null check (confidence between 0 and 1),
  reason         text null,

  -- Dove sta nel flusso di lavoro. Indipendente dalla classificazione: una
  -- NEW_REQUEST può essere ancora da guardare o già diventata una richiesta.
  triage_status  text not null default 'TO_ANALYZE' check (triage_status in
    ('TO_ANALYZE',   -- mai passata dal classificatore
     'TO_REVIEW',    -- classificata, aspetta una decisione umana
     'PROCESSED',    -- diventata richiesta o agganciata a un'opportunità
     'DISMISSED')),  -- archiviata: non commerciale, o scartata a mano

  -- Esito, quando c'è. Il vincolo tiene fuori le righe che dicono due cose.
  request_id     uuid null references sales_ai.requests(id) on delete set null,
  root_offer_id  uuid null references public.offers(id) on delete set null,

  -- Da chi e quando arriva la classificazione automatica.
  model           text null,
  prompt_version  text null,
  analyzed_at     timestamptz null,

  -- Da chi e quando arriva la conferma umana.
  confirmed_by   uuid null references public.profili_utenti(id) on delete set null,
  confirmed_at   timestamptz null,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint email_triage_esito_unico check (num_nonnulls(request_id, root_offer_id) <= 1)
);

comment on table sales_ai.email_triage is
  'Stato commerciale di una email in ingresso. Separato da email_messaggi.letto di proposito.';

create index if not exists email_triage_da_smistare
  on sales_ai.email_triage (triage_status, classification)
  where triage_status in ('TO_ANALYZE', 'TO_REVIEW');

alter table sales_ai.email_triage enable row level security;
grant all on sales_ai.email_triage to service_role;

drop trigger if exists trg_email_triage_updated_at on sales_ai.email_triage;
create trigger trg_email_triage_updated_at
before update on sales_ai.email_triage
for each row execute function sales_ai.touch_updated_at();

-- Prende in carico le email nuove delle caselle commerciali e chiude subito i
-- casi che non richiedono il modello. Idempotente: si può rilanciare sempre.
--
-- Restano fuori dalla Inbox le email già agganciate con certezza a una
-- commessa o a un'offerta: quelle alimentano direttamente il contesto
-- dell'opportunità, non c'è niente da smistare.
create or replace function sales_ai.triage_ingest(p_limit int default 500)
returns table (nuove integer, escluse_da_mittente integer)
language plpgsql
security definer
set search_path = public, sales_ai, pg_temp
as $$
declare
  v_nuove   int := 0;
  v_escluse int := 0;
begin
  with candidate as (
    select e.id,
           lower(split_part(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+'), '@', 2)) as dom,
           lower(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+')) as addr
      from public.email_messaggi e
      join public.email_account a on a.id = e.account_id
     where a.sales_ai_inbox
       and e.direzione = 'in'
       and e.folder = 'inbox'
       and e.commessa_id is null
       and e.offerta_id is null
       and not exists (select 1 from sales_ai.email_triage t where t.email_id = e.id)
     order by e.created_at desc
     limit p_limit
  ),
  inserite as (
    insert into sales_ai.email_triage (email_id, classification, confidence, reason, triage_status, analyzed_at)
    select c.id,
           case when k.classe is not null then 'NOT_COMMERCIAL' end,
           case when k.classe is not null then 1.000 end,
           case when k.classe is not null
                then 'Mittente classificato "' || k.classe || '" in posta_mittenti_classe: ' || coalesce(k.nota, 'mai commerciale')
           end,
           case when k.classe is not null then 'DISMISSED' else 'TO_ANALYZE' end,
           case when k.classe is not null then now() end
      from candidate c
      left join public.posta_mittenti_classe k
        on k.attivo
       and k.classe in ('ESCLUDI', 'INTERNO', 'NOTIFICATORE')
       and k.valore in (c.addr, c.dom)
    returning triage_status
  )
  select count(*), count(*) filter (where triage_status = 'DISMISSED')
    into v_nuove, v_escluse
    from inserite;

  return query select v_nuove, v_escluse;
end;
$$;

grant execute on function sales_ai.triage_ingest(int) to authenticated;

-- La Inbox operativa: solo quello che richiede una decisione. Le
-- NOT_COMMERCIAL restano in tabella per lo storico ma non si vedono qui.
create or replace function sales_ai.get_inbox_commerciale(p_limit int default 100)
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
    select e.id as email_id,
           e.da as mittente,
           e.oggetto,
           left(coalesce(e.corpo, ''), 260) as anteprima,
           e.created_at,
           e.letto,
           jsonb_array_length(coalesce(e.allegati, '[]'::jsonb)) as allegati,
           acc.indirizzo as casella,
           tr.classification,
           tr.confidence,
           tr.reason,
           tr.triage_status,
           tr.root_offer_id,
           o.offer_number  as offerta_proposta,
           coalesce(cli.company_name, cli.display_name) as cliente_offerta,
           coalesce(idc.company_name, idc.display_name) as cliente_riconosciuto
      from sales_ai.email_triage tr
      join public.email_messaggi e   on e.id = tr.email_id
      left join public.email_account acc on acc.id = e.account_id
      left join public.offers  o   on o.id = tr.root_offer_id
      left join public.clients cli on cli.id = o.client_id
      left join lateral (
        select c.company_name, c.display_name
          from public.posta_identita i
          join public.clients c on c.id = i.client_id
         where i.attivo
           and i.valore in (
             lower(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+')),
             lower(split_part(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+'), '@', 2))
           )
         order by i.confidenza desc
         limit 1
      ) idc on true
     where tr.triage_status in ('TO_ANALYZE', 'TO_REVIEW')
       and coalesce(tr.classification, 'TO_ANALYZE') <> 'NOT_COMMERCIAL'
     order by e.created_at desc
     limit p_limit
  ) t;

  return v_result;
end;
$$;

grant execute on function sales_ai.get_inbox_commerciale(int) to authenticated;

-- I contatori in testa alla pagina.
create or replace function sales_ai.get_inbox_contatori()
returns jsonb
language sql
security definer
set search_path = public, sales_ai, pg_temp
as $$
  select jsonb_build_object(
    'da_smistare', count(*) filter (
      where triage_status in ('TO_ANALYZE', 'TO_REVIEW')
        and coalesce(classification, 'TO_ANALYZE') <> 'NOT_COMMERCIAL'),
    'nuove_richieste', count(*) filter (
      where triage_status = 'TO_REVIEW' and classification = 'NEW_REQUEST'),
    'possibili_match', count(*) filter (
      where triage_status = 'TO_REVIEW' and classification = 'EXISTING_OPPORTUNITY'),
    'da_verificare', count(*) filter (
      where triage_status = 'TO_REVIEW' and classification = 'UNCERTAIN'),
    'da_analizzare', count(*) filter (where triage_status = 'TO_ANALYZE'),
    'archiviate_non_commerciali', count(*) filter (
      where classification = 'NOT_COMMERCIAL')
  )
  from sales_ai.email_triage;
$$;

grant execute on function sales_ai.get_inbox_contatori() to authenticated;
