-- Estende sales_ai.email_triage dai 4 valori originali (NEW_REQUEST,
-- EXISTING_OPPORTUNITY, NOT_COMMERCIAL, UNCERTAIN) alla tassonomia completa
-- a 8 categorie richiesta dalle spec 03/09 e 07/09: aggiunge Conferma di
-- offerta, Ordine cliente acquisito, Ordine a fornitore, Amministrativa.
-- Newsletter/spam resta dentro NOT_COMMERCIAL (comportamento invariato, già
-- gestito da triage_ingest per i pattern tecnici/marketing), Da classificare
-- resta UNCERTAIN.
alter table sales_ai.email_triage
  drop constraint email_triage_classification_check;

alter table sales_ai.email_triage
  add constraint email_triage_classification_check
  check (classification = any (array[
    'NEW_REQUEST', 'EXISTING_OPPORTUNITY', 'NOT_COMMERCIAL', 'UNCERTAIN',
    'OFFER_CONFIRMED', 'CUSTOMER_ORDER', 'SUPPLIER_ORDER', 'ADMINISTRATIVE'
  ]));

-- Terzo scope possibile oltre a request_id/root_offer_id: un ordine cliente
-- già acquisito (commessa). public.commesse.id è bigint, non uuid come le
-- offerte. Colonna di comodo per risalire subito alla commessa dall'email,
-- parallela a root_offer_id; il collegamento "ufficiale" resta comunque
-- public.email_commessa (struttura gemella di email_offerta, già esistente
-- in Suite ma non ancora usata da Sales AI).
alter table sales_ai.email_triage
  add column commessa_id bigint references public.commesse(id) on delete set null;

alter table sales_ai.email_triage
  drop constraint email_triage_esito_unico;

alter table sales_ai.email_triage
  add constraint email_triage_esito_unico
  check (num_nonnulls(request_id, root_offer_id, commessa_id) <= 1);

comment on column sales_ai.email_triage.commessa_id is
  'Commessa collegata quando classification = CUSTOMER_ORDER (email su ordine cliente già acquisito). Mutuamente esclusivo con request_id/root_offer_id.';

-- Override manuale dello stato commerciale, distinto da
-- sync_offer_commercial_status (che è guidato dall'AI e non riapre da solo
-- un'opportunità già archiviata). Qui è l'utente a decidere durante la
-- revisione della Inbox ("Offerta annullata/persa" -> LOST, "Già trasformata
-- in ordine" -> WON): la sua decisione è sempre autorevole, quindi non
-- rispetta il guard su archived_at che protegge invece la sync automatica.
create or replace function sales_ai.imposta_esito_manuale_offerta(
  p_root_offer_id uuid,
  p_status text,
  p_user uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'sales_ai', 'pg_temp'
as $function$
begin
  if p_status not in ('WON', 'LOST') then
    raise exception 'Stato non valido per un esito manuale da revisione email: %', p_status;
  end if;

  insert into sales_ai.offer_lifecycle (root_offer_id, commercial_status, updated_by)
  values (p_root_offer_id, p_status, p_user)
  on conflict (root_offer_id) do update
    set commercial_status = excluded.commercial_status,
        updated_by = p_user,
        updated_at = now();
end;
$function$;
