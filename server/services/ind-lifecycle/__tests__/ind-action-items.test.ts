/**
 * IND next-actions engine — deterministic prioritized checklist. No DB.
 */

import { describe, it, expect } from 'vitest';
import { deriveIndActionItems } from '../ind-action-items';
import type { IndReadinessReport } from '../ind-readiness-service';
import type { ClockState } from '../ind-regulatory-clock';
import type { SequenceValidationReport } from '../ind-sequence-validation';
import { buildIndTimeline } from '../ind-timeline-service';

const readiness = (blockers: Array<{ kind: 'required_section' | 'required_form'; code: string }>): IndReadinessReport => ({
  filingType: 'initial',
  ready: blockers.length === 0,
  overallPercentage: 0,
  moduleProgress: [],
  requiredSections: { total: 0, completed: 0, incomplete: [] },
  forms: { required: [], completed: [], missing: [] },
  blockers: blockers.map((b) => ({ kind: b.kind, code: b.code, message: `${b.code} incomplete` })),
  warnings: [],
});

const heldClock: ClockState = {
  status: 'clinical_hold',
  thirtyDayDate: '2026-01-31T00:00:00.000Z',
  safeToProceed: false,
  onHold: true,
  daysUntilThirtyDay: 0,
  rationale: 'A clinical hold is in effect.',
};

const validation = (missing: Array<{ code: string }>): SequenceValidationReport => ({
  filingType: 'initial',
  valid: missing.length === 0,
  requiredCount: 10,
  presentCount: 10 - missing.length,
  missing: missing.map((m) => ({ code: m.code, title: `Section ${m.code}`, module: 'M1', regulatoryRef: '21 CFR 312.23' })),
  unknownSections: [],
});

describe('deriveIndActionItems', () => {
  it('puts a clinical hold and overdue safety reports at the top as critical', () => {
    const r = deriveIndActionItems({ clock: heldClock, overdueSafetyReports: 2 });
    expect(r.items[0].priority).toBe('critical');
    expect(r.criticalCount).toBe(2);
    expect(r.items.map((i) => i.category)).toEqual(expect.arrayContaining(['hold', 'safety']));
  });

  it('turns readiness blockers into high-priority actions', () => {
    const r = deriveIndActionItems({ readiness: readiness([{ kind: 'required_form', code: 'FDA_1571' }]) });
    const a = r.items.find((i) => i.id.includes('FDA_1571'))!;
    expect(a.priority).toBe('high');
    expect(a.title).toContain('FDA_1571');
  });

  it('does not double-count a section flagged by both readiness and validation', () => {
    const r = deriveIndActionItems({
      readiness: readiness([{ kind: 'required_section', code: 'm1.2' }]),
      sequenceValidation: validation([{ code: 'm1.2' }]),
    });
    expect(r.items.filter((i) => i.detail.includes('m1.2') || i.title.includes('m1.2')).length).toBe(1);
  });

  it('surfaces due-soon timeline milestones as time-bound medium actions', () => {
    const timeline = buildIndTimeline({ receiptDate: '2026-01-01T00:00:00.000Z', asOf: '2026-01-25T00:00:00.000Z' });
    const r = deriveIndActionItems({ timeline });
    const deadline = r.items.find((i) => i.category === 'deadline');
    expect(deadline?.priority).toBe('medium');
    expect(deadline?.dueDate).toBeTruthy();
  });

  it('orders critical before high before medium', () => {
    const r = deriveIndActionItems({
      clock: heldClock,
      readiness: readiness([{ kind: 'required_form', code: 'FDA_1571' }]),
      timeline: buildIndTimeline({ receiptDate: '2026-01-01T00:00:00.000Z', asOf: '2026-01-25T00:00:00.000Z' }),
    });
    const priorities = r.items.map((i) => i.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => ({ critical: 0, high: 1, medium: 2, low: 3 }[a] - { critical: 0, high: 1, medium: 2, low: 3 }[b])));
  });

  it('a clean program yields no actions', () => {
    const r = deriveIndActionItems({ readiness: readiness([]), overdueSafetyReports: 0 });
    expect(r.total).toBe(0);
    expect(r.criticalCount).toBe(0);
  });
});
