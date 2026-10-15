/**
 * An interim report date is counted from the real date its cadence runs
 * from, or it is not computed. 2026-10-15.
 *
 * computeDeadline dated the next interim report (PMR/PMC annual status
 * report, REMS assessment, …) by walking the reporting cadence forward from
 * an invented anchor — the final due date minus three years ("rough:
 * commitments are typically 3–5 yr") — and returned the date it produced as
 * the commitment's next deadline, with its urgency. Nothing about the
 * commitment said when its cadence started.
 */
import { describe, expect, it } from 'vitest';

import { buildComplianceCalendar, computeDeadline, type ScheduledCommitment } from '../lifecycle-obligations';

const PMR: ScheduledCommitment = { id: 'pmr-1', productId: 'prod-1', market: 'US', type: 'pmr', status: 'open' };

describe('the next interim report of a commitment that reports on a cadence', () => {
  it('is not computed without the date the cadence counts from, and says so', () => {
    const dl = computeDeadline({ ...PMR, dueDate: '2028-06-01' }, '2026-06-28');
    expect(dl).toEqual({
      commitmentId: 'pmr-1',
      type: 'pmr',
      finalDueDate: '2028-06-01',
      undetermined: expect.stringContaining('reportingAnchorDate'),
    });
  });

  it('is counted from the real anchor: the first anniversary on or after today', () => {
    const dl = computeDeadline({ ...PMR, dueDate: '2028-06-01', reportingAnchorDate: '2025-03-10' }, '2026-06-28');
    expect(dl).toEqual({
      commitmentId: 'pmr-1',
      type: 'pmr',
      nextDueDate: '2027-03-10',
      daysRemaining: 255,
      urgency: 'on_track',
      isFinalDeadline: false,
    });
  });

  it('counts calendar months (an 18-month REMS assessment from 31 August falls on 28 February)', () => {
    const dl = computeDeadline(
      { ...PMR, id: 'rems-1', type: 'rems', dueDate: '2029-01-01', reportingAnchorDate: '2025-08-31' },
      '2026-06-28',
    );
    expect(dl).toMatchObject({ nextDueDate: '2027-02-28', isFinalDeadline: false });
  });

  it('a final deadline already past is overdue whatever the cadence: no anchor is needed to say so', () => {
    const dl = computeDeadline({ ...PMR, dueDate: '2026-01-15' }, '2026-06-28');
    expect(dl).toMatchObject({ nextDueDate: '2026-01-15', urgency: 'overdue', isFinalDeadline: true });
  });
});

describe('the compliance calendar', () => {
  it('lists an obligation it could not date, with the reason — never drops it', () => {
    const cal = buildComplianceCalendar([{ ...PMR, dueDate: '2028-06-01' }], '2026-06-28');
    expect(cal.entries).toEqual([]);
    expect(cal.undetermined).toEqual([
      expect.objectContaining({ commitmentId: 'pmr-1', binding: true, finalDueDate: '2028-06-01' }),
    ]);
    expect(cal.summary).toMatchObject({ total: 1, undetermined: 1, binding: 1, onTrack: 0 });
  });
});
