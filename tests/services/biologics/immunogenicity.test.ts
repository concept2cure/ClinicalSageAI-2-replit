import { describe, it, expect } from 'vitest';
import { assessImmunogenicity } from '../../../server/services/biologics/immunogenicity';

describe('immunogenicity — incidence & comparison', () => {
  it('computes ADA incidence with a Wilson CI per arm', () => {
    const out = assessImmunogenicity({
      productType: 'biosimilar',
      arms: [
        { label: 'Proposed', role: 'test', nSubjects: 100, adaPositive: 12, treatmentEmergentAda: 12, nabPositive: 2 },
        { label: 'Reference', role: 'reference', nSubjects: 100, adaPositive: 10, treatmentEmergentAda: 10, nabPositive: 1 },
      ],
    });
    const test = out.arms.find((a) => a.label === 'Proposed')!;
    expect(test.adaIncidence.p).toBeCloseTo(0.12, 6);
    expect(test.adaIncidence.lower).toBeGreaterThan(0);
    expect(test.adaIncidence.upper).toBeLessThan(1);
  });

  it('finds comparable immunogenicity when the difference CI includes zero', () => {
    const out = assessImmunogenicity({
      arms: [
        { label: 'Proposed', role: 'test', nSubjects: 100, treatmentEmergentAda: 12, nabPositive: 2 },
        { label: 'Reference', role: 'reference', nSubjects: 100, treatmentEmergentAda: 10, nabPositive: 1 },
      ],
    });
    expect(out.comparison).not.toBeNull();
    expect(out.comparison!.verdict).toBe('similar');
  });

  it('flags higher immunogenicity in the test arm when the difference is large', () => {
    const out = assessImmunogenicity({
      arms: [
        { label: 'Proposed', role: 'test', nSubjects: 100, treatmentEmergentAda: 45, nabPositive: 10 },
        { label: 'Reference', role: 'reference', nSubjects: 100, treatmentEmergentAda: 8, nabPositive: 1 },
      ],
    });
    expect(out.comparison!.verdict).toBe('higher_in_test');
  });
});

describe('immunogenicity — risk classification', () => {
  it('grades low risk for low incidence with no NAb / impact', () => {
    const out = assessImmunogenicity({
      arms: [{ label: 'Proposed', role: 'test', nSubjects: 200, treatmentEmergentAda: 2, nabPositive: 0 }],
    });
    expect(out.risk.tier).toBe('low');
  });

  it('escalates to high risk on serious hypersensitivity', () => {
    const out = assessImmunogenicity({
      arms: [
        { label: 'Proposed', role: 'test', nSubjects: 100, treatmentEmergentAda: 20, nabPositive: 5, hypersensitivity: 2 },
      ],
    });
    expect(out.risk.tier).toBe('high');
    expect(out.risk.consequence).toBe('high');
  });

  it('escalates when neutralizing ADA hits a non-redundant endogenous protein', () => {
    const out = assessImmunogenicity({
      riskFactors: { neutralizesEndogenous: true },
      arms: [
        { label: 'Proposed', role: 'test', nSubjects: 100, treatmentEmergentAda: 15, nabPositive: 6, impactedEfficacy: 4 },
      ],
    });
    expect(out.risk.tier).toBe('high');
    expect(out.recommendations.length).toBeGreaterThan(0);
  });
});
