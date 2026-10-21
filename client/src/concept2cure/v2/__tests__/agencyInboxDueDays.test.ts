/**
 * The inbox's day count reads the same UTC calendar days as the server's
 * overdue verdict (review of 2026-10-19, rows D2 and D5).
 *
 * An agency letter's due date is stored at UTC midnight. The card and the
 * Communication lead counted milliseconds from the browser's clock, so a
 * letter due today read "(-1d)" from 12:00 UTC on, and "you have -1 days to
 * respond", beside a server verdict (response-logic letterOverdue: due today
 * is not overdue) and a CMC row that said it was not overdue. CMC's "Open on
 * its letter" lands on exactly that card.
 *
 *   • due today is 0, "today", at any hour of the UTC day;
 *   • a date that has passed is "N days ago", never a negative "days to respond";
 *   • the rule is the shared one (shared/utils/utc-day.ts), the server's own.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { daysTo, dueInWords } from '../surfaces/AgencyInbox';
import { utcDaysUntil } from '@shared/utils/utc-day';
import { letterOverdue } from '../../../../../server/services/agency-responses/response-logic';

afterEach(() => { vi.useRealTimers(); });

const DUE_TODAY = '2026-10-19T00:00:00.000Z';

describe('the inbox counts UTC calendar days, as the server does', () => {
  it('a letter due today is 0 days at 13:00 UTC, and at 23:59 UTC', () => {
    expect(daysTo(DUE_TODAY, new Date('2026-10-19T13:00:00.000Z'))).toBe(0);
    expect(daysTo(DUE_TODAY, new Date('2026-10-19T23:59:00.000Z'))).toBe(0);
    expect(daysTo(DUE_TODAY, new Date('2026-10-19T00:00:00.000Z'))).toBe(0);
    // …and the server agrees that it is not overdue on that day.
    expect(letterOverdue({ responseRequired: true, closureStatus: 'open', dueDate: DUE_TODAY }, [], '2026-10-19')).toBe(false);
  });

  it('counts whole days either side of the due day', () => {
    expect(daysTo(DUE_TODAY, new Date('2026-10-16T22:00:00.000Z'))).toBe(3);
    expect(daysTo(DUE_TODAY, new Date('2026-10-24T01:00:00.000Z'))).toBe(-5);
    expect(daysTo(null)).toBeNull();
    expect(utcDaysUntil('2026-10-19', '2026-10-18')).toBe(1);
  });

  it('words it without a negative count, and without claiming "overdue"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T13:00:00.000Z'));
    expect(dueInWords(DUE_TODAY)).toBe('today');
    expect(dueInWords(DUE_TODAY, true)).toBe('today');
    expect(dueInWords('2026-10-22T00:00:00.000Z')).toBe('in 3 days');
    expect(dueInWords('2026-10-20T00:00:00.000Z')).toBe('in 1 day');
    expect(dueInWords('2026-10-14T00:00:00.000Z')).toBe('5 days ago');
    expect(dueInWords('2026-10-14T00:00:00.000Z', true)).toBe('5d ago');
    expect(dueInWords(null)).toBeNull();
  });
});
