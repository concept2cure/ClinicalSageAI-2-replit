/**
 * Where a document under review stands, in words — one rule for every place
 * that shows a review row (the Review board's queue and the project's Review
 * tab, FILING_SPINE F7).
 *
 * The board's `state` is the reviewers' verdict, not the record's status
 * (server/services/review/authoring-review-board.ts deriveState): every
 * reviewer approving makes it 'approved' while the document is still
 * IN_REVIEW and its signature chain is pending. Only the document's own
 * status says it is approved, so "Approved" is shown only when docStatus is
 * APPROVED; a reviewer verdict is never presented as an approved record.
 * A decline is its own verdict ("Declined"), not a request for changes.
 */
import { statusKey } from '../editor/CanvasDocumentList';
import type { ReviewItem } from '../fixtures/review-data';

export type ReviewStandingGroup = 'in-review' | 'changes' | 'declined' | 'sign-off' | 'approved';

export interface ReviewStanding {
  group: ReviewStandingGroup;
  words: string;
  /** The document-status key the canvas list's pill colours by. */
  tone?: 'IN_REVIEW' | 'APPROVED';
}

export function reviewStanding(r: Pick<ReviewItem, 'docStatus' | 'state'>): ReviewStanding {
  if (statusKey(r.docStatus ?? null) === 'APPROVED') return { group: 'approved', words: 'Approved', tone: 'APPROVED' };
  if (r.state === 'rejected') return { group: 'declined', words: 'Declined' };
  if (r.state === 'changes-requested') return { group: 'changes', words: 'Changes requested' };
  if (r.state === 'approved') return { group: 'sign-off', words: 'Reviewers approved, sign-off pending', tone: 'IN_REVIEW' };
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
