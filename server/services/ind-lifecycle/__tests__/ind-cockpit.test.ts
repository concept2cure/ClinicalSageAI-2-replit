/**
 * IND submission cockpit combiner — dashboard + per-sequence gates roll-up. No DB.
 */

import { describe, it, expect } from 'vitest';
import {
  buildIndCockpit,
  annotateGateWithSnapshot,
  buildDriftDigest,
  indVerdictFromAssessment,
  sequenceGateOf,
  DISPATCH_VERDICT_SOURCE,
  type SequenceGateSummary,
} from '../ind-cockpit';
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
  recordedUnderPreviousGate: false,
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
    expect(c.summary).toEqual({ totalSequences: 0, dispatchReady: 0, blocked: 0, unverified: 0, drifted: 0, recordedUnderPreviousGate: 0 });
  });

  it('includes the cross-reference register summary when supplied', () => {
    const c = buildIndCockpit({
      dashboard,
      sequenceGates: [],
      crossReferences: { total: 3, withLoa: 2, missingLoa: 1, ready: false },
    });
    expect(c.crossReferences).toEqual({ total: 3, withLoa: 2, missingLoa: 1, ready: false });
  });

  it('omits crossReferences when not supplied', () => {
    expect(buildIndCockpit({ dashboard, sequenceGates: [] }).crossReferences).toBeUndefined();
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
  const current = { source: DISPATCH_VERDICT_SOURCE };

  it('marks never-verified when there is no snapshot', () => {
    const a = annotateGateWithSnapshot(base, null);
    expect(a.lastVerifiedAt).toBeNull();
    expect(a.drift).toBe(false);
  });

  it('records the last-verified time and no drift when the verdict matches', () => {
    const a = annotateGateWithSnapshot(base, { canDispatch: true, createdAt: '2026-01-01T00:00:00.000Z', verdict: current });
    expect(a.lastVerifiedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(a.drift).toBe(false);
    expect(a.recordedUnderPreviousGate).toBe(false);
  });

  it('flags drift when the live verdict differs from the snapshot', () => {
    const a = annotateGateWithSnapshot(base, { canDispatch: false, createdAt: new Date('2026-01-01T00:00:00.000Z'), verdict: current });
    expect(a.drift).toBe(true);
    expect(a.lastVerifiedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  /* P-33: a snapshot written by the deleted IND gate carries no source. That
     gate blocked on a hold read from the request body and on checksums the
     governed path never sets, so its "blocked" against today's "cleared" is a
     different question answered, not drift. */
  it('a snapshot from before P-33 is reported as recorded under the previous gate, never as drift', () => {
    const a = annotateGateWithSnapshot(base, { canDispatch: false, createdAt: '2026-01-01T00:00:00.000Z', verdict: { canDispatch: false, blockers: [] } });
    expect(a).toMatchObject({ drift: false, recordedUnderPreviousGate: true, lastVerifiedAt: '2026-01-01T00:00:00.000Z' });
    const legacyNoVerdict = annotateGateWithSnapshot(base, { canDispatch: false, createdAt: '2026-01-01T00:00:00.000Z' });
    expect(legacyNoVerdict).toMatchObject({ drift: false, recordedUnderPreviousGate: true });
  });
});

describe('buildDriftDigest', () => {
  it('surfaces drifted and never-verified sequences, with drift taking precedence', () => {
    const d = buildDriftDigest([
      gate(0, true, [], { lastVerifiedAt: '2026-01-01T00:00:00.000Z', drift: false }), // ok, excluded
      gate(1, false, ['EMPTY_SEQUENCE'], { lastVerifiedAt: '2026-01-02T00:00:00.000Z', drift: true }), // drifted
      gate(2, true), // never verified
      gate(3, false, [], { lastVerifiedAt: null, drift: true }), // drift wins over never-verified
    ]);
    expect(d.summary).toEqual({ total: 3, drifted: 2, neverVerified: 1, recordedUnderPreviousGate: 0 });
    expect(d.entries.find((e) => e.sequenceId === 3)!.reason).toBe('drifted');
    expect(d.entries.find((e) => e.sequenceId === 2)!.reason).toBe('never_verified');
    expect(d.entries.some((e) => e.sequenceId === 0)).toBe(false);
  });

  it('is empty when every sequence is verified and on-target', () => {
    const d = buildDriftDigest([gate(0, true, [], { lastVerifiedAt: '2026-01-01T00:00:00.000Z', drift: false })]);
    expect(d.summary.total).toBe(0);
  });
});

describe('buildDriftDigest — a snapshot from before P-33', () => {
  it('surfaces the sequence for re-verification under the one verdict, not as drift', () => {
    const d = buildDriftDigest([
      gate(0, true, [], { lastVerifiedAt: '2026-01-01T00:00:00.000Z', recordedUnderPreviousGate: true }),
      gate(1, true, [], { lastVerifiedAt: '2026-01-02T00:00:00.000Z', drift: true }),
    ]);
    expect(d.summary).toEqual({ total: 2, drifted: 1, neverVerified: 0, recordedUnderPreviousGate: 1 });
    expect(d.entries.map((e) => [e.sequenceId, e.reason])).toEqual([[0, 'recorded_under_previous_gate'], [1, 'drifted']]);
  });
});

/* P-33: the IND routes answer with the one verdict. The mapper never
   recomputes it — canDispatch is the assessment's gate.cleared — and it says
   which gate produced it and what it did not assess. */
describe('indVerdictFromAssessment — the one verdict, in the IND routes\' shape', () => {
  const rule = (id: string) => ({ id }) as any;
  const finding = (severity: 'error' | 'warning' | 'info', code: string, extra: object = {}) =>
    ({ severity, code, sectionCode: null, message: `${code} message`, ...extra }) as any;
  const assessment = (over: any = {}) => ({
    gate: { cleared: true, blockers: [] },
    gates: [
      { key: 'structural', rule: rule('STRUCTURAL_GATE_CLEAR'), cleared: true, blockers: [] },
      { key: 'external', rule: rule('EXTERNAL_VALIDATION_CLEAN'), cleared: true, blockers: [], notAssessed: 'No validator.' },
      { key: 'shadowPresence', rule: rule('SHADOW_REVIEW_COMPLETED'), cleared: true, blockers: [] },
      { key: 'releaseSignature', rule: rule('RELEASE_SIGNATURE_VALID'), cleared: true, blockers: [] },
    ],
    readiness: { errors: 0, warnings: 0, infos: 0, releaseBlockers: 0, findings: [] },
    unacknowledgedShadowCriticals: 0,
    ...over,
  });

  it('a cleared assessment: canDispatch, no blockers, and what was not assessed', () => {
    const v = indVerdictFromAssessment(assessment({
      readiness: { errors: 0, warnings: 1, infos: 1, releaseBlockers: 0, findings: [finding('warning', 'IND_SAFETY_REPORT_OVERDUE'), finding('info', 'CLINICAL_HOLD_NOT_ASSESSED')] },
    }));
    expect(v).toMatchObject({ canDispatch: true, blockers: [], source: DISPATCH_VERDICT_SOURCE });
    expect(v.warnings.map((w) => w.code)).toEqual(['IND_SAFETY_REPORT_OVERDUE']);
    expect(v.notAssessed).toEqual(['No validator.', 'CLINICAL_HOLD_NOT_ASSESSED message']);
  });

  it('a blocked assessment: the findings by their own codes, then each other blocking gate by its rule', () => {
    const a = assessment({
      gate: { cleared: false, blockers: ['2 open error-severity validation finding(s) must be resolved before dispatch.', 'No completed Shadow Review.'] },
      readiness: { errors: 2, warnings: 0, infos: 0, releaseBlockers: 0, findings: [finding('error', 'CROSS_REFERENCE_LOA_MISSING', { sectionCode: '1.4.1' }), finding('error', 'MISSING_REQUIRED_SECTION')] },
    });
    a.gates[0] = { ...a.gates[0], cleared: false, blockers: ['2 open error-severity validation finding(s) must be resolved before dispatch.'] };
    a.gates[2] = { ...a.gates[2], cleared: false, blockers: ['No completed Shadow Review.'] };
    const v = indVerdictFromAssessment(a);
    expect(v.canDispatch).toBe(false);
    expect(v.blockers.map((b) => b.code)).toEqual(['CROSS_REFERENCE_LOA_MISSING', 'MISSING_REQUIRED_SECTION', 'SHADOW_REVIEW_COMPLETED']);
    expect(v.blockers[0].sectionCode).toBe('1.4.1');
    expect(sequenceGateOf({ id: 5, sequenceNumber: '0001', type: 'amendment', status: 'assembling' }, v)).toMatchObject({
      canDispatch: false,
      blockerCount: 3,
      blockerCodes: ['CROSS_REFERENCE_LOA_MISSING', 'MISSING_REQUIRED_SECTION', 'SHADOW_REVIEW_COMPLETED'],
    });
  });

  it('keeps the structural gate\'s own sentence when an open Shadow Review critical, which no finding names, blocks it', () => {
    const a = assessment({ gate: { cleared: false, blockers: ['1 unacknowledged Shadow Review critical(s).'] }, unacknowledgedShadowCriticals: 1 });
    a.gates[0] = { ...a.gates[0], cleared: false, blockers: ['1 unacknowledged Shadow Review critical(s).'] };
    expect(indVerdictFromAssessment(a).blockers).toEqual([{ code: 'STRUCTURAL_GATE_CLEAR', message: '1 unacknowledged Shadow Review critical(s).' }]);
  });
});
