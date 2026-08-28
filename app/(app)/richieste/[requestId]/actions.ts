"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/sales-ai/supabase.js";

export async function convertiInOfferta(requestId: string, numeroOfferta: string) {
  const authed = await createClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta, rientra." };

  const numero = numeroOfferta.trim();
  if (!numero) return { ok: false, error: "Serve il numero della nuova offerta." };

  const db = createServiceClient();
  const { data: offerId, error } = await db.schema("sales_ai").rpc("converti_richiesta_in_offerta", {
    p_request_id: requestId,
    p_offer_number: numero,
    p_user: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/richieste");
  revalidatePath(`/richieste/${requestId}`);
  revalidatePath("/ricerca");
  return { ok: true, offerId: offerId as string };
}
