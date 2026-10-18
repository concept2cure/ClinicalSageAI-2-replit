import { AUTHORING_REVIEW_BINDING_BASIS, type AuthoringReviewContext, type AuthoringReviewRow } from '@shared/authoring/peer-review';

export const PEER_DOC = '3f2c1a10-0000-4000-8000-000000000055';
export const PEER_REQUEST = '3f2c1a10-0000-4000-8000-000000000077';
export const PEER_SECTION = '3f2c1a10-0000-4000-8000-000000000101';
export const peerContext: AuthoringReviewContext = {
  documentId: PEER_DOC, actorId: '7', organizationId: 7,
  snapshot: { id: PEER_DOC, title: 'Clinical Overview §2.5', module: 'M2', locale: 'en', productCode: 'TEST', version: 3,
    sections: [{ id: PEER_SECTION, code: '2.5.1', title: 'Dose rationale', content: '<p>The complete saved rationale includes <strong>the comparator</strong>.</p><table><tbody><tr><td>Saved cohort 42</td></tr></tbody></table>' }] },
  snapshotHash: 'a'.repeat(64), bindingBasis: AUTHORING_REVIEW_BINDING_BASIS,
  myReview: { reviewId: PEER_REQUEST, requestedAt: '2026-09-20T10:00:00Z', reviewStatus: 'pending' },
  canReview: true, unavailableReason: null,
};

export function peerRead(context: AuthoringReviewContext = peerContext) {
  return { success: true, reviews: [], reviewContext: context,
    stats: { total: 0, pending: 0, approved: 0, rejected: 0, changes_requested: 0, stale: 0, unbound: 0 }, canApprove: false };
}

export function peerReceipt(status: 'approved' | 'rejected' | 'changes_requested' = 'approved') {
  const review: AuthoringReviewRow = {
    id: PEER_REQUEST, doc_id: PEER_DOC, reviewer_id: '7', tenant_id: 7,
    review_status: status, review_comments: status === 'approved' ? null : 'The dose rationale requires revision.',
    requested_at: peerContext.myReview!.requestedAt, requested_by: 'author@example.test', reviewed_at: '2026-10-14T11:00:00Z',
    reviewed_snapshot: peerContext.snapshot, reviewed_snapshot_hash: peerContext.snapshotHash,
    review_binding_basis: peerContext.bindingBasis, standing: 'current',
  };
  return { success: true, review, tasks: { completed: [], leftOpen: [] }, auditTrail: { persisted: true, chained: true } };
}

export const peerBoard = { queue: [{
  id: PEER_DOC, doc: 'Clinical Overview §2.5', prog: 'Synthetic program', programId: null, pid: PEER_DOC, module: 'M2',
  docStatus: 'IN_REVIEW', state: 'in-review',
  reviews: [{ id: PEER_REQUEST, reviewerId: '7', reviewer: 'Synthetic Reviewer', reviewerEmail: 'reviewer@example.test', status: 'pending', standing: 'pending', comments: null, requestedBy: 'author@example.test', requestedAt: peerContext.myReview!.requestedAt, reviewedAt: null }],
  myReviewId: PEER_REQUEST, myReviewStatus: 'pending', myReviewStanding: 'pending', awaitingMyReview: true, requestedByMe: false, atMySignOff: false, mine: true,
  reviewer: 'Synthetic Reviewer', role: 'Reviewer', due: '', tone: '', comments: 0, esig: 'pending', conf: null, prov: 'v3',
  passage: 'Short queue excerpt.', firstSectionId: PEER_SECTION, requestedAt: peerContext.myReview!.requestedAt,
}], workflows: {}, thread: [] };

export function actorToken(userId = 7, organizationId = 7): string {
  return `synthetic.${btoa(JSON.stringify({ userId, organizationId }))}.fixture`;
}
