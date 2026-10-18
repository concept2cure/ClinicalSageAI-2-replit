/**
 * The overdue IND safety-report count says what it counts: tracked reports only.
 *
 * What the code used to do (until 2026-10-15): the dashboard, cockpit and
 * dispatch-gate routes took the count from listOverdueSafetyReports — DRAFTED
 * reports in the ind_safety_reports register past their deadline — and passed
 * it on as "overdue expedited IND safety reports". An SAE whose 7- or 15-day
 * clock had lapsed with no draft never appears there (and a NOT_DETERMINED
 * event cannot be drafted at all), yet a count of 0 produced no blocker, no
 * action and no word that the figure covered tracked reports only.
 */
import { describe, it, expect } from 'vitest';
import { evaluateIndReadiness } from '../ind-readiness-service';
import { deriveIndActionItems } from '../ind-action-items';
import { buildIndDashboard } from '../ind-dashboard';
import type { SequenceSummary } from '../ind-submission-overview';

const summary: SequenceSummary = {
  total: 1,
  byType: { original: 1 },
  byStatus: { draft: 1 },
  latestSequenceNumber: '0000',
  dispatched: 0,
  validated: 0,
  validationFailures: 0,
};

describe('the overdue count is labelled tracked-only wherever it is stated', () => {
  it('readiness says so beside a stated count — including zero', () => {
    for (const n of [0, 2]) {
      const r = evaluateIndReadiness({ filingType: 'amendment', sectionStatus: {}, overdueSafetyReports: n });
      expect(r.warnings.some((w) => /tracked reports only/.test(w)), String(n)).toBe(true);
    }
    const blocker = evaluateIndReadiness({ filingType: 'amendment', sectionStatus: {}, overdueSafetyReports: 2 }).blockers.find(
      (b) => b.kind === 'overdue_safety_report',
    );
    expect(blocker?.message).toMatch(/2 tracked expedited IND safety report\(s\)/);
  });

  it('the overdue action names its figure as tracked reports', () => {
    const item = deriveIndActionItems({ overdueSafetyReports: 3 }).items.find((i) => i.id === 'safety_overdue')!;
    expect(item.priority).toBe('critical');
    expect(item.title).toBe('Submit 3 overdue tracked IND safety report(s)');
    expect(item.detail).toMatch(/tracked reports only/i);
  });

  it('the dashboard headline carries the count under a name that says what it is', () => {
    expect(buildIndDashboard({ sequenceSummary: summary, overdueSafetyReports: 0 }).headline.overdueTrackedSafetyReports).toBe(0);
    expect(buildIndDashboard({ sequenceSummary: summary, overdueSafetyReports: 4 }).headline.overdueTrackedSafetyReports).toBe(4);
    // Not supplied is not zero.
    expect(buildIndDashboard({ sequenceSummary: summary }).headline.overdueTrackedSafetyReports).toBeNull();
  });
});
