import Link from "next/link";
import { EmptyState, ErrorState } from "./PageShell";
import { ACTOR_LABEL, currencyShortFmt, dateFmt } from "@/lib/sales-ai/display";

export type ActionRow = {
  id: string;
  actor: string;
  description: string;
  due_date: string | null;
  blocking: boolean;
  overdue: boolean;
  created_at: string;
  offer_id: string;
  offer_number: string;
  title: string | null;
  final_price_net: number | null;
  client_name: string | null;
};

export function ActionsList({
  rows,
  error,
  heading,
  emptyTitle,
  emptyNote,
}: {
  rows: ActionRow[];
  error: boolean;
  heading: string;
  emptyTitle: string;
  emptyNote: string;
}) {
  return (
    <section className="panel" style={{ overflow: "hidden" }}>
      <div className="panel-head">
        <h2>{heading}</h2>
        <span className="panel-meta">{rows.length} azioni</span>
      </div>

      {error && <ErrorState />}
      {!error && rows.length === 0 && <EmptyState title={emptyTitle} note={emptyNote} />}

      {rows.map((a) => (
        <Link
          key={a.id}
          href={`/offerte/${encodeURIComponent(a.offer_number)}`}
          className="offer-card"
          style={{ color: "var(--text)" }}
        >
          <div>
            <div className="offer-top">
              {a.overdue && <span className="status danger">Scaduta</span>}
              {a.blocking && <span className="status warn">Bloccante</span>}
              <span className="tag purple">{ACTOR_LABEL[a.actor] ?? a.actor}</span>
              <span className="tag">#{a.offer_number}</span>
              {a.due_date && <span className="tag">Entro {dateFmt(a.due_date)}</span>}
            </div>
            <h3>{a.description}</h3>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              {a.client_name ?? "Cliente non specificato"} · {a.title ?? "Senza oggetto"}
            </div>
          </div>
          <div className="offer-side">
            <span style={{ fontWeight: 900, fontSize: 15 }}>{currencyShortFmt(a.final_price_net)}</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Individuata il {dateFmt(a.created_at)}</span>
          </div>
        </Link>
      ))}
    </section>
  );
}
