/**
 * A compliance report is not run for a date that has not happened.
 *
 * HS-1008-6, honest-state review 2026-10-08. `parseReportPeriod`'s as-of branch
 * returned before any comparison against the clock, so "access review as of
 * 2027-01-01" answered with TODAY's membership under a date a year away. The
 * client's `pastAsOfNote` only fires for a PAST date, so nothing on either side
 * qualified the figure, and a regulator reading the export has a dated
 * statement of access for a day that has not happened.
 *
 * `periodProblem` is the check in front of the field, so the person is stopped
 * where they are typing rather than by a 400 after the round trip. The server's
 * half is pinned by
 * server/services/audit/compliance-reports/__tests__/period.test.ts — the
 * client check is a convenience and never the authority.
 */
import { describe, expect, it } from 'vitest';
import { defaultPeriod, periodProblem } from '../surfaces/complianceReportsModel';

const NOW = new Date('2026-09-30T15:42:00.000Z');

describe('periodProblem — a date that has not happened', () => {
  it('refuses a future as-of date', () => {
    const problem = periodProblem('as-of', { from: '', to: '2027-01-01' }, NOW);
    expect(problem, 'a future as-of date was allowed through').not.toBeNull();
    expect(problem).toMatch(/has not happened yet/);
  });

  it('refuses a range whose end has not happened', () => {
    expect(periodProblem('range', { from: '2026-09-01', to: '2026-12-31' }, NOW)).toMatch(
      /has not happened yet/,
    );
  });

  /* Today is the default, so a boundary that refused it would refuse every
     default request. */
  it('accepts today, and accepts the default period', () => {
    expect(periodProblem('as-of', { from: '', to: '2026-09-30' }, NOW)).toBeNull();
    expect(periodProblem('range', { from: '2026-09-01', to: '2026-09-30' }, NOW)).toBeNull();
    expect(periodProblem('range', defaultPeriod(NOW), NOW)).toBeNull();
    expect(periodProblem('as-of', defaultPeriod(NOW), NOW)).toBeNull();
  });

  it('reads the clock as a calendar day, not an instant', () => {
    for (const t of ['T00:00:00.000Z', 'T15:42:00.000Z', 'T23:59:59.999Z']) {
      expect(periodProblem('as-of', { from: '', to: '2026-09-30' }, new Date(`2026-09-30${t}`))).toBeNull();
    }
  });

  /* The checks that were already there still come first where they should: a
     malformed date is named as malformed, not as a future date. */
  it('still names a malformed or missing date before anything else', () => {
    expect(periodProblem('as-of', { from: '', to: 'yesterday' }, NOW)).toMatch(/Enter the date/);
    expect(periodProblem('range', { from: '', to: '' }, NOW)).toMatch(/Enter an end date/);
    expect(periodProblem('range', { from: 'garbage', to: '2026-09-30' }, NOW)).toMatch(/Enter a start date/);
    expect(periodProblem('range', { from: '2026-09-30', to: '2026-09-01' }, NOW)).toMatch(
      /start date is after the end date/,
    );
  });
});
