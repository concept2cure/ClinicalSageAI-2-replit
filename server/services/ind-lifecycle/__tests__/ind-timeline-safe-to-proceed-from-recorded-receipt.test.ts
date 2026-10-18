/**
 * The IND timeline places the 30-day safe-to-proceed milestone only from FDA's
 * RECORDED receipt, and projects every annual report still ahead of `asOf`.
 *
 * What the code used to do (until 2026-10-15):
 *   - buildIndTimeline ignored `receiptRecorded` and placed a "30-day
 *     safe-to-proceed date" from whatever receiptDate it was given — a program's
 *     planned target date included. Once that date went by the milestone read
 *     'past', the action list said "Prepare: 30-day safe-to-proceed date" while
 *     it was due, and the dashboard headline named it the next milestone. The
 *     clock engine already refused the same date ('projected').
 *   - the annual-report loop ran a fixed ceil(horizon / 365) + 1 years from the
 *     effective date, so an IND effective on 2018-01-01 was projected to its
 *     2021 report only: on 2026-10-15 it had no upcoming annual report and
 *     `next` was null.
 *   - an unparseable date threw a RangeError from toISOString (HTTP 500).
 */
import { describe, it, expect } from 'vitest';
import { buildIndTimeline } from '../ind-timeline-service';
import { deriveIndActionItems } from '../ind-action-items';

const RECEIPT = '2026-01-01T00:00:00.000Z';

describe('buildIndTimeline — the safe-to-proceed milestone needs a recorded receipt', () => {
  it('places no safe-to-proceed milestone from a date not stated to be FDA receipt, and says so', () => {
    for (const receiptRecorded of [undefined, false, 'true' as unknown as boolean]) {
      const t = buildIndTimeline({ receiptDate: RECEIPT, receiptRecorded, asOf: '2026-03-01T00:00:00.000Z' });
      expect(t.milestones.map((m) => m.key), String(receiptRecorded)).not.toContain('safe_to_proceed');
      expect(t.safeToProceedBasis).toBe('receipt_not_recorded');
      expect(t.next).toBeNull();
    }
  });

  it('a due-soon projection is not an action to prepare for a safe-to-proceed date', () => {
    const t = buildIndTimeline({ receiptDate: RECEIPT, asOf: '2026-01-25T00:00:00.000Z' });
    expect(deriveIndActionItems({ timeline: t }).items.filter((i) => i.category === 'deadline')).toEqual([]);
  });

  it('from a recorded receipt it is placed, 30 calendar days on', () => {
    const t = buildIndTimeline({ receiptDate: RECEIPT, receiptRecorded: true, asOf: '2026-01-10T00:00:00.000Z' });
    expect(t.safeToProceedBasis).toBe('fda_receipt');
    const m = t.milestones.find((x) => x.key === 'safe_to_proceed')!;
    expect(m.date).toBe('2026-01-31T00:00:00.000Z');
    expect(m.status).toBe('due_soon');
  });
});

describe('buildIndTimeline — annual reports are projected up to the horizon, whatever the IND\'s age', () => {
  it('an IND effective in 2018 has its 2027 report ahead of it on 2026-10-15', () => {
    const t = buildIndTimeline({
      receiptDate: '2017-12-02T00:00:00.000Z',
      receiptRecorded: true,
      effectiveDate: '2018-01-01T00:00:00.000Z',
      asOf: '2026-10-15T00:00:00.000Z',
    });
    expect(t.next?.key).toBe('annual_report_9');
    expect(t.next?.date).toBe('2027-03-02T00:00:00.000Z');
    // Every anniversary from the first, none skipped, none beyond the horizon.
    const years = t.milestones.filter((m) => m.key.startsWith('annual_report_')).map((m) => Number(m.key.split('_')[2]));
    expect(years).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('buildIndTimeline — an unparseable date is refused by name (VALIDATION), not a 500', () => {
  it.each([
    [{ receiptDate: 'not a date', receiptRecorded: true }, 'receiptDate'],
    [{ receiptDate: RECEIPT, effectiveDate: '2026-13-45' }, 'effectiveDate'],
    [{ receiptDate: RECEIPT, asOf: 'yesterday-ish' }, 'asOf'],
  ])('%j → names %s', (input, field) => {
    let refusal: unknown;
    try { buildIndTimeline(input); }
    catch (error) { refusal = error; }
    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message.startsWith(`VALIDATION: ${field} `)).toBe(true);
  });
});
