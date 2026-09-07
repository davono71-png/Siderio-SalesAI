-- Fase 5 (Rev.2 §4): scheda email completa per la consultazione diretta
-- dalle viste Sales AI. Un'unica chiamata restituisce intestazioni, corpo
-- integrale, allegati (solo metadati: vedi nota in fetchAttachmentImages/
-- context.js, i byte degli allegati email non sono ancora accessibili da
-- qui), collegamenti risolti (offerta/commessa/richiesta) e l'intero thread
-- (stessa "conversazione" RFC, cronologico, inbound/outbound distinguibili).
create or replace function sales_ai.get_email_detail(p_email_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'sales_ai', 'pg_temp'
as $function$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'email', jsonb_build_object(
      'id', e.id,
      'da', e.da,
      'destinatari', to_jsonb(e.destinatari),
      'cc', to_jsonb(e.cc),
      'oggetto', e.oggetto,
      'corpo', e.corpo,
      'allegati', coalesce(e.allegati, '[]'::jsonb),
      'created_at', e.created_at,
      'direzione', e.direzione,
      'folder', e.folder,
      'letto', e.letto,
      'casella', acc.indirizzo,
      'conversazione', e.conversazione
    ),
    'triage', case when tr.email_id is null then null else jsonb_build_object(
      'classification', tr.classification,
      'confidence', tr.confidence,
      'reason', tr.reason,
      'triage_status', tr.triage_status,
      'confirmed_at', tr.confirmed_at,
      'analyzed_at', tr.analyzed_at,
      'root_offer_id', tr.root_offer_id,
      'commessa_id', tr.commessa_id,
      'request_id', tr.request_id
    ) end,
    'cliente_riconosciuto', (
      select coalesce(c.company_name, c.display_name)
        from public.posta_identita i
        join public.clients c on c.id = i.client_id
       where i.attivo
         and i.valore in (
           lower(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+')),
           lower(split_part(substring(coalesce(e.da, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+'), '@', 2))
         )
       order by i.confidenza desc
       limit 1
    ),
    'offerta', (
      select jsonb_build_object('id', o.id, 'offer_number', o.offer_number, 'cliente', coalesce(cli.company_name, cli.display_name))
        from public.offers o
        left join public.clients cli on cli.id = o.client_id
       where o.id = tr.root_offer_id
    ),
    'commessa', (
      select jsonb_build_object('id', co.id, 'numero_commessa', co.numero_commessa, 'cliente', co.cliente)
        from public.commesse co
       where co.id = tr.commessa_id
    ),
    'richiesta', (
      select jsonb_build_object('id', r.id, 'title', r.title)
        from sales_ai.requests r
       where r.id = tr.request_id
    ),
    'thread', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id,
               'da', t.da,
               'oggetto', t.oggetto,
               'anteprima', left(coalesce(t.corpo, ''), 200),
               'created_at', t.created_at,
               'direzione', t.direzione,
               'corrente', t.id = e.id
             ) order by t.created_at asc), '[]'::jsonb)
        from public.email_messaggi t
       where e.conversazione is not null
         and t.conversazione = e.conversazione
    )
  )
    into v_result
    from public.email_messaggi e
    left join public.email_account acc on acc.id = e.account_id
    left join sales_ai.email_triage tr on tr.email_id = e.id
   where e.id = p_email_id;

  return v_result;
end;
$function$;
