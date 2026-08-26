"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveOfferState(formData: FormData) {
  const offerId = String(formData.get("offer_id") ?? "");
  const offerNumber = String(formData.get("offer_number") ?? "");
  if (!offerId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const priority = String(formData.get("priority") ?? "");

  const payload = {
    offer_id: offerId,
    status: String(formData.get("status") ?? "nessuna_azione"),
    priority: priority || null,
    action_owner: (formData.get("action_owner") as string) || null,
    waiting_for: (formData.get("waiting_for") as string) || null,
    next_action: (formData.get("next_action") as string) || null,
    next_action_date: (formData.get("next_action_date") as string) || null,
    reason: (formData.get("reason") as string) || null,
    updated_at: new Date().toISOString(),
    updated_by: user?.id ?? null,
  };

  await supabase.schema("sales_ai").from("offer_local_state").upsert(payload);

  revalidatePath(`/offerte/${offerNumber}`);
}
