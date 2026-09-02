"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/sales-ai/supabase.js";
import { triageInboxBatch } from "@/lib/sales-ai/inboxTriage.js";

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
export async function analizzaInbox(quante = 15) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  try {
    const { analizzate, falliti } = await triageInboxBatch(db, { quante });
    revalidatePath("/inbox");
    return { ok: true, analizzate, falliti };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Smistamento fallito." };
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
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    })
    .eq("email_id", emailId);

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
      reason: "Segnata non commerciale a mano",
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    })
    .eq("email_id", emailId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox");
  return { ok: true };
}
