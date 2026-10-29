import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { capturedActorHeaders } from '@/utils/authToken';
import {
  authoringReviewInputSchema, authoringReviewReadSchema, authoringReviewResponseSchema,
  type AuthoringReviewContext, type AuthoringReviewInput, type AuthoringReviewRow,
} from '@shared/authoring/peer-review';
import type { ScientificReviewSubmission } from '@shared/authoring/csr-scientific-review';

export interface PeerReviewScope { documentId: string; userId: number; organizationId: number }
export type PeerVerdict = AuthoringReviewInput['review_status'];
const UNCONFIRMED = 'The service did not confirm whether your decision was recorded. Reload the review record before taking another action.';
const READ_FAILED = 'The complete saved document and your review request could not be verified. Reload the review record.';
const REFUSED = 'The service refused this decision. Reload the review record before trying again.';

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
  return context;
}

export function capturedReviewInput(
  context: AuthoringReviewContext, verdict: PeerVerdict, note: string, csrEvidence: ScientificReviewSubmission | null = null,
): AuthoringReviewInput {
  if (!context.canReview || !context.myReview) throw new PeerReviewError(context.unavailableReason ?? REFUSED, true);
  const trimmed = note.trim();
  if ((verdict !== 'approved' && trimmed.length < 8) || trimmed.length > 4000) {
    throw new PeerReviewError('A change request or rejection needs a reason of at least 8 characters. Notes may contain at most 4,000 characters.');
  }
  return authoringReviewInputSchema.parse({ review_status: verdict, ...(trimmed ? { review_comments: trimmed } : {}), expected: {
    reviewId: context.myReview.reviewId, requestedAt: context.myReview.requestedAt,
    snapshotHash: context.snapshotHash, bindingBasis: context.bindingBasis,
  }, ...(verdict === 'approved' && csrEvidence ? { csr_evidence: csrEvidence } : {}) });
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

function refusal(error: unknown): PeerReviewError {
  if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500 && error.status !== 408) {
    return new PeerReviewError(redactInternals(error.message, REFUSED), true, error.code ?? refusalCode(error.payload));
  }
  return new PeerReviewError(UNCONFIRMED, true);
}

export async function recordPeerReview(
  scope: PeerReviewScope, context: AuthoringReviewContext, verdict: PeerVerdict, note: string,
  csrEvidence: ScientificReviewSubmission | null = null,
): Promise<AuthoringReviewRow> {
  if (context.documentId !== scope.documentId || context.actorId !== String(scope.userId) || context.organizationId !== scope.organizationId) {
    throw new PeerReviewError(READ_FAILED, true);
  }
  const input = capturedReviewInput(context, verdict, note, csrEvidence);
  const headers = headersFor(scope);
  let response: Response;
  try { response = await apiRequest('POST', `/api/authoring/documents/${encodeURIComponent(scope.documentId)}/review`, input, headers); }
  catch (error) { throw refusal(error); }
  const body: unknown = await response.json().catch(() => null);
  headersFor(scope);
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500 && response.status !== 408) {
      throw new PeerReviewError(serverMessage(body) ?? REFUSED, true, refusalCode(body));
    }
    throw new PeerReviewError(UNCONFIRMED, true);
  }
  const parsed = authoringReviewResponseSchema.safeParse(body);
  if (!parsed.success || !receiptMatches(parsed.data.review, scope, context, input)) throw new PeerReviewError(UNCONFIRMED, true);
  return parsed.data.review;
}
