"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/sales-ai/supabase.js";

async function currentUserId() {
  const authed = await createClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  return user?.id ?? null;
}

export async function creaRichiesta(emailIds: string[], titolo: string, clientId: string | null) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  const { error } = await db.schema("sales_ai").rpc("crea_richiesta", {
    p_email_ids: emailIds,
    p_title: titolo,
    p_client_id: clientId,
    p_channel: "UNKNOWN",
    p_user: userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/richieste");
  return { ok: true };
}

export async function scartaCandidato(emailIds: string[], motivo: string) {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sessione scaduta, rientra." };

  const db = createServiceClient();
  const { error } = await db.schema("sales_ai").rpc("scarta_candidati", {
    p_email_ids: emailIds,
    p_motivo: motivo,
    p_user: userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/richieste");
  return { ok: true };
}
