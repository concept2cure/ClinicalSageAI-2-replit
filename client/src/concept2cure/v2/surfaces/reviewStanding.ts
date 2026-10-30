/**
 * Where a document under review stands, in words — one rule for every place
 * that shows a review row (the Review board's queue and the project's Review
 * tab, FILING_SPINE F7).
 *
 * Only verdicts whose saved-content standing is current count here. Raw
 * verdicts from older content or an unavailable binding remain history.
 * Every assigned reviewer approving current content can leave the document
 * IN_REVIEW while its signature chain is pending. Only the document's own
 * status says it is approved, so "Approved" is shown only when docStatus is
 * APPROVED; a reviewer verdict is never presented as an approved record.
 * A decline is its own verdict ("Declined"), not a request for changes.
 */
import { statusKey } from '../editor/CanvasDocumentList';
import type { ReviewItem } from '../fixtures/review-data';
import { reviewStandingOf } from '../editor/reviewTaskState';
import { signedOnRoute } from '@shared/authoring/peer-review';

export type ReviewStandingGroup = 'in-review' | 'changes' | 'declined' | 'sign-off' | 'approved';

export interface ReviewStanding {
  group: ReviewStandingGroup;
  words: string;
  /** The document-status key the canvas list's pill colours by. */
  tone?: 'IN_REVIEW' | 'APPROVED';
}

export function reviewStanding(r: Pick<ReviewItem, 'docStatus' | 'state'> & { reviews?: Array<{ status: string; standing?: unknown; routeSignedAt?: string | null }> }): ReviewStanding {
  if (statusKey(r.docStatus ?? null) === 'APPROVED') return { group: 'approved', words: 'Approved', tone: 'APPROVED' };
  const reviews = r.reviews ?? [];
  const current = reviews.filter(row => reviewStandingOf(row.status, row.standing) === 'current');
  if (current.some(row => row.status === 'rejected')) return { group: 'declined', words: 'Declined' };
  if (current.some(row => row.status === 'changes_requested')) return { group: 'changes', words: 'Changes requested' };
  // A reviewer's REVIEWER signature on the route is their review (RR5).
  const signed = reviews.filter(row => signedOnRoute(row));
  if (reviews.length > 0 && reviews.every(row => signedOnRoute(row) || (reviewStandingOf(row.status, row.standing) === 'current' && row.status === 'approved'))) {
    return { group: 'sign-off', words: signed.length > 0 ? 'Reviewers signed, sign-off pending' : 'Reviewers approved, sign-off pending', tone: 'IN_REVIEW' };
  }
  if (reviews.some(row => ['stale', 'unbound'].includes(reviewStandingOf(row.status, row.standing))) ||
      (reviews.length === 0 && r.state !== 'in-review')) {
    return { group: 'in-review', words: 'Current review needed', tone: 'IN_REVIEW' };
  }
  return { group: 'in-review', words: 'In review', tone: 'IN_REVIEW' };
}

/** The Review board's Pill tone for each standing. */
export const REVIEW_STANDING_PILL_TONE: Record<ReviewStandingGroup, string> = {
  'in-review': 'warn',
  changes: 'warn',
  declined: 'err',
  'sign-off': 'warn',
  approved: 'ok',
};
