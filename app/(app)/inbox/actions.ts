"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/sales-ai/supabase.js";
import { triageInboxBatch } from "@/lib/sales-ai/inboxTriage.js";
import type { MailTriage } from "./MailRow";

async function currentUserId() {
  const authed = await createClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  return user?.id ?? null;
}

// Prende in carico le email nuove e ne classifica un lotto. Il filtro
// deterministico sui mittenti chiude da solo la maggior parte del volume: al
// modello arriva solo quello che resta. Stessa logica del worker pg_cron
// (app/api/sales-ai/triage-inbox): questo bottone resta per forzare un
// giro subito, non è più l'unico modo per far avanzare la coda.
// Elenco dietro ogni card KPI della Inbox ("Da smistare", "Nuove
// richieste", "Possibili match"): stessa card cliccabile già introdotta
// nel Command Center, applicata qui su richiesta di Davide. La lista
// inline della pagina si ferma a 100 righe; con "Da smistare" oltre quel
// numero, il popup è l'unico modo per vedere il resto.
export async function getInboxKpiList(kpi: "DA_SMISTARE" | "NUOVE_RICHIESTE" | "POSSIBILI_MATCH") {
  const db = createServiceClient();
  const { data, error } = await db.schema("sales_ai").rpc("get_inbox_kpi_list", { p_kpi: kpi });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, rows: (data ?? []) as MailTriage[] };
}

export async function analizzaInbox(quante = 15) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  try {
    const { analizzate, falliti } = await triageInboxBatch(db, { quante });
    revalidatePath("/inbox");
    return { ok: true, analizzate, falliti };
  } catch (e) {
    // Gli errori Postgrest non sono sempre istanze di Error: senza questo
    // fallback il messaggio reale spariva dietro un generico "Smistamento
    // fallito.", inutile per capire cosa non ha funzionato.
    const messaggio = (e as { message?: string } | null)?.message;
    return { ok: false, error: messaggio || "Smistamento fallito." };
  }
}

export async function creaRichiestaDaEmail(emailId: string, titolo: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();

  // Il cliente si ricava dall'identità del mittente, se la conosciamo.
  const { data: mail } = await db
    .from("email_messaggi")
    .select("da")
    .eq("id", emailId)
    .maybeSingle();

  const indirizzo = (mail?.da ?? "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+/)?.[0] ?? null;
  let clientId: string | null = null;
  if (indirizzo) {
    const { data: ident } = await db
      .from("posta_identita")
      .select("client_id, confidenza")
      .eq("attivo", true)
      .in("valore", [indirizzo, indirizzo.split("@")[1]])
      .order("confidenza", { ascending: false })
      .limit(1);
    clientId = ident?.[0]?.client_id ?? null;
  }

  const { data: requestId, error } = await db.schema("sales_ai").rpc("crea_richiesta", {
    p_email_ids: [emailId],
    p_title: titolo,
    p_client_id: clientId,
    p_channel: "UNKNOWN",
    p_user: userId,
  });
  if (error) return { ok: false, error: error.message };

  await db
    .schema("sales_ai")
    .from("email_triage")
    .update({
      triage_status: "PROCESSED",
      request_id: requestId,
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    })
    .eq("email_id", emailId);

  revalidatePath("/inbox");
  revalidatePath("/richieste");
  return { ok: true };
}

// Aggancia l'email a un'offerta. Passa da email_offerta, la tabella condivisa
// con Suite: origine 'ai' e confermato true, perché a premere è stata una
// persona. Nessun match incerto scrive qui da solo.
export async function confermaMatchOfferta(emailId: string, offerNumber: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const numero = offerNumber.trim();
  if (!numero) return { ok: false, error: "Serve il numero dell'offerta." };

  const db = createServiceClient();

  const { data: offerta } = await db
    .from("offers")
    .select("id, root_offer_id")
    .eq("offer_number", numero)
    .maybeSingle();
  if (!offerta) return { ok: false, error: `Nessuna offerta con numero ${numero}.` };

  const { error } = await db.from("email_offerta").upsert(
    {
      email_id: emailId,
      offerta_id: offerta.id,
      origine: "ai",
      confermato: true,
      match_confidence: 1,
      motivo: "Confermato a mano dalla Inbox commerciale",
      creato_da: "inbox-sales-ai",
    },
    { onConflict: "email_id,offerta_id" }
  );
  if (error) return { ok: false, error: error.message };

  await db
    .schema("sales_ai")
    .from("email_triage")
    .update({
      triage_status: "PROCESSED",
      root_offer_id: offerta.root_offer_id ?? offerta.id,
      // Un match precedente (auto-proposto o sbagliato) può aver lasciato
      // request_id/commessa_id valorizzati: email_triage_esito_unico ammette
      // un solo collegamento alla volta, quindi ripulisco gli altri due ogni
      // volta che ne confermo uno.
      request_id: null,
      commessa_id: null,
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    })
    .eq("email_id", emailId);

  revalidatePath("/inbox");
  return { ok: true };
}

// Trova l'offerta su cui agire: un numero esplicito passato dall'utente ha
// sempre la precedenza; altrimenti usa il collegamento già proposto sulla
// riga di triage (il tag "Offerta #..." mostrato in Inbox viene proprio da
// lì). Condivisa da tutte le azioni che chiudono l'esito di un'offerta.
async function risolviOfferta(
  db: ReturnType<typeof createServiceClient>,
  emailId: string,
  offerNumber?: string
) {
  const numero = (offerNumber ?? "").trim();
  if (numero) {
    const { data } = await db
      .from("offers")
      .select("id, root_offer_id, offer_number, commessa_id")
      .eq("offer_number", numero)
      .maybeSingle();
    if (!data) return { error: `Nessuna offerta con numero ${numero}.` };
    return { offerta: data };
  }

  const { data: triage } = await db
    .schema("sales_ai")
    .from("email_triage")
    .select("root_offer_id")
    .eq("email_id", emailId)
    .maybeSingle();
  if (!triage?.root_offer_id) return { error: "Serve il numero dell'offerta." };

  const { data } = await db
    .from("offers")
    .select("id, root_offer_id, offer_number, commessa_id")
    .eq("id", triage.root_offer_id)
    .maybeSingle();
  if (!data) return { error: "Offerta collegata non trovata." };
  return { offerta: data };
}

// "Offerta annullata/persa": chiude l'opportunità come persa sul ciclo di
// vita (sales_ai.offer_lifecycle, non su ai_analyses — è una correzione
// dell'utente, non un verdetto dell'AI) e collega comunque l'email
// all'offerta: l'esito resta tracciabile, l'offerta esce dalle opportunità
// attive.
export async function offertaAnnullataPersa(emailId: string, offerNumber?: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  const risolto = await risolviOfferta(db, emailId, offerNumber);
  if (risolto.error) return { ok: false, error: risolto.error };
  const offerta = risolto.offerta!;
  const rootId = offerta.root_offer_id ?? offerta.id;

  const { error: statoError } = await db.schema("sales_ai").rpc("imposta_esito_manuale_offerta", {
    p_root_offer_id: rootId,
    p_status: "LOST",
    p_user: userId,
  });
  if (statoError) return { ok: false, error: statoError.message };

  const { error } = await db
    .schema("sales_ai")
    .from("email_triage")
    .update({
      triage_status: "PROCESSED",
      classification: "EXISTING_OPPORTUNITY",
      root_offer_id: rootId,
      request_id: null,
      commessa_id: null,
      reason: "Offerta segnata annullata/persa a mano dalla Inbox",
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    })
    .eq("email_id", emailId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  return { ok: true };
}

// "Già trasformata in ordine": marca l'offerta acquisita (WON) e, se Suite
// la collega già a una commessa (offers.commessa_id), riporta anche quel
// riferimento sulla riga di triage — pura tracciabilità, non crea nulla.
export async function offertaTrasformataOrdine(emailId: string, offerNumber?: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  const risolto = await risolviOfferta(db, emailId, offerNumber);
  if (risolto.error) return { ok: false, error: risolto.error };
  const offerta = risolto.offerta!;
  const rootId = offerta.root_offer_id ?? offerta.id;

  const { error: statoError } = await db.schema("sales_ai").rpc("imposta_esito_manuale_offerta", {
    p_root_offer_id: rootId,
    p_status: "WON",
    p_user: userId,
  });
  if (statoError) return { ok: false, error: statoError.message };

  const { error } = await db
    .schema("sales_ai")
    .from("email_triage")
    .update({
      triage_status: "PROCESSED",
      classification: "OFFER_CONFIRMED",
      root_offer_id: rootId,
      request_id: null,
      commessa_id: null,
      reason: "Offerta segnata già trasformata in ordine a mano dalla Inbox",
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    })
    .eq("email_id", emailId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  return { ok: true };
}

// "Ordine cliente in corso": collega l'email alla commessa via
// public.email_commessa (gemella di email_offerta, stesso principio) e la
// esclude dalla pipeline di pre-vendita — non è mai stata un'opportunità.
export async function ordineClienteInCorso(emailId: string, commessaNumber: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const numero = commessaNumber.trim();
  if (!numero) return { ok: false, error: "Serve il numero della commessa." };

  const db = createServiceClient();
  const { data: commessa } = await db
    .from("commesse")
    .select("id, numero_commessa")
    .eq("numero_commessa", numero)
    .maybeSingle();
  if (!commessa) return { ok: false, error: `Nessuna commessa con numero ${numero}.` };

  const { error: linkError } = await db.from("email_commessa").upsert(
    {
      email_id: emailId,
      commessa_id: commessa.id,
      origine: "ai",
      confermato: true,
      match_confidence: 1,
      motivo: "Confermato a mano dalla Inbox commerciale",
      creato_da: "inbox-sales-ai",
    },
    { onConflict: "email_id,commessa_id" }
  );
  if (linkError) return { ok: false, error: linkError.message };

  const { error } = await db
    .schema("sales_ai")
    .from("email_triage")
    .update({
      triage_status: "DISMISSED",
      classification: "CUSTOMER_ORDER",
      commessa_id: commessa.id,
      root_offer_id: null,
      request_id: null,
      reason: "Ordine cliente in corso, collegato a mano dalla Inbox",
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    })
    .eq("email_id", emailId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  return { ok: true };
}

// "Fornitore/acquisti": nessun modulo acquisti da collegare per ora (vedi
// spec), quindi si limita a classificare ed escludere dalla pipeline vendite
// — stesso trattamento di SUPPLIER_ORDER quando lo decide da sola l'AI.
export async function fornitoreAcquisti(emailId: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  const { error } = await db
    .schema("sales_ai")
    .from("email_triage")
    .update({
      classification: "SUPPLIER_ORDER",
      triage_status: "DISMISSED",
      root_offer_id: null,
      request_id: null,
      commessa_id: null,
      reason: "Segnata fornitore/acquisti a mano",
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    })
    .eq("email_id", emailId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  return { ok: true };
}

// "Duplicato/da ignorare": non tocca la classificazione (può restare utile
// per lo storico), chiude solo lo stato — nessun nuovo evento o oggetto,
// ma la decisione resta scritta nel motivo.
export async function duplicatoDaIgnorare(emailId: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  const { error } = await db
    .schema("sales_ai")
    .from("email_triage")
    .update({
      triage_status: "DISMISSED",
      root_offer_id: null,
      request_id: null,
      commessa_id: null,
      reason: "Duplicato/da ignorare, segnato a mano",
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    })
    .eq("email_id", emailId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  return { ok: true };
}

export async function segnaNonCommerciale(emailId: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  const { error } = await db
    .schema("sales_ai")
    .from("email_triage")
    .update({
      classification: "NOT_COMMERCIAL",
      triage_status: "DISMISSED",
      root_offer_id: null,
      request_id: null,
      commessa_id: null,
      reason: "Segnata non commerciale a mano",
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    })
    .eq("email_id", emailId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  return { ok: true };
}
