import { z } from 'zod/v4';

const nullableString = z.string().nullable();
const nullableDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

export const OpenActionSchema = z.object({
  actor: z.enum(['SIDERIO', 'CUSTOMER', 'AGENCY', 'ARCHITECT', 'OTHER']),
  description: z.string(),
  due_date: nullableDate,
  blocking: z.boolean(),
});

export const SalesAiOutputSchema = z.object({
  classification: z.enum(['NEW_REQUEST', 'EXISTING_OPPORTUNITY', 'NOT_COMMERCIAL', 'UNCERTAIN']),
  confidence: z.number().min(0).max(1),
  email: z.object({
    message_id: nullableString,
    thread_id: nullableString,
    subject: nullableString,
    from_address: nullableString,
    to_address: nullableString,
    email_date: nullableString,
    source_account: nullableString,
  }),
  channel: z.enum(['DIRECT', 'AGENCY', 'UNKNOWN']),
  agency_name: nullableString,
  customer: z.object({
    name: nullableString,
    contact_name: nullableString,
    email: nullableString,
  }),
  request: z.object({
    subject: nullableString,
    installation_location: nullableString,
    timing: nullableString,
    customer_budget_status: z.enum(['KNOWN', 'NOT_MENTIONED', 'CUSTOMER_DOES_NOT_KNOW']),
    customer_budget: nullableString,
  }),
  qualification: z.object({
    completeness: z.number().int().min(0).max(100),
    sufficient_to_proceed: z.boolean(),
    critical_missing_information: z.array(z.string()),
    non_blocking_missing_information: z.array(z.string()),
  }),
  commercial: z.object({
    opportunity_status: z.enum(['OPEN', 'WAITING', 'WON', 'LOST', 'ON_HOLD', 'UNKNOWN']),
    loss_reason: z.enum(['BUDGET', 'PRICE', 'TIMING', 'PROJECT_CANCELLED', 'COMPETITOR', 'TECHNICAL', 'NO_RESPONSE', 'OTHER', 'UNKNOWN']).nullable(),
    followup_owner: z.enum(['SIDERIO', 'AGENCY', 'SHARED', 'UNKNOWN']),
    waiting_for: z.enum(['SIDERIO', 'CUSTOMER', 'AGENCY', 'ARCHITECT', 'NONE', 'UNKNOWN']),
    suggested_action: z.enum([
      'REVIEW_REQUEST',
      'REQUEST_INFORMATION',
      'PREPARE_QUOTE',
      'PREPARE_REVISION',
      'FORMALIZE_ORDER',
      'WAIT',
      'FOLLOW_UP_CUSTOMER',
      'ASK_AGENCY_UPDATE',
      'REPLY_TO_CUSTOMER',
      'REPLY_TO_AGENCY',
      'INTERNAL_CHECK',
      'ARCHIVE',
      'NO_ACTION',
      'MANUAL_REVIEW',
    ]),
    action_due_date: nullableDate,
    wait_until: nullableDate,
    next_review_date: nullableDate,
  }),
  open_actions: z.array(OpenActionSchema),
  reason: z.string(),
  evidence: z.array(z.string()),
});
