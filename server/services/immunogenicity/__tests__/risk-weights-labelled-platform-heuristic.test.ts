/**
 * The immunogenicity risk weights are labelled as a platform heuristic. The
 * guidance is cited for the factor, not beside the weight, and no hidden
 * offset sets a category verdict (audit finding 12, 2026-10-15).
 *
 * What the code used to do: every factor row carried `citation:
 * FDA_2014_FACTORS` ("Section III — Factors That Can Affect Immunogenicity")
 * beside a weight such as +12 or +18 that is this module's own. The "NOT a
 * regulatory threshold" caveat lived only in a code comment. The patient/
 * treatment tier was the 0–100 bands applied to that category's sum plus an
 * undocumented 30. Those weights sum to −7…31, so the tier could never leave
 * 'moderate': IV + intermittent + immunocompetent read "patient/treatment
 * factors moderate", and so did SC + chronic daily + autoimmune.
 */
import { describe, expect, it } from 'vitest';
import {
  assessImmunogenicityRisk,
  type ImmunogenicityRiskParams,
  type RiskFactorContribution,
} from '../immunogenicity-knowledge';

const ALL_STATED: ImmunogenicityRiskParams = {
  productType: 'human_recombinant',
  hasEndogenousCounterpart: false,
  aggregationLevel: 'low',
  glycosylation: 'human_like',
  hasImmunogenicImpurities: false,
  formulationRisk: false,
  route: 'intravenous',
  doseFrequency: 'intermittent',
  immuneStatus: 'immunocompetent',
  concomitantImmunosuppression: false,
};

const sumOf = (rows: RiskFactorContribution[], category: RiskFactorContribution['category']) =>
  rows.filter((c) => c.category === category).reduce((s, c) => s + c.scoreContribution, 0);

describe('assessImmunogenicityRisk: the score says what it is', () => {
  it('labels the score in the result as a platform heuristic, not an FDA/EMA scale', () => {
    const r = assessImmunogenicityRisk(ALL_STATED);

    expect(r.methodology).toMatch(/platform heuristic/i);
    expect(r.methodology).toMatch(/not an FDA\/EMA scale/i);
    expect(r.summary).toMatch(/platform-heuristic score 18\/100/);
  });

  it('cites the guidance for the factor, never as the source of the weight', () => {
    const r = assessImmunogenicityRisk(ALL_STATED);

    expect(r.factorContributions.length).toBeGreaterThan(0);
    for (const c of r.factorContributions) {
      expect(c).not.toHaveProperty('citation');
      expect(c.weightBasis).toBe('platform_heuristic');
      expect(c.factorCitation.authority).toBe('FDA');
    }
  });

  it('reports each category as the plain sum of its weights, with no offset and no category tier', () => {
    const typical = assessImmunogenicityRisk(ALL_STATED);
    expect(typical.productFactorScore).toBe(8);
    expect(typical.patientTreatmentFactorScore).toBe(10);
    expect(typical.patientTreatmentFactorScore).toBe(sumOf(typical.factorContributions, 'patient_treatment'));
    expect(typical.productFactorScore).toBe(sumOf(typical.factorContributions, 'product'));
    expect(typical).not.toHaveProperty('patientTreatmentRiskTier');
    expect(typical).not.toHaveProperty('productRiskTier');
    expect(typical.summary).not.toMatch(/patient\/treatment factors moderate/);

    const highest = assessImmunogenicityRisk({
      ...ALL_STATED,
      route: 'subcutaneous',
      doseFrequency: 'chronic_daily',
      immuneStatus: 'autoimmune',
    });
    expect(highest.patientTreatmentFactorScore).toBe(31);
  });

  it('gives no category sum while a factor in that category is not assessed', () => {
    const r = assessImmunogenicityRisk({ ...ALL_STATED, route: undefined });

    expect(r.patientTreatmentFactorScore).toBeNull();
    expect(r.productFactorScore).toBe(8);
  });
});
