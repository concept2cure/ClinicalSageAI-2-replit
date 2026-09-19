/**
 * IND dispatch-readiness gate — deterministic go/no-go. No DB.
 */

import { describe, it, expect } from 'vitest';
import { evaluateDispatchGate } from '../ind-dispatch-gate';
import type { SequenceValidationReport } from '../ind-sequence-validation';
import type { PackageManifest } from '../ind-package-manifest';

const validation = (missing: string[], unknown: string[] = []): SequenceValidationReport => ({
  filingType: 'initial',
  valid: missing.length === 0,
  requiredCount: 5,
  presentCount: 5 - missing.length,
  missing: missing.map((c) => ({ code: c, title: `Section ${c}`, module: 'M1', regulatoryRef: '21 CFR 312.23' })),
  unknownSections: unknown,
});

const manifest = (totalLeaves: number, missingChecksums: number): PackageManifest => ({
  sequenceNumber: '0001',
  applicationNumber: 'IND123456',
  submissionType: 'original',
  modules: [],
  totalLeaves,
  missingChecksums,
});

describe('evaluateDispatchGate', () => {
  it('allows dispatch when everything is complete', () => {
    const v = evaluateDispatchGate({ sequenceValidation: validation([]), manifest: manifest(10, 0) });
    expect(v.canDispatch).toBe(true);
    expect(v.blockers).toHaveLength(0);
  });

  it('blocks an empty sequence', () => {
    const v = evaluateDispatchGate({ sequenceValidation: validation([]), manifest: manifest(0, 0) });
    expect(v.canDispatch).toBe(false);
    expect(v.blockers.map((b) => b.code)).toContain('EMPTY_SEQUENCE');
  });

  it('blocks on missing required sections', () => {
    const v = evaluateDispatchGate({ sequenceValidation: validation(['m1.2', 'm2.5']), manifest: manifest(10, 0) });
    expect(v.canDispatch).toBe(false);
    expect(v.blockers.map((b) => b.code)).toContain('MISSING_REQUIRED_SECTIONS');
    expect(v.summary.missingRequiredSections).toBe(2);
  });

  it('blocks on missing checksums', () => {
    const v = evaluateDispatchGate({ sequenceValidation: validation([]), manifest: manifest(10, 3) });
    expect(v.canDispatch).toBe(false);
    expect(v.blockers.map((b) => b.code)).toContain('MISSING_CHECKSUMS');
  });

  it('blocks when critical actions are open', () => {
    const v = evaluateDispatchGate({ sequenceValidation: validation([]), manifest: manifest(10, 0), criticalActions: 1 });
    expect(v.canDispatch).toBe(false);
    expect(v.blockers.map((b) => b.code)).toContain('CRITICAL_ACTIONS_OPEN');
  });

  it('blocks re-dispatch of an already-dispatched sequence', () => {
    const v = evaluateDispatchGate({ sequenceValidation: validation([]), manifest: manifest(10, 0), sequenceStatus: 'dispatched' });
    expect(v.canDispatch).toBe(false);
    expect(v.blockers.map((b) => b.code)).toContain('ALREADY_DISPATCHED');
  });

  it('blocks when an external dependency has no Letter of Authorization', () => {
    const v = evaluateDispatchGate({ sequenceValidation: validation([]), manifest: manifest(10, 0), unauthorizedCrossReferences: 1 });
    expect(v.canDispatch).toBe(false);
    expect(v.blockers.map((b) => b.code)).toContain('UNAUTHORIZED_CROSS_REFERENCES');
    expect(v.summary.unauthorizedCrossReferences).toBe(1);
  });

  it('does not block when all cross-references are authorized (count 0)', () => {
    const v = evaluateDispatchGate({ sequenceValidation: validation([]), manifest: manifest(10, 0), unauthorizedCrossReferences: 0 });
    expect(v.canDispatch).toBe(true);
  });

  it('treats unknown sections as a soft warning, not a blocker', () => {
    const v = evaluateDispatchGate({ sequenceValidation: validation([], ['m99.1']), manifest: manifest(10, 0) });
    expect(v.canDispatch).toBe(true);
    expect(v.warnings.map((w) => w.code)).toContain('UNKNOWN_SECTIONS');
  });

  it('reports every blocker together (not just the first)', () => {
    const v = evaluateDispatchGate({
      sequenceValidation: validation(['m1.2']),
      manifest: manifest(0, 0),
      criticalActions: 2,
    });
    const codes = v.blockers.map((b) => b.code);
    expect(codes).toEqual(expect.arrayContaining(['EMPTY_SEQUENCE', 'MISSING_REQUIRED_SECTIONS', 'CRITICAL_ACTIONS_OPEN']));
  });
});

/**
 * A clinical hold that was never EVALUATED is not a hold that is absent.
 *
 * `criticalActions` counts the 21 CFR 312.42 hold only when a regulatory clock
 * reached deriveIndActionItems (ind-action-items.ts: `if (input.clock?.onHold)`).
 * Both routes build that clock from the REQUEST BODY —
 *
 *     const clock = b.clockInput?.receiptDate ? evaluateRegulatoryClock(b.clockInput) : null;
 *
 * — so a caller that omits `clockInput` gets clock null, the hold item is never
 * derived, `criticalCount` legitimately excludes it, and the gate answered
 * `canDispatch: true` for a sequence under an active clinical hold. The line
 * directly above it in the same route shows the authors already knew this class:
 * `// From the register, never the request body`, applied to overdue safety
 * reports. There is no persisted hold register to read instead, so the honest
 * move is to refuse rather than to assume absence.
 */
describe('evaluateDispatchGate — an unevaluated clinical hold blocks', () => {
  const clean = () => ({ sequenceValidation: validation([]), manifest: manifest(10, 0) });

  it('blocks when the clinical-hold state was not evaluated', () => {
    const v = evaluateDispatchGate({ ...clean(), criticalActions: 0, clinicalHoldEvaluated: false });
    expect(v.canDispatch).toBe(false);
    expect(v.blockers.map((b) => b.code)).toContain('CLINICAL_HOLD_NOT_EVALUATED');
  });

  it('clears when the hold WAS evaluated and there is none', () => {
    const v = evaluateDispatchGate({ ...clean(), criticalActions: 0, clinicalHoldEvaluated: true });
    expect(v.canDispatch).toBe(true);
    expect(v.blockers).toHaveLength(0);
  });

  it('still blocks on a hold that WAS evaluated and is open', () => {
    const v = evaluateDispatchGate({ ...clean(), criticalActions: 1, clinicalHoldEvaluated: true });
    expect(v.canDispatch).toBe(false);
    expect(v.blockers.map((b) => b.code)).toContain('CRITICAL_ACTIONS_OPEN');
  });

  it('leaves callers that do not model the clock at all unchanged', () => {
    const v = evaluateDispatchGate(clean());
    expect(v.canDispatch).toBe(true);
  });
});
