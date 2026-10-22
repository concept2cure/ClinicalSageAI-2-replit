/**
 * The expedited clock's due date is the canonical reporting deadline
 * (calculateReportingDeadline), not a second copy of the 7/15-day rule.
 *
 * What it used to do (until 2026-10-15): it added its own 7 or 15 days to the
 * awareness date — a separate implementation of the rule
 * pharmacovigilanceService already carries, free to drift from it.
 */
import { describe, it, expect, vi } from 'vitest';

const calc = vi.hoisted(() => vi.fn());
vi.mock('../../compliance/pharmacovigilanceService', () => ({ calculateReportingDeadline: calc }));

import { computeExpeditedReportingClock } from '../expedited-reporting-clock';

const susarCase = {
  awarenessDate: '2026-03-01', seriousnessCriteria: ['life-threatening'], causality: 'related', expectedness: 'unexpected',
};

describe('the clock asks the canonical rule for the due date', () => {
  it('passes the case as a SUSAR from the awareness date, and reports what it answers', () => {
    calc.mockReturnValue({ deadline: new Date('2026-03-08T00:00:00.000Z'), reason: null });
    const r = computeExpeditedReportingClock(susarCase, new Date('2026-03-02T00:00:00.000Z'));
    expect(calc, 'the clock computed its own deadline').toHaveBeenCalledWith('SUSAR', 'life_threatening', 'FDA', new Date('2026-03-01T00:00:00.000Z'));
    expect(r).toMatchObject({ category: '7-day', dueDate: '2026-03-08', daysRemaining: 6 });
  });

  it('a canonical "no deadline" is reported, not replaced by a local count', () => {
    calc.mockReturnValue({ deadline: null, reason: 'seriousness criterion not recorded' });
    const r = computeExpeditedReportingClock({ ...susarCase, seriousnessCriteria: ['other'] });
    expect(r.dueDate).toBeNull();
    expect(r.basis).toMatch(/seriousness criterion not recorded/);
  });
});
