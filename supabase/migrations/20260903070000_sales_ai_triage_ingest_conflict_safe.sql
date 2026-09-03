-- Bug reale emerso col worker pg_cron ogni 5 minuti: due esecuzioni
-- ravvicinate di triage_ingest() possono selezionare lo stesso set di
-- candidate (entrambe viste prima che l'altra facesse commit dell'insert),
-- e la seconda falliva con "duplicate key value violates unique
-- constraint email_triage_pkey". Col solo pulsante manuale era quasi
-- impossibile; ogni 5 minuti è sistematico. ON CONFLICT DO NOTHING rende
-- l'insert idempotente: chi arriva secondo non fa nulla, non fallisce.
create or replace function sales_ai.triage_ingest(p_limit integer default 500)
returns table(nuove integer, escluse_mittente integer, escluse_pattern_tecnico integer, escluse_contenuto integer)
language plpgsql
security definer
set search_path to 'public', 'sales_ai', 'pg_temp'
as $function$
declare
  v_nuove             int := 0;
  v_escluse_mittente  int := 0;
  v_escluse_pattern   int := 0;
  v_escluse_contenuto int := 0;
begin
  create temporary table _triage_batch on commit drop as
  with candidate as (
    select e.id,
           lower(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+')) as addr,
           lower(split_part(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+'), '@', 2)) as dom,
           lower(split_part(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+'), '@', 1)) as local,
           lower(coalesce(e.corpo, '')) as corpo,
           lower(coalesce(e.corpo_html, '')) as corpo_html
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
  esito as (
    select
      c.id,
      case
        -- whitelist esplicita: relazione commerciale già nota, mai auto-esclusa
        when wl.classe is not null then null
        -- mittente già classificato come mai commerciale
        when bl.classe is not null then jsonb_build_object(
          'tipo', 'MITTENTE_CLASSE',
          'motivo', 'Mittente classificato "' || bl.classe || '" in posta_mittenti_classe: ' || coalesce(bl.nota, 'mai commerciale')
        )
        -- indirizzo tecnico automatico (no-reply, notifiche, mailer-daemon...)
        when c.local ~ '^(no-?reply|non-?rispondere|mailer-daemon|postmaster|bounce[a-z0-9]*|notifiche?|notifications?)$'
          then jsonb_build_object(
            'tipo', 'PATTERN_TECNICO',
            'motivo', 'Mittente automatico (indirizzo no-reply/notifica): ' || c.addr
          )
        -- contenuto tipico di newsletter/marketing (link di disiscrizione esplicito)
        when c.corpo_html ~ '(unsubscribe|disiscriviti|annulla l''iscrizione|cancellati dalla newsletter|gestisci le tue preferenze|gestisci la tua iscrizione|manage your subscription|manage your preferences)'
          or c.corpo ~ '(unsubscribe|disiscriviti|annulla l''iscrizione|cancellati dalla newsletter|non vuoi più ricevere queste email)'
          then jsonb_build_object(
            'tipo', 'CONTENUTO_MARKETING',
            'motivo', 'Contenuto tipico di newsletter/marketing (link di disiscrizione rilevato nel testo)'
          )
        else null
      end as decisione
    from candidate c
    left join public.posta_mittenti_classe wl
      on wl.attivo
     and wl.classe in ('CLIENTE', 'FORNITORE')
     and (wl.valore in (c.addr, c.dom) or c.dom like '%.' || wl.valore)
    left join public.posta_mittenti_classe bl
      on bl.attivo
     and bl.classe in ('ESCLUDI', 'INTERNO', 'NOTIFICATORE')
     and (bl.valore in (c.addr, c.dom) or c.dom like '%.' || bl.valore)
  )
  select c.id, e.decisione
    from candidate c
    join esito e on e.id = c.id;

  insert into sales_ai.email_triage (email_id, classification, confidence, reason, triage_status, analyzed_at)
  select id,
         case when decisione is not null then 'NOT_COMMERCIAL' end,
         case when decisione is not null then 1.000 end,
         decisione->>'motivo',
         case when decisione is not null then 'DISMISSED' else 'TO_ANALYZE' end,
         case when decisione is not null then now() end
    from _triage_batch
  on conflict (email_id) do nothing;

  select count(*),
         count(*) filter (where decisione->>'tipo' = 'MITTENTE_CLASSE'),
         count(*) filter (where decisione->>'tipo' = 'PATTERN_TECNICO'),
         count(*) filter (where decisione->>'tipo' = 'CONTENUTO_MARKETING')
    into v_nuove, v_escluse_mittente, v_escluse_pattern, v_escluse_contenuto
    from _triage_batch;

  return query select v_nuove, v_escluse_mittente, v_escluse_pattern, v_escluse_contenuto;
end;
$function$;
