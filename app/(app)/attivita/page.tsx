import { createClient } from "@/lib/supabase/server";
import { PageShell, getUserLabel } from "@/components/PageShell";
import { ActionsList, type ActionRow } from "@/components/ActionsList";

export const dynamic = "force-dynamic";

export default async function AttivitaPage() {
  const userLabel = await getUserLabel();
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("sales_ai")
    .rpc("get_actions", { p_side: "SIDERIO", p_limit: 100 });

  const rows = (data ?? []) as ActionRow[];

  return (
    <PageShell
      active="attivita"
      userLabel={userLabel}
      eyebrow="Sales AI · Commerciale"
      title="Attività"
      subtitle="Quello che tocca a Siderio, secondo l'analisi delle email."
    >
      <ActionsList
        rows={rows}
        error={!!error}
        heading="Da fare"
        emptyTitle="Nessuna attività aperta a carico di Siderio"
        emptyNote="Le attività compaiono qui quando l'AI analizza un'opportunità e trova qualcosa che tocca a noi. Apri un'offerta e premi «Analizza con AI»."
      />
    </PageShell>
  );
}
