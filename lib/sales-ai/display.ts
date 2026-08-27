export type Tone = "danger" | "warn" | "info" | "ok" | "neutral";

export const CLASSIFICATION_LABEL: Record<string, string> = {
  NEW_REQUEST: "Nuova richiesta",
  EXISTING_OPPORTUNITY: "Opportunità in corso",
  NOT_COMMERCIAL: "Non commerciale",
  UNCERTAIN: "Da rivedere",
};

export const CLASSIFICATION_TONE: Record<string, Tone> = {
  NEW_REQUEST: "info",
  EXISTING_OPPORTUNITY: "ok",
  NOT_COMMERCIAL: "neutral",
  UNCERTAIN: "warn",
};

export const ACTOR_LABEL: Record<string, string> = {
  SIDERIO: "Siderio",
  CUSTOMER: "Cliente",
  AGENCY: "Agenzia",
  ARCHITECT: "Progettista",
  OTHER: "Altro",
};

export const SUGGESTED_ACTION_LABEL: Record<string, string> = {
  REVIEW_REQUEST: "Valutare la richiesta",
  REQUEST_INFORMATION: "Chiedere informazioni",
  PREPARE_QUOTE: "Preparare il preventivo",
  PREPARE_REVISION: "Preparare una revisione",
  FORMALIZE_ORDER: "Formalizzare l'ordine",
  WAIT: "Attendere",
  FOLLOW_UP_CUSTOMER: "Follow-up al cliente",
  ASK_AGENCY_UPDATE: "Chiedere aggiornamento all'agenzia",
  REPLY_TO_CUSTOMER: "Rispondere al cliente",
  REPLY_TO_AGENCY: "Rispondere all'agenzia",
  INTERNAL_CHECK: "Verifica interna",
  ARCHIVE: "Archiviare",
  NO_ACTION: "Nessuna azione",
  MANUAL_REVIEW: "Revisione manuale",
};

export const OPPORTUNITY_STATUS_LABEL: Record<string, string> = {
  OPEN: "Aperta",
  WAITING: "In attesa",
  WON: "Vinta",
  LOST: "Persa",
  ON_HOLD: "Sospesa",
  UNKNOWN: "Non determinato",
};

export const WAITING_FOR_LABEL: Record<string, string> = {
  ...ACTOR_LABEL,
  NONE: "Nessuno",
  UNKNOWN: "Non determinato",
};

export const dateFmt = (v: string | null | undefined) =>
  v
    ? new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(v))
    : "—";

export const dateTimeFmt = (v: string | null | undefined) =>
  v
    ? new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(v))
    : "—";

export const currencyFmt = (v: number | null | undefined) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v ?? 0);

export const currencyShortFmt = (v: number | null | undefined) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v ?? 0);
