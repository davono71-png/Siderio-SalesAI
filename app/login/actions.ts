"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error("Errore login Supabase:", error.status, error.code, error.message);
    if (error.status === 400 && error.code === "invalid_credentials") {
      return { error: "Email o password non corrette." };
    }
    return { error: `Errore di accesso (${error.code ?? error.status ?? "sconosciuto"}): ${error.message}` };
  }

  redirect("/ricerca");
}
