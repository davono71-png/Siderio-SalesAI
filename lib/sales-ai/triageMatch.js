// Passi 1 (IDENTIFICAZIONE) e 2 (MATCH) della logica di decisione richiesta
// dalla spec "Classificazione e routing email" (03.09.2026): prima che il
// classificatore si esprima, cerchiamo deterministicamente controparte,
// continuità di thread e riferimenti espliciti (numero offerta/commessa) nei
// dati di Suite. Il modello riceve questi indizi già pronti — non deve
// indovinarli dal testo libero — e la decisione finale su COSA collegare
// resta comunque del codice, non dell'AI: un numero letto male dal modello
// non deve mai finire scritto su un'offerta sbagliata.
//
// Riusato identico dalla riconciliazione dello storico (Fase 3): stessa
// logica di match sia per le email nuove sia per il backfill.

const RE_INDIRIZZO = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+/;
// Numeri isolati di 3-6 cifre: coprono sia i numeri offerta (es. 6741) sia i
// numeri commessa (es. 4030), intervalli diversi ma sovrapponibili in teoria.
// Non proviamo a indovinare dal prefisso ("off.", "comm.", "#"): cerchiamo il
// numero su entrambe le tabelle e lasciamo che sia l'esistenza del record a
// dire di cosa si tratta.
const RE_NUMERO = /\b(\d{3,6})\b/g;

function normalizzaIndirizzo(da) {
  const m = String(da || '').match(RE_INDIRIZZO);
  return m ? m[0].toLowerCase() : null;
}

function estraiNumeri(testo) {
  const trovati = new Set();
  for (const m of String(testo || '').matchAll(RE_NUMERO)) {
    trovati.add(m[1]);
  }
  return [...trovati];
}

// Chi scrive: cliente noto, fornitore noto, o mittente mai visto. Stessa
// fonte (posta_mittenti_classe, posta_identita) già usata da triage_ingest
// per lo sfoltimento deterministico, qui riletta per arricchire il contesto
// invece che per escludere a priori.
export async function identificaControparte(db, email) {
  const indirizzo = normalizzaIndirizzo(email.da);
  const dominio = indirizzo ? indirizzo.split('@')[1] : null;
  if (!indirizzo) {
    return { indirizzo: null, dominio: null, classe: null, client_id: null, cliente_nome: null, fornitore_nome: null };
  }

  const [{ data: classeRows }, { data: identRows }, { data: fornitoreRows }] = await Promise.all([
    db.from('posta_mittenti_classe').select('classe, nota, valore').eq('attivo', true).in('valore', [indirizzo, dominio]),
    db
      .from('posta_identita')
      .select('client_id, confidenza')
      .eq('attivo', true)
      .in('valore', [indirizzo, dominio])
      .order('confidenza', { ascending: false })
      .limit(1),
    db.from('fornitori').select('id, denominazione').eq('attivo', true).eq('email', indirizzo).limit(1),
  ]);

  const classe = classeRows?.find((r) => r.classe === 'FORNITORE')?.classe || classeRows?.[0]?.classe || null;
  const clientId = identRows?.[0]?.client_id || null;
  let clienteNome = null;
  if (clientId) {
    const { data: cli } = await db.from('clients').select('display_name, company_name').eq('id', clientId).maybeSingle();
    clienteNome = cli?.company_name || cli?.display_name || null;
  }

  return {
    indirizzo,
    dominio,
    classe, // CLIENTE | FORNITORE | ESCLUDI | INTERNO | NOTIFICATORE | null
    client_id: clientId,
    cliente_nome: clienteNome,
    fornitore_nome: fornitoreRows?.[0]?.denominazione || null,
  };
}

// Continuità di thread: se In-Reply-To/References puntano a un messaggio già
// collegato a un'offerta o una commessa, è un segnale "molto alto" —
// indipendente da qualsiasi numero scritto nel testo di questa email.
export async function cercaMatchThread(db, email) {
  const riferimenti = [email.in_reply_to, ...String(email.riferimenti || '').split(/\s+/)].filter(Boolean);
  if (riferimenti.length === 0) return null;

  const { data } = await db
    .from('email_messaggi')
    .select('id, offerta_id, commessa_id')
    .in('message_id', riferimenti)
    .limit(10);

  const collegata = (data ?? []).find((r) => r.offerta_id || r.commessa_id);
  if (!collegata) return null;
  return collegata.offerta_id
    ? { tipo: 'offerta', id: collegata.offerta_id }
    : { tipo: 'commessa', id: collegata.commessa_id };
}

export async function cercaMatchOfferta(db, { numeri, clientId }) {
  if (numeri.length > 0) {
    const { data } = await db
      .from('offers')
      .select('id, offer_number, root_offer_id, status, client_id, attiva')
      .in('offer_number', numeri)
      .order('created_at', { ascending: false })
      .limit(5);
    if (data?.length) return { livello: data.length === 1 ? 'certo' : 'ambiguo', candidati: data };
  }
  if (clientId) {
    const { data } = await db
      .from('offers')
      .select('id, offer_number, root_offer_id, status, client_id, attiva')
      .eq('client_id', clientId)
      .eq('attiva', true)
      .order('created_at', { ascending: false })
      .limit(5);
    if (data?.length) return { livello: data.length === 1 ? 'probabile' : 'ambiguo', candidati: data };
  }
  return null;
}

export async function cercaMatchCommessa(db, { numeri, clienteNome }) {
  if (numeri.length > 0) {
    const { data: esatto } = await db
      .from('commesse')
      .select('id, numero_commessa, cliente, stato, attiva')
      .in('numero_commessa', numeri)
      .order('created_at', { ascending: false })
      .limit(5);
    if (esatto?.length) return { livello: esatto.length === 1 ? 'certo' : 'ambiguo', candidati: esatto };

    // numero_commessa non è sempre un numero pulito: nella pratica compaiono
    // valori come "3978 + 3988" (commesse abbinate) o "3973_Rossi" (numero +
    // nome cliente), che l'uguaglianza esatta non trova mai. Un contains è
    // meno preciso, quindi anche con un solo risultato resta "probabile" —
    // non abbastanza per l'aggancio automatico, solo per non perdere il
    // riferimento.
    const filtroContains = numeri.map((n) => `numero_commessa.ilike.%${n}%`).join(',');
    const { data: parziale } = await db
      .from('commesse')
      .select('id, numero_commessa, cliente, stato, attiva')
      .or(filtroContains)
      .order('created_at', { ascending: false })
      .limit(5);
    if (parziale?.length) return { livello: 'probabile', candidati: parziale };
  }
  if (clienteNome) {
    const { data } = await db
      .from('commesse')
      .select('id, numero_commessa, cliente, stato, attiva')
      .ilike('cliente', `%${clienteNome}%`)
      .eq('attiva', true)
      .order('created_at', { ascending: false })
      .limit(5);
    if (data?.length) return { livello: data.length === 1 ? 'probabile' : 'ambiguo', candidati: data };
  }
  return null;
}

// Punto d'ingresso unico: costruisce il contesto completo da passare al
// classificatore (e da riusare, tal quale, nella riconciliazione storico).
export async function costruisciContestoMatch(db, email) {
  const controparte = await identificaControparte(db, email);
  const numeri = estraiNumeri(`${email.oggetto || ''} ${email.corpo || ''}`);
  const [thread, offerta, commessa] = await Promise.all([
    cercaMatchThread(db, email),
    cercaMatchOfferta(db, { numeri, clientId: controparte.client_id }),
    cercaMatchCommessa(db, { numeri, clienteNome: controparte.cliente_nome }),
  ]);
  return { controparte, numeri_trovati: numeri, thread, offerta, commessa };
}

// Estrae l'unico candidato certo (numero esplicito, un solo risultato) —
// quello che il codice può collegare da solo senza passare dall'AI.
export function candidatoCerto(matchOfferOrCommessa) {
  if (matchOfferOrCommessa?.livello === 'certo' && matchOfferOrCommessa.candidati?.length === 1) {
    return matchOfferOrCommessa.candidati[0];
  }
  return null;
}
