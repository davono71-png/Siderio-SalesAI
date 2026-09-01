import { httpError } from './http.js';

function uniq(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))];
}

function trimText(value, maxChars) {
  if (!value) return null;
  const text = String(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[...corpo troncato dal backend...]`;
}

function mergeRows(...groups) {
  const map = new Map();
  for (const group of groups) {
    for (const row of group || []) map.set(row.id, row);
  }
  return [...map.values()];
}

function limitMessages(messages) {
  const maxEmails = Math.max(10, Number(process.env.SALES_AI_MAX_EMAILS || 40));
  if (messages.length <= maxEmails) return { messages, truncated: false, total: messages.length };

  const headCount = Math.min(8, Math.floor(maxEmails / 4));
  const tailCount = maxEmails - headCount;
  return {
    messages: [...messages.slice(0, headCount), ...messages.slice(-tailCount)],
    truncated: true,
    total: messages.length,
  };
}

async function fetchAccounts(db, messages) {
  const ids = uniq(messages.map((m) => m.account_id));
  if (!ids.length) return new Map();
  const { data, error } = await db.from('email_account').select('id, indirizzo, tipo').in('id', ids);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, row]));
}

function normalizeMessages(messages, accountMap) {
  const maxBody = Math.max(1000, Number(process.env.SALES_AI_MAX_EMAIL_BODY_CHARS || 6000));
  return messages
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    .map((m) => ({
      id: m.id,
      account_id: m.account_id,
      account_address: accountMap.get(m.account_id)?.indirizzo || null,
      direction: m.direzione,
      folder: m.folder,
      message_id: m.message_id,
      in_reply_to: m.in_reply_to,
      references: m.riferimenti,
      from: m.da,
      to: m.destinatari,
      cc: m.cc,
      subject: m.oggetto,
      body: trimText(m.corpo, maxBody),
      supplier_order_flag: Boolean(m.ordine),
      created_at: m.created_at,
      linked_offer_id: m.offerta_id,
      linked_commessa_id: m.commessa_id,
    }));
}

async function fetchMessageRowsByOfferIds(db, offerIds) {
  if (!offerIds.length) return [];
  const { data, error } = await db
    .from('email_messaggi')
    .select('id,account_id,commessa_id,offerta_id,direzione,folder,message_id,in_reply_to,riferimenti,da,destinatari,cc,oggetto,corpo,ordine,created_at')
    .in('offerta_id', offerIds);
  if (error) throw error;
  return data || [];
}

async function fetchMessageRowsByCommessaIds(db, commessaIds) {
  if (!commessaIds.length) return [];
  const { data, error } = await db
    .from('email_messaggi')
    .select('id,account_id,commessa_id,offerta_id,direzione,folder,message_id,in_reply_to,riferimenti,da,destinatari,cc,oggetto,corpo,ordine,created_at')
    .in('commessa_id', commessaIds);
  if (error) throw error;
  return data || [];
}

async function fetchMessageRowsByIds(db, emailIds) {
  if (!emailIds.length) return [];
  const { data, error } = await db
    .from('email_messaggi')
    .select('id,account_id,commessa_id,offerta_id,direzione,folder,message_id,in_reply_to,riferimenti,da,destinatari,cc,oggetto,corpo,ordine,created_at')
    .in('id', emailIds);
  if (error) throw error;
  return data || [];
}

async function fetchMessageRowsFromEmailCommessa(db, commessaIds) {
  if (process.env.SALES_AI_ENABLE_EMAIL_COMMESSA_LOOKUP !== 'true' || !commessaIds.length) return [];

  const { data: links, error: linkError } = await db
    .from('email_commessa')
    .select('email_id,commessa_id,origine,confermato')
    .in('commessa_id', commessaIds);
  if (linkError) throw linkError;

  const emailIds = uniq((links || []).map((row) => row.email_id));
  if (!emailIds.length) return [];

  const { data, error } = await db
    .from('email_messaggi')
    .select('id,account_id,commessa_id,offerta_id,direzione,folder,message_id,in_reply_to,riferimenti,da,destinatari,cc,oggetto,corpo,ordine,created_at')
    .in('id', emailIds);
  if (error) throw error;
  return data || [];
}

// Immagini allegate all'offerta (offerte_allegati): scaricate dal bucket
// privato allegati-offerte e inviate al modello come input visivo vero e
// proprio, non solo come nome file. Prima di questo il backend passava solo
// i metadata e diceva esplicitamente al modello di non inferirne il
// contenuto — caso reale osservato sull'offerta #6757 (due foto allegate,
// l'AI dichiarava di non poterle leggere).
//
// Solo immagini, con un tetto di dimensione e di conteggio: i PDF e gli
// allegati email restano fuori da questa V1.
const ATTACHMENT_IMAGE_MAX_BYTES = Math.max(200_000, Number(process.env.SALES_AI_MAX_ATTACHMENT_IMAGE_BYTES || 6_000_000));
const ATTACHMENT_IMAGE_MAX_COUNT = Math.max(1, Number(process.env.SALES_AI_MAX_ATTACHMENT_IMAGES || 6));

// Le immagini possono arrivare da bucket diversi (allegati offerta Suite vs
// allegati caricati a mano su richieste/opportunità): ogni allegato porta il
// proprio bucket, così un'unica chiamata rispetta il tetto complessivo per
// analisi invece di applicarlo separatamente per fonte.
async function fetchAttachmentImages(db, attachments) {
  const images = [];
  const skipped = [];
  const candidates = (attachments || []).filter((a) => (a.tipo_file || '').startsWith('image/'));

  for (const att of candidates) {
    if (images.length >= ATTACHMENT_IMAGE_MAX_COUNT) {
      skipped.push(`${att.nome_file} (limite di ${ATTACHMENT_IMAGE_MAX_COUNT} immagini per analisi raggiunto)`);
      continue;
    }

    const sizeBytes = Number(att.dimensione_kb || 0) * 1024;
    if (sizeBytes && sizeBytes > ATTACHMENT_IMAGE_MAX_BYTES) {
      skipped.push(`${att.nome_file} (${Math.round(sizeBytes / 1024)}KB, supera il limite)`);
      continue;
    }

    try {
      const { data, error } = await db.storage.from(att.bucket || 'allegati-offerte').download(att.storage_path);
      if (error || !data) {
        skipped.push(`${att.nome_file} (download non riuscito)`);
        continue;
      }
      const buffer = Buffer.from(await data.arrayBuffer());
      images.push({
        id: att.id,
        nome_file: att.nome_file,
        mime: att.tipo_file,
        data_url: `data:${att.tipo_file};base64,${buffer.toString('base64')}`,
      });
    } catch {
      skipped.push(`${att.nome_file} (errore di lettura)`);
    }
  }

  return { images, skipped };
}

export async function resolveRootOfferId(db, offerOrRootId) {
  const { data, error } = await db
    .from('offers')
    .select('id, root_offer_id')
    .eq('id', offerOrRootId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw httpError(404, 'Offerta non trovata');
  return data.root_offer_id || data.id;
}

export async function buildOfferOpportunityContext(db, suppliedRootOfferId) {
  const rootOfferId = await resolveRootOfferId(db, suppliedRootOfferId);

  const { data: offers, error: offersError } = await db
    .from('offers')
    .select('id,offer_number,client_id,commessa_id,status,parent_offer_id,root_offer_id,revision_number,revision_note,final_price_net,accepted_price_net,sent_at,accepted_at')
    .or(`id.eq.${rootOfferId},root_offer_id.eq.${rootOfferId}`)
    .order('revision_number', { ascending: true });
  if (offersError) throw offersError;
  if (!offers?.length) throw httpError(404, 'Catena offerta non trovata');

  const offerIds = uniq(offers.map((o) => o.id));
  const commessaIds = uniq(offers.map((o) => o.commessa_id));
  const clientId = offers.find((o) => o.client_id)?.client_id || null;

  // Rev.1 §05: "la conversione non deve azzerare il contesto" — se questa
  // offerta nasce da una richiesta Sales AI, tutto ciò che è successo prima
  // della conversione (email, eventi, allegati, e la richiesta stessa) resta
  // parte del contesto dell'opportunità, non solo quello accumulato dopo.
  const salesDb = db.schema('sales_ai');
  const { data: originatingRequests, error: originatingRequestError } = await salesDb
    .from('requests')
    .select('id,title,channel,agency_source,contact_name,installation_location,notes,estimate_min,estimate_max,estimate_note,created_at,converted_at')
    .in('converted_offer_id', offerIds)
    .limit(1);
  if (originatingRequestError) throw originatingRequestError;
  const originatingRequest = originatingRequests?.[0] || null;

  let client = null;
  if (clientId) {
    const { data, error } = await db
      .from('clients')
      .select('id,display_name,nome_abbreviato,company_name,email,phone,address,city,province,vat_number,tax_code')
      .eq('id', clientId)
      .maybeSingle();
    if (error) throw error;
    client = data || null;
  }

  let commesse = [];
  if (commessaIds.length) {
    const { data, error } = await db
      .from('commesse')
      .select('id,numero_commessa,cliente,offerta_id,stato,attiva,agente')
      .in('id', commessaIds);
    if (error) throw error;
    commesse = data || [];
  }

  let preOfferEmailIds = [];
  if (originatingRequest) {
    const { data: preOfferLinks, error: preOfferLinksError } = await salesDb
      .from('request_messages')
      .select('email_id')
      .eq('request_id', originatingRequest.id);
    if (preOfferLinksError) throw preOfferLinksError;
    preOfferEmailIds = uniq((preOfferLinks || []).map((row) => row.email_id));
  }

  const [byOffer, byCommessa, byTag, byPreOfferRequest] = await Promise.all([
    fetchMessageRowsByOfferIds(db, offerIds),
    fetchMessageRowsByCommessaIds(db, commessaIds),
    fetchMessageRowsFromEmailCommessa(db, commessaIds),
    fetchMessageRowsByIds(db, preOfferEmailIds),
  ]);

  const merged = mergeRows(byOffer, byCommessa, byTag, byPreOfferRequest).sort(
    (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
  );
  const accountMap = await fetchAccounts(db, merged);
  const normalized = normalizeMessages(merged, accountMap);
  const limited = limitMessages(normalized);

  let offerAttachments = [];
  if (offerIds.length) {
    const { data, error } = await db
      .from('offerte_allegati')
      .select('id,offerta_id,nome_file,tipo_file,storage_path,dimensione_kb,caricato_da')
      .in('offerta_id', offerIds.map(String));
    if (error) throw error;
    offerAttachments = data || [];
  }

  // Eventi manuali (telefonate, sopralluoghi, note) e allegati caricati a
  // mano — Rev.1 §06 per il post-offerta (root_offer_id), §05 per il
  // pre-offerta ereditato dalla richiesta d'origine (request_id): stesso
  // trattamento, un'unica storia continua invece di due elenchi separati.
  const { data: postOfferEvents, error: postOfferEventsError } = await salesDb
    .from('request_events')
    .select('id,event_type,event_at,contact_name,description,outcome,next_action,followup_date')
    .eq('root_offer_id', rootOfferId);
  if (postOfferEventsError) throw postOfferEventsError;

  let preOfferEvents = [];
  if (originatingRequest) {
    const { data, error } = await salesDb
      .from('request_events')
      .select('id,event_type,event_at,contact_name,description,outcome,next_action,followup_date')
      .eq('request_id', originatingRequest.id);
    if (error) throw error;
    preOfferEvents = data || [];
  }
  const manualEvents = mergeRows(preOfferEvents, postOfferEvents).sort(
    (a, b) => new Date(a.event_at || 0) - new Date(b.event_at || 0),
  );

  const { data: postOfferAttachments, error: postOfferAttachmentsError } = await salesDb
    .from('request_attachments')
    .select('id,nome_file,tipo_file,storage_path,dimensione_kb,caricato_da,created_at')
    .eq('root_offer_id', rootOfferId);
  if (postOfferAttachmentsError) throw postOfferAttachmentsError;

  let preOfferAttachments = [];
  if (originatingRequest) {
    const { data, error } = await salesDb
      .from('request_attachments')
      .select('id,nome_file,tipo_file,storage_path,dimensione_kb,caricato_da,created_at')
      .eq('request_id', originatingRequest.id);
    if (error) throw error;
    preOfferAttachments = data || [];
  }
  const manualAttachments = mergeRows(preOfferAttachments, postOfferAttachments);

  const attachmentsForImages = [
    ...offerAttachments.map((a) => ({ ...a, bucket: 'allegati-offerte' })),
    ...manualAttachments.map((a) => ({ ...a, bucket: 'allegati-richieste' })),
  ];
  const { images: attachmentImages, skipped: skippedAttachmentImages } = await fetchAttachmentImages(db, attachmentsForImages);

  const warnings = [];
  if (limited.truncated) {
    warnings.push(`Archivio con ${limited.total} email: inviate al modello ${limited.messages.length} email (inizio + parte più recente).`);
  }
  if (process.env.SALES_AI_ENABLE_EMAIL_COMMESSA_LOOKUP !== 'true') {
    warnings.push('Lookup many-to-many email_commessa disabilitato finché non viene confermato il tipo reale di commessa_id.');
  }
  if (attachmentImages.length) {
    warnings.push(`${attachmentImages.length} immagine/i allegata/e all'opportunità inviate come contenuto visivo: puoi leggerne il contenuto reale, non solo il nome file.`);
  }
  if (skippedAttachmentImages.length) {
    warnings.push(`Allegati non inviati come immagine: ${skippedAttachmentImages.join('; ')}.`);
  }
  warnings.push('Gli allegati non immagine (PDF, disegni CAD, ecc.) e gli allegati delle email restano non leggibili in questa versione; non vanno inferiti.');
  if (!manualEvents.length) {
    warnings.push('Nessun evento manuale registrato su questa opportunità: quello che è stato detto a voce potrebbe non essere qui.');
  }
  if (originatingRequest) {
    warnings.push('Questa opportunità nasce da una richiesta Sales AI: originating_request, email, eventi e allegati pre-offerta sono inclusi nel contesto insieme a quelli successivi alla conversione.');
  }

  return {
    scope: { type: 'OFFER_OPPORTUNITY', root_offer_id: rootOfferId },
    customer: client,
    offers,
    commesse: commesse.map((c) => ({ ...c, cliente_note: 'Campo testuale display-only: non usare come FK cliente.' })),
    originating_request: originatingRequest,
    offer_attachments_metadata: offerAttachments,
    manual_events: manualEvents,
    manual_attachments_metadata: manualAttachments,
    messages: limited.messages,
    context_warnings: warnings,
    attachment_images: attachmentImages,
  };
}

export async function buildRequestContext(db, requestId) {
  const salesDb = db.schema('sales_ai');
  const { data: request, error: requestError } = await salesDb
    .from('requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  if (requestError) throw requestError;
  if (!request) throw httpError(404, 'Request Sales AI non trovata');

  let client = null;
  if (request.client_id) {
    const { data, error } = await db
      .from('clients')
      .select('id,display_name,nome_abbreviato,company_name,email,phone,address,city,province,vat_number,tax_code')
      .eq('id', request.client_id)
      .maybeSingle();
    if (error) throw error;
    client = data || null;
  }

  const { data: links, error: linksError } = await salesDb
    .from('request_messages')
    .select('email_id,origin,match_confidence,confirmed')
    .eq('request_id', requestId);
  if (linksError) throw linksError;

  const emailIds = uniq((links || []).map((row) => row.email_id));
  let messages = [];
  if (emailIds.length) {
    const { data, error } = await db
      .from('email_messaggi')
      .select('id,account_id,commessa_id,offerta_id,direzione,folder,message_id,in_reply_to,riferimenti,da,destinatari,cc,oggetto,corpo,ordine,created_at')
      .in('id', emailIds);
    if (error) throw error;
    messages = data || [];
  }

  const accountMap = await fetchAccounts(db, messages);
  const normalized = normalizeMessages(messages, accountMap);
  const limited = limitMessages(normalized);

  // Eventi manuali: telefonate, incontri, sopralluoghi, note. Non sono un
  // contorno delle email — spesso contengono le informazioni decisive
  // (quantità, finitura, data di consegna) che il cliente dice a voce e che
  // altrimenti resterebbero nella testa di chi ha risposto al telefono.
  // Vanno nel contesto con lo stesso peso dei messaggi.
  const { data: eventi, error: eventiError } = await salesDb
    .from('request_events')
    .select('id,event_type,event_at,contact_name,description,outcome,next_action,followup_date')
    .eq('request_id', requestId)
    .order('event_at', { ascending: true });
  if (eventiError) throw eventiError;

  // Allegati caricati a mano sulla richiesta (foto, PDF, disegni): stesso
  // trattamento degli allegati offerta, bucket dedicato allegati-richieste.
  // Gli allegati email restano fuori, come per le offerte.
  const { data: requestAttachments, error: attachmentsError } = await salesDb
    .from('request_attachments')
    .select('id,nome_file,tipo_file,storage_path,dimensione_kb,caricato_da,created_at')
    .eq('request_id', requestId);
  if (attachmentsError) throw attachmentsError;

  const { images: attachmentImages, skipped: skippedAttachmentImages } = await fetchAttachmentImages(
    db,
    (requestAttachments || []).map((a) => ({ ...a, bucket: 'allegati-richieste' })),
  );

  const warnings = ['Il contenuto degli allegati email non è disponibile in questa V1; non deve essere inferito.'];
  if (limited.truncated) warnings.push(`Request con ${limited.total} email: contesto ridotto a ${limited.messages.length}.`);
  if (!(eventi || []).length) {
    warnings.push('Nessun evento manuale registrato: quello che è stato detto a voce potrebbe non essere qui.');
  }
  if (attachmentImages.length) {
    warnings.push(`${attachmentImages.length} immagine/i caricata/e sulla richiesta inviate come contenuto visivo: puoi leggerne il contenuto reale, non solo il nome file.`);
  }
  if (skippedAttachmentImages.length) {
    warnings.push(`Allegati richiesta non inviati come immagine: ${skippedAttachmentImages.join('; ')}.`);
  }
  if ((requestAttachments || []).some((a) => !(a.tipo_file || '').startsWith('image/'))) {
    warnings.push('Gli allegati richiesta non immagine (PDF, disegni CAD, ecc.) restano non leggibili in questa versione; non vanno inferiti.');
  }

  // Email ed eventi in un unico elenco cronologico: è la storia vera della
  // trattativa, e il modello deve valutarla per intero invece di ragionare
  // sull'ultimo messaggio arrivato.
  const timeline = [
    ...limited.messages.map((m) => ({
      quando: m.created_at,
      tipo: 'EMAIL',
      direzione: m.direction,
      interlocutore: m.from,
      oggetto: m.subject,
      contenuto: m.body,
    })),
    ...(eventi || []).map((e) => ({
      quando: e.event_at,
      tipo: e.event_type,
      direzione: null,
      interlocutore: e.contact_name,
      oggetto: null,
      contenuto: e.description,
      esito: e.outcome,
      prossima_azione: e.next_action,
      data_followup: e.followup_date,
    })),
  ].sort((a, b) => new Date(a.quando || 0) - new Date(b.quando || 0));

  return {
    scope: { type: 'REQUEST', request_id: requestId },
    request,
    customer: client,
    message_links: links || [],
    messages: limited.messages,
    manual_events: eventi || [],
    timeline,
    request_attachments_metadata: requestAttachments || [],
    context_warnings: warnings,
    attachment_images: attachmentImages,
  };
}
