-- Rev.1 §05: "se il cliente è noto nella richiesta, evitare di creare
-- un'offerta senza client_id" — il flusso obbligatorio non prevede un ramo
-- "procedi comunque". Criterio di accettazione §14.7 test #2: la creazione
-- offerta può fallire, ma allora la richiesta resta attiva e non deve
-- restare un converted_offer_id parziale.
create or replace function sales_ai.converti_richiesta_in_offerta(p_request_id uuid, p_offer_number text, p_user uuid default null)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'sales_ai', 'pg_temp'
as $function$
declare
  v_request  sales_ai.requests;
  v_offer_id uuid;
  v_note     text;
begin
  select * into v_request from sales_ai.requests where id = p_request_id;
  if not found then
    raise exception 'Richiesta non trovata';
  end if;
  if v_request.converted_offer_id is not null then
    raise exception 'Questa richiesta è già stata convertita in offerta';
  end if;
  if coalesce(btrim(p_offer_number), '') = '' then
    raise exception 'Serve il numero della nuova offerta';
  end if;
  if exists (select 1 from public.offers where offer_number = btrim(p_offer_number)) then
    raise exception 'Esiste già un''offerta con numero %', btrim(p_offer_number);
  end if;
  if v_request.client_id is null then
    raise exception 'Collega prima un cliente dall''anagrafica Suite: un''offerta non può restare senza client_id';
  end if;

  v_note := 'Nata dalla richiesta Sales AI del ' ||
            to_char(v_request.created_at, 'DD/MM/YYYY') ||
            coalesce(' — ' || nullif(btrim(v_request.notes), ''), '');

  insert into public.offers (offer_number, client_id, status, title, internal_notes)
  values (btrim(p_offer_number), v_request.client_id, 'draft', v_request.title, v_note)
  returning id into v_offer_id;

  -- La corrispondenza segue l'offerta, altrimenti l'analisi post-offerta
  -- ripartirebbe da zero.
  insert into public.email_offerta (email_id, offerta_id, origine, confermato, match_confidence, motivo, creato_da)
  select rm.email_id, v_offer_id, 'manuale', true, 1,
         'Email della richiesta convertita in offerta', 'sales-ai'
    from sales_ai.request_messages rm
   where rm.request_id = p_request_id
  on conflict (email_id, offerta_id) do nothing;

  update sales_ai.requests
     set converted_offer_id = v_offer_id,
         converted_at       = now(),
         status             = 'CONVERTED_TO_OFFER'
   where id = p_request_id;

  return v_offer_id;
end;
$function$;
