"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";

export async function signIn(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  // Login con il client Supabase "puro" (nessun adapter cookie): isola la
  // chiamata di rete da qualunque comportamento aggiunto da @supabase/ssr.
  const bareClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await bareClient.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    console.error("Errore login Supabase:", error?.status, error?.code, error?.message);
    if (error?.status === 400 && error?.code === "invalid_credentials") {
      return { error: "Email o password non corrette." };
    }
    return {
      error: `Errore di accesso (${error?.code ?? error?.status ?? "sconosciuto"}): ${
        error?.message ?? "risposta senza sessione"
      }`,
    };
  }

  // Sessione ottenuta: la salviamo nei cookie tramite il client con adapter SSR.
  const supabase = await createClient();
  await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  redirect("/oggi");
}
