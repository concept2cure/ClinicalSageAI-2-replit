/**
 * The E-value of a confidence interval that includes the null is 1.
 *
 * What the code used to do (2026-10-15): assessBiasRisk computed the
 * confidence-limit E-value from 1/rrLower whenever the lower limit was below
 * 1, so a risk ratio of 1.5 with a lower limit of 0.9 — an interval that
 * includes "no effect" — was reported as needing confounding of RR 1.46 to
 * explain away. For a protective estimate (RR < 1) it used the lower limit,
 * which is the one farthest from the null.
 */
import { describe, expect, it } from 'vitest';

import { assessBiasRisk, type BiasAssessmentParams } from '../rwe-methodology-knowledge';

const base: BiasAssessmentParams = {
  studyDesign: 'new_user_active_comparator',
  exposureType: 'drug',
  dataSource: 'claims',
  selfReportedOutcome: false,
  differentialSurveillance: false,
  nUnmeasuredConfounders: 1,
  hasActiveComparator: true,
};

describe('assessBiasRisk E-value for the confidence limit', () => {
  it('is 1 when the interval includes the null', () => {
    const note = assessBiasRisk({ ...base, observedEffectEstimate: 1.5, observedCILower: 0.9 }).eValueNote ?? '';
    expect(note).toContain('(RR=0.90): 1.00 (the interval includes the null)');
    expect(note).not.toContain('1.46');
  });

  it('is computed from the lower limit when the interval excludes the null', () => {
    const note = assessBiasRisk({ ...base, observedEffectEstimate: 2, observedCILower: 1.5 }).eValueNote ?? '';
    expect(note).toContain('(RR=1.50): 2.37');
  });

  it('is not computed for a protective estimate, which needs the upper limit', () => {
    const note = assessBiasRisk({ ...base, observedEffectEstimate: 0.6, observedCILower: 0.4 }).eValueNote ?? '';
    expect(note).toContain('not computed');
  });
});
