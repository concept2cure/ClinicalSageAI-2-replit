/**
 * Whether an IACUC annual review is due is derived from the last recorded
 * annual review, not from the approval date alone.
 *
 * What the code used to do (until 2026-10-15): annualReviewDue was
 * `!expired && today >= approval + 1 year`, so from the second year of an
 * approval on it read "due" every day until expiry, however recently the annual
 * review had been held. Past the first year, with no annual review recorded,
 * whether one is due is not determined, and the status says why.
 */
import { describe, expect, it } from 'vitest';
import { approvalReviewStatus } from '../iacuc-logic';

const TODAY = '2026-06-10';

describe('approvalReviewStatus — annual review', () => {
  it('is not due in the first year after approval', () => {
    expect(approvalReviewStatus('2025-09-01', TODAY)).toMatchObject({ annualReviewDue: false, annualReviewUndeterminedReason: null });
  });

  it('past the first year with no annual review recorded, is not determined and says why', () => {
    const s = approvalReviewStatus('2024-03-01', TODAY);
    expect(s.annualReviewDue).toBeNull();
    expect(s).toMatchObject({ annualReviewUndeterminedReason: expect.stringMatching(/no annual review is recorded/) });
  });

  it('is not due within a year of the last recorded annual review', () => {
    expect(approvalReviewStatus('2024-03-01', TODAY, null, '2026-03-05')).toMatchObject({ annualReviewDue: false });
  });

  it('is due a year after the last recorded annual review', () => {
    expect(approvalReviewStatus('2024-03-01', TODAY, null, '2025-03-05')).toMatchObject({ annualReviewDue: true });
  });
});
