/**
 * TMF completeness — DIA TMF Reference Model zones, essential-document
 * assessment, and the inspection-readiness verdict.
 */

import { describe, it, expect } from 'vitest';
import { assessTmfCompleteness, getTmfReferenceModel, TMF_REFERENCE_MODEL } from '../tmf-completeness';

/** All essential artifact codes across the model. */
const allEssential = () => TMF_REFERENCE_MODEL.flatMap((z) => z.artifacts.filter((a) => a.essential).map((a) => a.code));
const allArtifacts = () => TMF_REFERENCE_MODEL.flatMap((z) => z.artifacts.map((a) => a.code));

describe('TMF_REFERENCE_MODEL', () => {
  it('has 11 zones, each with ≥1 essential artifact and unique codes', () => {
    expect(getTmfReferenceModel()).toHaveLength(11);
    const codes = allArtifacts();
    expect(new Set(codes).size).toBe(codes.length);
    for (const z of TMF_REFERENCE_MODEL) {
      expect(z.artifacts.some((a) => a.essential)).toBe(true);
    }
  });
});

describe('assessTmfCompleteness', () => {
  it('ready when all essential artifacts are present (default scope)', () => {
    const res = assessTmfCompleteness({ providedArtifacts: allEssential() });
    expect(res.ready).toBe(true);
    expect(res.scope).toBe('essential');
    expect(res.summary.totalMissing).toBe(0);
    expect(res.summary.zonesComplete).toBe(11);
  });

  it('flags missing essential artifacts per zone and is not ready', () => {
    const res = assessTmfCompleteness({ providedArtifacts: allEssential().filter((c) => c !== 'protocol') });
    expect(res.ready).toBe(false);
    const zone2 = res.zones.find((z) => z.number === 2)!;
    expect(zone2.missing).toContain('protocol');
    expect(zone2.complete).toBe(false);
    expect(res.summary.totalMissing).toBe(1);
  });

  it("scope 'all' requires non-essential artifacts too", () => {
    const essentialOnly = assessTmfCompleteness({ providedArtifacts: allEssential(), scope: 'all' });
    expect(essentialOnly.ready).toBe(false); // non-essential ones now required and missing
    const everything = assessTmfCompleteness({ providedArtifacts: allArtifacts(), scope: 'all' });
    expect(everything.ready).toBe(true);
  });

  it('reports an empty TMF as not ready with all essentials missing', () => {
    const res = assessTmfCompleteness({ providedArtifacts: [] });
    expect(res.ready).toBe(false);
    expect(res.summary.totalMissing).toBe(res.summary.totalRequired);
    expect(res.summary.zonesComplete).toBe(0);
  });

  it('is deterministic', () => {
    const a = assessTmfCompleteness({ providedArtifacts: ['protocol', 'sap'] });
    const b = assessTmfCompleteness({ providedArtifacts: ['protocol', 'sap'] });
    expect(a).toEqual(b);
  });
});
