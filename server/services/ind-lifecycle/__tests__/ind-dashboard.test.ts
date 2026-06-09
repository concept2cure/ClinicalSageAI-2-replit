/**
 * IND dashboard combiner — folds sequence summary + readiness + clock into one
 * headline. Pure (no DB).
 */

import { describe, it, expect } from 'vitest';
import { buildIndDashboard } from '../ind-dashboard';
import type { SequenceSummary } from '../ind-submission-overview';
import type { IndReadinessReport } from '../ind-readiness-service';
import type { ClockState } from '../ind-regulatory-clock';

const summary: SequenceSummary = {
  total: 3,
  byType: { original: 1, amendment: 2 },
  byStatus: { dispatched: 1, draft: 2 },
  latestSequenceNumber: '0002',
  dispatched: 1,
  validated: 1,
  validationFailures: 1,
};

const readyReport = (ready: boolean, blockers: number): IndReadinessReport => ({
  filingType: 'initial',
  ready,
  overallPercentage: ready ? 100 : 50,
  moduleProgress: [],
  requiredSections: { total: 0, completed: 0, incomplete: [] },
  forms: { required: [], completed: [], missing: [] },
  blockers: Array.from({ length: blockers }, (_, i) => ({ kind: 'required_section' as const, code: `s${i}`, message: 'x' })),
  warnings: [],
});

const clock = (onHold: boolean, safe: boolean): ClockState => ({
  status: onHold ? 'clinical_hold' : 'safe_to_proceed',
  thirtyDayDate: '2026-01-31T00:00:00.000Z',
  safeToProceed: safe,
  onHold,
  daysUntilThirtyDay: 0,
  rationale: 'x',
});

describe('buildIndDashboard', () => {
  it('returns nulls in the headline when readiness/clock are absent', () => {
    const d = buildIndDashboard({ sequenceSummary: summary });
    expect(d.headline.ready).toBeNull();
    expect(d.headline.onHold).toBeNull();
    expect(d.headline.safeToProceed).toBeNull();
    // Only the validation failures count as blockers when nothing else is supplied.
    expect(d.headline.openValidationFailures).toBe(1);
    expect(d.headline.blockerCount).toBe(1);
  });

  it('aggregates readiness blockers + active hold + validation failures', () => {
    const d = buildIndDashboard({
      sequenceSummary: summary,
      readiness: readyReport(false, 2),
      clock: clock(true, false),
    });
    expect(d.headline.ready).toBe(false);
    expect(d.headline.onHold).toBe(true);
    expect(d.headline.safeToProceed).toBe(false);
    // 2 readiness blockers + 1 hold + 1 validation failure
    expect(d.headline.blockerCount).toBe(4);
  });

  it('a clean submission has zero blockers', () => {
    const clean: SequenceSummary = { ...summary, validationFailures: 0 };
    const d = buildIndDashboard({
      sequenceSummary: clean,
      readiness: readyReport(true, 0),
      clock: clock(false, true),
    });
    expect(d.headline.blockerCount).toBe(0);
    expect(d.headline.ready).toBe(true);
    expect(d.headline.safeToProceed).toBe(true);
  });
});
