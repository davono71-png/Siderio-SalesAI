"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/sales-ai/supabase.js";
import { classificaEmail, statoDopoClassificazione } from "@/lib/sales-ai/triage.js";

async function currentUserId() {
  const authed = await createClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  return user?.id ?? null;
}

// Prende in carico le email nuove e ne classifica un lotto. Il filtro
// deterministico sui mittenti chiude da solo la maggior parte del volume: al
// modello arriva solo quello che resta.
export async function analizzaInbox(quante = 15) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();

  const { error: ingestError } = await db.schema("sales_ai").rpc("triage_ingest", { p_limit: 500 });
  if (ingestError) return { ok: false, error: ingestError.message };

  const { data: daFare, error: listError } = await db
    .schema("sales_ai")
    .from("email_triage")
    .select("email_id")
    .eq("triage_status", "TO_ANALYZE")
    .limit(quante);
  if (listError) return { ok: false, error: listError.message };

  const ids = (daFare ?? []).map((r: { email_id: string }) => r.email_id);
  if (ids.length === 0) {
    revalidatePath("/inbox");
    return { ok: true, analizzate: 0, falliti: 0 };
  }

  const { data: emails, error: mailError } = await db
    .from("email_messaggi")
    .select("id, da, oggetto, corpo, allegati, created_at, account_id")
    .in("id", ids);
  if (mailError) return { ok: false, error: mailError.message };

  let analizzate = 0;
  let falliti = 0;

  for (const mail of emails ?? []) {
    try {
      const esito = await classificaEmail({
        da: mail.da,
        oggetto: mail.oggetto,
        corpo: mail.corpo,
        allegati: mail.allegati,
        created_at: mail.created_at,
      });

      const { error } = await db
        .schema("sales_ai")
        .from("email_triage")
        .update({
          classification: esito.classification,
          confidence: esito.confidence,
          reason: esito.reason,
          triage_status: statoDopoClassificazione(esito.classification),
          model: esito.model,
          prompt_version: esito.prompt_version,
          analyzed_at: new Date().toISOString(),
        })
        .eq("email_id", mail.id);

      if (error) falliti += 1;
      else analizzate += 1;
    } catch {
      // Una email che fa fallire il modello non deve bloccare il lotto:
      // resta TO_ANALYZE e verrà ritentata al giro dopo.
      falliti += 1;
    }
  }

  revalidatePath("/inbox");
  return { ok: true, analizzate, falliti };
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
