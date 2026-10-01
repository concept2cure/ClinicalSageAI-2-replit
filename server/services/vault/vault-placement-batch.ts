/**
 * Confirm suggested filings in bulk, with one written reason (VR-11b, row D2).
 *
 * The classifier and AnA only ever suggest a folder. Until a person confirms
 * it, a document is "suggested", and the Vault counts only confirmed filings
 * as filed. Confirming was one document at a time, so a data room filed in
 * bulk (VR-11a) left a person to click through every suggestion. Here a
 * person confirms the suggestions in one folder together.
 *
 *   - A reason is required, stated once and recorded on every document: as
 *     its placement rationale, and in its own chained vault.document.file row.
 *   - Each document is confirmed through placeVaultDocument in its own
 *     transaction, so a refusal on one leaves the others confirmed.
 *   - Each must still be suggested in the folder the person saw. One moved or
 *     confirmed since is refused CONFLICT and not touched.
 *   - Every document gets an answer, and `complete` is false whenever any was
 *     refused.
 */
import { requireGovernedReason } from '../../routes/governed-reason';
import { createScopedLogger } from '../../utils/logger.js';
import { placeVaultDocument } from './vault-placement.service.js';

const logger = createScopedLogger('vault-placement-batch');

/** At most this many documents per request. */
export const CONFIRM_BATCH_LIMIT = 100;

export type ConfirmItem =
  | { documentId: string; outcome: 'confirmed'; folderLabel: string }
  | { documentId: string; outcome: 'refused'; code: string; message: string };

export type ConfirmBatchResult =
  | { ok: true; complete: boolean; items: ConfirmItem[] }
  | { ok: false; status: number; code: string; message: string };

export interface ConfirmBatchInput {
  programId: string;
  organizationId: number;
  userId: number | null;
  /** The folder whose suggestions the person is confirming. */
  folderId: unknown;
  documentIds: unknown;
  note: unknown;
  ipAddress?: string;
  userAgent?: string;
}

/** The request's own refusal, before any document is touched; null when it may proceed. */
function requestRefusal(input: ConfirmBatchInput, ids: string[]): Extract<ConfirmBatchResult, { ok: false }> | null {
  const reason = requireGovernedReason(input.note);
  if (!reason.ok) return { ok: false, status: 422, code: 'REASON_REQUIRED', message: reason.error };
  if (typeof input.folderId !== 'string' || !input.folderId.trim()) {
    return { ok: false, status: 400, code: 'NO_FOLDER', message: 'Name the folder whose suggestions you are confirming.' };
  }
  if (ids.length === 0 || ids.length > CONFIRM_BATCH_LIMIT) {
    return { ok: false, status: 400, code: 'INVALID_DOCUMENTS', message: `Choose between 1 and ${CONFIRM_BATCH_LIMIT} documents to confirm.` };
  }
  return null;
}

/** Confirm one document's suggestion, if it is still the one the person saw. Never throws. */
async function confirmOne(input: ConfirmBatchInput, documentId: string, folderId: string, note: string): Promise<ConfirmItem> {
  try {
    const outcome = await placeVaultDocument({
      programId: input.programId,
      documentId,
      organizationId: input.organizationId,
      userId: input.userId,
      confirm: true,
      note,
      expected: { folderId, placementStatus: 'suggested' },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    if (!outcome.ok) return { documentId, outcome: 'refused', code: outcome.code, message: outcome.message };
    return { documentId, outcome: 'confirmed', folderLabel: outcome.filing.folderLabel };
  } catch (err) {
    logger.error('bulk confirm failed for one document', {
      documentId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { documentId, outcome: 'refused', code: 'CONFIRM_FAILED', message: 'It could not be confirmed. Nothing was changed for it.' };
  }
}

/** Confirm the suggested filings of the named documents in one folder, one answer per document. */
export async function confirmSuggestedFilings(input: ConfirmBatchInput): Promise<ConfirmBatchResult> {
  // Every id asked about gets an answer: one that is not a document id is
  // refused for itself by placeVaultDocument, never dropped from the list.
  const ids = Array.from(new Set(
    (Array.isArray(input.documentIds) ? input.documentIds : []).map((v) => String(v ?? '').trim()).filter(Boolean),
  ));
  const refusal = requestRefusal(input, ids);
  if (refusal) return refusal;
  const note = (input.note as string).trim();
  const folderId = (input.folderId as string).trim();

  const items: ConfirmItem[] = [];
  for (const id of ids) items.push(await confirmOne(input, id, folderId, note));
  return { ok: true, complete: items.every((i) => i.outcome === 'confirmed'), items };
}
