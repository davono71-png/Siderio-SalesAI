"use server";

import { createClient } from "@/lib/supabase/server";

export type KpiRow = {
  offer_id: string;
  offer_number: string;
  title: string | null;
  client_name: string | null;
  final_price_net: number | null;
  status: string;
  sent_at: string | null;
  days_since_sent: number | null;
  sales_status: string | null;
  analyzed_at: string | null;
  open_actions: number;
  blocking_actions: number;
  overdue_actions: number;
  next_due_date: string | null;
};

// Elenco dietro ogni card KPI del Command Center: stessa logica di
// get_dashboard, filtrata per un solo KPI alla volta. "KPI cliccabili" era
// già un requisito condiviso in precedenza, mai arrivato in UI — le card
// erano numeri statici senza nessun modo di vedere cosa c'è dietro.
export async function getKpiList(kpi: "OFFERTE_APERTE" | "FERME_14GG" | "AZIONI_APERTE" | "ANALIZZATE_AI") {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("sales_ai").rpc("get_kpi_list", { p_kpi: kpi });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, rows: (data ?? []) as KpiRow[] };
}
