/**
 * The register's review-overdue mark and the Record review row are judged
 * against today, not a date left from the removed fixtures (CAT2-22). At
 * 2026-10-29 a review due 2026-07-01 is overdue; the old constant
 * ('2026-06-04') said it was not.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isReviewOverdue, reviewRowOf, type QmsDoc } from '../data';

afterEach(() => { vi.useRealTimers(); });

describe('review overdue is judged against today', () => {
  it('marks a review due 2026-07-01 overdue on 2026-10-29, in the register and in the Record review row', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T12:00:00Z'));
    expect(isReviewOverdue('2026-07-01')).toBe(true);
    expect(isReviewOverdue('2026-11-30')).toBe(false);
    const doc = { id: 1, docNumber: 'SOP-001', title: 'Document control', status: 'effective', version: '1.0', nextReviewDate: '2026-07-01' } as unknown as QmsDoc;
    expect(reviewRowOf(doc).overdue).toBe(true);
  });
});
