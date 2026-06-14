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
