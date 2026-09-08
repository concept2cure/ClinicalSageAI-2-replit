/**
 * Per-section outcome of a batch draft.
 *
 * `AnaDocumentDraftingService.batchDraft` used to run each slice through
 * `Promise.all`, so one section that could not be drafted rejected the whole
 * call: the route answered a single error for all twenty sections, the client
 * painted the same message on every card, and the nineteen drafts that HAD
 * been generated — and paid for — were thrown away. The realistic trigger is a
 * section whose existing content is too large for any model, which the
 * gateway now refuses before dispatch (context-budget.ts); the refusal is
 * correct, and it must cost exactly one section.
 *
 * A failed section is therefore a RESULT in its own slot, carrying the
 * gateway's stable code and its actionable sentence — never a raw provider or
 * driver string, and never a throw. The client already reads it
 * (BatchDraft.tsx: `results[i].error`); the AnA tool `batch_draft_sections`
 * reports it per section.
 *
 * This lives in its own module, not in AnaDocumentDraftingService, so callers
 * that mock the service module in tests still get the real predicate.
 *
 * @module server/services/ana/batch-draft-result
 */

import type { GatewayErrorCode } from '../ai-gateway/gateway-error-map';
import type { DocumentDraftResponse } from './AnaDocumentDraftingService';

export interface BatchDraftFailure {
  /** A gateway classification, or DRAFT_FAILED for a fault of ours. */
  error: GatewayErrorCode | 'DRAFT_FAILED';
  /** A sentence the author can act on. Internals are never placed here. */
  message: string;
  /** The section the request named, so the failure can be matched to its card. */
  sectionType: string;
}

export type BatchDraftResult = DocumentDraftResponse | BatchDraftFailure;

/** True for a failed slot. A draft has `content`; a failure has `error` and none. */
export function isBatchDraftFailure(result: unknown): result is BatchDraftFailure {
  return (
    !!result &&
    typeof result === 'object' &&
    typeof (result as { error?: unknown }).error === 'string' &&
    !('content' in (result as object))
  );
}
