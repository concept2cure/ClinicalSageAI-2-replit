import { describe, it, expect } from 'vitest';
import type { Commitment } from '../../shared/regulatory/agency-interaction';
import {
  getFulfillmentRequirement,
  computeDeadline,
  buildComplianceCalendar,
  escalationLevel,
  annualStatusCategory,
  type FulfillmentEvidenceType,
} from '../../shared/regulatory/lifecycle-obligations';

const mkCommitment = (
  overrides: Partial<Commitment> & Pick<Commitment, 'type'>,
): Commitment => ({
  id: 'c-1',
  productId: 'prod-1',
  market: 'fda',
  status: 'open',
  ...overrides,
});

describe('lifecycle obligations — fulfillment requirements', () => {
  it('PMR requires annual interim reporting and carries enforcement consequence', () => {
    const req = getFulfillmentRequirement('pmr');
    expect(req.requiresInterimReporting).toBe(true);
    expect(req.reportingCadenceMonths).toBe(12);
    expect(req.missedDeadlineConsequence).toBe('enforcement_action');
    expect(req.acceptedEvidence).toContain('study_report');
  });

  it('PMC has the same cadence but a warning letter (not enforcement) consequence', () => {
    const req = getFulfillmentRequirement('pmc');
    expect(req.reportingCadenceMonths).toBe(12);
    expect(req.missedDeadlineConsequence).toBe('warning_letter');
  });

  it('REMS uses 18-month assessment cadence and is enforceable', () => {
    const req = getFulfillmentRequirement('rems');
    expect(req.reportingCadenceMonths).toBe(18);
    expect(req.missedDeadlineConsequence).toBe('enforcement_action');
    expect(req.acceptedEvidence).toContain('rems_assessment');
  });

  it('EU specific obligation is enforceable with 12-month cadence', () => {
    const req = getFulfillmentRequirement('specific_obligation');
    expect(req.missedDeadlineConsequence).toBe('enforcement_action');
    expect(req.acceptedEvidence).toContain('specific_data');
  });

  it('annual reportable is the lightest — no interim, just a status flag', () => {
    const req = getFulfillmentRequirement('annual_reportable');
    expect(req.requiresInterimReporting).toBe(false);
    expect(req.missedDeadlineConsequence).toBe('status_flag');
  });

  it('every commitment type has at least one accepted evidence type', () => {
    const types: Commitment['type'][] = [
      'pmr', 'pmc', 'rems', 'post_approval_study', 'specific_obligation', 'annual_reportable',
    ];
    for (const t of types) {
      expect(getFulfillmentRequirement(t).acceptedEvidence.length).toBeGreaterThan(0);
    }
  });
});

describe('lifecycle obligations — deadline computation', () => {
  it('returns null for fulfilled commitments', () => {
    const c = mkCommitment({ type: 'pmr', status: 'fulfilled', dueDate: '2027-06-01' });
    expect(computeDeadline(c, '2026-06-28')).toBeNull();
  });

  it('returns null for commitments with no due date', () => {
    const c = mkCommitment({ type: 'pmr' });
    expect(computeDeadline(c, '2026-06-28')).toBeNull();
  });

  it('computes days remaining correctly for a future deadline', () => {
    const c = mkCommitment({ type: 'annual_reportable', dueDate: '2026-12-31' });
    const dl = computeDeadline(c, '2026-06-28')!;
    expect(dl).not.toBeNull();
    expect(dl.daysRemaining).toBeGreaterThan(150);
    expect(dl.urgency).toBe('on_track');
    expect(dl.isFinalDeadline).toBe(true);
  });

  it('marks a past-due commitment as overdue', () => {
    const c = mkCommitment({ type: 'pmr', status: 'in_progress', dueDate: '2026-01-15' });
    const dl = computeDeadline(c, '2026-06-28')!;
    expect(dl.daysRemaining).toBeLessThan(0);
    expect(dl.urgency).toBe('overdue');
  });

  it('marks a commitment due in 20 days as critical', () => {
    const c = mkCommitment({ type: 'pmr', status: 'in_progress', dueDate: '2026-07-18' });
    const dl = computeDeadline(c, '2026-06-28')!;
    expect(dl.daysRemaining).toBe(20);
    expect(dl.urgency).toBe('critical');
  });

  it('marks a commitment due in 60 days as approaching', () => {
    const c = mkCommitment({ type: 'pmc', status: 'in_progress', dueDate: '2026-08-27' });
    const dl = computeDeadline(c, '2026-06-28')!;
    expect(dl.daysRemaining).toBe(60);
    expect(dl.urgency).toBe('approaching');
  });
});

describe('lifecycle obligations — compliance calendar', () => {
  const commitments: Commitment[] = [
    mkCommitment({ id: 'pmr-1', type: 'pmr', status: 'in_progress', dueDate: '2026-07-10' }),
    mkCommitment({ id: 'pmc-1', type: 'pmc', status: 'open', dueDate: '2027-03-01' }),
    mkCommitment({ id: 'rems-1', type: 'rems', status: 'overdue', dueDate: '2026-05-01' }),
    mkCommitment({ id: 'done-1', type: 'pmr', status: 'fulfilled', dueDate: '2026-01-01' }),
  ];

  it('excludes fulfilled commitments from the calendar', () => {
    const cal = buildComplianceCalendar(commitments, '2026-06-28');
    expect(cal.entries.find((e) => e.commitmentId === 'done-1')).toBeUndefined();
  });

  it('sorts by urgency: overdue first, then critical, then on_track', () => {
    const cal = buildComplianceCalendar(commitments, '2026-06-28');
    const urgencies = cal.entries.map((e) => e.deadline.urgency);
    expect(urgencies[0]).toBe('overdue');  // rems-1 is overdue
  });

  it('summary counts are correct', () => {
    const cal = buildComplianceCalendar(commitments, '2026-06-28');
    expect(cal.summary.total).toBe(3); // 3 active (pmr-1, pmc-1, rems-1)
    expect(cal.summary.overdue).toBeGreaterThanOrEqual(1); // rems-1
  });

  it('marks binding commitments correctly', () => {
    const cal = buildComplianceCalendar(commitments, '2026-06-28');
    const pmr = cal.entries.find((e) => e.commitmentId === 'pmr-1');
    const rems = cal.entries.find((e) => e.commitmentId === 'rems-1');
    const pmc = cal.entries.find((e) => e.commitmentId === 'pmc-1');
    expect(pmr?.binding).toBe(true);
    expect(rems?.binding).toBe(true);
    expect(pmc?.binding).toBe(false);
  });

  it('an empty commitment list produces an empty calendar', () => {
    const cal = buildComplianceCalendar([], '2026-06-28');
    expect(cal.entries).toEqual([]);
    expect(cal.summary.total).toBe(0);
  });
});

describe('lifecycle obligations — escalation rules', () => {
  it('overdue always escalates to urgent regardless of binding status', () => {
    expect(escalationLevel('pmr', 'overdue')).toBe('urgent');
    expect(escalationLevel('pmc', 'overdue')).toBe('urgent');
    expect(escalationLevel('annual_reportable', 'overdue')).toBe('urgent');
  });

  it('critical binding commitment escalates, non-binding notifies', () => {
    expect(escalationLevel('pmr', 'critical')).toBe('escalate');
    expect(escalationLevel('rems', 'critical')).toBe('escalate');
    expect(escalationLevel('pmc', 'critical')).toBe('notify');
  });

  it('approaching binding commitment notifies, non-binding is none', () => {
    expect(escalationLevel('specific_obligation', 'approaching')).toBe('notify');
    expect(escalationLevel('pmc', 'approaching')).toBe('none');
  });

  it('on_track is always none', () => {
    expect(escalationLevel('pmr', 'on_track')).toBe('none');
    expect(escalationLevel('pmc', 'on_track')).toBe('none');
  });
});

describe('lifecycle obligations — FDA annual status categories', () => {
  it('maps commitment statuses to FDA PMR/PMC reporting categories', () => {
    expect(annualStatusCategory('fulfilled', null)).toBe('fulfilled');
    expect(annualStatusCategory('released', null)).toBe('released');
    expect(annualStatusCategory('open', null)).toBe('pending');
    expect(annualStatusCategory('in_progress', 'on_track')).toBe('ongoing');
    expect(annualStatusCategory('in_progress', 'overdue')).toBe('delayed');
    expect(annualStatusCategory('overdue', 'overdue')).toBe('delayed');
  });
});
