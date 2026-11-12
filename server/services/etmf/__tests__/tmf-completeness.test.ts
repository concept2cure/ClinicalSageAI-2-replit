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

describe('records declared not applicable (P-124 item 5)', () => {
  const essential = TMF_REFERENCE_MODEL.flatMap((z) => z.artifacts.filter((a) => a.essential).map((a) => a.code));

  it('leave the required set, are counted as neither present nor missing, and are counted on their own', () => {
    const base = assessTmfCompleteness({ providedArtifacts: [] });
    const r = assessTmfCompleteness({ providedArtifacts: [], notApplicable: ['monitoring_plan'] });
    const zone = r.zones.find((z) => z.notApplicable.includes('monitoring_plan'))!;
    expect(zone.required).not.toContain('monitoring_plan');
    expect(zone.missing).not.toContain('monitoring_plan');
    expect(zone.present).not.toContain('monitoring_plan');
    expect(r.summary).toMatchObject({ totalNotApplicable: 1, totalRequired: base.summary.totalRequired - 1, totalMissing: base.summary.totalMissing - 1 });
  });

  it('a study that files every other essential record and declares one is ready, and says one was declared', () => {
    const r = assessTmfCompleteness({ providedArtifacts: essential.filter((c) => c !== 'monitoring_plan'), notApplicable: ['monitoring_plan'] });
    expect(r.ready).toBe(true);
    expect(r.summary.totalNotApplicable).toBe(1);
    expect(r.summary.totalMissing).toBe(0);
  });

  it('a code both filed and declared is counted as declared, never twice', () => {
    const r = assessTmfCompleteness({ providedArtifacts: ['monitoring_plan'], notApplicable: ['monitoring_plan'] });
    expect(r.zones.flatMap((z) => z.present)).not.toContain('monitoring_plan');
    expect(r.summary.totalNotApplicable).toBe(1);
  });

  it('a declaration outside the scope checked is not counted; nothing declared reads as before', () => {
    const optional = TMF_REFERENCE_MODEL.flatMap((z) => z.artifacts.filter((a) => !a.essential).map((a) => a.code))[0];
    expect(assessTmfCompleteness({ providedArtifacts: [], notApplicable: [optional] }).summary.totalNotApplicable).toBe(0);
    expect(assessTmfCompleteness({ providedArtifacts: [], scope: 'all', notApplicable: [optional] }).summary.totalNotApplicable).toBe(1);
    expect(assessTmfCompleteness({ providedArtifacts: [] }).zones.every((z) => z.notApplicable.length === 0)).toBe(true);
  });
});
