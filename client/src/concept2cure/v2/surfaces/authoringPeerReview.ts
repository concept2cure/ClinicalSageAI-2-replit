import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { capturedActorHeaders } from '@/utils/authToken';
import {
  authoringReviewInputSchema, authoringReviewReadSchema, authoringReviewResponseSchema,
  independentCheckContextSchema,
  type AuthoringReviewContext, type AuthoringReviewInput, type AuthoringReviewRow, type IndependentCheckContext,
} from '@shared/authoring/peer-review';
import type { ScientificReviewSubmission } from '@shared/authoring/csr-scientific-review';

export interface PeerReviewScope { documentId: string; userId: number; organizationId: number }
export type PeerVerdict = AuthoringReviewInput['review_status'];
export type IndependentFindingDrafts = Record<string, { decision: '' | 'resolved' | 'rejected'; reason: string }>;
interface ReviewEvidence { csrEvidence?: ScientificReviewSubmission | null; findingDrafts?: IndependentFindingDrafts }
const UNCONFIRMED = 'The service did not confirm whether your decision was recorded. Reload the review record before taking another action.';
const READ_FAILED = 'The complete saved document and your review request could not be verified. Reload the review record.';
const REFUSED = 'The service refused this decision. Reload the review record before trying again.';
const CHECK_UNCONFIRMED = 'The service did not confirm whether independent checks were recorded. Reload the review record before running checks again.';

export class PeerReviewError extends Error {
  /** The server's refusal code, when it gave one: a CSR approval refused for want of its scientific review says so. */
  constructor(message: string, public readonly reloadRequired = false, public readonly code: string | null = null) {
    super(message); this.name = 'PeerReviewError';
  }
}

function canonicalId(value: unknown): number | null {
  const raw = String(value ?? '');
  const parsed = Number(raw);
  return /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(parsed) && parsed <= 2_147_483_647 ? parsed : null;
}

export function peerReviewScope(user: { id?: unknown; organizationId?: unknown } | null, documentId: string): PeerReviewScope | null {
  const userId = canonicalId(user?.id);
  const organizationId = canonicalId(user?.organizationId);
  return userId && organizationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)
    ? { documentId, userId, organizationId } : null;
}

function headersFor(scope: PeerReviewScope) {
  try { return capturedActorHeaders(scope); }
  catch { throw new PeerReviewError('Your signed-in account or organization changed. Reopen the review under your current account.', true); }
}

export async function readPeerReview(scope: PeerReviewScope): Promise<AuthoringReviewContext> {
  const headers = headersFor(scope);
  const response = await apiRequest('GET', `/api/authoring/documents/${encodeURIComponent(scope.documentId)}/reviews`, undefined, headers);
  const body: unknown = await response.json().catch(() => null);
  headersFor(scope);
  if (!response.ok) throw new PeerReviewError(serverMessage(body) ?? READ_FAILED);
  const parsed = authoringReviewReadSchema.safeParse(body);
  if (!parsed.success) throw new PeerReviewError(READ_FAILED);
  const context = parsed.data.reviewContext;
  if (context.documentId !== scope.documentId || context.actorId !== String(scope.userId) || context.organizationId !== scope.organizationId) {
    throw new PeerReviewError(READ_FAILED);
  }
  if (context.independentCheck && !checkMatchesSnapshot(context.independentCheck, context.snapshotHash)) throw new PeerReviewError(READ_FAILED);
  return context;
}

function checkMatchesSnapshot(check: IndependentCheckContext, snapshotHash: string): boolean {
  return check.snapshotHash === snapshotHash && new Set(check.findings.map(finding => finding.findingId)).size === check.findings.length &&
    check.hardBlockCount === check.findings.filter(finding => finding.hard && finding.open).length &&
    check.findings.every(finding => !finding.current || finding.open);
}

export function independentFindingSubmission(context: AuthoringReviewContext, drafts: IndependentFindingDrafts): AuthoringReviewInput['independent_findings'] {
  const selected = Object.entries(drafts).filter(([, draft]) => draft.decision !== '');
  if (!selected.length) return undefined;
  const check = context.independentCheck;
  if (!check || check.standing !== 'current' || !check.receiptId || !checkMatchesSnapshot(check, context.snapshotHash)) {
    throw new PeerReviewError('Run the independent checks for this saved document before recording finding decisions.');
  }
  const dispositions = selected.map(([findingId, draft]) => {
    const finding = check.findings.find(item => item.findingId === findingId && item.open);
    const reason = draft.reason.trim();
    if (!finding || (draft.decision === 'resolved' && finding.current)) throw new PeerReviewError('A finding can be resolved only after the current server checks no longer report it. Rerun the checks first.');
    if (reason.length < 8 || reason.length > 2000) throw new PeerReviewError('Each finding decision needs a reason of 8 to 2,000 characters.');
    if (draft.decision !== 'resolved' && draft.decision !== 'rejected') throw new PeerReviewError('Choose a finding decision.');
    return { findingId: finding.findingId, decision: draft.decision, reason };
  });
  return { receiptId: check.receiptId, snapshotHash: check.snapshotHash, dispositions };
}

export function independentDecisionReady(context: AuthoringReviewContext | null, verdict: PeerVerdict | '', drafts: IndependentFindingDrafts): boolean {
  if (!context) return false;
  try {
    const submission = independentFindingSubmission(context, drafts);
    const check = context.independentCheck;
    if (verdict !== 'approved' || !check) return true;
    if (check.standing !== 'current' || !check.receiptId || !checkMatchesSnapshot(check, context.snapshotHash)) return false;
    return check.findings.every(finding => !finding.hard || !finding.open ||
      (!finding.current && submission?.dispositions.some(disposition => disposition.findingId === finding.findingId && disposition.decision === 'resolved')));
  } catch { return false; }
}

export function capturedReviewInput(
  context: AuthoringReviewContext, verdict: PeerVerdict, note: string, csrEvidence: ScientificReviewSubmission | null = null,
  findingDrafts: IndependentFindingDrafts = {},
): AuthoringReviewInput {
  if (!context.canReview || !context.myReview) throw new PeerReviewError(context.unavailableReason ?? REFUSED, true);
  const trimmed = note.trim();
  if ((verdict !== 'approved' && trimmed.length < 8) || trimmed.length > 4000) {
    throw new PeerReviewError('A change request or rejection needs a reason of at least 8 characters. Notes may contain at most 4,000 characters.');
  }
  const independentFindings = independentFindingSubmission(context, findingDrafts);
  if (!independentDecisionReady(context, verdict, findingDrafts)) throw new PeerReviewError('Current independent checks and resolution of every hard finding are required before approval. Rejecting a finding does not waive a hard block.');
  return authoringReviewInputSchema.parse({ review_status: verdict, ...(trimmed ? { review_comments: trimmed } : {}), expected: {
    reviewId: context.myReview.reviewId, requestedAt: context.myReview.requestedAt,
    snapshotHash: context.snapshotHash, bindingBasis: context.bindingBasis,
  }, ...(verdict === 'approved' && csrEvidence ? { csr_evidence: csrEvidence } : {}),
  ...(independentFindings ? { independent_findings: independentFindings } : {}) });
}

function receiptMatches(review: AuthoringReviewRow, scope: PeerReviewScope, context: AuthoringReviewContext, input: AuthoringReviewInput): boolean {
  return review.id === input.expected.reviewId && review.doc_id === scope.documentId &&
    review.reviewer_id === String(scope.userId) && review.tenant_id === scope.organizationId &&
    review.requested_at === input.expected.requestedAt && review.review_status === input.review_status &&
    review.review_comments === (input.review_comments ?? null) &&
    review.reviewed_snapshot_hash === input.expected.snapshotHash && review.review_binding_basis === input.expected.bindingBasis &&
    JSON.stringify(review.reviewed_snapshot) === JSON.stringify(context.snapshot);
}

function refusalCode(body: unknown): string | null {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : null;
}

function knownRefusal(status: number): boolean { return status >= 400 && status < 500 && status !== 408; }

function refusal(error: unknown): PeerReviewError {
  if (error instanceof ApiRequestError && knownRefusal(error.status)) {
    return new PeerReviewError(redactInternals(error.message, REFUSED), true, error.code ?? refusalCode(error.payload));
  }
  return new PeerReviewError(UNCONFIRMED, true);
}

function evidenceParts(evidence: ScientificReviewSubmission | ReviewEvidence | null): ReviewEvidence {
  if (!evidence) return {};
  return 'format' in evidence ? { csrEvidence: evidence } : evidence;
}

function scopeMatchesContext(scope: PeerReviewScope, context: AuthoringReviewContext): boolean {
  return context.documentId === scope.documentId && context.actorId === String(scope.userId) && context.organizationId === scope.organizationId;
}

export async function recordPeerReview(
  scope: PeerReviewScope, context: AuthoringReviewContext, verdict: PeerVerdict, note: string,
  evidence: ScientificReviewSubmission | ReviewEvidence | null = null,
): Promise<AuthoringReviewRow> {
  if (!scopeMatchesContext(scope, context)) throw new PeerReviewError(READ_FAILED, true);
  const { csrEvidence = null, findingDrafts = {} } = evidenceParts(evidence);
  const input = capturedReviewInput(context, verdict, note, csrEvidence, findingDrafts);
  const headers = headersFor(scope);
  let response: Response;
  try { response = await apiRequest('POST', `/api/authoring/documents/${encodeURIComponent(scope.documentId)}/review`, input, headers); }
  catch (error) { throw refusal(error); }
  const body: unknown = await response.json().catch(() => null);
  headersFor(scope);
  if (!response.ok) {
    if (knownRefusal(response.status)) {
      throw new PeerReviewError(serverMessage(body) ?? REFUSED, true, refusalCode(body));
    }
    throw new PeerReviewError(UNCONFIRMED, true);
  }
  const parsed = authoringReviewResponseSchema.safeParse(body);
  if (!parsed.success || !receiptMatches(parsed.data.review, scope, context, input)) throw new PeerReviewError(UNCONFIRMED, true);
  return parsed.data.review;
}

async function postIndependentChecks(scope: PeerReviewScope, context: AuthoringReviewContext): Promise<Response> {
  try { return await apiRequest('POST', `/api/authoring/documents/${encodeURIComponent(scope.documentId)}/review`,
    { action: 'run_independent_checks', expectedSnapshotHash: context.snapshotHash }, headersFor(scope)); }
  catch (error) {
    if (error instanceof PeerReviewError) throw error;
    if (error instanceof ApiRequestError && knownRefusal(error.status)) throw refusal(error);
    throw new PeerReviewError(CHECK_UNCONFIRMED, true);
  }
}

function independentReceipt(body: unknown, snapshotHash: string): IndependentCheckContext {
  const parsed = independentCheckContextSchema.safeParse((body as { independentCheck?: unknown } | null)?.independentCheck);
  if ((body as { success?: unknown } | null)?.success !== true || !parsed.success || !parsed.data.receiptId ||
      parsed.data.standing !== 'current' || !checkMatchesSnapshot(parsed.data, snapshotHash)) throw new PeerReviewError(CHECK_UNCONFIRMED, true);
  return parsed.data;
}

/** Uses the existing audited action and returns only a verified server-issued receipt for this snapshot. */
export async function runPeerReviewIndependentChecks(scope: PeerReviewScope, context: AuthoringReviewContext): Promise<IndependentCheckContext> {
  if (!scopeMatchesContext(scope, context) || context.canRunIndependentChecks !== true) {
    throw new PeerReviewError('Current document access is required to run independent checks.', true);
  }
  const response = await postIndependentChecks(scope, context);
  const body: unknown = await response.json().catch(() => null);
  headersFor(scope);
  if (!response.ok) {
    if (knownRefusal(response.status)) throw new PeerReviewError(serverMessage(body) ?? REFUSED, true, refusalCode(body));
    throw new PeerReviewError(CHECK_UNCONFIRMED, true);
  }
  return independentReceipt(body, context.snapshotHash);
}
