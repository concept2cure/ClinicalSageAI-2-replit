/**
 * IND submission cockpit combiner — dashboard + per-sequence gates roll-up. No DB.
 */

import { describe, it, expect } from 'vitest';
import { buildIndCockpit, annotateGateWithSnapshot, type SequenceGateSummary } from '../ind-cockpit';
import type { IndDashboard } from '../ind-dashboard';

// Minimal dashboard stub (the combiner only passes it through).
const dashboard = {
  sequenceSummary: { total: 2, byType: {}, byStatus: {}, latestSequenceNumber: '0001', dispatched: 0, validated: 0, validationFailures: 0 },
  readiness: null,
  clock: null,
  timeline: null,
  sequenceValidation: null,
  actionItems: { items: [], criticalCount: 0, total: 0 },
  headline: { ready: null, onHold: null, safeToProceed: null, openValidationFailures: 0, blockerCount: 0, criticalActions: 0, nextMilestone: null },
} as unknown as IndDashboard;

const gate = (id: number, canDispatch: boolean, blockerCodes: string[] = [], extra: Partial<SequenceGateSummary> = {}): SequenceGateSummary => ({
  sequenceId: id,
  sequenceNumber: String(id).padStart(4, '0'),
  type: 'amendment',
  status: 'draft',
  canDispatch,
  blockerCount: blockerCodes.length,
  warningCount: 0,
  blockerCodes,
  lastVerifiedAt: null,
  drift: false,
  ...extra,
});

describe('buildIndCockpit', () => {
  it('rolls up dispatch-ready vs blocked across sequences', () => {
    const c = buildIndCockpit({
      dashboard,
      sequenceGates: [gate(0, true), gate(1, false, ['MISSING_CHECKSUMS']), gate(2, false, ['EMPTY_SEQUENCE'])],
    });
    expect(c.summary.totalSequences).toBe(3);
    expect(c.summary.dispatchReady).toBe(1);
    expect(c.summary.blocked).toBe(2);
  });

  it('passes the dashboard through and preserves the gate list', () => {
    const gates = [gate(0, true)];
    const c = buildIndCockpit({ dashboard, sequenceGates: gates });
    expect(c.dashboard).toBe(dashboard);
    expect(c.sequenceGates).toBe(gates);
  });

  it('handles a submission with no sequences', () => {
    const c = buildIndCockpit({ dashboard, sequenceGates: [] });
    expect(c.summary).toEqual({ totalSequences: 0, dispatchReady: 0, blocked: 0, unverified: 0, drifted: 0 });
  });

  it('rolls up unverified and drifted sequences', () => {
    const c = buildIndCockpit({
      dashboard,
      sequenceGates: [
        gate(0, true, [], { lastVerifiedAt: '2026-01-01T00:00:00.000Z', drift: false }),
        gate(1, false, ['EMPTY_SEQUENCE'], { lastVerifiedAt: '2026-01-02T00:00:00.000Z', drift: true }),
        gate(2, true), // never verified (lastVerifiedAt null)
      ],
    });
    expect(c.summary.unverified).toBe(1);
    expect(c.summary.drifted).toBe(1);
  });
});

describe('annotateGateWithSnapshot', () => {
  const base = gate(0, true);

  it('marks never-verified when there is no snapshot', () => {
    const a = annotateGateWithSnapshot(base, null);
    expect(a.lastVerifiedAt).toBeNull();
    expect(a.drift).toBe(false);
  });

  it('records the last-verified time and no drift when the verdict matches', () => {
    const a = annotateGateWithSnapshot(base, { canDispatch: true, createdAt: '2026-01-01T00:00:00.000Z' });
    expect(a.lastVerifiedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(a.drift).toBe(false);
  });

  it('flags drift when the live verdict differs from the snapshot', () => {
    const a = annotateGateWithSnapshot(base, { canDispatch: false, createdAt: new Date('2026-01-01T00:00:00.000Z') });
    expect(a.drift).toBe(true);
    expect(a.lastVerifiedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
