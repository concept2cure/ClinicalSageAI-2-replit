/**
 * designDeviceClinicalEvidence (AnA tool design_device_clinical_evidence) says
 * "not determined" when a fact that decides whether clinical data are needed
 * was not stated (2026-10-15).
 *
 * It started from clinicalDataRequired = false and kept it unless a stated fact
 * turned it on. So designDeviceClinicalEvidence({}) — no class, no pathway, no
 * device facts — answered "Clinical data are generally NOT required", study
 * type "none (non-clinical sufficient)", and usIDERequired false; a class II
 * device whose novelty, implantability and 510(k) comparison were never stated
 * got the same answer; and a study it did require, with the significant-risk
 * question unstated, was told it needed no IDE.
 */
import { describe, expect, it } from 'vitest';
import { designDeviceClinicalEvidence, type DesignDeviceClinicalEvidenceParams } from '../medical-device-knowledge';
import { DESIGN_DEVICE_CLINICAL_EVIDENCE } from '../../ana/medicalDeviceTools';

const design = (p: Partial<DesignDeviceClinicalEvidenceParams>) =>
  designDeviceClinicalEvidence(p as DesignDeviceClinicalEvidenceParams);

/** Every fact that would require clinical data, stated false. */
const NONE_OF_THE_TRIGGERS = { novelTechnology: false, clinicalDataNeededForSE: false, implantable: false, lifeSustaining: false };

describe('designDeviceClinicalEvidence', () => {
  it('states nothing about clinical data from no facts', () => {
    const r = design({});
    expect(r.clinicalDataRequired, 'clinical data "not required" from no facts').toBeNull();
    expect(r.usIDERequired, 'IDE "not required" from no facts').toBeNull();
    expect(r.recommendedStudies.map((s) => s.studyType)).not.toContain('none (non-clinical sufficient)');
    expect(r.clinicalDataRationale).toMatch(/not determined/i);
    expect(r.clinicalDataRationale).not.toMatch(/NOT required/);
    expect(r.missingFacts).toEqual(expect.arrayContaining([expect.stringMatching(/^usClass/)]));
  });

  it('a class II device is not "no clinical data" until each fact that would require them is stated', () => {
    const r = design({ usClass: 'II' });
    expect(r.clinicalDataRequired).toBeNull();
    for (const k of Object.keys(NONE_OF_THE_TRIGGERS)) {
      expect(r.missingFacts, k).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`^${k}`))]));
    }
    const stated = design({ usClass: 'II', ...NONE_OF_THE_TRIGGERS });
    expect(stated.clinicalDataRequired).toBe(false);
    expect(stated.usIDERequired).toBe(false);
    expect(stated.missingFacts).toEqual([]);
    expect(stated.recommendedStudies.map((s) => s.studyType)).toContain('none (non-clinical sufficient)');
  });

  it('one stated fact that requires clinical data decides it, whatever else is unstated', () => {
    expect(design({ usClass: 'III' }).clinicalDataRequired).toBe(true);
    expect(design({ usPathway: 'PMA' }).clinicalDataRequired).toBe(true);
    expect(design({ usClass: 'II', novelTechnology: true }).clinicalDataRequired).toBe(true);
    expect(design({ usClass: 'II', implantable: true }).clinicalDataRequired).toBe(true);
  });

  it('does not rule out an IDE while the significant-risk question is unstated', () => {
    const r = design({ usClass: 'II', novelTechnology: true });
    expect(r.usIDERequired, 'IDE "not required" with significant risk unstated').toBeNull();
    expect(r.missingFacts).toEqual([expect.stringMatching(/^significantRisk/)]);
    expect(design({ usClass: 'II', novelTechnology: true, significantRisk: false }).usIDERequired).toBe(false);
    expect(design({ usClass: 'II', novelTechnology: true, significantRisk: true }).usIDERequired).toBe(true);
    expect(design({ usClass: 'III' }).usIDERequired).toBe(true);
  });

  it('tells AnA that null is "not determined"', () => {
    expect(DESIGN_DEVICE_CLINICAL_EVIDENCE.description.slice(0, 1024)).toMatch(/null/);
    expect(DESIGN_DEVICE_CLINICAL_EVIDENCE.description.slice(0, 1024)).toMatch(/missingFacts/);
  });
});
