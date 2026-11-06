/**
 * The one client call for a QMS approval signature — a controlled document, a
 * change, or a document's retirement. The review routing that must precede a
 * document's approval is its review route since RR4 (qmsReviewRoute.ts
 * sendQmsForReview, which replaced sendQmsDocumentForReview here: a send now
 * names one QMS approver and any reviewers). The signed routes take the same body and
 * answer the same way (server/routes/mdx-qms.ts: POST /qms/documents/:id/approve;
 * since P1-28 / DP-31, POST /qms/changes/:id/approve; since P1-29 / DP-32,
 * POST /qms/documents/:id/retire), so the register and the change log share
 * this rather than each keeping a copy.
 *
 * Runs after EsignModal has checked the password (and code); the server
 * re-verifies them in the transaction that writes the signature. A refusal is
 * thrown as the sentence to show, and the dialog stays open. The time returned
 * is the server's, from the signature row, never the browser's clock.
 *
 * A periodic review of the version in force (postQmsPeriodicReview, gap 5.2)
 * is signed the same way, with meaning `review`, through the platform's one
 * signing ceremony (POST /qms/documents/:id/periodic-review).
 *
 * @module client/src/concept2cure/quality/qmsApproval
 */
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { stableStringify } from '@shared/canonical-json';
import type { C2CFormConfig } from '../v2/C2CForm';

const NOTHING_SIGNED = 'Nothing was signed.';
/** The server's sentence, ending once with "Nothing was signed." (the ceremony's refusals already do). */
function refusedSigning(message: string): Error {
  return new Error(message.trimEnd().endsWith(NOTHING_SIGNED) ? message : `${message} ${NOTHING_SIGNED}`);
}
import type { EsigSignedManifest } from '../_shared/components/EsignModal';

export type QmsApprovalTarget = { kind: 'document' | 'change' | 'document-retire'; id: number };

export interface LearningAdministrationView {
  policy: { enabled: boolean; version: number };
  classes: Array<{ key: string; label: string; count: number }>;
  sources: Array<{ id: string; recordedAt: string }>;
  library: Array<{ name: string; receipt: { schemaVersion: 1; libraryVersionId: string; artifactSha256: string; signatureHash: string } }>;
}
const learningRecord = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const LEARNING_CLASS_KEYS = ['source_identity_check', 'cross_section_consistency', 'independent_review'];
const LEARNING_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const LEARNING_SHA = /^[a-f0-9]{64}$/;
export interface LearningReviewView {
  artifact: { kind: 'aggregate_learning_v1'; libraryVersionId: string; classKey: string; agency: string;
    documentType: string; cohortMinimum: number; tenantCount: number; eventCount: number };
  artifactSha256: string; instructions: string;
}
function validLearningReviewScope(a: Record<string, any>): boolean {
  return a.kind === 'aggregate_learning_v1' && LEARNING_UUID.test(a.libraryVersionId) && LEARNING_CLASS_KEYS.includes(a.classKey) &&
    ['fda', 'ema', 'pmda', 'mhra', 'hc', 'swissmedic', 'other'].includes(a.agency) &&
    ['protocol', 'ib', 'cmc', 'labeling', 'cer', 'response_letter', 'meeting_minutes', 'section', 'briefing_package', 'other'].includes(a.documentType);
}
function validLearningReviewCounts(a: Record<string, any>): boolean {
  return a.cohortMinimum === 3 && Number.isSafeInteger(a.tenantCount) && a.tenantCount >= 3 && Number.isSafeInteger(a.eventCount) && a.eventCount >= a.tenantCount;
}
export function learningReviewViewOf(value: unknown): LearningReviewView | { unavailable: true } | null {
  if (value == null) return null;
  const raw = learningRecord(value), a = learningRecord(raw.artifact);
  if (raw.unavailable || !validLearningReviewScope(a) || !validLearningReviewCounts(a) ||
      !LEARNING_SHA.test(raw.artifactSha256) || typeof raw.instructions !== 'string') return { unavailable: true };
  return { artifact: { kind: 'aggregate_learning_v1', libraryVersionId: a.libraryVersionId, classKey: a.classKey, agency: a.agency,
    documentType: a.documentType, cohortMinimum: a.cohortMinimum, tenantCount: a.tenantCount, eventCount: a.eventCount },
  artifactSha256: raw.artifactSha256, instructions: raw.instructions };
}
export async function verifyLearningReviewHash(view: LearningReviewView): Promise<boolean> {
  if (!globalThis.crypto?.subtle) return false;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableStringify(view.artifact)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') === view.artifactSha256;
}
export function learningAdministrationViewOf(value: unknown): LearningAdministrationView | null {
  if (value === undefined) return { policy: { enabled: false, version: 0 }, classes: [], sources: [], library: [] };
  const raw = learningRecord(value), policy = learningRecord(raw.policy);
  if (typeof policy.enabled !== 'boolean' || !Number.isSafeInteger(policy.version) || policy.version < 0 ||
      ![raw.classes, raw.sources, raw.library].every(Array.isArray)) return null;
  if (raw.classes.some((item: any) => !LEARNING_CLASS_KEYS.includes(item?.key) || typeof item.label !== 'string' ||
      !Number.isSafeInteger(item.count) || item.count < 0) || raw.sources.some((item: any) => !LEARNING_UUID.test(item?.id) || !Number.isFinite(Date.parse(item.recordedAt)))) return null;
  const library = raw.library.map((item: any) => ({ name: item?.name, receipt: learningRecord(item?.receipt) }));
  if (library.some((item: any) => typeof item.name !== 'string' || item.receipt.schemaVersion !== 1 ||
      !LEARNING_UUID.test(item.receipt.libraryVersionId) || !LEARNING_SHA.test(item.receipt.artifactSha256) || !LEARNING_SHA.test(item.receipt.signatureHash))) return null;
  return { policy: { enabled: policy.enabled, version: policy.version },
    classes: raw.classes.map(({ key, label, count }: any) => ({ key, label, count })),
    sources: raw.sources.map(({ id, recordedAt }: any) => ({ id, recordedAt })),
    library: library.map(({ name, receipt }: any) => ({ name, receipt: { schemaVersion: 1, libraryVersionId: receipt.libraryVersionId,
      artifactSha256: receipt.artifactSha256, signatureHash: receipt.signatureHash } })) };
}
export function learningAdministrationFields(action: string, data: LearningAdministrationView): C2CFormConfig['fields'] | null {
  if (action === 'learning_policy') return [{ key: 'enabled', label: 'Contribute controlled pattern classes', type: 'select',
    default: data.policy.enabled ? 'yes' : 'no', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] }];
  if (action === 'learning_contribute') return [
    { key: 'classKey', label: 'Pattern class', type: 'select', required: true, options: data.classes.map(c => ({ value: c.key, label: `${c.label} (${c.count} current contributions)` })) },
    { key: 'sourceAuditEventId', label: 'Your recorded correction', type: 'select', required: true, options: data.sources.map(s => ({ value: s.id, label: `Recorded ${s.recordedAt}` })) }];
  return action === 'learning_install' ? [{ key: 'libraryVersionId', label: 'Reviewed library version', type: 'select', required: true,
    options: data.library.map(item => ({ value: item.receipt.libraryVersionId, label: item.name })) }] : null;
}
export function learningAdministrationBody(action: string, values: Record<string, string>, data?: LearningAdministrationView): Record<string, unknown> | null {
  if (action === 'learning_policy') return { enabled: values.enabled === 'yes', expectedVersion: data?.policy.version };
  if (action === 'learning_contribute') return { classKey: values.classKey, sourceAuditEventId: values.sourceAuditEventId };
  if (action !== 'learning_install') return null;
  const item = data?.library.find(entry => entry.receipt.libraryVersionId === values.libraryVersionId);
  if (!item) throw new Error('INVALID_INPUT');
  return { libraryVersionId: item.receipt.libraryVersionId, expectedArtifactSha256: item.receipt.artifactSha256 };
}

/** The signed route for each target kind, relative to /api/mdx/qms. */
const SIGNED_PATH: Record<QmsApprovalTarget['kind'], (id: number) => string> = {
  document: (id) => `documents/${id}/approve`,
  'document-retire': (id) => `documents/${id}/retire`,
  change: (id) => `changes/${id}/approve`,
};

/**
 * The meaning each target kind is signed with, as the route stores it and as
 * the dialog names it. A retirement withdraws the document from use; it is not
 * an approval (P-51).
 */
const SIGNED_MEANING: Record<QmsApprovalTarget['kind'], { stored: string; id: 'approval' | 'retirement' }> = {
  document: { stored: 'APPROVED', id: 'approval' },
  'document-retire': { stored: 'retirement', id: 'retirement' },
  change: { stored: 'APPROVED', id: 'approval' },
};

export async function postQmsApproval(
  target: QmsApprovalTarget,
  input: { reason: string; password: string; totp?: string },
  /** For a document approval: the day it is effective from (YYYY-MM-DD, not before today), bound in the signature (CAT2-19). */
  effectiveDate?: string,
  learningReview?: { expectedArtifactSha256: string; invariantAccepted: true },
): Promise<EsigSignedManifest> {
  const res = await apiRequest('POST', `/api/mdx/qms/${SIGNED_PATH[target.kind](target.id)}`, {
    password: input.password,
    ...(input.totp ? { mfaToken: input.totp } : {}),
    meaning: SIGNED_MEANING[target.kind].stored,
    reason: input.reason,
    ...(target.kind === 'document' && effectiveDate ? { effectiveDate } : {}),
    ...(target.kind === 'change' && learningReview ? { learningReview } : {}),
  });
  const json = (await res.json().catch(() => null)) as {
    meta?: { signature?: { signedAt?: string; boundPayloadDigest?: string } };
  } | null;
  // apiRequest returns a 401 rather than throwing it; here it is the signing
  // ceremony refusing the password or code.
  if (res.status === 401) {
    throw refusedSigning(serverMessage(json) ?? 'Your password or code was not verified. Re-enter them and sign again.');
  }
  const sig = json?.meta?.signature;
  if (!sig?.signedAt) {
    throw new Error('The server did not return the signature record. Reload the register to see whether the approval was recorded.');
  }
  return {
    meaning: SIGNED_MEANING[target.kind].id,
    reason: input.reason,
    signedAt: sig.signedAt,
    ...(sig.boundPayloadDigest ? { hash: sig.boundPayloadDigest } : {}),
  };
}

/** What the reviewer decided: the next review date is required when the document remains current. */
export type QmsPeriodicReviewDecision =
  | { outcome: 'current'; nextReviewDate: string }
  | { outcome: 'revision-required' };

/**
 * Record a periodic review of a controlled document's version in force. It
 * changes nothing on the document: the review is the signature
 * (server/services/qms/periodic-review.ts).
 */
export function postQmsPeriodicReview(
  id: number,
  decision: QmsPeriodicReviewDecision,
  input: { reason: string; password: string; totp?: string },
): Promise<EsigSignedManifest> {
  return sendSignedAct('POST', `/api/mdx/qms/documents/${id}/periodic-review`, decision, { ...input, meaning: 'review' }, UNCONFIRMED_REVIEW);
}

/**
 * Sign a nonconformance's disposition. The reason is recorded as its
 * rationale, and a signed disposition is not changed
 * (server/services/qms/nonconformance-disposition.ts).
 */
export function signNcDisposition(
  id: number,
  disposition: string,
  input: { meaning: EsigSignedManifest['meaning']; reason: string; password: string; totp?: string },
): Promise<EsigSignedManifest> {
  return sendSignedAct('PATCH', `/api/mdx/qms/nonconforming/${id}/disposition`, { disposition }, input, UNCONFIRMED_DISPOSITION);
}
const UNCONFIRMED_DISPOSITION = 'The server did not confirm the disposition. Reload the register and check the nonconformance before you sign again.';

/** Close a deviation with a signature (server/services/qms/deviations.ts, P-57). */
export function signDeviationClose(
  id: number,
  input: { meaning: EsigSignedManifest['meaning']; reason: string; password: string; totp?: string },
): Promise<EsigSignedManifest> {
  return sendSignedAct('POST', `/api/mdx/qms/deviations/${id}/close`, {}, input, UNCONFIRMED_CLOSE);
}
const UNCONFIRMED_CLOSE = 'The server did not confirm the close. Reload the register and check the deviation before you sign again.';

/** Cancel a deviation recorded in error; the signer's reason is the cancellation's. */
export function signDeviationCancel(
  id: number,
  input: { meaning: EsigSignedManifest['meaning']; reason: string; password: string; totp?: string },
): Promise<EsigSignedManifest> {
  return sendSignedAct('POST', `/api/mdx/qms/deviations/${id}/cancel`, {}, input, UNCONFIRMED_CANCEL);
}
const UNCONFIRMED_CANCEL = 'The server did not confirm the cancellation. Reload the register and check the deviation before you sign again.';

/** Sign a supplier's approval standing (server/services/qms/supplier-approval.ts). */
export function signSupplierApproval(
  id: number,
  decision: { approvalStatus: string; reapprovalDate?: string },
  input: { meaning: EsigSignedManifest['meaning']; reason: string; password: string; totp?: string },
): Promise<EsigSignedManifest> {
  return sendSignedAct('POST', `/api/mdx/qms/suppliers/${id}/approval`, decision, input, UNCONFIRMED_APPROVAL);
}
const UNCONFIRMED_APPROVAL = "The server did not confirm the supplier's standing. Reload the register and check the supplier before you sign again.";

/**
 * A route that signs through the platform's one ceremony (routes/governed-signed-act.ts),
 * which answers with the signature's time. A coded refusal (4xx) is the server's
 * sentence. A dropped connection or a server error may have come after the
 * commit, so it is not "nothing was signed", and signing again could record a
 * second act.
 */
async function sendSignedAct(
  method: 'POST' | 'PATCH',
  path: string,
  fields: Record<string, unknown>,
  input: { meaning: EsigSignedManifest['meaning']; reason: string; password: string; totp?: string },
  unconfirmed: string,
): Promise<EsigSignedManifest> {
  let res: Response;
  try {
    res = await apiRequest(method, path, {
      ...fields,
      password: input.password,
      ...(input.totp ? { mfaToken: input.totp } : {}),
      meaning: input.meaning,
      reason: input.reason,
    });
  } catch (err) {
    const status = (err as { status?: unknown } | null)?.status;
    if (typeof status === 'number' && status < 500) throw err;
    throw new Error(unconfirmed);
  }
  const json = (await res.json().catch(() => null)) as { signedAt?: string; sha256Chain?: string } | null;
  if (res.status === 401) {
    throw refusedSigning(serverMessage(json) ?? 'Your password or code was not verified. Re-enter them and sign again.');
  }
  if (!json?.signedAt) throw new Error(unconfirmed);
  return { meaning: input.meaning, reason: input.reason, signedAt: json.signedAt, ...(json.sha256Chain ? { hash: json.sha256Chain } : {}) };
}
const UNCONFIRMED_REVIEW = 'The server did not confirm the review. Reload the register and check the document’s last review before you sign again.';
