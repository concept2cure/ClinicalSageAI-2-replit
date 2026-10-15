/**
 * The other medical-device engines give no favourable verdict on a fact nobody
 * stated (2026-10-15).
 *
 * - assessSubstantialEquivalence answered 'SE' — "supported by performance data
 *   demonstrating it is as safe and effective as the predicate" — with
 *   performanceDataDemonstratesEquivalence unstated, and read an unstated
 *   differentQuestionsOfSafetyEffectiveness as "the differences do not raise
 *   different questions". An unstated predicateIdentified or sameIntendedUse
 *   was answered for the user: "No predicate identified", "different intended use".
 * - assessEssentialPrinciples marked GSPR 9, 14, 15, 19/20 and 23 (and the IVD
 *   analytical-performance row) "addressed" whatever was given, GSPR 5 too unless
 *   lay use was stated, and read an unstated device property (sterile, software,
 *   active ...) as "not applicable": { qmsInPlace, riskManagementFile } alone
 *   came back 'conforming'.
 * - selectDevicePathway sent an IVDR Class A device whose sterility was not
 *   stated to self-certification ("no notified body"), and described a declared
 *   MDR Class Is, Im or Ir device as Class III.
 * - planDeviceSubmission gave the non-clinical "3-9 months" testing estimate and
 *   called a 510(k) Pre-Submission optional when nobody said whether clinical
 *   data are included, and dropped an HDE/BLA section (biocompatibility,
 *   sterilization, software, IVD performance) whose device answer was unstated.
 */
import { describe, expect, it } from 'vitest';
import {
  assessEssentialPrinciples,
  assessSubstantialEquivalence,
  planDeviceSubmission,
  selectDevicePathway,
  type AssessEssentialPrinciplesParams,
  type AssessSubstantialEquivalenceParams,
  type PlanDeviceSubmissionParams,
  type SelectDevicePathwayParams,
} from '../medical-device-knowledge';

const se = (p: unknown) => assessSubstantialEquivalence(p as AssessSubstantialEquivalenceParams);
const gspr = (p: AssessEssentialPrinciplesParams) => assessEssentialPrinciples(p);
const pick = (p: SelectDevicePathwayParams) => selectDevicePathway(p);
const row = (r: ReturnType<typeof gspr>, ref: string) => r.conformityMatrix.find((x) => x.gsprRef === ref);

describe('assessSubstantialEquivalence', () => {
  const SAME_USE = { predicateIdentified: true, sameIntendedUse: true };

  it('does not find SE when nobody said the performance data show equivalence', () => {
    const r = se({ ...SAME_USE, sameTechnologicalCharacteristics: true });
    expect(r.determination, 'SE with the performance data unstated').toBe('indeterminate');
    expect(r.determinationRationale).toMatch(/performanceDataDemonstratesEquivalence/);
    expect(r.determinationRationale).not.toMatch(/supported by performance data/);
    expect(se({ ...SAME_USE, sameTechnologicalCharacteristics: true, performanceDataDemonstratesEquivalence: true }).determination)
      .toBe('SE');
  });

  it('does not answer the different-questions step for the user', () => {
    const r = se({ ...SAME_USE, sameTechnologicalCharacteristics: false, performanceDataDemonstratesEquivalence: true });
    expect(r.determination).toBe('indeterminate');
    expect(r.decisionPath.map((d) => d.answer).join(' ')).not.toMatch(/do not raise different questions/);
    expect(r.determinationRationale).toMatch(/differentQuestionsOfSafetyEffectiveness/);
    const answered = se({
      ...SAME_USE, sameTechnologicalCharacteristics: false, differentQuestionsOfSafetyEffectiveness: false,
      performanceDataDemonstratesEquivalence: true,
    });
    expect(answered.determination).toBe('SE');
  });

  it('refuses a step it reaches without the answer to it', () => {
    expect(() => se({})).toThrow(/predicateIdentified/);
    expect(() => se({ predicateIdentified: true })).toThrow(/sameIntendedUse/);
    expect(() => se(SAME_USE)).toThrow(/sameTechnologicalCharacteristics/);
    // A stated "no predicate" still ends the flow at step 1.
    expect(se({ predicateIdentified: false }).determination).toBe('NSE');
  });
});

describe('assessEssentialPrinciples', () => {
  const FILES = { qmsInPlace: true, riskManagementFile: true };

  it('is not "conforming" on a QMS and a risk-management file alone', () => {
    const r = gspr(FILES);
    expect(r.overallConformity, 'conformity with no device evidence').not.toBe('conforming');
    const addressed = r.conformityMatrix.filter((x) => x.status === 'addressed').map((x) => x.gsprRef);
    expect(addressed).toEqual(['GSPR 1', 'GSPR 2', 'GSPR 3', 'GSPR 4']);
    for (const ref of ['GSPR 5', 'GSPR 9', 'GSPR 14', 'GSPR 23']) expect(row(r, ref)?.status, ref).toBe('gap');
  });

  it('does not call a requirement "not applicable" because a device property was not stated', () => {
    const r = gspr(FILES);
    expect(row(r, 'GSPR 11')).toMatchObject({ applicable: null, status: 'not-assessed' });
    expect(r.findings.map((f) => f.statement).join(' ')).toMatch(/sterile/);
    expect(row(gspr({ ...FILES, sterile: false }), 'GSPR 11')?.status).toBe('not-applicable');
  });

  it('does not count an IVD as showing its analytical performance', () => {
    expect(row(gspr({ ...FILES, isIVD: true }), 'IVDR GSPR 9 (analytical)')?.status).toBe('gap');
  });

  it('still lets a claimed standard address its requirement', () => {
    const r = gspr({ ...FILES, sterile: true, standardsClaimed: ['ISO 11135:2014'] });
    expect(row(r, 'GSPR 11')?.status).toBe('addressed');
  });
});

describe('selectDevicePathway — EU conformity route', () => {
  const US = { usClass: 'II', predicateExists: true } as const;

  it('does not self-certify an IVDR Class A device whose sterility was not stated', () => {
    const r = pick({ ...US, isIVD: true, euIvdrClass: 'A' });
    expect(r.euConformityRoute, 'no notified body with sterility unstated').toBe('undetermined');
    expect(r.euConformityRationale).toMatch(/sterile/);
    expect(pick({ ...US, isIVD: true, euIvdrClass: 'A', sterile: false }).euConformityRoute).toBe('self-certification (no NB)');
    expect(pick({ ...US, isIVD: true, euIvdrClass: 'A', sterile: true }).euConformityRoute).toBe('notified body involvement');
  });

  it('describes a declared Class Is, Im or Ir device as that class, not Class III', () => {
    for (const euMdrClass of ['Is', 'Im', 'Ir'] as const) {
      const r = pick({ ...US, euMdrClass });
      expect(r.euConformityRoute, euMdrClass).toBe('notified body involvement');
      expect(r.euConformityRationale, euMdrClass).not.toMatch(/Class III/);
      expect(r.euConformityRationale, euMdrClass).toContain(`Class ${euMdrClass}`);
    }
  });
});

describe('planDeviceSubmission', () => {
  const plan = (p: Omit<PlanDeviceSubmissionParams, 'asOf'>) => planDeviceSubmission({ ...p, asOf: '2026-10-15' });
  const testing = (p: Omit<PlanDeviceSubmissionParams, 'asOf'>) =>
    plan(p).timeline.find((t) => t.phase === 'Testing & Evidence Generation')?.durationEstimate;

  it('gives no non-clinical timeline when nobody said whether clinical data are included', () => {
    expect(testing({ usPathway: '510(k)' }), 'timeline with clinical data unstated').not.toBe('3-9 months (non-clinical)');
    expect(testing({ usPathway: '510(k)' })).toMatch(/not stated/);
    expect(testing({ usPathway: '510(k)', clinicalDataIncluded: false })).toBe('3-9 months (non-clinical)');
    expect(testing({ usPathway: '510(k)', clinicalDataIncluded: true })).toMatch(/12-36\+ months/);
  });

  it('does not call a Pre-Submission optional on an unstated clinical-data answer', () => {
    expect(plan({ usPathway: '510(k)' }).qSubStrategy).not.toMatch(/optional/);
    expect(plan({ usPathway: '510(k)', clinicalDataIncluded: false }).qSubStrategy).toMatch(/optional/);
  });

  it('keeps a non-eSTAR section whose device answer was not stated, marked undetermined', () => {
    const sterile = plan({ usPathway: 'HDE' }).usSections.find((s) => s.sectionId === 'sterile');
    expect(sterile, 'sterilization section dropped with sterility unstated').toBeDefined();
    expect(sterile?.contents).toMatch(/^Undetermined/);
    expect(plan({ usPathway: 'HDE', sterile: false }).usSections.find((s) => s.sectionId === 'sterile')).toBeUndefined();
    expect(plan({ usPathway: 'HDE', sterile: true }).usSections.find((s) => s.sectionId === 'sterile')?.contents)
      .not.toMatch(/Undetermined/);
  });
});
