import { createClient } from "@/lib/supabase/server";
import { PageShell, getUserLabel } from "@/components/PageShell";
import { ActionsList, type ActionRow } from "@/components/ActionsList";

export const dynamic = "force-dynamic";

export default async function AttesePage() {
  const userLabel = await getUserLabel();
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("sales_ai")
    .rpc("get_actions", { p_side: "EXTERNAL", p_limit: 100 });

  const rows = (data ?? []) as ActionRow[];

  return (
    <PageShell
      active="attese"
      userLabel={userLabel}
      eyebrow="Sales AI · Commerciale"
      title="Attese"
      subtitle="Quello che stiamo aspettando da cliente, agenzia o progettista."
    >
      <ActionsList
        rows={rows}
        error={!!error}
        heading="In attesa di risposta"
        emptyTitle="Nessuna attesa registrata"
        emptyNote="Qui finiscono le azioni che l'AI attribuisce a qualcuno fuori da Siderio. Si popola man mano che analizzi le opportunità."
      />
    </PageShell>
  );
}
