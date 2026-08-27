"use client";

import { useState, useTransition } from "react";
import { SparkIcon } from "@/components/icons";
import { runOpportunityAnalysis, submitAnalysisFeedback } from "./actions";
import {
  ACTOR_LABEL,
  CLASSIFICATION_LABEL,
  CLASSIFICATION_TONE,
  OPPORTUNITY_STATUS_LABEL,
  SUGGESTED_ACTION_LABEL,
  WAITING_FOR_LABEL,
  dateFmt,
  dateTimeFmt,
} from "@/lib/sales-ai/display";

export type OpenAction = {
  id: string;
  actor: string;
  description: string;
  due_date: string | null;
  blocking: boolean;
  status: string;
};

export type Analysis = {
  id: string;
  classification: string;
  confidence: number;
  result_json: {
    reason?: string;
    channel?: string;
    agency_name?: string | null;
    request?: {
      subject?: string | null;
      installation_location?: string | null;
      timing?: string | null;
      customer_budget_status?: string;
      customer_budget?: string | null;
    };
    qualification?: {
      completeness?: number;
      sufficient_to_proceed?: boolean;
      critical_missing_information?: string[];
      non_blocking_missing_information?: string[];
    };
    commercial?: {
      opportunity_status?: string;
      loss_reason?: string | null;
      followup_owner?: string;
      waiting_for?: string;
      suggested_action?: string;
      action_due_date?: string | null;
      wait_until?: string | null;
      next_review_date?: string | null;
    };
    evidence?: string[];
  };
  created_at: string;
  model: string;
  prompt_version: string;
  feedback: Array<{ result: string; created_at: string }>;
};

export type AiState = {
  root_offer_id: string;
  latest_analysis: Analysis | null;
  open_actions: OpenAction[];
  analysis_count: number;
};

const FEEDBACK_LABEL: Record<string, string> = {
  CORRECT: "Corretta",
  PARTIAL: "Parziale",
  WRONG: "Sbagliata",
  CRITICAL: "Grave",
};

export function AiPanel({
  state,
  offerId,
  offerNumber,
}: {
  state: AiState | null;
  offerId: string;
  offerNumber: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);

  const analysis = state?.latest_analysis ?? null;
  const actions = state?.open_actions ?? [];
  const commercial = analysis?.result_json?.commercial;
  const qualification = analysis?.result_json?.qualification;

  function analyze() {
    setMessage(null);
    startTransition(async () => {
      const res = await runOpportunityAnalysis(offerId, offerNumber);
      if (res.ok) {
        setMessage({
          tone: "ok",
          text: res.queued
            ? "Analisi accodata: un altro job era già in corso, arriverà a breve."
            : "Analisi completata.",
        });
      } else {
        setMessage({ tone: "danger", text: res.error ?? "Analisi fallita." });
      }
    });
  }

  function sendFeedback(result: string) {
    if (!analysis) return;
    setMessage(null);
    startTransition(async () => {
      const res = await submitAnalysisFeedback(analysis.id, result, offerNumber);
      setMessage(
        res.ok
          ? { tone: "ok", text: "Grazie, feedback registrato." }
          : { tone: "danger", text: res.error ?? "Non riesco a salvare il feedback." }
      );
    });
  }

  return (
    <section className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span className="section-title">
          <SparkIcon size={16} />
          Sales AI
        </span>
        {analysis && (
          <span className={`status ${CLASSIFICATION_TONE[analysis.classification] ?? "neutral"}`}>
            {CLASSIFICATION_LABEL[analysis.classification] ?? analysis.classification}
          </span>
        )}
      </div>

      {!analysis && (
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
          Questa opportunità non è ancora stata analizzata. L&apos;analisi legge tutte le email collegate
          all&apos;offerta e alle sue revisioni.
        </div>
      )}

      {analysis && (
        <div className="ai-panel">
          <h3 style={{ fontSize: 14 }}>Valutazione del {dateTimeFmt(analysis.created_at)}</h3>

          <div className="row">
            <label>Cosa sta succedendo</label>
            <div>{analysis.result_json?.reason ?? "—"}</div>
          </div>

          <div className="detail-grid" style={{ marginTop: 12 }}>
            <div className="detail">
              <label>Stato opportunità</label>
              <div>
                {OPPORTUNITY_STATUS_LABEL[commercial?.opportunity_status ?? ""] ??
                  commercial?.opportunity_status ??
                  "—"}
              </div>
            </div>
            <div className="detail">
              <label>Chi deve agire</label>
              <div>{WAITING_FOR_LABEL[commercial?.waiting_for ?? ""] ?? commercial?.waiting_for ?? "—"}</div>
            </div>
            <div className="detail">
              <label>Azione consigliata</label>
              <div>
                {SUGGESTED_ACTION_LABEL[commercial?.suggested_action ?? ""] ?? commercial?.suggested_action ?? "—"}
              </div>
            </div>
            <div className="detail">
              <label>Entro</label>
              <div>{dateFmt(commercial?.action_due_date ?? commercial?.next_review_date ?? null)}</div>
            </div>
          </div>

          {qualification && (
            <div className="row">
              <label>Completezza informazioni</label>
              <div>
                {qualification.completeness ?? "—"}%
                {qualification.sufficient_to_proceed === false ? " · non sufficienti per procedere" : ""}
              </div>
            </div>
          )}

          {!!qualification?.critical_missing_information?.length && (
            <div className="row">
              <label>Informazioni critiche mancanti</label>
              <div>{qualification.critical_missing_information.join(" · ")}</div>
            </div>
          )}

          <div className="row">
            <label>Confidenza</label>
            <div>
              {Math.round((analysis.confidence ?? 0) * 100)}% · {analysis.model} · prompt{" "}
              {analysis.prompt_version}
            </div>
          </div>

          <div className="ai-panel-actions">
            <span style={{ fontSize: 11, fontWeight: 900, color: "var(--muted)", alignSelf: "center" }}>
              LA VALUTAZIONE È:
            </span>
            {["CORRECT", "PARTIAL", "WRONG"].map((r) => (
              <button key={r} type="button" className="btn small" disabled={pending} onClick={() => sendFeedback(r)}>
                {FEEDBACK_LABEL[r]}
              </button>
            ))}
          </div>

          {analysis.feedback.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
              Feedback già registrato: {FEEDBACK_LABEL[analysis.feedback[0].result] ?? analysis.feedback[0].result} (
              {dateFmt(analysis.feedback[0].created_at)})
            </div>
          )}
        </div>
      )}

      {actions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: "var(--muted)" }}>AZIONI APERTE</span>
          {actions.map((a) => (
            <div
              key={a.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 11,
                display: "flex",
                flexDirection: "column",
                gap: 5,
              }}
            >
              <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                <span className="tag purple">{ACTOR_LABEL[a.actor] ?? a.actor}</span>
                {a.blocking && <span className="status danger">Bloccante</span>}
                {a.due_date && <span className="tag">Entro {dateFmt(a.due_date)}</span>}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.45 }}>{a.description}</div>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn ai" onClick={analyze} disabled={pending}>
        <SparkIcon size={15} />
        {pending ? "Analisi in corso…" : analysis ? "Rianalizza con AI" : "Analizza con AI"}
      </button>

      {message && (
        <div style={{ fontSize: 12, color: message.tone === "ok" ? "var(--ok)" : "var(--danger)" }}>
          {message.text}
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--muted)" }}>
        {state ? `${state.analysis_count} valutazioni registrate su questa opportunità.` : ""}
      </div>
    </section>
  );
}
